import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';
import { asPositiveInt, normaliseEmail, normaliseVariant } from '../services/server/stock-utils.js';
import { notifyAdminsOfNewOrder } from '../services/server/admin-push.js';
import { projectPublicStock } from '../src/server/stockProjection.js';
import { adminAuditEntry } from '../src/server/adminAudit.js';

type DraftItem = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  selectedVariant: string;
  image: string;
};

const cleanOrderId = (value: unknown) => String(value || '').trim().replace(/^#+/, '');
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const validateOrderId = (value: unknown): string | null => {
  const id = cleanOrderId(value);
  return /^AS-\d{6,12}$/.test(id) ? id : null;
};

const validateShippingInfo = (value: any) => {
  const info = value && typeof value === 'object' ? { ...value } : null;
  if (!info) throw new Error('Dados de entrega inválidos.');

  info.name = String(info.name || '').trim().slice(0, 120);
  info.email = normaliseEmail(info.email);
  info.phone = String(info.phone || '').trim().slice(0, 40);
  info.deliveryMethod = info.deliveryMethod === 'Pickup' ? 'Pickup' : 'Shipping';
  info.paymentMethod = ['MB Way', 'Transferência', 'Cobrança', 'Outro'].includes(info.paymentMethod) ? info.paymentMethod : 'MB Way';

  if (!info.name || !info.email || !info.phone) throw new Error('Preencha nome, email e telemóvel para enviar o pedido.');
  if (info.deliveryMethod === 'Shipping') {
    for (const key of ['street', 'doorNumber', 'zip', 'city']) {
      info[key] = String(info[key] || '').trim().slice(0, 160);
      if (!info[key]) throw new Error('Preencha a morada completa para envio.');
    }
  } else {
    info.street = 'Levantamento na Loja (All-Shop)';
    info.city = 'Leiria';
    info.zip = '2400-135';
    info.doorNumber = '-';
  }

  return info;
};

const parseItems = (itemsInput: unknown): DraftItem[] => {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0 || itemsInput.length > 20) {
    throw new Error('O carrinho está vazio ou contém demasiados itens.');
  }

  const grouped = new Map<string, DraftItem>();
  for (const item of itemsInput) {
    const productId = Number((item as any)?.productId);
    const quantity = asPositiveInt((item as any)?.quantity, 20);
    const selectedVariant = String((item as any)?.selectedVariant || '').trim().slice(0, 120);
    if (!Number.isInteger(productId) || productId <= 0 || !quantity || quantity < 1) {
      throw new Error('Um artigo do carrinho é inválido. Atualize a página e tente novamente.');
    }

    const key = `${productId}|${normaliseVariant(selectedVariant)}`;
    const existing = grouped.get(key);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > 20) throw new Error('A quantidade máxima por produto é 20 unidades.');

    const price = Number((item as any)?.price);
    grouped.set(key, {
      productId,
      name: String((item as any)?.name || 'Produto').trim().slice(0, 240) || 'Produto',
      price: Number.isFinite(price) && price >= 0 && price <= 100000 ? roundMoney(price) : 0,
      quantity: nextQuantity,
      selectedVariant,
      image: String((item as any)?.image || '').trim().slice(0, 2000),
    });
  }
  return [...grouped.values()];
};

type PreorderConfig = {
  enabled?: unknown;
  capacity?: unknown;
  reservedQuantity?: unknown;
  variantCapacities?: unknown;
  reservedByVariant?: unknown;
  estimatedDispatchDate?: unknown;
  paymentDeadlineHours?: unknown;
  note?: unknown;
};

const preorderDate = (value: unknown) => {
  const date = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
};

// A pré-reserva usa a mesma fonte de verdade das reservas temporárias do
// carrinho. A diferença é que esta só é libertada quando a pré-reserva é
// cancelada, expira por falta de sinal ou é entregue.
const preorderReservationId = (orderId: string) => `preorder_${orderId}`;
const PREORDER_RESERVATION_END = new Date('2099-12-31T23:59:59.999Z');

const preorderNumberMap = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, quantity]) => [normaliseVariant(key), Math.max(0, Math.floor(Number(quantity) || 0))] as const)
    .filter(([key, quantity]) => Boolean(key) && quantity > 0));
};

const preorderMapTotal = (value: Record<string, number>) => Object.values(value).reduce((total, quantity) => total + quantity, 0);

const preorderOffer = (product: Record<string, unknown>) => {
  const source = product.preorder && typeof product.preorder === 'object' && !Array.isArray(product.preorder)
    ? product.preorder as PreorderConfig
    : null;
  if (!source?.enabled) return null;
  const variantCapacities = preorderNumberMap(source.variantCapacities);
  const reservedByVariant = preorderNumberMap(source.reservedByVariant);
  const hasVariantCapacities = Object.keys(variantCapacities).length > 0;
  const capacity = hasVariantCapacities ? preorderMapTotal(variantCapacities) : Math.max(0, Math.floor(Number(source.capacity) || 0));
  const reservedQuantity = Math.max(0, Math.floor(Number(source.reservedQuantity) || 0));
  const estimatedDispatchDate = preorderDate(source.estimatedDispatchDate);
  if (!capacity || !estimatedDispatchDate) return null;
  return {
    source,
    capacity,
    reservedQuantity,
    variantCapacities,
    reservedByVariant,
    hasVariantCapacities,
    estimatedDispatchDate,
    paymentDeadlineHours: Math.min(72, Math.max(2, Math.floor(Number(source.paymentDeadlineHours) || 48))),
  };
};

const createPreorder = async (firestore: NonNullable<typeof db>, req: Request) => {
  const orderId = validateOrderId(req.body?.idempotencyKey);
  if (!orderId) throw new Error('Não foi possível criar a referência da pré-reserva. Tente novamente.');
  if (req.body?.termsAccepted !== true) throw new Error('Confirme que leu as condições da pré-reserva.');
  const productId = Number(req.body?.productId);
  const quantity = asPositiveInt(req.body?.quantity, 10);
  const selectedVariant = String(req.body?.selectedVariant ?? '').trim().slice(0, 120);
  if (!Number.isInteger(productId) || productId <= 0 || !quantity) throw new Error('A pré-reserva contém dados inválidos. Atualize a página e tente novamente.');

  const identity = await getRequestIdentity(req, req.body?.guestToken);
  const shippingInfo = validateShippingInfo(req.body?.shippingInfo);
  const now = new Date();
  const result = await firestore.runTransaction(async (transaction) => {
    const orderRef = firestore.collection('orders').doc(orderId);
    const productRef = firestore.collection('products_public').doc(String(productId));
    const inventoryQuery = firestore.collection('products_inventory').where('publicProductId', '==', productId);
    const reservationsQuery = firestore.collection('stock_reservations').where('productId', '==', productId);
    const [existingSnapshot, productSnapshot, productOrders, inventorySnapshot, reservationsSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(productRef),
      transaction.get(firestore.collection('orders').where('preorder.productId', '==', productId)),
      transaction.get(inventoryQuery),
      transaction.get(reservationsQuery),
    ]);
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() ?? {};
      const belongs = existing.userId ? existing.userId === identity.userId : existing.ownerKey === identity.ownerKey;
      if (!belongs) throw new Error('Esta referência já pertence a outra sessão. Tente novamente.');
      return { order: { id: orderId, ...existing }, alreadyExists: true };
    }
    if (!productSnapshot.exists) throw new Error('Este produto já não está disponível para pré-reserva.');
    const product = productSnapshot.data() ?? {};
    if (product.isPrivate === true) throw new Error('Este produto não está disponível para pré-reserva.');
    const offer = preorderOffer(product);
    if (!offer) throw new Error('A pré-reserva deste produto já não está ativa.');
    if (product.maxQuantityPerOrder && quantity > Number(product.maxQuantityPerOrder)) throw new Error(`Só pode pré-reservar até ${product.maxQuantityPerOrder} unidade(s) deste produto.`);

    let activeReserved = 0;
    const activeReservedByVariant: Record<string, number> = {};
    for (const document of productOrders.docs) {
      const current = document.data() ?? {};
      const reservation = current.preorder && typeof current.preorder === 'object' ? current.preorder as Record<string, unknown> : {};
      const expired = reservation.status === 'DEPOSIT_PENDING' && reservation.capacityHeld === true && new Date(String(reservation.depositDeadlineAt ?? '')).getTime() <= now.getTime();
      const held = Math.max(0, Math.floor(Number(reservation.quantity) || 0));
      if (expired) {
        transaction.update(document.ref, {
          status: 'Cancelado',
          preorder: { ...reservation, status: 'EXPIRED', capacityHeld: false, capacityReleasedAt: now.toISOString() },
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({ status: 'Cancelado', date: now.toISOString(), notes: 'Pré-reserva expirada: o sinal não foi recebido dentro do prazo.' }),
        });
        transaction.delete(firestore.collection('stock_reservations').doc(preorderReservationId(document.id)));
        continue;
      }
      if (reservation.capacityHeld === true && !['CANCELLED', 'EXPIRED', 'FULFILLED'].includes(String(reservation.status ?? ''))) {
        activeReserved += held;
        const key = normaliseVariant(reservation.variantName);
        if (key) activeReservedByVariant[key] = (activeReservedByVariant[key] ?? 0) + held;
      }
    }

    const variant = Array.isArray(product.variants)
      ? product.variants.find((item: unknown) => normaliseVariant((item as Record<string, unknown>)?.name) === normaliseVariant(selectedVariant)) as Record<string, unknown> | undefined
      : undefined;
    if (Array.isArray(product.variants) && product.variants.length > 0 && !variant) throw new Error('Escolha uma versão válida do produto.');
    const variantKey = normaliseVariant(selectedVariant);
    if (offer.hasVariantCapacities) {
      const variantCapacity = Number(offer.variantCapacities[variantKey] ?? 0);
      const availableForVariant = Math.max(0, variantCapacity - Number(activeReservedByVariant[variantKey] ?? 0));
      if (!variantCapacity || quantity > availableForVariant) throw new Error(`Esta versão já não tem vagas suficientes. Restam ${availableForVariant} vaga${availableForVariant === 1 ? '' : 's'} para pré-reserva.`);
    } else if (activeReserved + quantity > offer.capacity) {
      throw new Error('As vagas desta pré-reserva já foram preenchidas. Pode pedir um aviso caso abram novas vagas.');
    }
    const unitPrice = Number(variant?.price ?? product.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('O preço deste produto precisa de ser atualizado antes de aceitar pré-reservas.');
    const subtotal = roundMoney(unitPrice * quantity);
    const shippingCost = shippingInfo.deliveryMethod === 'Pickup' || subtotal >= 50 ? 0 : 4.99;
    const total = roundMoney(subtotal + shippingCost);
    const depositDue = roundMoney(total * 0.5);
    const createdAt = now.toISOString();
    const order = {
      id: orderId,
      date: createdAt,
      total,
      subtotal,
      shippingCost,
      status: 'Pendente',
      statusHistory: [{ status: 'Pendente', date: createdAt, notes: 'Pré-reserva criada. Aguarda o sinal de 50%.' }],
      items: [{ productId, name: String(product.name ?? 'Produto').trim().slice(0, 250) || 'Produto', price: roundMoney(unitPrice), image: String(variant?.image ?? product.image ?? '').trim().slice(0, 1000), description: String(variant?.description ?? product.description ?? '').trim().slice(0, 5000), quantity, selectedVariant, addedAt: createdAt }],
      userId: identity.userId,
      ownerKey: identity.ownerKey,
      shippingInfo,
      stockDeducted: false,
      storeShippingCost: 0,
      preorder: {
        kind: 'PREORDER', productId, variantName: selectedVariant || null, quantity,
        status: 'DEPOSIT_PENDING', capacityHeld: true, depositPercent: 50,
        depositDue, balanceDue: roundMoney(total - depositDue),
        depositDeadlineAt: new Date(now.getTime() + offer.paymentDeadlineHours * 60 * 60 * 1000).toISOString(),
        estimatedDispatchDate: offer.estimatedDispatchDate, termsAcceptedAt: createdAt,
      },
      schemaVersion: 3,
    };
    const reservationRef = firestore.collection('stock_reservations').doc(preorderReservationId(orderId));
    const reservation = {
      productId,
      variantName: selectedVariant || null,
      variantKey: normaliseVariant(selectedVariant),
      quantity,
      ownerKey: `preorder:${orderId}`,
      userId: identity.userId,
      orderId,
      kind: 'PREORDER',
      expiresAt: Timestamp.fromDate(PREORDER_RESERVATION_END),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const releasedReservationIds = new Set(productOrders.docs
      .filter((document) => {
        const current = document.data() ?? {};
        const currentPreorder = current.preorder && typeof current.preorder === 'object' ? current.preorder as Record<string, unknown> : {};
        return currentPreorder.status === 'DEPOSIT_PENDING' && currentPreorder.capacityHeld === true && new Date(String(currentPreorder.depositDeadlineAt ?? '')).getTime() <= now.getTime();
      })
      .map((document) => preorderReservationId(document.id)));
    const reservationsForProjection = [
      ...reservationsSnapshot.docs
        .filter((document) => !releasedReservationIds.has(document.id))
        .map((document) => ({ id: document.id, ...document.data() })),
      { id: reservationRef.id, ...reservation },
    ];
    const lotsForProjection = inventorySnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    transaction.update(productRef, {
      ...projectPublicStock(productId, product, lotsForProjection, reservationsForProjection),
      preorder: { ...offer.source, reservedQuantity: activeReserved + quantity, ...(offer.hasVariantCapacities ? { reservedByVariant: { ...activeReservedByVariant, [variantKey]: Number(activeReservedByVariant[variantKey] ?? 0) + quantity } } : {}), depositPercent: 50, paymentDeadlineHours: offer.paymentDeadlineHours },
      stockUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(reservationRef, reservation);
    transaction.set(orderRef, { ...order, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(firestore.collection('admin_audit_log').doc(), adminAuditEntry({
      action: 'create_preorder',
      actor: { uid: identity.userId, kind: 'CLIENT' },
      target: { type: 'Pré-reserva', id: orderId, label: `#${orderId}` },
      before: null,
      after: order,
      summary: 'Pré-reserva criada pelo cliente; aguarda o sinal de 50%.',
      details: { productId, quantity, selectedVariant: selectedVariant || 'Sem variante' },
    }));
    return { order, alreadyExists: false };
  });
  if (!result.alreadyExists) {
    try { await notifyAdminsOfNewOrder(firestore, result.order); } catch (error) { console.warn('[preorder-admin-push]', error); }
  }
  return result;
};

/**
 * Stores the message-stage checkout as an auditable intent only. The follow-up
 * endpoint finalizes prices, coupon, stock and notifications atomically after
 * the customer explicitly confirms sending their message.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'O pedido não pode ser registado neste momento. Tente novamente dentro de momentos.' });

  try {
    if (req.body?.action === 'create_preorder') {
      const result = await createPreorder(firestore, req);
      return res.status(200).json({ success: true, ...result });
    }
    const orderId = validateOrderId(req.body?.idempotencyKey ?? req.body?.order?.id);
    if (!orderId) return res.status(400).json({ error: 'Número de encomenda inválido. Volte ao carrinho e tente novamente.' });

    const identity = await getRequestIdentity(req, req.body?.guestToken);
    const items = parseItems(req.body?.items ?? req.body?.order?.items);
    const shippingInfo = validateShippingInfo(req.body?.shippingInfo ?? req.body?.order?.shippingInfo);
    const requestTotal = Number(req.body?.order?.total);
    const total = Number.isFinite(requestTotal) && requestTotal >= 0 && requestTotal <= 100000
      ? roundMoney(requestTotal)
      : roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const requestedCoupon = String(req.body?.order?.couponCode || '').trim().toUpperCase().slice(0, 80);
    const requestedDiscount = Number(req.body?.order?.discountValue);

    const result = await firestore.runTransaction(async (transaction) => {
      const orderRef = firestore.collection('orders').doc(orderId);
      const existingSnapshot = await transaction.get(orderRef);
      if (existingSnapshot.exists) {
        const existing = existingSnapshot.data() || {};
        const belongsToCurrentOwner = existing.userId
          ? existing.userId === identity.userId
          : existing.ownerKey === identity.ownerKey;
        if (!belongsToCurrentOwner) {
          throw new Error('Este número de encomenda já está em utilização. Volte ao carrinho e tente novamente.');
        }
        return { order: { id: orderId, ...existing }, alreadyExists: true };
      }

      const createdAt = new Date().toISOString();
      const order = {
        id: orderId,
        date: createdAt,
        total,
        status: 'A confirmar',
        statusHistory: [{
          status: 'A confirmar',
          date: createdAt,
          notes: 'Pedido enviado por mensagem; aguarda a confirmação do cliente.',
        }],
        items: items.map((item) => ({ ...item, addedAt: createdAt })),
        userId: identity.userId,
        ownerKey: identity.ownerKey,
        shippingInfo,
        stockDeducted: false,
        awaitingCustomerConfirmation: true,
        confirmationDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        storeShippingCost: 5.4,
        ...(requestedCoupon ? { couponCode: requestedCoupon } : {}),
        ...(Number.isFinite(requestedDiscount) && requestedDiscount > 0 ? { discountValue: roundMoney(Math.min(requestedDiscount, total)) } : {}),
        schemaVersion: 2,
      };
      transaction.set(orderRef, { ...order, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(firestore.collection('admin_audit_log').doc(), adminAuditEntry({
        action: 'create_order_draft',
        actor: { uid: identity.userId, kind: 'CLIENT' },
        target: { type: 'Encomenda', id: orderId, label: `#${orderId}` },
        before: null,
        after: order,
        summary: 'Pedido iniciado pelo cliente; aguarda confirmação final.',
      }));
      return { order, alreadyExists: false };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível registar o pedido.');
    console.error('[create-order-draft]', error);
    if (req.body?.action === 'create_preorder') {
      return res.status(/vaga|produto|versão|pré-reserva|sinal|prazo/i.test(message) ? 409 : 400).json({ error: message });
    }
    return res.status(/número de encomenda|carrinho|morada|artigo/i.test(message) ? 400 : 409).json({ error: message });
  }
}

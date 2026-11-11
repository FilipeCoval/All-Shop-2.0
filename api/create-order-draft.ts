import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';
import { asPositiveInt, normaliseEmail, normaliseVariant } from '../services/server/stock-utils.js';

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
      return { order, alreadyExists: false };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível registar o pedido.');
    console.error('[create-order-draft]', error);
    return res.status(/número de encomenda|carrinho|morada|artigo/i.test(message) ? 400 : 409).json({ error: message });
  }
}

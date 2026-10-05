import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, type DocumentData, type DocumentReference, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { projectPublicStock, type LotData, type ReservationData } from '../stockProjection.js';
import { applyPartialCancellation, calculateCancellationRefund, validateCancellationItems } from '../orderCancellation.js';
import { activeReservedQuantity, allocateSale, normalizeVariant, toMillis } from '../checkoutCore.js';
import { applyFulfillmentToPackages, FulfillmentError, fulfillmentItemsFromPackages, fulfillmentUnitSerial, isOrderFulfillmentComplete, planOrderFulfillment, type FulfillmentLot, type FulfillmentPackage } from '../orderFulfillment.js';

const STATUSES = new Set(['Pendente', 'Processamento', 'Pago', 'Enviado', 'Entregue', 'Cancelado', 'Reclamação', 'Devolvido', 'Levantamento em Loja']);
const text = (value: unknown, max = 1200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const normalize = (value: unknown) => text(value).toLowerCase();
const cleanOrderId = (value: unknown) => text(value, 100).replace(/^#+/, '');

async function notifyFulfillment(database: ReturnType<typeof getAdminDb>, order: DocumentData) {
  if (!order?.userId) return { sentCount: 0, failureCount: 0 };
  const userSnapshot = await database.collection('users').doc(String(order.userId)).get();
  if (!userSnapshot.exists) return { sentCount: 0, failureCount: 0 };
  const user = userSnapshot.data() ?? {};
  const tokens = [...new Set([...(Array.isArray(user.deviceTokens) ? user.deviceTokens : []), user.fcmToken].map(String).filter((token) => token.length > 20))];
  if (!tokens.length) return { sentCount: 0, failureCount: 0 };
  const pickup = order.shippingInfo?.deliveryMethod === 'Pickup';
  const result = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: pickup ? 'Encomenda pronta para levantamento' : 'Encomenda enviada',
      body: pickup ? `A encomenda #${order.id} foi preparada e está pronta.` : `A encomenda #${order.id} já foi expedida.${order.trackingNumber ? ` Rastreio: ${order.trackingNumber}` : ''}`,
    },
    webpush: { notification: { icon: 'https://i.imgur.com/nSiZKBf.png' }, fcmOptions: { link: `https://www.all-shop.net/#order/${order.id}` } },
  });
  return { sentCount: result.successCount, failureCount: result.failureCount };
}

type RecoveryItemInput = {
  productId: number;
  quantity: number;
  variantName: string;
  overridePrice: number;
};

type RestockContext = {
  productId: number;
  productRef: DocumentReference;
  product: DocumentData;
  lots: Array<QueryDocumentSnapshot & { data(): LotData }>;
  reservations: ReservationData[];
  restoreByLot: Map<string, number>;
  orderId: string;
};

const sourceOrderItems = (order: DocumentData): DocumentData[] => {
  const packages = Array.isArray(order.packages) ? order.packages.filter((pkg: unknown) => pkg && typeof pkg === 'object') : [];
  if (packages.length) {
    return packages.flatMap((pkg: DocumentData) => Array.isArray(pkg.items)
      ? pkg.items.filter((item: unknown) => item && typeof item === 'object')
      : []);
  }
  return Array.isArray(order.items) ? order.items.filter((item: unknown) => item && typeof item === 'object') : [];
};

const cleanItems = (order: DocumentData) => sourceOrderItems(order)
  .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
  .map((item) => ({ productId: Number(item.productId), quantity: Math.max(0, Number(item.quantity ?? 0)), variant: text(item.selectedVariant, 120) }))
  .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && item.quantity > 0);

async function prepareRestock(transaction: Transaction, orderId: string, order: DocumentData, selectedItems = cleanItems(order)): Promise<RestockContext[]> {
  if (order.stockDeducted !== true) return [];
  const database = getAdminDb();
  const grouped = new Map<string, { productId: number; quantity: number; variant: string }>();
  for (const item of selectedItems) {
    const key = `${item.productId}:${normalize(item.variant)}`;
    const current = grouped.get(key);
    grouped.set(key, { ...item, quantity: item.quantity + (current?.quantity ?? 0) });
  }

  const contexts: RestockContext[] = [];
  for (const item of grouped.values()) {
    const productRef = database.collection('products_public').doc(String(item.productId));
    const [productSnapshot, lotsSnapshot, reservationsSnapshot] = await Promise.all([
      transaction.get(productRef),
      transaction.get(database.collection('products_inventory').where('publicProductId', '==', item.productId)),
      transaction.get(database.collection('stock_reservations').where('productId', '==', item.productId)),
    ]);
    if (!productSnapshot.exists) throw new ApiError(409, `O produto ${item.productId} já não existe no catálogo.`);
    const productLots = lotsSnapshot.docs;
    const generic = productLots.filter((lot) => !normalize(lot.data().variant));
    const variantKey = normalize(item.variant);
    const exact = productLots.filter((lot) => normalize(lot.data().variant) === variantKey);
    const matching = !variantKey ? (generic.length ? generic : productLots) : (exact.length ? exact : generic);
    const restoreByLot = new Map<string, number>();
    let remaining = item.quantity;
    for (const lot of matching) {
      if (remaining <= 0) break;
      const data = lot.data();
      const soldForOrder = Array.isArray(data.units) ? data.units.filter((unit: DocumentData) => unit?.status === 'SOLD' && cleanOrderId(unit?.soldToOrder) === orderId).length : 0;
      const restorable = soldForOrder || Math.max(0, Number(data.quantitySold ?? 0));
      const quantity = Math.min(remaining, restorable);
      if (quantity > 0) { restoreByLot.set(lot.id, quantity); remaining -= quantity; }
    }
    if (remaining > 0) throw new ApiError(409, 'Não foi possível repor o stock com segurança. Verifique os lotes antes de cancelar.');
    contexts.push({ productId: item.productId, productRef, product: productSnapshot.data() ?? {}, lots: lotsSnapshot.docs as RestockContext['lots'], reservations: reservationsSnapshot.docs.map((document) => document.data() as ReservationData), restoreByLot, orderId });
  }
  return contexts;
}

function applyRestock(transaction: Transaction, contexts: RestockContext[]) {
  const now = new Date().toISOString();
  for (const context of contexts) {
    const projectedLots: LotData[] = context.lots.map((lot) => {
      const data = lot.data();
      const restore = context.restoreByLot.get(lot.id) ?? 0;
      if (!restore) return { id: lot.id, ...data };
      let unitsLeft = restore;
      const units = Array.isArray(data.units) ? data.units.map((unit: DocumentData) => {
        if (unitsLeft > 0 && unit?.status === 'SOLD' && cleanOrderId(unit?.soldToOrder) === context.orderId) {
          unitsLeft -= 1;
          const { soldAt: _soldAt, soldToOrder: _soldToOrder, soldToCustomerName: _name, soldToCustomerEmail: _email, ...rest } = unit;
          return { ...rest, status: 'AVAILABLE', returnedAt: now };
        }
        return unit;
      }) : [];
      const update = { quantitySold: Math.max(0, Number(data.quantitySold ?? 0) - restore), units };
      transaction.update(lot.ref, update);
      return { id: lot.id, ...data, ...update };
    });
    transaction.update(context.productRef, { ...projectPublicStock(context.productId, context.product, projectedLots, context.reservations), stockUpdatedAt: FieldValue.serverTimestamp() });
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    const database = getAdminDb();
    const action = text(request.body?.action, 40);
    const orderId = cleanOrderId(request.body?.orderId);
    if (!orderId) throw new ApiError(400, 'A encomenda não foi indicada.');
    if (!['set_status', 'update_tracking', 'review_request', 'recover_telegram_order', 'fulfill_order'].includes(action)) throw new ApiError(400, 'Ação de encomenda inválida.');

    const transactionResult = await database.runTransaction(async (transaction) => {
      const canonicalOrderRef = database.collection('orders').doc(orderId);
      const legacyOrderRef = database.collection('orders').doc(`#${orderId}`);
      const [canonicalOrderSnapshot, legacyOrderSnapshot] = await Promise.all([
        transaction.get(canonicalOrderRef),
        transaction.get(legacyOrderRef),
      ]);
      if (canonicalOrderSnapshot.exists && legacyOrderSnapshot.exists) {
        throw new ApiError(409, 'Existem duas encomendas com esta referência. Corrija o duplicado antes de continuar.');
      }
      let orderRef = canonicalOrderSnapshot.exists
        ? canonicalOrderRef
        : legacyOrderSnapshot.exists
          ? legacyOrderRef
          : canonicalOrderRef;
      let orderSnapshot = canonicalOrderSnapshot.exists ? canonicalOrderSnapshot : legacyOrderSnapshot;
      if (!orderSnapshot.exists) {
        const matchingLegacyOrders = await transaction.get(database.collection('orders').where('id', 'in', [orderId, `#${orderId}`]).limit(2));
        if (matchingLegacyOrders.size > 1) throw new ApiError(409, 'Existem duas encomendas com esta referência. Corrija o duplicado antes de continuar.');
        if (!matchingLegacyOrders.empty) {
          orderSnapshot = matchingLegacyOrders.docs[0];
          orderRef = matchingLegacyOrders.docs[0].ref;
        }
      }
      const withDocument = (order: DocumentData) => ({ order, documentId: orderRef.id });
      const now = new Date().toISOString();

      if (action === 'recover_telegram_order') {
        if (orderSnapshot.exists) throw new ApiError(409, 'Esta encomenda já existe na base de dados. Atualize a dashboard.');
        if (!/^AS-\d{6,16}$/.test(orderId)) throw new ApiError(400, 'A referência do pedido é inválida.');
        const rawItems: unknown[] = Array.isArray(request.body?.items) ? request.body.items : [];
        if (!rawItems.length || rawItems.length > 20) throw new ApiError(400, 'Indique pelo menos um artigo.');
        const customerName = text(request.body?.name, 140); const phone = text(request.body?.phone, 50); const email = text(request.body?.email, 180).toLowerCase();
        if (!customerName || !phone) throw new ApiError(400, 'Nome e telemóvel são obrigatórios.');

        // Firestore exige que todas as leituras da transação aconteçam antes da primeira escrita.
        // O fluxo anterior lia/escrevia produto a produto; pedidos com 2+ artigos falhavam no segundo artigo.
        const parsedItems: RecoveryItemInput[] = rawItems.map((raw) => {
          const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
          const productId = Number(item.productId);
          const quantity = Math.trunc(Number(item.quantity));
          const variantName = text(item.variantName, 120);
          const overridePrice = Number(item.price);
          if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new ApiError(400, 'Existe um artigo inválido.');
          return { productId, quantity, variantName, overridePrice };
        });

        const uniqueProductIds = [...new Set(parsedItems.map((item) => item.productId))];
        const productContexts = new Map<number, { productRef: DocumentReference; product: DocumentData; lots: LotData[]; reservations: ReservationData[] }>();

        await Promise.all(uniqueProductIds.map(async (productId) => {
          const productRef = database.collection('products_public').doc(String(productId));
          const [productSnapshot, inventorySnapshot, reservationsSnapshot] = await Promise.all([
            transaction.get(productRef),
            transaction.get(database.collection('products_inventory').where('publicProductId', '==', productId)),
            transaction.get(database.collection('stock_reservations').where('productId', '==', productId)),
          ]);
          if (!productSnapshot.exists || inventorySnapshot.empty) throw new ApiError(409, `O produto ${productId} não tem stock configurado.`);
          productContexts.set(productId, {
            productRef,
            product: productSnapshot.data() ?? {},
            lots: inventorySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as LotData)),
            reservations: reservationsSnapshot.docs
              .map((doc) => ({ id: doc.id, ...doc.data() } as ReservationData))
              .filter((item) => toMillis(item.expiresAt) > Date.now()),
          });
        }));

        const allowWithoutStock = request.body?.allowWithoutStock === true;
        const canonicalItems: DocumentData[] = parsedItems.map((item) => {
          const context = productContexts.get(item.productId);
          if (!context) throw new ApiError(409, `O produto ${item.productId} não pôde ser carregado.`);
          const { product } = context;
          const variant = Array.isArray(product.variants) ? product.variants.find((entry: DocumentData) => normalizeVariant(entry?.name) === normalizeVariant(item.variantName)) : null;
          if (item.variantName && !variant) throw new ApiError(409, `A variante “${item.variantName}” já não existe em ${String(product.name ?? 'produto')}.`);
          const price = Number.isFinite(item.overridePrice) && item.overridePrice >= 0 ? item.overridePrice : Number(variant?.price ?? product.price ?? 0);
          return { productId: item.productId, name: String(product.name ?? 'Produto'), quantity: item.quantity, price: Math.round(price * 100) / 100, selectedVariant: item.variantName, image: String(variant?.image ?? product.image ?? ''), unitIds: [], serialNumbers: [] };
        });
        const touchedProducts = new Set<number>();
        let stockDeducted = true;
        let stockReconciliationRequired = false;

        // Trabalhamos numa cópia dos lotes. Assim, se qualquer artigo não tiver stock livre,
        // podemos recuperar a encomenda inteira sem alterar parcialmente o inventário.
        const workingLots = new Map<number, LotData[]>();
        for (const [productId, context] of productContexts) {
          workingLots.set(productId, context.lots.map((lot) => ({
            ...lot,
            ...(Array.isArray(lot.units) ? { units: lot.units.map((unit: DocumentData) => ({ ...unit })) } : {}),
          })));
        }

        for (let index = 0; index < parsedItems.length; index += 1) {
          const item = parsedItems[index];
          const context = productContexts.get(item.productId)!;
          const { product, reservations } = context;
          const lots = workingLots.get(item.productId) ?? [];
          const reserved = activeReservedQuantity(reservations, item.productId, item.variantName);
          try {
            const allocation = allocateSale(lots, item.productId, item.variantName, item.quantity, reserved);
            const unitIds: string[] = [];
            const serialNumbers: string[] = [];
            for (const { lot, sold } of allocation) {
              lot.quantitySold = Number(lot.quantitySold ?? 0) + sold;
              if (lot.units?.length) {
                let remaining = sold;
                lot.units = lot.units.map((unit: DocumentData) => {
                  if (remaining > 0 && unit?.status === 'AVAILABLE') {
                    remaining -= 1;
                    if (unit.id) unitIds.push(String(unit.id));
                    const serialNumber = fulfillmentUnitSerial(unit);
                    if (serialNumber) serialNumbers.push(serialNumber);
                    return { ...unit, status: 'SOLD', soldAt: now, soldToOrder: orderId, soldToCustomerName: customerName, soldToCustomerEmail: email };
                  }
                  return unit;
                });
              }
            }
            canonicalItems[index].unitIds = unitIds;
            canonicalItems[index].serialNumbers = serialNumbers;
            touchedProducts.add(item.productId);
          } catch {
            if (!allowWithoutStock) throw new ApiError(409, `Não existe stock livre suficiente para “${String(product.name ?? 'produto')}”.`);
            stockDeducted = false;
            stockReconciliationRequired = true;
            break;
          }
        }

        if (!stockDeducted) {
          // Nunca fazemos abatimentos parciais numa recuperação histórica.
          // Se um artigo falhar, nenhum lote é alterado e a encomenda fica marcada para acerto de stock.
          touchedProducts.clear();
          for (const item of canonicalItems) {
            item.unitIds = [];
            item.serialNumbers = [];
          }
        } else {
          for (const productId of touchedProducts) {
            const context = productContexts.get(productId)!;
            const lots = workingLots.get(productId) ?? context.lots;
            for (const lot of lots) {
              transaction.update(database.collection('products_inventory').doc(String(lot.id)), {
                quantitySold: Number(lot.quantitySold ?? 0),
                ...(lot.units ? { units: lot.units } : {}),
              });
            }
            transaction.update(context.productRef, {
              ...projectPublicStock(productId, context.product, lots, context.reservations),
              stockUpdatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        const total = Math.max(0, Number(request.body?.total ?? canonicalItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0)));
        const deliveryMethod = request.body?.deliveryMethod === 'Shipping' ? 'Shipping' : 'Pickup';
        const order: DocumentData = {
          date: now, status: 'Pendente', total: Math.round(total * 100) / 100, subtotal: Math.round(total * 100) / 100, discountValue: 0, shippingCost: 0, stockDeducted, stockReconciliationRequired, recoveredFromTelegram: true, recoveredAt: now, recoveredByUserId: admin.uid,
          shippingInfo: { name: customerName, phone, email, paymentMethod: text(request.body?.paymentMethod, 60) || 'MB Way', deliveryMethod, ...(deliveryMethod === 'Pickup' ? { street: 'Levantamento na Loja (All-Shop)', doorNumber: '-', zip: '2400-135', city: 'Leiria' } : {}) },
          items: canonicalItems, statusHistory: [{ status: 'Pendente', date: now, notes: stockDeducted ? 'Pedido recuperado manualmente a partir da mensagem do Telegram' : 'Pedido recuperado do Telegram sem abatimento de stock; inventário requer acerto manual' }], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(orderRef, order);
        transaction.set(database.collection('admin_audit_log').doc(), { action: 'recover_telegram_order', adminId: admin.uid, adminEmail: admin.email, orderId, changes: { recoveredFromTelegram: true, stockDeducted, stockReconciliationRequired }, createdAt: FieldValue.serverTimestamp() });
        return withDocument({ ...order, id: orderId });
      }

      if (!orderSnapshot.exists) throw new ApiError(404, 'Encomenda não encontrada.');
      const order = orderSnapshot.data() ?? {};

      if (action === 'fulfill_order') {
        if (isOrderFulfillmentComplete(order)) throw new ApiError(409, 'Esta encomenda já foi expedida. Atualize a dashboard.');
        if (['Cancelado', 'Devolvido'].includes(String(order.status ?? ''))) throw new ApiError(409, 'Uma encomenda cancelada ou devolvida não pode ser expedida.');
        const rawSelections: unknown[] = Array.isArray(request.body?.selections) ? request.body.selections : [];
        const selections = rawSelections.map((raw) => {
          const selection = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
          const serialNumber = text(selection.serialNumber, 160).toUpperCase();
          const itemIndex = Number(selection.itemIndex);
          if (!serialNumber || !Number.isInteger(itemIndex) || itemIndex < 0) throw new ApiError(400, 'A seleção de S/N é inválida.');
          return { serialNumber, itemIndex };
        });
        const serialNumbers = selections.length
          ? selections.map((selection) => selection.serialNumber)
          : Array.isArray(request.body?.serialNumbers)
            ? request.body.serialNumbers.map((value: unknown) => text(value, 160).toUpperCase()).filter(Boolean)
            : [];
        if (!serialNumbers.length || serialNumbers.length > 100) throw new ApiError(400, 'Indique os S/N das unidades a expedir.');
        const orderPackages = Array.isArray(order.packages)
          ? order.packages.filter((pkg: unknown): pkg is FulfillmentPackage => Boolean(pkg && typeof pkg === 'object'))
          : [];
        const rootOrderItems: DocumentData[] = Array.isArray(order.items) ? order.items.filter((item: unknown) => item && typeof item === 'object') : [];
        if (!orderPackages.length && Array.isArray(order.items) && rootOrderItems.length !== order.items.length) {
          throw new ApiError(409, 'Esta encomenda contém artigos antigos sem referência de produto e não pode ser expedida automaticamente.');
        }
        const orderItems: DocumentData[] = orderPackages.length ? fulfillmentItemsFromPackages(orderPackages) : rootOrderItems;
        if (!orderItems.length || orderItems.some((item) => !Number.isInteger(Number(item.productId)) || Number(item.productId) <= 0 || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) {
          throw new ApiError(409, 'Esta encomenda contém artigos antigos ou inválidos e não pode ser expedida automaticamente.');
        }
        if (selections.some((selection) => selection.itemIndex >= orderItems.length)) throw new ApiError(400, 'A seleção de S/N já não corresponde aos artigos desta encomenda. Atualize a dashboard.');
        const productIds = [...new Set(orderItems.map((item) => Number(item.productId)).filter((id) => Number.isInteger(id) && id > 0))];
        if (!productIds.length) throw new ApiError(409, 'A encomenda não contém produtos válidos.');

        const contexts = await Promise.all(productIds.map(async (productId) => {
          const productRef = database.collection('products_public').doc(String(productId));
          const [productSnapshot, lotsSnapshot, reservationsSnapshot] = await Promise.all([
            transaction.get(productRef),
            transaction.get(database.collection('products_inventory').where('publicProductId', '==', productId)),
            transaction.get(database.collection('stock_reservations').where('productId', '==', productId)),
          ]);
          if (!productSnapshot.exists || lotsSnapshot.empty) throw new ApiError(409, `O produto ${productId} não tem inventário disponível.`);
          return {
            productId,
            productRef,
            product: productSnapshot.data() ?? {},
            lots: lotsSnapshot.docs.map((document) => ({ ...document.data(), id: document.id } as FulfillmentLot)),
            lotRefs: new Map(lotsSnapshot.docs.map((document) => [document.id, document.ref])),
            reservations: reservationsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() } as ReservationData)).filter((item) => toMillis(item.expiresAt) > Date.now()),
          };
        }));
        const isPickup = order.shippingInfo?.deliveryMethod === 'Pickup' || order.status === 'Levantamento em Loja';
        const userRef = isPickup && typeof order.userId === 'string' && order.userId && !order.pointsAwarded ? database.collection('users').doc(order.userId) : null;
        const userSnapshot = userRef ? await transaction.get(userRef) : null;
        let plan;
        try {
          plan = planOrderFulfillment({
            orderId,
            orderItems,
            lots: contexts.flatMap((context) => context.lots),
            serialNumbers,
            ...(selections.length ? { serialItemIndexes: selections.map((selection) => selection.itemIndex) } : {}),
            stockAlreadyDeducted: order.stockDeducted === true,
            customerName: text(order.shippingInfo?.name, 140),
            customerEmail: text(order.shippingInfo?.email, 180).toLowerCase(),
            fulfilledAt: now,
          });
        } catch (error) {
          if (error instanceof FulfillmentError) throw new ApiError(409, error.message);
          throw error;
        }

        const updatedById = new Map(plan.updatedLots.map((lot) => [lot.id, lot]));
        for (const context of contexts) {
          const projectedLots = context.lots.map((lot) => updatedById.get(lot.id) ?? lot);
          for (const lot of projectedLots) {
            const ref = context.lotRefs.get(lot.id);
            if (!ref) continue;
            transaction.update(ref, { quantitySold: Number(lot.quantitySold ?? 0), status: lot.status, units: lot.units ?? [] });
          }
          transaction.update(context.productRef, { ...projectPublicStock(context.productId, context.product, projectedLots, context.reservations), stockUpdatedAt: FieldValue.serverTimestamp() });
        }

        const status = isPickup ? 'Entregue' : 'Enviado';
        const requestedTrackingNumber = isPickup ? '' : text(request.body?.trackingNumber, 150);
        const packageTrackingNumbers = Array.isArray(request.body?.packageTrackingNumbers)
          ? request.body.packageTrackingNumbers.slice(0, orderPackages.length).map((value: unknown) => isPickup ? '' : text(value, 150))
          : undefined;
        const updatedItems = orderItems.map((item, index) => ({
          ...item,
          unitIds: plan.itemUnitIds[index] ?? [],
          serialNumbers: plan.itemSerials[index] ?? [],
        }));
        const updatedPackages = orderPackages.length ? applyFulfillmentToPackages({
          packages: orderPackages,
          itemUnitIds: plan.itemUnitIds,
          itemSerials: plan.itemSerials,
          packageTrackingNumbers,
          fallbackTrackingNumber: requestedTrackingNumber,
        }) : [];
        const trackingNumber = requestedTrackingNumber
          || updatedPackages.map((pkg) => text(pkg.trackingNumber, 150)).find(Boolean)
          || '';
        const update: DocumentData = {
          ...(orderPackages.length ? { packages: updatedPackages } : { items: updatedItems }),
          status,
          fulfillmentStatus: 'COMPLETED',
          fulfilledAt: now,
          fulfilledBy: admin.email,
          serialNumbersUsed: plan.serialNumbers,
          totalProductCost: plan.totalProductCost,
          trackingNumber: trackingNumber || null,
          stockDeducted: true,
          stockReconciliationRequired: false,
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({ status, date: now, notes: isPickup ? 'Levantamento validado por S/N na All-Shop 3.0' : `Expedição validada por S/N na All-Shop 3.0${trackingNumber ? ` · Rastreio: ${trackingNumber}` : ''}` }),
        };
        if (userSnapshot?.exists && userRef) {
          const user = userSnapshot.data() ?? {};
          const multiplier = user.tier === 'Ouro' ? 1.5 : user.tier === 'Prata' ? 1.25 : 1;
          const points = Math.floor(Math.max(0, Number(order.total ?? 0)) * multiplier);
          transaction.update(userRef, { loyaltyPoints: Math.max(0, Number(user.loyaltyPoints ?? 0)) + points });
          update.pointsAwarded = true;
        }
        transaction.update(orderRef, update);
        transaction.set(database.collection('stock_movements').doc(), { type: 'SALE', orderId, items: updatedItems.map((item: DocumentData) => ({ productId: item.productId, quantity: item.quantity, unitIds: item.unitIds, serialNumbers: item.serialNumbers })), totalValue: Number(order.total ?? 0), createdAt: now, createdBy: admin.email });
        transaction.set(database.collection('admin_audit_log').doc(), { action, adminId: admin.uid, adminEmail: admin.email, orderId, changes: { status, trackingNumber: trackingNumber || null, serialNumbers: plan.serialNumbers }, createdAt: FieldValue.serverTimestamp() });
        return withDocument({ ...order, ...update, id: orderId });
      }

      let update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
      let restockContexts: RestockContext[] = [];

      if (action === 'update_tracking') {
        const requestedTrackingNumber = text(request.body?.trackingNumber, 150);
        const orderPackages = Array.isArray(order.packages) ? order.packages.filter((pkg: unknown) => pkg && typeof pkg === 'object') as DocumentData[] : [];
        const packageTrackingNumbers = Array.isArray(request.body?.packageTrackingNumbers)
          ? request.body.packageTrackingNumbers.slice(0, orderPackages.length).map((value: unknown) => text(value, 150))
          : undefined;
        if (orderPackages.length) {
          update.packages = orderPackages.map((pkg, index) => {
            const hasOverride = Array.isArray(packageTrackingNumbers);
            const packageTracking = hasOverride
              ? packageTrackingNumbers?.[index] ?? ''
              : text(pkg.trackingNumber, 150) || requestedTrackingNumber;
            return { ...pkg, trackingNumber: packageTracking || null };
          });
          update.trackingNumber = requestedTrackingNumber
            || update.packages.map((pkg: DocumentData) => text(pkg.trackingNumber, 150)).find(Boolean)
            || '';
        } else {
          update.trackingNumber = requestedTrackingNumber;
        }
      }

      if (action === 'set_status') {
        const status = text(request.body?.status, 60);
        if (!STATUSES.has(status)) throw new ApiError(400, 'Estado inválido.');
        if (status === String(order.status ?? 'Pendente')) return withDocument({ ...order, id: orderId });
        if (['Cancelado', 'Devolvido'].includes(String(order.status ?? ''))) {
          throw new ApiError(409, 'Uma encomenda cancelada ou devolvida fica fechada e não pode ser reaberta.');
        }
        if (order.status === 'Entregue' && status === 'Enviado') throw new ApiError(409, 'Uma encomenda entregue não pode voltar ao estado enviado.');
        if (status === 'Enviado' && !isOrderFulfillmentComplete(order)) throw new ApiError(409, 'Use “Preparar e expedir” para validar os S/N antes de marcar como enviado.');
        if (status === 'Entregue' && !isOrderFulfillmentComplete(order) && order.status !== 'Enviado') throw new ApiError(409, 'Valide primeiro a expedição e os S/N desta encomenda.');
        if (status === 'Cancelado') restockContexts = await prepareRestock(transaction, orderId, order);
        const userRef = typeof order.userId === 'string' && order.userId ? database.collection('users').doc(order.userId) : null;
        const needsUser = Boolean(userRef && ((status === 'Entregue' && !order.pointsAwarded) || status === 'Cancelado'));
        const userSnapshot = needsUser && userRef ? await transaction.get(userRef) : null;
        update = { ...update, status, statusHistory: FieldValue.arrayUnion({ status, date: now, notes: 'Estado alterado na All-Shop 3.0' }) };
        if (status === 'Cancelado' && restockContexts.length) { update.stockRestoredAt = now; update.stockRestoredItems = cleanItems(order); }
        if (order.cancellationRequest?.status === 'Pendente' && status === 'Cancelado') update.cancellationRequest = { ...order.cancellationRequest, status: 'Aprovado', reviewedAt: now, reviewedByUserId: admin.uid };

        if (userSnapshot?.exists && userRef) {
          const user = userSnapshot.data() ?? {};
          const total = Math.max(0, Number(order.total ?? 0));
          const multiplier = user.tier === 'Ouro' ? 1.5 : user.tier === 'Prata' ? 1.25 : 1;
          const points = Math.floor(total * multiplier);
          if (status === 'Entregue' && !order.pointsAwarded) {
            transaction.update(userRef, { loyaltyPoints: Math.max(0, Number(user.loyaltyPoints ?? 0)) + points });
            update.pointsAwarded = true;
          } else if (status === 'Cancelado') {
            const totalSpent = Math.max(0, Number(user.totalSpent ?? 0) - total);
            transaction.update(userRef, { loyaltyPoints: Math.max(0, Number(user.loyaltyPoints ?? 0) - (order.pointsAwarded ? points : 0)), totalSpent, tier: totalSpent >= 600 ? 'Ouro' : totalSpent >= 250 ? 'Prata' : 'Bronze' });
            if (order.pointsAwarded) update.pointsAwarded = false;
          }
        }
      }

      if (action === 'review_request') {
        const kind = request.body?.requestKind === 'return' ? 'return' : request.body?.requestKind === 'cancellation' ? 'cancellation' : null;
        const decision = request.body?.decision === 'approve' ? 'approve' : request.body?.decision === 'reject' ? 'reject' : null;
        if (!kind || !decision) throw new ApiError(400, 'Decisão inválida.');
        const field = kind === 'return' ? 'returnRequest' : 'cancellationRequest';
        if (order[field]?.status !== 'Pendente') throw new ApiError(409, 'Este pedido já não está pendente. Atualize a dashboard.');
        update[field] = { ...order[field], status: decision === 'approve' ? 'Aprovado' : 'Rejeitado', reviewNote: text(request.body?.reviewNote), reviewedAt: now, reviewedByUserId: admin.uid };
        update.statusHistory = FieldValue.arrayUnion({ status: `${kind === 'return' ? 'Devolução' : 'Cancelamento'} ${decision === 'approve' ? 'aprovado' : 'recusado'}`, date: now, notes: text(request.body?.reviewNote) || 'Decisão registada na All-Shop 3.0' });
        if (kind === 'cancellation' && decision === 'approve') {
          const allItems = cleanItems(order);
          const partial = order[field]?.type === 'PARCIAL';
          const requested = partial && Array.isArray(order[field]?.items) ? order[field].items.map((item: DocumentData) => ({ productId: Number(item.productId), quantity: Math.max(0, Number(item.quantity ?? 0)), variant: text(item.selectedVariant, 120) })).filter((item: { productId: number; quantity: number }) => Number.isInteger(item.productId) && item.productId > 0 && item.quantity > 0) : allItems;
          if (!requested.length) throw new ApiError(409, 'O pedido não contém artigos válidos para cancelar.');
          if (!validateCancellationItems(order, requested)) throw new ApiError(409, 'O pedido de cancelamento contém quantidades inválidas.');
          restockContexts = await prepareRestock(transaction, orderId, order, requested);
          const refund = calculateCancellationRefund(order, requested, partial);
          if (partial) {
            const remaining = applyPartialCancellation(order, requested);
            if (remaining.items) update.items = remaining.items;
            if (Array.isArray(order.packages)) update.packages = remaining.packages;
            update.status = remaining.remainingQuantity > 0 ? String(order.status ?? 'Processamento') : 'Cancelado';
            update.total = Math.max(0, Math.round((Number(order.total ?? 0) - refund) * 100) / 100);
          } else {
            update.status = 'Cancelado';
          }
          if (typeof order.userId === 'string' && order.userId) {
            const userRef = database.collection('users').doc(order.userId); const userSnapshot = await transaction.get(userRef);
            if (userSnapshot.exists) {
              const user = userSnapshot.data() ?? {}; const totalSpent = Math.max(0, Number(user.totalSpent ?? 0) - refund); const multiplier = user.tier === 'Ouro' ? 1.5 : user.tier === 'Prata' ? 1.25 : 1;
              transaction.update(userRef, { totalSpent, loyaltyPoints: Math.max(0, Number(user.loyaltyPoints ?? 0) - (order.pointsAwarded ? Math.floor(refund * multiplier) : 0)), tier: totalSpent >= 600 ? 'Ouro' : totalSpent >= 250 ? 'Prata' : 'Bronze' });
              if (!partial && order.pointsAwarded) update.pointsAwarded = false;
            }
          }
          if (restockContexts.length) { update.stockRestoredAt = now; update.stockRestoredItems = requested; }
        }
      }

      applyRestock(transaction, restockContexts);
      transaction.update(orderRef, update);
      transaction.set(database.collection('admin_audit_log').doc(), { action, adminId: admin.uid, adminEmail: admin.email, orderId, changes: { status: update.status ?? null, trackingNumber: update.trackingNumber ?? null }, createdAt: FieldValue.serverTimestamp() });
      return withDocument({ ...order, ...update, id: orderId });
    });
    const result = transactionResult.order;
    const persistedOrderRef = database.collection('orders').doc(transactionResult.documentId);

    let notification: { sentCount: number; failureCount: number } | undefined;
    if (action === 'fulfill_order') {
      try {
        notification = await notifyFulfillment(database, result);
        await persistedOrderRef.update({ fulfillmentNotification: { ...notification, attemptedAt: new Date().toISOString() } });
      } catch (notificationError) {
        notification = { sentCount: 0, failureCount: 1 };
        await persistedOrderRef.update({ fulfillmentNotification: { ...notification, attemptedAt: new Date().toISOString(), error: notificationError instanceof Error ? text(notificationError.message, 300) : 'Erro desconhecido' } }).catch(() => undefined);
      }
    }
    return response.status(200).json({ success: true, order: result, ...(notification ? { notification } : {}) });
  } catch (error) {
    return handleApiError(response, error);
  }
}

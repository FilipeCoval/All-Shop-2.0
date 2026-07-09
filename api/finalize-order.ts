import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';
import {
  asPositiveInt,
  getBatchPhysical,
  getMatchingBatches,
  makeReservationId,
  normaliseEmail,
  normaliseVariant,
  syncInventoryReservedSummary,
  syncPublicProductStock,
  allocateReservationSummaries,
  toReservationRecord,
  type ReservationRecord,
} from '../services/server/stock-utils.js';

type RequestedItem = {
  productId: number;
  selectedVariant: string;
  variantKey: string;
  quantity: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const validateOrderId = (value: unknown): string | null => {
  const id = String(value || '').trim().replace(/^#+/, '');
  return /^AS-\d{6,12}$/.test(id) ? id : null;
};

const calculateShipping = (subtotalAfterDiscount: number, shippingInfo: any): number => {
  if (shippingInfo?.deliveryMethod === 'Pickup') return 0;
  if (shippingInfo?.paymentMethod === 'Cobrança') return subtotalAfterDiscount < 50 ? 12 : 7;
  return subtotalAfterDiscount >= 50 ? 0 : 4.99;
};

const validateShippingInfo = (value: any) => {
  const info = value && typeof value === 'object' ? { ...value } : null;
  if (!info) throw new Error('Dados de entrega inválidos.');

  info.name = String(info.name || '').trim().slice(0, 120);
  info.email = normaliseEmail(info.email);
  info.phone = String(info.phone || '').trim().slice(0, 40);
  info.deliveryMethod = info.deliveryMethod === 'Pickup' ? 'Pickup' : 'Shipping';
  info.paymentMethod = ['MB Way', 'Transferência', 'Cobrança', 'Outro'].includes(info.paymentMethod) ? info.paymentMethod : 'MB Way';

  if (!info.name || !info.email || !info.phone) throw new Error('Preencha nome, email e telemóvel para concluir a encomenda.');
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

const parseItems = (itemsInput: unknown): RequestedItem[] => {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0 || itemsInput.length > 20) {
    throw new Error('O carrinho está vazio ou contém demasiados itens.');
  }

  const grouped = new Map<string, RequestedItem>();
  for (const item of itemsInput) {
    const productId = Number((item as any)?.productId);
    const quantity = asPositiveInt((item as any)?.quantity, 20);
    const selectedVariant = String((item as any)?.selectedVariant || '').trim().slice(0, 120);
    const variantKey = normaliseVariant(selectedVariant);
    if (!Number.isInteger(productId) || productId <= 0 || !quantity || quantity < 1) {
      throw new Error('Um item do carrinho é inválido. Atualize a página e tente novamente.');
    }

    const key = `${productId}|${variantKey}`;
    const previous = grouped.get(key);
    const nextQuantity = (previous?.quantity || 0) + quantity;
    if (nextQuantity > 20) throw new Error('A quantidade máxima por produto é 20 unidades.');
    grouped.set(key, { productId, selectedVariant, variantKey, quantity: nextQuantity });
  }
  return [...grouped.values()];
};

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'O checkout está temporariamente indisponível. Tente novamente dentro de momentos.' });

  try {
    const orderId = validateOrderId(req.body?.idempotencyKey ?? req.body?.order?.id);
    if (!orderId) return res.status(400).json({ error: 'Número de encomenda inválido. Volte ao carrinho e tente novamente.' });

    const identity = await getRequestIdentity(req, req.body?.guestToken);
    const requestedItems = parseItems(req.body?.items);
    const shippingInfo = validateShippingInfo(req.body?.shippingInfo ?? req.body?.order?.shippingInfo);
    const mode = req.body?.mode === 'pending' ? 'pending' : 'finalize';
    const isPendingMode = mode === 'pending';

    const result = await firestore.runTransaction(async (transaction) => {
      const orderRef = firestore.collection('orders').doc(orderId);
      const existingOrder = await transaction.get(orderRef);
      const existingData = existingOrder.exists ? (existingOrder.data() || {}) : null;
      if (existingData) {
        const existingEmail = normaliseEmail(existingData?.shippingInfo?.email || existingData?.customerEmail || existingData?.email || '');
        if (existingData.userId && existingData.userId !== identity.userId) {
          throw new Error('Este número de encomenda já está em utilização. Volte ao carrinho e tente novamente.');
        }
        if (!existingData.userId && existingEmail && existingEmail !== shippingInfo.email) {
          throw new Error('Este número de encomenda já está em utilização. Volte ao carrinho e tente novamente.');
        }
        if (isPendingMode || existingData.stockDeducted === true) {
          return { order: { id: orderId, ...existingData }, alreadyFinalized: existingData.stockDeducted === true };
        }
      }

      const productContexts = new Map<number, any>();
      for (const productId of [...new Set(requestedItems.map((item) => item.productId))]) {
        const inventoryQuery = firestore.collection('products_inventory').where('publicProductId', '==', productId);
        const reservationsQuery = firestore.collection('stock_reservations').where('productId', '==', productId);
        const publicRef = firestore.collection('products_public').doc(String(productId));
        const [inventorySnapshot, reservationsSnapshot, publicSnapshot] = await Promise.all([
          transaction.get(inventoryQuery),
          transaction.get(reservationsQuery),
          transaction.get(publicRef),
        ]);
        if (inventorySnapshot.empty || !publicSnapshot.exists) {
          throw new Error('Um dos produtos deixou de estar disponível. Atualize o carrinho.');
        }
        productContexts.set(productId, { inventorySnapshot, reservationsSnapshot, publicSnapshot, publicRef });
      }

      const now = Date.now();
      const canonicalItems: any[] = [];
      type SalePlan = { saleByBatch: Map<string, number>; remainingReservations: ReservationRecord[]; reservationIdsToDelete: string[] };
      const salePlans = new Map<number, SalePlan>();
      let subtotal = 0;
      let requestedFreebies = 0;

      for (const requested of requestedItems) {
        const context = productContexts.get(requested.productId);
        const publicData = context.publicSnapshot.data() || {};
        const matchingBatches = getMatchingBatches(context.inventorySnapshot.docs, requested.variantKey);
        if (matchingBatches.length === 0) throw new Error('A variação selecionada já não está disponível.');

        const activeReservations = context.reservationsSnapshot.docs
          .map(toReservationRecord)
          .filter((record: ReservationRecord | null): record is ReservationRecord => !!record && record.expiresAtMs > now);
        const ownReservationId = makeReservationId(identity.ownerKey, requested.productId, requested.variantKey);
        const ownReservation = activeReservations.find((reservation: ReservationRecord) => reservation.id === ownReservationId);
        const otherReservations = activeReservations.filter((reservation: ReservationRecord) => reservation.id !== ownReservationId);

        const physical = matchingBatches.reduce((sum: number, batch: any) => sum + getBatchPhysical(batch.data()).available, 0);
        const reservedByOthers = otherReservations
          .filter((reservation: ReservationRecord) => reservation.variantKey === requested.variantKey || (!reservation.variantKey && !!requested.variantKey))
          .reduce((sum: number, reservation: ReservationRecord) => sum + reservation.quantity, 0);
        const ownReservedQuantity = ownReservation?.quantity || 0;
        if (physical - reservedByOthers < requested.quantity) {
          throw new Error(`Já não existe stock suficiente para “${publicData.name || 'este produto'}”.`);
        }
        if (ownReservedQuantity > 0 && ownReservedQuantity < requested.quantity && physical - reservedByOthers < requested.quantity) {
          throw new Error(`A reserva de “${publicData.name || 'este produto'}” expirou. Atualize o carrinho.`);
        }

        const variant = Array.isArray(publicData.variants)
          ? publicData.variants.find((item: any) => normaliseVariant(item?.name) === requested.variantKey)
          : null;
        if (requested.variantKey && !variant && getMatchingBatches(context.inventorySnapshot.docs, requested.variantKey).length === 0) {
          throw new Error('A variação selecionada deixou de existir. Atualize o carrinho.');
        }

        const isFreebie = publicData.isFreebie === true;
        const unitPrice = isFreebie
          ? 0
          : Number(variant?.price ?? ((publicData.promoEndsAt && new Date(publicData.promoEndsAt).getTime() <= Date.now() && publicData.originalPrice) ? publicData.originalPrice : publicData.price));
        if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('O preço de um produto é inválido. Atualize a página.');
        if (publicData.maxQuantityPerOrder && requested.quantity > Number(publicData.maxQuantityPerOrder)) {
          throw new Error(`Só pode comprar até ${publicData.maxQuantityPerOrder} unidade(s) de “${publicData.name || 'este produto'}”.`);
        }

        if (isFreebie) requestedFreebies += requested.quantity;
        subtotal += unitPrice * requested.quantity;
        canonicalItems.push({
          productId: requested.productId,
          name: String(publicData.name || 'Produto'),
          price: roundMoney(unitPrice),
          image: variant?.image || publicData.image || '',
          description: typeof publicData.description === 'string' ? publicData.description : '',
          quantity: requested.quantity,
          selectedVariant: requested.selectedVariant,
          addedAt: new Date().toISOString(),
        });

        const previousPlan: SalePlan = salePlans.get(requested.productId) || { saleByBatch: new Map<string, number>(), remainingReservations: activeReservations, reservationIdsToDelete: [] as string[] };
        previousPlan.reservationIdsToDelete.push(ownReservationId);
        previousPlan.remainingReservations = previousPlan.remainingReservations.filter((reservation: ReservationRecord) => reservation.id !== ownReservationId);

        const reservationSummary = new Map<string, number>();
        // Existing reservations not belonging to this finalization are used below before allocating stock for the sale.
        for (const batch of context.inventorySnapshot.docs) reservationSummary.set(batch.id, 0);
        const allocationForOthers = allocateReservationSummaries(context.inventorySnapshot.docs, previousPlan.remainingReservations);
        for (const [batchId, qty] of allocationForOthers) reservationSummary.set(batchId, qty);

        let remainingToSell = requested.quantity;
        for (const batch of matchingBatches) {
          if (remainingToSell <= 0) break;
          const alreadyPlanned = previousPlan.saleByBatch.get(batch.id) || 0;
          const availableInBatch = Math.max(0, getBatchPhysical(batch.data()).available - (reservationSummary.get(batch.id) || 0) - alreadyPlanned);
          const take = Math.min(remainingToSell, availableInBatch);
          if (take > 0) {
            previousPlan.saleByBatch.set(batch.id, alreadyPlanned + take);
            remainingToSell -= take;
          }
        }
        if (remainingToSell > 0) throw new Error(`Já não existe stock suficiente para “${publicData.name || 'este produto'}”.`);
        salePlans.set(requested.productId, previousPlan);
      }

      if (requestedFreebies > 0) {
        if (!identity.userId) throw new Error('As ofertas estão disponíveis apenas para clientes com sessão iniciada.');
        const freebieUserRef = firestore.collection('users').doc(identity.userId);
        const userSnapshot = await transaction.get(freebieUserRef);
        if (!userSnapshot.exists || Number(userSnapshot.data()?.freebieQuota || 0) < requestedFreebies) {
          throw new Error('Não tem ofertas disponíveis para adicionar a esta encomenda.');
        }
        if (!isPendingMode) {
          transaction.update(freebieUserRef, { freebieQuota: Number(userSnapshot.data()?.freebieQuota || 0) - requestedFreebies });
        }
      }

      let discountValue = 0;
      let couponCode: string | undefined;
      const requestedCouponCode = String(req.body?.order?.couponCode || '').trim().toUpperCase();
      if (requestedCouponCode) {
        const couponQuery = firestore.collection('coupons').where('code', '==', requestedCouponCode).limit(1);
        const couponSnapshot = await transaction.get(couponQuery);
        if (couponSnapshot.empty) throw new Error('O cupão deixou de ser válido.');
        const couponDoc = couponSnapshot.docs[0];
        const coupon = couponDoc.data();
        if (!coupon.isActive || (coupon.maxUsages && Number(coupon.usageCount || 0) >= Number(coupon.maxUsages))) throw new Error('O cupão já não está disponível.');
        if (coupon.userId && coupon.userId !== identity.userId) throw new Error('Este cupão é exclusivo de outro cliente.');
        if (subtotal < Number(coupon.minPurchase || 0)) throw new Error('O valor mínimo do cupão deixou de ser atingido.');

        const couponBase = coupon.validProductId
          ? canonicalItems.filter((item) => Number(item.productId) === Number(coupon.validProductId)).reduce((sum, item) => sum + item.price * item.quantity, 0)
          : subtotal;
        if (coupon.validProductId && couponBase <= 0) throw new Error('O cupão não se aplica aos produtos deste carrinho.');
        discountValue = coupon.type === 'PERCENTAGE' ? couponBase * (Number(coupon.value || 0) / 100) : Number(coupon.value || 0);
        if (coupon.maxDiscount) discountValue = Math.min(discountValue, Number(coupon.maxDiscount));
        discountValue = roundMoney(Math.max(0, Math.min(discountValue, couponBase)));
        couponCode = requestedCouponCode;
        if (!isPendingMode) {
          const nextUsageCount = Number(coupon.usageCount || 0) + 1;
          transaction.update(couponDoc.ref, {
            usageCount: nextUsageCount,
            ...(coupon.maxUsages && nextUsageCount >= Number(coupon.maxUsages) ? { isActive: false } : {}),
          });
        }
      }

      const shippingCost = calculateShipping(roundMoney(subtotal - discountValue), shippingInfo);
      const total = roundMoney(subtotal - discountValue + shippingCost);

      if (!isPendingMode) {
        for (const [productId, plan] of salePlans.entries()) {
          const context = productContexts.get(productId);
          for (const batch of context.inventorySnapshot.docs) {
            const soldNow = plan.saleByBatch.get(batch.id) || 0;
            if (soldNow > 0) {
              transaction.update(batch.ref, { quantitySold: Number(batch.data().quantitySold || 0) + soldNow });
            }
          }
          for (const reservationId of [...new Set(plan.reservationIdsToDelete)]) {
            const reservationRef = firestore.collection('stock_reservations').doc(reservationId);
            transaction.delete(reservationRef);
          }
          syncInventoryReservedSummary(transaction, context.inventorySnapshot.docs, plan.remainingReservations);
          syncPublicProductStock(transaction, context.publicSnapshot, context.publicRef, context.inventorySnapshot.docs, plan.remainingReservations, plan.saleByBatch);
        }
      }

      const nowIso = new Date().toISOString();
      const previousHistory = Array.isArray(existingData?.statusHistory) ? existingData.statusHistory : [];
      const responseOrder = {
        id: orderId,
        date: existingData?.date || nowIso,
        total,
        status: isPendingMode ? 'Pendente' : 'Processamento',
        statusHistory: isPendingMode
          ? (previousHistory.length > 0 ? previousHistory : [{ status: 'Pendente', date: nowIso, notes: 'Pedido registado ao avançar para WhatsApp/Telegram.' }])
          : [
              ...previousHistory.filter((entry: any) => entry?.status !== 'Processamento'),
              { status: 'Processamento', date: nowIso, notes: 'Pedido confirmado pelo cliente.' }
            ],
        items: canonicalItems,
        userId: identity.userId || existingData?.userId || null,
        shippingInfo,
        stockDeducted: !isPendingMode,
        storeShippingCost: 5.4,
        ...(req.body?.guestToken && !identity.userId ? { guestToken: String(req.body.guestToken).slice(0, 120) } : {}),
        ...(discountValue > 0 ? { discountValue } : {}),
        ...(couponCode ? { couponCode } : {}),
        schemaVersion: 2,
      };
      transaction.set(orderRef, {
        ...responseOrder,
        ...(existingData ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { order: responseOrder, alreadyFinalized: !isPendingMode };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível concluir a encomenda.');
    console.error('[finalize-order]', error);
    const conflict = /stock|cupão|ofertas|número de encomenda/i.test(message);
    return res.status(conflict ? 409 : 400).json({ error: message });
  }
}

import type { Request, Response } from 'express';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';
import {
  getMatchingBatches,
  normaliseEmail,
  normaliseVariant,
  syncInventoryReservedSummary,
  syncPublicProductStock,
  toReservationRecord,
} from '../services/server/stock-utils.js';

type ClientAction = 'cancel_order' | 'cancel_item' | 'request_return';
type ReviewDecision = 'approve' | 'reject';

const ORDER_STATUSES = new Set([
  'Pendente',
  'Processamento',
  'Pago',
  'Enviado',
  'Entregue',
  'Cancelado',
  'Reclamação',
  'Devolvido',
  'Levantamento em Loja',
]);

const FALLBACK_ADMIN_EMAILS = new Set([
  'filipe_coval_90@hotmail.com',
  'filipecoval90@gmail.com',
  'mcpoleca@gmail.com',
  'filipe@teste.com',
]);

const cleanText = (value: unknown, max = 1200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanOrderId = (value: unknown) => String(value || '').trim().replace(/^#+/, '').slice(0, 80);

const getAdminEmails = () => {
  const configured = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => normaliseEmail(value))
    .filter(Boolean);
  return configured.length > 0 ? new Set(configured) : FALLBACK_ADMIN_EMAILS;
};

const isAdminEmail = (email: string | null) => !!email && getAdminEmails().has(normaliseEmail(email));

const safeOrderForOwner = (id: string, data: Record<string, any>) => {
  const { guestToken: _guestToken, ownerKey: _ownerKey, ...safe } = data || {};
  return { ...safe, id: String(safe.id || id).replace(/^#+/, '') };
};

const orderItems = (order: Record<string, any>) => Array.isArray(order.items)
  ? order.items.filter((item: any) => item && typeof item === 'object' && Number.isFinite(Number(item.productId)))
  : [];

const requestItems = (request: any, order: Record<string, any>) => {
  const rawItems = request?.type !== 'PARCIAL'
    ? orderItems(order).map((item: any) => ({
      productId: Number(item.productId),
      quantity: Math.max(0, Number(item.quantity || 0)),
      selectedVariant: item.selectedVariant ? String(item.selectedVariant) : '',
    })).filter((item) => item.quantity > 0)
    : Array.isArray(request?.items)
    ? request.items.map((item: any) => ({
      productId: Number(item.productId),
      quantity: Math.max(0, Number(item.quantity || 0)),
      selectedVariant: item.selectedVariant ? String(item.selectedVariant) : '',
    })).filter((item: any) => Number.isFinite(item.productId) && item.quantity > 0)
    : [];

  const grouped = new Map<string, { productId: number; quantity: number; selectedVariant: string }>();
  for (const item of rawItems) {
    const selectedVariant = String(item.selectedVariant || '');
    const key = `${item.productId}:${normaliseVariant(selectedVariant)}`;
    const current = grouped.get(key);
    grouped.set(key, {
      productId: item.productId,
      quantity: (current?.quantity || 0) + item.quantity,
      selectedVariant,
    });
  }
  return [...grouped.values()];
};

const restoreCancelledStock = async (
  transaction: Transaction,
  firestore: Firestore,
  orderId: string,
  order: Record<string, any>,
  cancellationItems: Array<{ productId: number; quantity: number; selectedVariant?: string }>,
) => {
  if (order.stockDeducted !== true || order.stockRestoredAt) return [];

  const contexts: Array<{
    productId: number;
    variantKey: string;
    quantity: number;
    publicRef: any;
    publicSnapshot: any;
    inventorySnapshots: any[];
    reservations: any[];
    restoreByBatch: Map<string, number>;
  }> = [];

  for (const cancelledItem of cancellationItems) {
    const productId = Number(cancelledItem.productId);
    const variantKey = normaliseVariant(cancelledItem.selectedVariant);
    const publicRef = firestore.collection('products_public').doc(String(productId));
    const publicSnapshot = await transaction.get(publicRef);
    if (!publicSnapshot.exists) throw new Error('Um produto desta encomenda já não existe no catálogo.');

    const inventoryQuery = firestore.collection('products_inventory').where('publicProductId', '==', productId);
    const reservationsQuery = firestore.collection('stock_reservations').where('productId', '==', productId);
    const [inventorySnapshot, reservationsSnapshot] = await Promise.all([
      transaction.get(inventoryQuery),
      transaction.get(reservationsQuery),
    ]);

    const matching = getMatchingBatches(inventorySnapshot.docs, variantKey);
    let remaining = Number(cancelledItem.quantity || 0);
    const restoreByBatch = new Map<string, number>();
    for (const batch of matching) {
      if (remaining <= 0) break;
      const data = batch.data();
      const assignedUnits = Array.isArray(data.units)
        ? data.units.filter((unit: any) => unit?.status === 'SOLD' && unit?.soldToOrder === orderId).length
        : 0;
      const restorable = assignedUnits > 0
        ? assignedUnits
        : Math.max(0, Number(data.quantitySold || 0));
      const restore = Math.min(remaining, restorable);
      if (restore > 0) {
        restoreByBatch.set(batch.id, restore);
        remaining -= restore;
      }
    }
    if (remaining > 0) {
      throw new Error('Não foi possível repor o stock deste artigo com segurança. Verifique os lotes no inventário.');
    }

    const activeReservations = reservationsSnapshot.docs
      .map(toReservationRecord)
      .filter((reservation): reservation is NonNullable<typeof reservation> => !!reservation)
      .filter((reservation) => reservation.expiresAtMs > Date.now());

    contexts.push({
      productId,
      variantKey,
      quantity: Number(cancelledItem.quantity || 0),
      publicRef,
      publicSnapshot,
      inventorySnapshots: inventorySnapshot.docs,
      reservations: activeReservations,
      restoreByBatch,
    });
  }

  const restocked: Array<{ productId: number; quantity: number; selectedVariant?: string }> = [];
  for (const context of contexts) {
    const stockAdjustments = new Map<string, number>();
    for (const batch of context.inventorySnapshots) {
      const restore = context.restoreByBatch.get(batch.id) || 0;
      if (restore <= 0) continue;

      const data = batch.data();
      const update: Record<string, any> = {
        quantitySold: Math.max(0, Number(data.quantitySold || 0) - restore),
      };
      if (Array.isArray(data.units)) {
        let unitsToRestore = restore;
        update.units = data.units.map((unit: any) => {
          if (unitsToRestore > 0 && unit?.status === 'SOLD' && unit?.soldToOrder === orderId) {
            unitsToRestore--;
            const { soldAt: _soldAt, soldToOrder: _soldToOrder, ...availableUnit } = unit;
            return { ...availableUnit, status: 'AVAILABLE' };
          }
          return unit;
        });
      }
      transaction.update(batch.ref, update);
      stockAdjustments.set(batch.id, -restore);
    }

    syncInventoryReservedSummary(transaction, context.inventorySnapshots, context.reservations, stockAdjustments);
    syncPublicProductStock(
      transaction,
      context.publicSnapshot,
      context.publicRef,
      context.inventorySnapshots,
      context.reservations,
      stockAdjustments,
    );
    restocked.push({
      productId: context.productId,
      quantity: context.quantity,
      ...(context.variantKey ? { selectedVariant: context.variantKey } : {}),
    });
  }
  return restocked;
};

/**
 * Protected customer request + admin review endpoint.
 * Customers can only request a cancellation/return. Only an authenticated admin
 * can approve/reject it. A cancellation approval restores stock atomically.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'O serviço de encomendas está temporariamente indisponível.' });

  try {
    const identity = await getRequestIdentity(req);
    const action = String(req.body?.action || '');
    const orderId = cleanOrderId(req.body?.orderId);
    if (!orderId) return res.status(400).json({ error: 'A encomenda é inválida.' });

    // ADMIN: change an order status through a verified server route. This avoids
    // browser-rule drift and keeps cancellation/restocking in one transaction.
    if (action === 'set_status') {
      if (!identity.userId || !isAdminEmail(identity.email)) {
        return res.status(403).json({ error: 'Não tem permissão para alterar encomendas.' });
      }

      const newStatus = cleanText(req.body?.status, 60);
      if (!ORDER_STATUSES.has(newStatus)) {
        return res.status(400).json({ error: 'Estado de encomenda inválido.' });
      }

      const result = await firestore.runTransaction(async (transaction) => {
        const orderRef = firestore.collection('orders').doc(orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists) throw new Error('Encomenda não encontrada.');
        const order = orderSnapshot.data() || {};
        const currentStatus = String(order.status || 'Pendente');
        if (currentStatus === newStatus) return safeOrderForOwner(orderSnapshot.id, order);

        const now = new Date().toISOString();
        const total = Math.max(0, Number(order.total || 0));
        const userRef = typeof order.userId === 'string' && order.userId.trim()
          ? firestore.collection('users').doc(order.userId)
          : null;
        const shouldReadUser = !!userRef && (
          (newStatus === 'Entregue' && !order.pointsAwarded)
          || (newStatus === 'Cancelado' && !!order.pointsAwarded)
        );
        const userSnapshot = shouldReadUser && userRef ? await transaction.get(userRef) : null;

        const update: Record<string, any> = {
          status: newStatus,
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({
            status: newStatus,
            date: now,
            notes: 'Estado alterado via Backoffice',
          }),
        };
        if (['Pendente', 'Processamento', 'Pago'].includes(newStatus)) {
          update.fulfillmentStatus = null;
        }

        if (newStatus === 'Cancelado' && currentStatus !== 'Cancelado') {
          const cancellationItems = requestItems({ type: 'TOTAL' }, order);
          if (cancellationItems.length === 0) throw new Error('Não foi possível identificar os artigos a cancelar.');
          const restocked = await restoreCancelledStock(
            transaction,
            firestore,
            orderId,
            order,
            cancellationItems,
          );
          if (order.stockDeducted === true && !order.stockRestoredAt) {
            update.stockRestoredAt = now;
            update.stockRestoredItems = restocked;
          }
          if (order.cancellationRequest?.status === 'Pendente') {
            update.cancellationRequest = {
              ...order.cancellationRequest,
              status: 'Aprovado',
              reviewedAt: now,
              reviewedByUserId: identity.userId,
              reviewNote: 'Cancelamento confirmado no Backoffice.',
            };
          }
        }

        if (userSnapshot?.exists && userRef) {
          const user = userSnapshot.data() || {};
          const tier = String(user.tier || 'Bronze');
          const multiplier = tier === 'Ouro' ? 1.5 : tier === 'Prata' ? 1.25 : 1;
          const points = Math.floor(total * multiplier);
          if (points > 0 && newStatus === 'Entregue' && !order.pointsAwarded) {
            transaction.update(userRef, {
              loyaltyPoints: Math.max(0, Number(user.loyaltyPoints || 0)) + points,
              pointsHistory: [{
                id: `earn-${orderId}`,
                date: now,
                amount: points,
                reason: `Compra #${orderId} (Nível ${tier})`,
                orderId,
              }, ...(Array.isArray(user.pointsHistory) ? user.pointsHistory : [])],
            });
            update.pointsAwarded = true;
          } else if (points > 0 && newStatus === 'Cancelado' && order.pointsAwarded) {
            const totalSpent = Math.max(0, Number(user.totalSpent || 0) - total);
            transaction.update(userRef, {
              totalSpent,
              tier: totalSpent >= 600 ? 'Ouro' : totalSpent >= 250 ? 'Prata' : 'Bronze',
              loyaltyPoints: Math.max(0, Number(user.loyaltyPoints || 0) - points),
              pointsHistory: [{
                id: `refund-${orderId}`,
                date: now,
                amount: -points,
                reason: `Cancelamento da Compra #${orderId}`,
                orderId,
              }, ...(Array.isArray(user.pointsHistory) ? user.pointsHistory : [])],
            });
            update.pointsAwarded = false;
          }
        }

        transaction.update(orderRef, update);
        return safeOrderForOwner(orderSnapshot.id, { ...order, ...update, status: newStatus });
      });

      return res.status(200).json({
        success: true,
        order: result,
        message: `Estado alterado para ${newStatus}.`,
      });
    }

    // ADMIN: approve/reject a pending customer request.
    if (action === 'review_request') {
      if (!identity.userId || !isAdminEmail(identity.email)) {
        return res.status(403).json({ error: 'Não tem permissão para analisar pedidos.' });
      }

      const decision = String(req.body?.decision || '') as ReviewDecision;
      const requestKind = String(req.body?.requestKind || '');
      const reviewNote = cleanText(req.body?.reviewNote, 1200);
      if (!['approve', 'reject'].includes(decision) || !['cancellation', 'return'].includes(requestKind)) {
        return res.status(400).json({ error: 'Decisão de análise inválida.' });
      }

      const result = await firestore.runTransaction(async (transaction) => {
        const orderRef = firestore.collection('orders').doc(orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists) throw new Error('Encomenda não encontrada.');
        const order = orderSnapshot.data() || {};
        const requestField = requestKind === 'cancellation' ? 'cancellationRequest' : 'returnRequest';
        const pendingRequest = order[requestField];
        if (!pendingRequest || pendingRequest.status !== 'Pendente') {
          throw new Error('Este pedido já não está pendente. Atualize a página.');
        }

        const now = new Date().toISOString();
        const reviewData = {
          ...pendingRequest,
          status: decision === 'approve' ? 'Aprovado' : 'Rejeitado',
          reviewedAt: now,
          reviewedByUserId: identity.userId,
          ...(reviewNote ? { reviewNote } : {}),
        };
        const update: Record<string, any> = {
          [requestField]: reviewData,
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({
            status: requestKind === 'cancellation'
              ? (decision === 'approve' ? 'Cancelamento aprovado' : 'Cancelamento recusado')
              : (decision === 'approve' ? 'Devolução aprovada' : 'Devolução recusada'),
            date: now,
            notes: reviewNote || 'Decisão registada no Backoffice.',
          }),
        };

        // A return is only approved as a request. Stock must be put back only after
        // the physical item is received and checked, avoiding false stock increases.
        if (requestKind === 'return' || decision === 'reject') {
          transaction.update(orderRef, update);
          return safeOrderForOwner(orderSnapshot.id, { ...order, ...update });
        }

        const cancellationItems = requestItems(pendingRequest, order);
        if (cancellationItems.length === 0) throw new Error('Não foi possível identificar os artigos a cancelar.');

        const restocked = await restoreCancelledStock(
          transaction,
          firestore,
          orderId,
          order,
          cancellationItems,
        );

        if (pendingRequest.type === 'PARCIAL') {
          const quantitiesToCancel = new Map(
            cancellationItems.map(item => [
              `${item.productId}:${normaliseVariant(item.selectedVariant)}`,
              item.quantity,
            ]),
          );
          const remainingItems = orderItems(order).map((item: any) => {
            const key = `${Number(item.productId)}:${normaliseVariant(item.selectedVariant)}`;
            const pendingQuantity = quantitiesToCancel.get(key) || 0;
            if (pendingQuantity <= 0) return item;
            const itemQuantity = Math.max(0, Number(item.quantity || 0));
            const cancelledQuantity = Math.min(itemQuantity, pendingQuantity);
            quantitiesToCancel.set(key, pendingQuantity - cancelledQuantity);
            return { ...item, quantity: itemQuantity - cancelledQuantity };
          }).filter((item: any) => Number(item.quantity || 0) > 0);
          update.items = remainingItems;
          update.status = remainingItems.length > 0 ? String(order.status || 'Processamento') : 'Cancelado';
        } else {
          update.status = 'Cancelado';
        }
        update.stockRestoredAt = order.stockDeducted === true ? now : undefined;
        update.stockRestoredItems = order.stockDeducted === true ? restocked : [];

        transaction.update(orderRef, update);
        return safeOrderForOwner(orderSnapshot.id, { ...order, ...update });
      });

      return res.status(200).json({
        success: true,
        order: result,
        message: decision === 'approve' ? 'Pedido aprovado com sucesso.' : 'Pedido recusado com sucesso.',
      });
    }

    // CUSTOMER: create a cancellation/return request. Never adjusts stock here.
    if (!identity.userId || !identity.email) return res.status(401).json({ error: 'Faça login para gerir a sua encomenda.' });
    const clientAction = action as ClientAction;
    if (!['cancel_order', 'cancel_item', 'request_return'].includes(clientAction)) {
      return res.status(400).json({ error: 'Ação de encomenda inválida.' });
    }

    const reason = cleanText(req.body?.reason);
    if (!reason) return res.status(400).json({ error: 'Indique o motivo do pedido.' });

    const result = await firestore.runTransaction(async (transaction) => {
      const orderRef = firestore.collection('orders').doc(orderId);
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) throw new Error('Encomenda não encontrada.');

      const order = orderSnapshot.data() || {};
      const ownerByUid = order.userId && order.userId === identity.userId;
      const ownerByEmail = normaliseEmail(order?.shippingInfo?.email || order.customerEmail || order.email) === identity.email;
      if (!ownerByUid && !ownerByEmail) throw new Error('Não tem permissão para alterar esta encomenda.');

      const currentStatus = String(order.status || 'Pendente');
      if (['Cancelado', 'Devolvido'].includes(currentStatus)) {
        throw new Error('Esta encomenda já não pode receber pedidos de alteração.');
      }

      const existingCancellation = order.cancellationRequest;
      const existingReturn = order.returnRequest;
      const now = new Date().toISOString();
      const baseUpdate: Record<string, any> = {
        userId: identity.userId,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (clientAction === 'request_return') {
        if (currentStatus !== 'Entregue') {
          throw new Error('A devolução só pode ser pedida depois de a encomenda ser entregue.');
        }
        if (existingReturn?.status === 'Pendente') {
          throw new Error('Já existe um pedido de devolução em análise para esta encomenda.');
        }
        baseUpdate.returnRequest = {
          status: 'Pendente',
          reason,
          requestedAt: now,
          requestedByUserId: identity.userId,
        };
        baseUpdate.statusHistory = FieldValue.arrayUnion({
          status: 'Pedido de devolução',
          date: now,
          notes: `Pedido enviado pelo cliente: ${reason}`,
        });
      } else {
        if (existingCancellation?.status === 'Pendente') {
          throw new Error('Já existe um pedido de cancelamento em análise para esta encomenda.');
        }

        let items: Array<{ productId: number; quantity: number; selectedVariant?: string }> | undefined;
        if (clientAction === 'cancel_item') {
          const productId = Number(req.body?.productId);
          const requestedQuantity = Number(req.body?.quantity);
          if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
            throw new Error('O artigo a cancelar é inválido.');
          }
          const orderItem = orderItems(order).find((item: any) => Number(item.productId) === productId);
          if (!orderItem || requestedQuantity > Number(orderItem.quantity || 0)) {
            throw new Error('O artigo indicado não pertence a esta encomenda.');
          }
          items = [{
            productId,
            quantity: requestedQuantity,
            ...(orderItem.selectedVariant ? { selectedVariant: String(orderItem.selectedVariant) } : {}),
          }];
        }

        baseUpdate.cancellationRequest = {
          status: 'Pendente',
          type: clientAction === 'cancel_item' ? 'PARCIAL' : 'TOTAL',
          reason,
          requestedAt: now,
          requestedByUserId: identity.userId,
          ...(items ? { items } : {}),
        };
        baseUpdate.statusHistory = FieldValue.arrayUnion({
          status: clientAction === 'cancel_item' ? 'Pedido de cancelamento parcial' : 'Pedido de cancelamento',
          date: now,
          notes: `Pedido enviado pelo cliente: ${reason}`,
        });
      }

      transaction.update(orderRef, baseUpdate);
      return safeOrderForOwner(orderSnapshot.id, { ...order, ...baseUpdate });
    });

    return res.status(200).json({
      success: true,
      order: result,
      message: clientAction === 'request_return'
        ? 'O pedido de devolução foi enviado para análise.'
        : 'O pedido de cancelamento foi enviado para análise.',
    });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível enviar o pedido.');
    console.error('[update-order]', error);
    const forbidden = /permissão|login/i.test(message);
    return res.status(forbidden ? 403 : 400).json({ error: message });
  }
}

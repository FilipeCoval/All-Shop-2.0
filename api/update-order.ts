import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
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
  if (request?.type !== 'PARCIAL') {
    return orderItems(order).map((item: any) => ({
      productId: Number(item.productId),
      quantity: Math.max(0, Number(item.quantity || 0)),
      selectedVariant: item.selectedVariant ? String(item.selectedVariant) : '',
    })).filter((item) => item.quantity > 0);
  }
  return Array.isArray(request?.items)
    ? request.items.map((item: any) => ({
      productId: Number(item.productId),
      quantity: Math.max(0, Number(item.quantity || 0)),
      selectedVariant: item.selectedVariant ? String(item.selectedVariant) : '',
    })).filter((item: any) => Number.isFinite(item.productId) && item.quantity > 0)
    : [];
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

        // Read all product/inventory/reservation documents before writing anything.
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
            const sold = Math.max(0, Number(batch.data().quantitySold || 0));
            const restore = Math.min(remaining, sold);
            if (restore > 0) {
              restoreByBatch.set(batch.id, restore);
              remaining -= restore;
            }
          }
          if (remaining > 0 && order.stockDeducted === true) {
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
        if (order.stockDeducted === true) {
          for (const context of contexts) {
            const stockAdjustments = new Map<string, number>();
            for (const batch of context.inventorySnapshots) {
              const restore = context.restoreByBatch.get(batch.id) || 0;
              if (restore > 0) {
                transaction.update(batch.ref, {
                  quantitySold: Math.max(0, Number(batch.data().quantitySold || 0) - restore),
                });
                // Negative adjustment tells the summary helper that this many units
                // are returning to available physical stock within the transaction.
                stockAdjustments.set(batch.id, -restore);
              }
            }
            syncInventoryReservedSummary(transaction, context.inventorySnapshots, context.reservations);
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
        }

        if (pendingRequest.type === 'PARCIAL') {
          const remainingItems = orderItems(order).map((item: any) => {
            const target = cancellationItems.find((cancelled: { productId: number; quantity: number; selectedVariant?: string }) =>
              Number(cancelled.productId) === Number(item.productId)
              && normaliseVariant(cancelled.selectedVariant) === normaliseVariant(item.selectedVariant),
            );
            return target ? { ...item, quantity: Math.max(0, Number(item.quantity || 0) - target.quantity) } : item;
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

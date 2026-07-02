import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';
import { normaliseEmail } from '../services/server/stock-utils.js';

type Action = 'cancel_order' | 'cancel_item' | 'request_return';

const cleanText = (value: unknown, max = 1200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanOrderId = (value: unknown) => String(value || '').trim().replace(/^#+/, '').slice(0, 80);

const safeOrderForOwner = (id: string, data: Record<string, any>) => {
  const { guestToken: _guestToken, ownerKey: _ownerKey, ...safe } = data || {};
  return { ...safe, id: String(safe.id || id).replace(/^#+/, '') };
};

/**
 * Protected client order actions. The browser can request a cancellation or
 * return, but never changes stock, inventory or order state directly.
 * Actual restocking remains an admin action after review.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'O serviço de encomendas está temporariamente indisponível.' });

  try {
    const identity = await getRequestIdentity(req);
    if (!identity.userId || !identity.email) return res.status(401).json({ error: 'Faça login para gerir a sua encomenda.' });

    const action = String(req.body?.action || '') as Action;
    if (!['cancel_order', 'cancel_item', 'request_return'].includes(action)) {
      return res.status(400).json({ error: 'Ação de encomenda inválida.' });
    }

    const orderId = cleanOrderId(req.body?.orderId);
    const reason = cleanText(req.body?.reason);
    if (!orderId || !reason) return res.status(400).json({ error: 'Indique o motivo do pedido.' });

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

      if (action === 'request_return') {
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
        if (action === 'cancel_item') {
          const productId = Number(req.body?.productId);
          const requestedQuantity = Number(req.body?.quantity);
          if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
            throw new Error('O artigo a cancelar é inválido.');
          }
          const orderItem = Array.isArray(order.items)
            ? order.items.find((item: any) => item && typeof item === 'object' && Number(item.productId) === productId)
            : null;
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
          type: action === 'cancel_item' ? 'PARCIAL' : 'TOTAL',
          reason,
          requestedAt: now,
          requestedByUserId: identity.userId,
          ...(items ? { items } : {}),
        };
        baseUpdate.statusHistory = FieldValue.arrayUnion({
          status: action === 'cancel_item' ? 'Pedido de cancelamento parcial' : 'Pedido de cancelamento',
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
      message: action === 'request_return'
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

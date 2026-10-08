import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';

const text = (value: unknown, max = 1200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    const database = getAdminDb();
    const action = text(request.body?.action, 50);
    let targetId = '';

    if (action === 'save_coupon') {
      const input = request.body?.coupon ?? {};
      targetId = text(input.id, 100) || database.collection('coupons').doc().id;
      const code = text(input.code, 40).toUpperCase();
      const type = input.type === 'FIXED' ? 'FIXED' : input.type === 'PERCENTAGE' ? 'PERCENTAGE' : null;
      if (!code || !type || number(input.value) <= 0) throw new ApiError(400, 'Preencha corretamente o código, tipo e desconto.');
      if (type === 'PERCENTAGE' && number(input.value) > 100) throw new ApiError(400, 'A percentagem não pode ultrapassar 100%.');
      const ref = database.collection('coupons').doc(targetId);
      const current = await ref.get();
      await ref.set({ code, type, value: number(input.value), minPurchase: Math.max(0, number(input.minPurchase)), maxDiscount: input.maxDiscount ? Math.max(0, number(input.maxDiscount)) : null, maxUsages: input.maxUsages ? Math.max(1, Math.floor(number(input.maxUsages))) : null, validProductId: input.validProductId ? Number(input.validProductId) : null, isActive: input.isActive !== false, usageCount: current.exists ? Math.max(0, number(current.data()?.usageCount)) : 0, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }, { merge: true });
    } else if (action === 'update_ticket') {
      targetId = text(request.body?.ticketId, 100);
      if (!targetId) throw new ApiError(400, 'Ticket inválido.');
      const status = text(request.body?.status, 40);
      const priority = text(request.body?.priority, 20);
      if (!['Aberto', 'Em Análise', 'Resolvido', 'Fechado'].includes(status) || !['Baixa', 'Média', 'Alta'].includes(priority)) throw new ApiError(400, 'Estado ou prioridade inválidos.');
      const update: Record<string, unknown> = { status, priority, unreadAdmin: false, updatedAt: new Date().toISOString(), updatedBy: admin.uid };
      const message = text(request.body?.message, 3000);
      if (message) update.messages = FieldValue.arrayUnion({ id: database.collection('_').doc().id, senderId: admin.uid, senderName: 'All-Shop', role: 'admin', text: message, timestamp: new Date().toISOString() });
      await database.collection('support_tickets').doc(targetId).update(update);
    } else if (action === 'update_request') {
      targetId = text(request.body?.requestId, 100);
      const status = text(request.body?.status, 30);
      if (!targetId || !['Análise', 'Concluído', 'Anulado'].includes(status)) throw new ApiError(400, 'Pedido ou estado inválido.');
      await database.collection('product_requests').doc(targetId).update({ status, adminComment: text(request.body?.adminComment, 2000), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
    } else if (action === 'save_import') {
      const input = request.body?.shipment ?? {};
      targetId = text(input.id, 100) || database.collection('import_shipments').doc().id;
      const name = text(input.name, 120);
      const status = text(input.status, 30);
      const distributionMethod = input.distributionMethod === 'VALUE' ? 'VALUE' : 'QUANTITY';
      if (!name || !['GATHERING', 'SHIPPED', 'RECEIVED'].includes(status)) throw new ApiError(400, 'Indique o nome e o estado da importação.');
      const rawOrders = Array.isArray(input.orders) ? input.orders.slice(0, 50) : [];
      const orders = rawOrders.map((rawOrder: Record<string, unknown>, orderIndex: number) => {
        const rawItems = Array.isArray(rawOrder.items) ? rawOrder.items.slice(0, 100) : [];
        return {
          id: text(rawOrder.id, 100) || `order-${Date.now()}-${orderIndex}`,
          supplierName: text(rawOrder.supplierName, 160),
          orderNumber: text(rawOrder.orderNumber, 120),
          localShippingCost: Math.max(0, number(rawOrder.localShippingCost)),
          items: rawItems.map((rawItem: Record<string, unknown>, itemIndex: number) => ({
            id: text(rawItem.id, 100) || `item-${Date.now()}-${orderIndex}-${itemIndex}`,
            publicProductId: number(rawItem.publicProductId) > 0 ? number(rawItem.publicProductId) : null,
            name: text(rawItem.name, 180), variant: text(rawItem.variant, 120),
            quantity: Math.max(1, Math.floor(number(rawItem.quantity))),
            unitPrice: Math.max(0, number(rawItem.unitPrice)), purchaseTotal: Math.max(0, number(rawItem.purchaseTotal)), salePrice: Math.max(0, number(rawItem.salePrice)),
            cashbackValue: Math.max(0, number(rawItem.cashbackValue)), cashbackPlatform: text(rawItem.cashbackPlatform, 120),
            cashbackStatus: ['PENDING', 'RECEIVED', 'REJECTED'].includes(text(rawItem.cashbackStatus, 20)) ? text(rawItem.cashbackStatus, 20) : 'NONE',
            cashbackExpectedDate: text(rawItem.cashbackExpectedDate, 30),
          })).filter((item: { name: string }) => item.name),
        };
      });
      const ref = database.collection('import_shipments').doc(targetId);
      const current = await ref.get();
      const purchaseCurrency = ['EUR', 'USD', 'GBP', 'CNY'].includes(text(input.purchaseCurrency, 10)) ? text(input.purchaseCurrency, 10) : 'OTHER';
      await ref.set({ name, status, distributionMethod, purchaseCurrency, actualPaidEur: Math.max(0, number(input.actualPaidEur)), exchangeRate: Math.max(0.0001, number(input.exchangeRate) || 1), agentShippingCost: Math.max(0, number(input.agentShippingCost)), customsCost: Math.max(0, number(input.customsCost)), trackingNumber: text(input.trackingNumber, 180), estimatedArrival: text(input.estimatedArrival, 30), notes: text(input.notes, 3000), orders, createdAt: current.exists ? current.data()?.createdAt ?? new Date().toISOString() : new Date().toISOString(), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }, { merge: true });
    } else if (action === 'delete_import') {
      targetId = text(request.body?.shipmentId, 100);
      if (!targetId) throw new ApiError(400, 'Importação inválida.');
      const ref = database.collection('import_shipments').doc(targetId);
      if (!(await ref.get()).exists) throw new ApiError(404, 'Importação não encontrada.');
      await ref.delete();
    } else if (action === 'update_import_status') {
      targetId = text(request.body?.shipmentId, 100);
      const status = text(request.body?.status, 30);
      if (!targetId || !['GATHERING', 'SHIPPED', 'RECEIVED'].includes(status)) throw new ApiError(400, 'Importação ou estado inválido.');
      await database.collection('import_shipments').doc(targetId).update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
    } else if (action === 'adjust_points') {
      targetId = text(request.body?.userId, 100);
      const amount = Math.trunc(number(request.body?.amount));
      const reason = text(request.body?.reason, 500);
      if (!targetId || !amount || !reason || Math.abs(amount) > 100000) throw new ApiError(400, 'Indique o cliente, o valor e o motivo do ajuste.');
      const userRef = database.collection('users').doc(targetId);
      await database.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists) throw new ApiError(404, 'Cliente não encontrado.');
        const current = snapshot.data() ?? {};
        transaction.update(userRef, { loyaltyPoints: Math.max(0, number(current.loyaltyPoints) + amount), pointsHistory: FieldValue.arrayUnion({ id: `admin-${Date.now()}`, date: new Date().toISOString(), amount, reason, adjustedBy: admin.uid }) });
      });
    } else if (action === 'save_category') {
      const input = request.body?.category ?? {};
      targetId = text(input.id, 100) || database.collection('store_categories').doc().id;
      const name = text(input.name, 80);
      const image = text(input.image, 2000);
      const order = Math.max(0, Math.trunc(number(input.order)));
      if (!name || !image || !/^https?:\/\//i.test(image)) throw new ApiError(400, 'Indique o nome e um endereço válido para a imagem.');
      await database.collection('store_categories').doc(targetId).set({ name, image, order, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }, { merge: true });
    } else if (action === 'delete_category') {
      targetId = text(request.body?.categoryId, 100);
      if (!targetId) throw new ApiError(400, 'Categoria inválida.');
      const categoryRef = database.collection('store_categories').doc(targetId);
      const categorySnapshot = await categoryRef.get();
      if (!categorySnapshot.exists) throw new ApiError(404, 'Categoria não encontrada.');
      const categoryName = text(categorySnapshot.data()?.name, 80);
      const products = categoryName ? await database.collection('products_public').where('category', '==', categoryName).limit(1).get() : null;
      if (products && !products.empty) throw new ApiError(409, 'Esta categoria ainda tem produtos. Mova-os antes de a apagar.');
      await categoryRef.delete();
    } else {
      throw new ApiError(400, 'Ação administrativa inválida.');
    }

    await database.collection('admin_audit_log').add({ action, targetId, adminId: admin.uid, adminEmail: admin.email, createdAt: FieldValue.serverTimestamp() });
    return response.status(200).json({ success: true, id: targetId });
  } catch (error) {
    return handleApiError(response, error);
  }
}

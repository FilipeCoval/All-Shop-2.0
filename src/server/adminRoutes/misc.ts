import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { isCommercialOrder, orderBelongsToClient, tierForTotal } from '../../features/admin/clientInsights.js';
import type { AdminOrder, AdminPointHistory } from '../../features/admin/adminTypes.js';

const text = (value: unknown, max = 1200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const uniqueStrings = (...values: unknown[]) => [...new Set(values.flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).map((value) => text(value, 500)).filter(Boolean))];

const mergePointHistories = (...histories: unknown[]) => {
  const unique = new Map<string, AdminPointHistory>();
  histories.flatMap((history) => Array.isArray(history) ? history : []).forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as Record<string, unknown>;
    const entry: AdminPointHistory = {
      id: text(item.id, 120) || undefined,
      date: text(item.date, 80) || undefined,
      amount: number(item.amount),
      reason: text(item.reason, 500),
      adjustedBy: text(item.adjustedBy, 120) || undefined,
    };
    const key = entry.id || `${entry.date}|${entry.amount}|${entry.reason}`;
    unique.set(key, entry);
  });
  return [...unique.values()]
    .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime())
    .slice(0, 1000);
};

async function notifySupportReply(database: ReturnType<typeof getAdminDb>, userId: string, subject: string) {
  if (!userId) return;
  try {
    const userSnapshot = await database.collection('users').doc(userId).get();
    const user = userSnapshot.data() ?? {};
    const rawTokens = Array.isArray(user.deviceTokens) ? user.deviceTokens : user.fcmToken ? [user.fcmToken] : [];
    const tokens = [...new Set(rawTokens.map((token: unknown) => text(token, 500)).filter((token: string) => token.length > 10))].slice(0, 500);
    if (!tokens.length) return;
    await getMessaging(getApp()).sendEachForMulticast({
      tokens,
      notification: { title: 'Resposta do suporte All-Shop', body: subject || 'Tem uma nova mensagem do suporte.' },
      webpush: {
        notification: { icon: 'https://i.imgur.com/nSiZKBf.png' },
        fcmOptions: { link: 'https://www.all-shop.net/#account' },
      },
    });
  } catch (cause) {
    console.warn('[support-push] Não foi possível enviar a notificação.', cause instanceof Error ? cause.message : cause);
  }
}

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
      const ticketRef = database.collection('support_tickets').doc(targetId);
      const ticketSnapshot = await ticketRef.get();
      if (!ticketSnapshot.exists) throw new ApiError(404, 'Pedido de suporte não encontrado.');
      const ticket = ticketSnapshot.data() ?? {};
      const update: Record<string, unknown> = { status, priority, unreadAdmin: false, updatedAt: new Date().toISOString(), updatedBy: admin.uid };
      const message = text(request.body?.message, 3000);
      if (message) {
        update.messages = FieldValue.arrayUnion({ id: database.collection('_').doc().id, senderId: admin.uid, senderName: 'All-Shop', role: 'admin', text: message, timestamp: new Date().toISOString() });
        update.unreadUser = true;
      }
      await ticketRef.update(update);
      if (message) await notifySupportReply(database, text(ticket.userId, 100), text(ticket.subject, 180));
    } else if (action === 'mark_ticket_read') {
      targetId = text(request.body?.ticketId, 100);
      if (!targetId) throw new ApiError(400, 'Ticket inválido.');
      const ticketRef = database.collection('support_tickets').doc(targetId);
      if (!(await ticketRef.get()).exists) throw new ApiError(404, 'Pedido de suporte não encontrado.');
      await ticketRef.update({ unreadAdmin: false, readByAdminAt: new Date().toISOString(), readByAdmin: admin.uid });
      return response.status(200).json({ success: true, id: targetId });
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
    } else if (action === 'update_client_quota') {
      targetId = text(request.body?.userId, 100);
      const freebieQuota = Math.trunc(number(request.body?.freebieQuota));
      if (!targetId || freebieQuota < 0 || freebieQuota > 1000) throw new ApiError(400, 'Indique uma quota de ofertas válida entre 0 e 1000.');
      const userRef = database.collection('users').doc(targetId);
      await database.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists || snapshot.data()?.isMerged) throw new ApiError(404, 'Cliente não encontrado.');
        transaction.update(userRef, { freebieQuota, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
      });
    } else if (action === 'recalculate_client_loyalty') {
      targetId = text(request.body?.userId, 100);
      if (!targetId) throw new ApiError(400, 'Cliente inválido.');
      const userRef = database.collection('users').doc(targetId);
      const userSnapshot = await userRef.get();
      if (!userSnapshot.exists || userSnapshot.data()?.isMerged) throw new ApiError(404, 'Cliente não encontrado.');
      const user = userSnapshot.data() ?? {};
      const orderSnapshot = await database.collection('orders').get();
      const commercialOrders = orderSnapshot.docs
        .map((document) => ({ id: document.id, ...document.data() } as AdminOrder))
        .filter((order) => orderBelongsToClient(order, { id: targetId, email: text(user.email, 320) }))
        .filter(isCommercialOrder);
      const totalSpent = commercialOrders.reduce((sum, order) => sum + Math.max(0, number(order.total)), 0);
      const tier = tierForTotal(totalSpent);
      await userRef.update({ totalSpent, tier, loyaltySyncedAt: FieldValue.serverTimestamp(), loyaltySyncedBy: admin.uid });
    } else if (action === 'merge_client_accounts') {
      const primaryUserId = text(request.body?.primaryUserId, 100);
      const duplicateUserId = text(request.body?.duplicateUserId, 100);
      const confirmation = text(request.body?.confirmation, 20).toUpperCase();
      if (!primaryUserId || !duplicateUserId || primaryUserId === duplicateUserId) throw new ApiError(400, 'Escolha duas contas diferentes.');
      if (confirmation !== 'FUNDIR') throw new ApiError(400, 'Escreva FUNDIR para confirmar a operação.');
      targetId = primaryUserId;
      const primaryRef = database.collection('users').doc(primaryUserId);
      const duplicateRef = database.collection('users').doc(duplicateUserId);
      const [primarySnapshot, duplicateSnapshot, orderSnapshot] = await Promise.all([
        primaryRef.get(),
        duplicateRef.get(),
        database.collection('orders').get(),
      ]);
      if (!primarySnapshot.exists || primarySnapshot.data()?.isMerged) throw new ApiError(404, 'A conta principal não foi encontrada.');
      if (!duplicateSnapshot.exists || duplicateSnapshot.data()?.isMerged) throw new ApiError(404, 'A conta duplicada não foi encontrada ou já foi fundida.');
      const primary = primarySnapshot.data() ?? {};
      const duplicate = duplicateSnapshot.data() ?? {};
      const duplicateEmail = text(duplicate.email, 320).toLocaleLowerCase('pt');
      const duplicateOrders = orderSnapshot.docs.filter((document) => {
        const order = document.data() as AdminOrder;
        if (order.userId === duplicateUserId) return true;
        return !order.userId && Boolean(duplicateEmail) && text(order.shippingInfo?.email, 320).toLocaleLowerCase('pt') === duplicateEmail;
      });
      if (duplicateOrders.length > 440) throw new ApiError(409, 'Esta conta tem demasiadas encomendas para uma fusão automática. Contacte o suporte técnico.');
      const mergedAt = new Date().toISOString();
      const mergedTotalSpent = Math.max(0, number(primary.totalSpent) + number(duplicate.totalSpent));
      const batch = database.batch();
      duplicateOrders.forEach((order) => batch.update(order.ref, { userId: primaryUserId, mergedFromUserId: duplicateUserId, mergedAt }));
      const deviceTokens = uniqueStrings(primary.deviceTokens, primary.fcmToken, duplicate.deviceTokens, duplicate.fcmToken);
      batch.update(primaryRef, {
        loyaltyPoints: Math.max(0, number(primary.loyaltyPoints) + number(duplicate.loyaltyPoints)),
        totalSpent: mergedTotalSpent,
        tier: tierForTotal(mergedTotalSpent),
        freebieQuota: Math.max(0, Math.trunc(number(primary.freebieQuota) + number(duplicate.freebieQuota))),
        pointsHistory: mergePointHistories(primary.pointsHistory, duplicate.pointsHistory),
        deviceTokens,
        ...(deviceTokens[0] ? { fcmToken: deviceTokens[0] } : {}),
        mergedAccountIds: FieldValue.arrayUnion(duplicateUserId),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      });
      batch.update(duplicateRef, {
        isMerged: true,
        mergedInto: primaryUserId,
        mergedAt,
        loyaltyPoints: 0,
        freebieQuota: 0,
        deviceTokens: [],
        fcmToken: FieldValue.delete(),
        updatedBy: admin.uid,
      });
      await batch.commit();
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

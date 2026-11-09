import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { allowedAdminEmails, ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

async function sendPush(database: ReturnType<typeof getAdminDb>, users: FirebaseFirestore.QueryDocumentSnapshot[], title: string, body: string, image: string, link: string) {
  const tokens: string[] = [];
  users.forEach((document) => {
    const user = document.data();
    if (Array.isArray(user.deviceTokens)) tokens.push(...user.deviceTokens);
    if (user.fcmToken) tokens.push(user.fcmToken);
  });
  const uniqueTokens = [...new Set(tokens.map(String).filter((token) => token.length > 20))];
  if (!uniqueTokens.length) return { sentCount: 0, failureCount: 0, devices: 0 };

  let sentCount = 0; let failureCount = 0; const invalidTokens: string[] = [];
  for (const group of chunks(uniqueTokens, 500)) {
    const result = await getMessaging().sendEachForMulticast({
      tokens: group,
      notification: { title, body, ...(image ? { imageUrl: image } : {}) },
      webpush: { notification: { icon: 'https://i.imgur.com/nSiZKBf.png', ...(image ? { image } : {}) }, fcmOptions: { link } },
    });
    sentCount += result.successCount; failureCount += result.failureCount;
    result.responses.forEach((item, index) => {
      if (!item.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(item.error?.code ?? '')) invalidTokens.push(group[index]);
    });
  }
  if (invalidTokens.length) {
    const batch = database.batch();
    users.forEach((document) => {
      const user = document.data();
      const next = Array.isArray(user.deviceTokens) ? user.deviceTokens.filter((token: string) => !invalidTokens.includes(token)) : [];
      const update: Record<string, unknown> = {};
      if (Array.isArray(user.deviceTokens) && next.length !== user.deviceTokens.length) update.deviceTokens = next;
      if (user.fcmToken && invalidTokens.includes(user.fcmToken)) update.fcmToken = FieldValue.delete();
      if (Object.keys(update).length) batch.update(document.ref, update);
    });
    await batch.commit();
  }
  return { sentCount, failureCount, devices: uniqueTokens.length };
}

const alertIdsFrom = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map((id) => clean(id, 180)).filter(Boolean))].slice(0, 300)
  : [];

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    const database = getAdminDb();
    const action = clean(request.body?.action, 80);

    if (action === 'close_stock_waitlist') {
      const alertIds = alertIdsFrom(request.body?.alertIds);
      if (!alertIds.length) throw new ApiError(400, 'Selecione pelo menos um pedido da lista de espera.');
      const references = alertIds.map((id) => database.collection('stock_alerts').doc(id));
      const snapshots = await database.getAll(...references);
      const batch = database.batch(); let closedCount = 0;
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists || snapshot.data()?.status === 'NOTIFIED') return;
        batch.update(snapshot.ref, { status: 'NOTIFIED', notifiedAt: FieldValue.serverTimestamp(), notifiedBy: admin.email });
        closedCount += 1;
      });
      if (closedCount) await batch.commit();
      await database.collection('admin_audit_log').add({ action: 'close_stock_waitlist', targetId: `${closedCount} alertas`, adminId: admin.uid, adminEmail: admin.email, createdAt: FieldValue.serverTimestamp() });
      return response.status(200).json({ success: true, closedCount });
    }

    if (action === 'notify_stock_waitlist') {
      const alertIds = alertIdsFrom(request.body?.alertIds);
      const title = clean(request.body?.title, 120);
      const body = clean(request.body?.body, 500);
      const link = clean(request.body?.link, 2000) || 'https://www.all-shop.net';
      if (!alertIds.length) throw new ApiError(400, 'Selecione pelo menos um pedido da lista de espera.');
      if (!title || !body) throw new ApiError(400, 'Preencha o título e a mensagem.');
      if (!/^https:\/\//i.test(link)) throw new ApiError(400, 'O destino tem de usar um endereço HTTPS.');
      const alertSnapshots = await database.getAll(...alertIds.map((id) => database.collection('stock_alerts').doc(id)));
      const emails = new Set(alertSnapshots
        .filter((snapshot) => snapshot.exists && snapshot.data()?.status !== 'NOTIFIED')
        .map((snapshot) => clean(snapshot.data()?.email, 180).toLowerCase())
        .filter(Boolean));
      if (!emails.size) return response.status(200).json({ success: true, sentCount: 0, failureCount: 0, message: 'Estes pedidos já foram fechados ou não têm email.' });
      const usersSnapshot = await database.collection('users').get();
      const targetUsers = usersSnapshot.docs.filter((document) => emails.has(clean(document.data()?.email, 180).toLowerCase()));
      const result = await sendPush(database, targetUsers, title, body, '', link);
      await database.collection('admin_audit_log').add({ action: 'notify_stock_waitlist_push', targetId: `${emails.size} alertas`, adminId: admin.uid, adminEmail: admin.email, ...result, createdAt: FieldValue.serverTimestamp() });
      return response.status(200).json({ success: true, ...result, matchedCustomers: targetUsers.length, bcc: [...emails].join(', ') });
    }

    const title = clean(request.body?.title, 120);
    const body = clean(request.body?.body, 500);
    const image = clean(request.body?.image, 2000);
    const link = clean(request.body?.link, 2000) || 'https://www.all-shop.net';
    const target = request.body?.target === 'admins' ? 'admins' : 'all';
    if (!title || !body) throw new ApiError(400, 'Preencha o título e a mensagem.');
    if ((image && !/^https:\/\//i.test(image)) || !/^https:\/\//i.test(link)) throw new ApiError(400, 'A imagem e o destino têm de usar um endereço HTTPS.');

    const users = await database.collection('users').get();
    const adminEmails = allowedAdminEmails();
    const targetUsers = users.docs.filter((document) => {
      const user = document.data();
      return target !== 'admins' || Boolean(user.email && adminEmails.has(String(user.email).trim().toLowerCase()));
    });
    const result = await sendPush(database, targetUsers, title, body, image, link);
    if (!result.devices) return response.status(200).json({ success: true, ...result, message: 'Não existem dispositivos registados para este público.' });
    await database.collection('admin_audit_log').add({ action: 'send_marketing_push', targetId: target, adminId: admin.uid, adminEmail: admin.email, ...result, createdAt: FieldValue.serverTimestamp() });
    return response.status(200).json({ success: true, ...result });
  } catch (error) { return handleApiError(response, error); }
}

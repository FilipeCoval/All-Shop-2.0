import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { allowedAdminEmails, ApiError, handleApiError, requireAdmin, requirePost } from '../src/server/adminAuth.js';
import { getAdminDb } from '../src/server/firebaseAdmin.js';

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    const title = clean(request.body?.title, 120);
    const body = clean(request.body?.body, 500);
    const image = clean(request.body?.image, 2000);
    const link = clean(request.body?.link, 2000) || 'https://www.all-shop.net';
    const target = request.body?.target === 'admins' ? 'admins' : 'all';
    if (!title || !body) throw new ApiError(400, 'Preencha o título e a mensagem.');
    if ((image && !/^https:\/\//i.test(image)) || !/^https:\/\//i.test(link)) throw new ApiError(400, 'A imagem e o destino têm de usar um endereço HTTPS.');

    const database = getAdminDb();
    const users = await database.collection('users').get();
    const adminEmails = allowedAdminEmails();
    const tokens: string[] = [];
    users.forEach((document) => {
      const user = document.data();
      if (target === 'admins' && (!user.email || !adminEmails.has(String(user.email).trim().toLowerCase()))) return;
      if (Array.isArray(user.deviceTokens)) tokens.push(...user.deviceTokens);
      if (user.fcmToken) tokens.push(user.fcmToken);
    });
    const uniqueTokens = [...new Set(tokens.map(String).filter((token) => token.length > 20))];
    if (!uniqueTokens.length) return response.status(200).json({ success: true, sentCount: 0, failureCount: 0, message: 'Não existem dispositivos registados para este público.' });

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

    await database.collection('admin_audit_log').add({ action: 'send_marketing_push', targetId: target, adminId: admin.uid, adminEmail: admin.email, sentCount, failureCount, createdAt: FieldValue.serverTimestamp() });
    return response.status(200).json({ success: true, sentCount, failureCount });
  } catch (error) { return handleApiError(response, error); }
}

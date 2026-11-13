import { getApp } from 'firebase-admin/app';
import { FieldValue, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { allowedAdminEmails } from '../../src/server/adminAuth.js';

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

const adminPwaLink = (orderId: string) => {
  const base = clean(process.env.ADMIN_PWA_URL, 1000) || 'https://all-shop-admin.vercel.app/';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}tab=orders&order=${encodeURIComponent(orderId)}`;
};

export async function notifyAdminsOfNewOrder(database: Firestore, order: Record<string, any>) {
  const users = await database.collection('users').get();
  const allowedEmails = allowedAdminEmails();
  const adminDocuments: QueryDocumentSnapshot[] = [];
  const tokens: string[] = [];

  users.forEach((document) => {
    const data = document.data();
    const email = clean(data.normalizedEmail || data.email, 200).toLowerCase();
    if (!allowedEmails.has(email)) return;
    adminDocuments.push(document);
    const candidates = Array.isArray(data.deviceTokens) ? data.deviceTokens : data.fcmToken ? [data.fcmToken] : [];
    tokens.push(...candidates.map((token: unknown) => clean(token)).filter((token: string) => token.length > 20));
  });

  const uniqueTokens = [...new Set(tokens)].slice(0, 500);
  if (!uniqueTokens.length) return { sent: 0, failed: 0 };

  const orderId = clean(order.id, 80).replace(/^#/, '');
  const customer = clean(order.shippingInfo?.name || order.shippingInfo?.email, 120) || 'Novo cliente';
  const total = Number(order.total || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  const link = adminPwaLink(orderId);
  const result = await getMessaging(getApp()).sendEachForMulticast({
    tokens: uniqueTokens,
    notification: {
      title: `Nova encomenda #${orderId}`,
      body: `${customer} · ${total}`,
    },
    data: { type: 'new_order', orderId, link },
    webpush: {
      notification: {
        icon: 'https://i.imgur.com/nSiZKBf.png',
        badge: 'https://i.imgur.com/nSiZKBf.png',
        tag: `allshop-order-${orderId}`,
        renotify: true,
      },
      fcmOptions: { link },
    },
  });

  const invalidTokens = result.responses.flatMap((response, index) => {
    const code = response.error?.code || '';
    return !response.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)
      ? [uniqueTokens[index]]
      : [];
  });
  if (invalidTokens.length) {
    const batch = database.batch();
    adminDocuments.forEach((document) => {
      const data = document.data();
      const update: Record<string, unknown> = { deviceTokens: FieldValue.arrayRemove(...invalidTokens) };
      if (invalidTokens.includes(clean(data.fcmToken))) update.fcmToken = FieldValue.delete();
      batch.update(document.ref, update);
    });
    await batch.commit();
  }

  return { sent: result.successCount, failed: result.failureCount };
}

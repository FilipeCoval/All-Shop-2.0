import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';

const LOYALTY_TIERS = {
  BRONZE: { threshold: 0, multiplier: 1 },
  SILVER: { threshold: 200, multiplier: 1.25 },
  GOLD: { threshold: 500, multiplier: 1.5 },
} as const;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const asDateMs = (value: unknown) => {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const determineTier = (totalSpent: number) => {
  if (totalSpent >= LOYALTY_TIERS.GOLD.threshold) return 'Ouro';
  if (totalSpent >= LOYALTY_TIERS.SILVER.threshold) return 'Prata';
  return 'Bronze';
};

const multiplierForTier = (tier: string) => {
  if (tier === 'Ouro') return LOYALTY_TIERS.GOLD.multiplier;
  if (tier === 'Prata') return LOYALTY_TIERS.SILVER.multiplier;
  return LOYALTY_TIERS.BRONZE.multiplier;
};

const sanitizeOrderForOwner = (id: string, data: Record<string, any>) => {
  const { guestToken: _guestToken, ownerKey: _ownerKey, ...safe } = data || {};
  return { ...safe, id: String(safe.id || id).replace(/^#+/, '') };
};

/**
 * Authenticated user synchronisation. The browser never receives permission
 * to adopt guest orders or award loyalty points directly in Firestore.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'A área de cliente está temporariamente indisponível. Tente novamente dentro de momentos.' });

  try {
    const identity = await getRequestIdentity(req);
    if (!identity.userId || !identity.email) return res.status(401).json({ error: 'Faça login para consultar as suas encomendas.' });

    const result = await firestore.runTransaction(async (transaction) => {
      const userRef = firestore.collection('users').doc(identity.userId!);
      const byUserQuery = firestore.collection('orders').where('userId', '==', identity.userId);
      // Query by email only avoids requiring a composite index. We filter old
      // guest orders in the transaction before adopting them.
      const byEmailQuery = firestore.collection('orders').where('shippingInfo.email', '==', identity.email);
      const [userSnapshot, byUserSnapshot, byEmailSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(byUserQuery),
        transaction.get(byEmailQuery),
      ]);

      const orderMap = new Map<string, any>();
      byUserSnapshot.docs.forEach((snapshot) => orderMap.set(snapshot.id, snapshot));
      const guestOrders = byEmailSnapshot.docs.filter((snapshot) => {
        const data = snapshot.data() || {};
        return !data.userId || data.userId === identity.userId;
      });
      guestOrders.forEach((snapshot) => orderMap.set(snapshot.id, snapshot));
      const allOrders = [...orderMap.values()];

      const totalSpent = roundMoney(allOrders
        .filter((snapshot) => String(snapshot.data()?.status || '') !== 'Cancelado')
        .reduce((sum, snapshot) => sum + Number(snapshot.data()?.total || 0), 0));
      const tier = determineTier(totalSpent);

      const ordersNeedingAdoption = guestOrders.filter((snapshot) => !snapshot.data()?.userId);
      const ordersNeedingPoints = allOrders.filter((snapshot) => {
        const data = snapshot.data() || {};
        return data.status === 'Entregue' && data.pointsAwarded !== true;
      });

      const existingUser = userSnapshot.exists ? (userSnapshot.data() || {}) : {};
      const history = Array.isArray(existingUser.pointsHistory) ? existingUser.pointsHistory : [];
      const multiplier = multiplierForTier(tier);
      const pointEvents = ordersNeedingPoints.map((snapshot) => {
        const data = snapshot.data() || {};
        const points = Math.max(0, Math.floor(Number(data.total || 0) * multiplier));
        return {
          id: `order-${snapshot.id}`,
          date: new Date().toISOString(),
          amount: points,
          reason: `Compra #${String(data.id || snapshot.id).replace(/^#+/, '').slice(-6)} (Nível ${tier})`,
          orderId: snapshot.id,
        };
      }).filter((event) => event.amount > 0 && !history.some((item: any) => item?.orderId === event.orderId));

      if (!userSnapshot.exists) {
        transaction.set(userRef, {
          uid: identity.userId,
          email: identity.email,
          name: 'Cliente',
          addresses: [],
          wishlist: [],
          loyaltyPoints: 0,
          pointsHistory: [],
          totalSpent: 0,
          tier: 'Bronze',
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      for (const snapshot of ordersNeedingAdoption) {
        transaction.update(snapshot.ref, { userId: identity.userId, updatedAt: FieldValue.serverTimestamp() });
      }
      for (const snapshot of ordersNeedingPoints) {
        transaction.update(snapshot.ref, { pointsAwarded: true, updatedAt: FieldValue.serverTimestamp() });
      }

      const loyaltyPoints = Math.max(0, Number(existingUser.loyaltyPoints || 0) + pointEvents.reduce((sum, event) => sum + event.amount, 0));
      transaction.set(userRef, {
        totalSpent,
        tier,
        ...(pointEvents.length > 0 ? { loyaltyPoints, pointsHistory: [...pointEvents, ...history] } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const safeOrders = (allOrders
        .map((snapshot) => sanitizeOrderForOwner(snapshot.id, snapshot.data() || {})) as any[])
        .sort((a: any, b: any) => asDateMs(b.date) - asDateMs(a.date));

      return { orders: safeOrders };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível sincronizar a conta.');
    console.error('[sync-user]', error);
    return res.status(/sessão|login/i.test(message) ? 401 : 500).json({ error: message });
  }
}

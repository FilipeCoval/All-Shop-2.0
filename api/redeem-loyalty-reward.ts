import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';

type Reward = {
  id: string;
  points: number;
  label: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  maxDiscount?: number;
  minPurchase: number;
  codePart: string;
};

// This is deliberately kept on the server. A customer may select a reward,
// but must never be able to submit their own cost, discount or voucher value.
const REWARDS: Record<string, Reward> = {
  voucher_5: { id: 'voucher_5', points: 200, label: 'Voucher 5%', type: 'PERCENTAGE', value: 5, maxDiscount: 5, minPurchase: 0, codePart: '5P' },
  voucher_7: { id: 'voucher_7', points: 500, label: 'Voucher 7%', type: 'PERCENTAGE', value: 7, maxDiscount: 15, minPurchase: 0, codePart: '7P' },
  voucher_10: { id: 'voucher_10', points: 1000, label: 'Voucher 10%', type: 'PERCENTAGE', value: 10, maxDiscount: 30, minPurchase: 0, codePart: '10P' },
  free_shipping: { id: 'free_shipping', points: 400, label: 'Portes Grátis', type: 'FIXED', value: 4.99, maxDiscount: 4.99, minPurchase: 0, codePart: 'ENVIO' },
  // Compatibility with the previous, embedded customer-area reward list.
  vouch_2: { id: 'vouch_2', points: 200, label: 'Vale de 2€', type: 'FIXED', value: 2, minPurchase: 10, codePart: '2E' },
  vouch_5: { id: 'vouch_5', points: 500, label: 'Vale de 5€', type: 'FIXED', value: 5, minPurchase: 20, codePart: '5E' },
  vouch_10: { id: 'vouch_10', points: 1000, label: 'Vale de 10€', type: 'FIXED', value: 10, minPurchase: 50, codePart: '10E' },
  vouch_25: { id: 'vouch_25', points: 2500, label: 'Vale de 25€', type: 'FIXED', value: 25, minPurchase: 100, codePart: '25E' },
};

const couponCodeFor = (reward: Reward) => `ALL-${reward.codePart}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'A troca de pontos está temporariamente indisponível. Tente novamente dentro de momentos.' });

  try {
    const identity = await getRequestIdentity(req);
    if (!identity.userId) return res.status(401).json({ error: 'Inicie sessão para trocar os seus pontos.' });

    const rewardId = String(req.body?.rewardId || '').trim();
    const reward = REWARDS[rewardId];
    if (!reward) return res.status(400).json({ error: 'A recompensa selecionada já não está disponível.' });

    const code = couponCodeFor(reward);
    const result = await firestore.runTransaction(async (transaction) => {
      const userRef = firestore.collection('users').doc(identity.userId!);
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) throw new Error('Não encontrámos a sua conta. Termine sessão e entre novamente.');

      const user = userSnapshot.data() || {};
      const availablePoints = Math.max(0, Math.floor(Number(user.loyaltyPoints || 0)));
      if (availablePoints < reward.points) throw new Error('Já não tem pontos suficientes para esta recompensa.');

      const now = new Date().toISOString();
      const pointEvent = {
        id: `redeem-${randomUUID()}`,
        date: now,
        amount: -reward.points,
        reason: `Troca por ${reward.label}`,
      };
      const couponRef = firestore.collection('coupons').doc();
      const coupon = {
        code,
        type: reward.type,
        value: reward.value,
        minPurchase: reward.minPurchase,
        ...(reward.maxDiscount ? { maxDiscount: reward.maxDiscount } : {}),
        isActive: true,
        usageCount: 0,
        maxUsages: 1,
        userId: identity.userId,
        source: 'loyalty_reward',
        rewardId: reward.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.create(couponRef, coupon);
      transaction.update(userRef, {
        loyaltyPoints: availablePoints - reward.points,
        pointsHistory: [...(Array.isArray(user.pointsHistory) ? user.pointsHistory : []), pointEvent],
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        code,
        loyaltyPoints: availablePoints - reward.points,
        pointsHistory: [...(Array.isArray(user.pointsHistory) ? user.pointsHistory : []), pointEvent],
      };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível trocar os seus pontos.');
    console.error('[redeem-loyalty-reward]', error);
    const status = /sessão|inicie sessão|conta/i.test(message) ? 401 : /pontos suficientes|recompensa/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}

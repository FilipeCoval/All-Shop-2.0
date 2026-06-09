import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';
import { LOYALTY_TIERS } from '../constants';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    try {
        const { uid, email } = req.body;
        if (!uid || !email) {
            return res.status(400).json({ error: 'Missing parameters' });
        }
        
        const theDb = db;
        if (!theDb) throw new Error("A base de dados não está configurada corretamente.");

        await theDb.runTransaction(async (t) => {
             const userRef = theDb.collection('users').doc(uid);
             const userDoc = await t.get(userRef);
             if (!userDoc.exists) return; // dealt with client-side
             
             const userData = userDoc.data()!;
             
             const ordersSnap1 = await theDb.collection('orders').where('userId', '==', uid).get();
             const ordersSnap2 = await theDb.collection('orders').where('shippingInfo.email', '==', email.toLowerCase()).where('userId', '==', null).get();
             
             const allOrders: any[] = [];
             ordersSnap1.forEach(doc => allOrders.push({id: doc.id, ...doc.data()}));
             ordersSnap2.forEach(doc => allOrders.push({id: doc.id, ...doc.data()}));
             
             const historicalTotalSpent = allOrders.filter(o => o.status !== 'Cancelado').reduce((sum, order) => sum + (order.total || 0), 0);
             
             let correctTier = 'Bronze';
             if (historicalTotalSpent >= LOYALTY_TIERS.GOLD.threshold) correctTier = 'Ouro';
             else if (historicalTotalSpent >= LOYALTY_TIERS.SILVER.threshold) correctTier = 'Prata';
             
             const tierMap = { 'Bronze': 'BRONZE', 'Prata': 'SILVER', 'Ouro': 'GOLD' } as const;
             
             let missingPoints = 0;
             const newHistoryItems: any[] = [];
             
             const ordersToAwardPoints = allOrders.filter(o => o.status === 'Entregue' && !o.pointsAwarded);
             
             const orderUpdates = new Map<string, any>();
             
             if (ordersToAwardPoints.length > 0) {
                 const multiplier = LOYALTY_TIERS[tierMap[correctTier as keyof typeof tierMap]].multiplier;
                 ordersToAwardPoints.forEach(o => {
                     const pointsForThisOrder = Math.floor((o.total || 0) * multiplier);
                     if (pointsForThisOrder > 0) {
                         missingPoints += pointsForThisOrder;
                         newHistoryItems.push({ 
                             id: `sync-${o.id}`, 
                             date: new Date().toISOString(), 
                             amount: pointsForThisOrder, 
                             reason: `Compra #${o.id.slice(-6)} (Sinc. Nível ${correctTier})`, 
                             orderId: o.id 
                         });
                     }
                     orderUpdates.set(o.id, { pointsAwarded: true });
                 });
             }
             
             ordersSnap2.forEach(docSnap => {
                 const existing = orderUpdates.get(docSnap.id) || {};
                 orderUpdates.set(docSnap.id, { ...existing, userId: uid });
             });
             
             orderUpdates.forEach((updates, id) => {
                 const ref = theDb.collection('orders').doc(id);
                 t.update(ref, updates);
             });
             
             let needsUpdate = false;
             const userUpdateData: any = {};
             
             if (Number((userData.totalSpent || 0).toFixed(2)) !== Number(historicalTotalSpent.toFixed(2))) {
                 userUpdateData.totalSpent = historicalTotalSpent;
                 needsUpdate = true;
             }
             if ((userData.tier || 'Bronze') !== correctTier) {
                 userUpdateData.tier = correctTier;
                 needsUpdate = true;
             }
             if (missingPoints > 0) {
                 userUpdateData.loyaltyPoints = (userData.loyaltyPoints || 0) + missingPoints;
                 userUpdateData.pointsHistory = [...newHistoryItems, ...(userData.pointsHistory || [])];
                 needsUpdate = true;
             }
             
             if (needsUpdate) {
                 t.update(userRef, userUpdateData);
             }
        });
        
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error("Backend sync-user error:", error);
        res.status(500).json({ error: error?.message || "Unknown error" });
    }
}

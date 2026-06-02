import { Request, Response } from 'express';
import { db } from '../services/firebase-admin';
import * as admin from 'firebase-admin';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    // In a real production app, verify Auth token
    const { items, guestToken, shippingInfo, idempotencyKey } = req.body;
    const userId = req.headers.authorization;
    
    if (!items || !idempotencyKey) return res.status(400).json({ error: 'Missing data' });

    try {
        await db.runTransaction(async (t) => {
            // Check idempotency
            const orderQuery = await t.get(db.collection('orders').where('idempotencyKey', '==', idempotencyKey));
            if (!orderQuery.empty) throw new Error('Order already processed');

            // Process items
            for (const item of items) {
                const productRef = db.collection('products_inventory').doc(item.productId);
                const productDoc = await t.get(productRef);
                if (!productDoc.exists) throw new Error(`Product ${item.productId} not found`);

                const data = productDoc.data()!;
                // Decrease stock and decrease reserved
                t.update(productRef, {
                    stock: (data.stock || 0) - item.quantity,
                    reserved: (data.reserved || 0) - item.quantity
                });
            }

            // Create Order
            const orderRef = db.collection('orders').doc();
            t.set(orderRef, {
                items,
                userId: userId || null,
                guestToken: guestToken || null,
                shippingInfo,
                status: 'paid',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                idempotencyKey
            });
        });
        
        return res.status(200).json({ success: true });
    } catch (e: any) {
        return res.status(400).json({ error: e.message });
    }
}

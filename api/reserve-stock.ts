import { Request, Response } from 'express';
import { db } from '../services/firebase-admin';
import * as admin from 'firebase-admin';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    // In a real production app, verify the Auth token here!
    const { productId, quantity, guestToken } = req.body;
    const userId = req.headers.authorization; // Simple mock of auth check
    
    if (!productId || !quantity) return res.status(400).json({ error: 'Missing data' });

    try {
        await db.runTransaction(async (t) => {
            const productRef = db.collection('products_inventory').doc(productId);
            const productDoc = await t.get(productRef);
            
            if (!productDoc.exists) throw new Error('Product not found');
            
            const data = productDoc.data()!;
            const stock = data.stock || 0;
            const reserved = data.reserved || 0;
            const available = stock - reserved;
            
            if (available < quantity) throw new Error('Insufficient stock');
            
            // Increment reserved
            t.update(productRef, { reserved: reserved + quantity });
            
            // Create reservation
            const reservationRef = db.collection('stock_reservations').doc();
            t.set(reservationRef, {
                productId,
                quantity,
                userId: userId || null,
                guestToken: guestToken || null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
            });
        });
        
        return res.status(200).json({ success: true });
    } catch (e: any) {
        return res.status(400).json({ error: e.message });
    }
}

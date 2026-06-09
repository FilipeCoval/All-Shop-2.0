import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';
import * as admin from 'firebase-admin';

export default async function handler(req: Request, res: Response) {
    // This should ideally be protected by an API Key
    const firestore = db;
    if (!firestore) {
        return res.status(200).json({ success: false, reason: 'Database not connected on server-side Admin SDK' });
    }
    
    try {
        const now = admin.firestore.Timestamp.now();
        const expiredReservations = await firestore.collection('stock_reservations')
            .where('expiresAt', '<=', now)
            .get();
        
        for (const doc of expiredReservations.docs) {
            const resData = doc.data();
            
            await firestore.runTransaction(async (t) => {
                const productRef = firestore.collection('products_inventory').doc(resData.productId);
                const productDoc = await t.get(productRef);
                
                if (productDoc.exists) {
                    const data = productDoc.data()!;
                    t.update(productRef, {
                        reserved: Math.max(0, (data.reserved || 0) - resData.quantity)
                    });
                }
                t.delete(doc.ref);
            });
        }
        
        return res.status(200).json({ success: true, count: expiredReservations.size });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}

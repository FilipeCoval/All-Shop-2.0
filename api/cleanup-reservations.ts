import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';
import { Timestamp } from 'firebase-admin/firestore';

export default async function handler(req: Request, res: Response) {
    // This should ideally be protected by an API Key
    const firestore = db;
    if (!firestore) {
        return res.status(200).json({ success: false, reason: 'Database not connected on server-side Admin SDK' });
    }
    
    try {
        const nowTimestamp = Timestamp.now();
        const nowMillis = Date.now();
        
        // Fetch expired reservations of both types (Timestamp and number milliseconds)
        const expiredT = await firestore.collection('stock_reservations')
            .where('expiresAt', '<=', nowTimestamp)
            .get();
            
        const expiredN = await firestore.collection('stock_reservations')
            .where('expiresAt', '<=', nowMillis)
            .get();
            
        // Combine unique docs by ID
        const docsMap = new Map();
        expiredT.forEach(d => docsMap.set(d.id, d));
        expiredN.forEach(d => docsMap.set(d.id, d));
        
        const expiredDocs = Array.from(docsMap.values());
        
        for (const doc of expiredDocs) {
            const resData = doc.data();
            
            await firestore.runTransaction(async (t) => {
                // Find products_inventory document by publicProductId (which matches resData.productId)
                const productQuery = firestore.collection('products_inventory')
                    .where('publicProductId', '==', Number(resData.productId));
                const snap = await t.get(productQuery);
                
                let productRef;
                if (!snap.empty) {
                    productRef = snap.docs[0].ref;
                } else {
                    productRef = firestore.collection('products_inventory').doc(String(resData.productId));
                }
                
                const productDoc = await t.get(productRef);
                
                if (productDoc.exists) {
                    const data = productDoc.data()!;
                    t.update(productRef, {
                        reserved: Math.max(0, (data.reserved || 0) - (resData.quantity || 0))
                    });
                }
                t.delete(doc.ref);
            });
        }
        
        return res.status(200).json({ success: true, count: expiredDocs.length });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}

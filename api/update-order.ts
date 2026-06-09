import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    // NOTE: In production, REQUIRE AUTHENTICATION and check if user is ADMIN
    const { orderId, action, data } = req.body;
    
    if (!orderId || !action) return res.status(400).json({ error: 'Missing data' });

    const firestore = db;
    if (!firestore) {
        return res.status(200).json({ success: false, reason: 'Database not connected on server-side Admin SDK' });
    }

    try {
        const orderRef = firestore.collection('orders').doc(orderId);
        
        if (action === 'update') {
            await orderRef.update(data);
        } else if (action === 'set') {
            await orderRef.set(data);
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
        
        return res.status(200).json({ success: true });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}

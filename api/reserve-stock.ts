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
        console.log("DEBUG: reserve-stock transaction start, productId:", productId, "quantity:", quantity);
        
        if (!db) {
            console.error("DEBUG: db is not defined!");
            throw new Error("Internal Server Error: Database not connected");
        }
        
        const result = await db.runTransaction(async (t) => {
            console.log("DEBUG: transaction attempt");
            
            // Query for the product by publicProductId
            console.log("DEBUG: Looking for products_inventory with publicProductId:", Number(productId));
            const productQuery = db.collection('products_inventory').where('publicProductId', '==', Number(productId));
            const snapshot = await t.get(productQuery);
            
            console.log("DEBUG: snapshot empty:", snapshot.empty);
            if (snapshot.empty) {
                // Try looking up by ID as fallback if Number(productId) fails
                console.log("DEBUG: Trying fallback lookup by doc ID:", productId);
                const fallbackRef = db.collection('products_inventory').doc(productId);
                const fallbackDoc = await t.get(fallbackRef);
                if (fallbackDoc.exists) {
                    console.log("DEBUG: Found product via fallback doc ID");
                    return { productRef: fallbackRef, productDoc: fallbackDoc };
                }
                throw new Error(`Product not found in inventory with productId: ${productId}`);
            }
            
            const productDoc = snapshot.docs[0];
            return { productRef: productDoc.ref, productDoc };
        });
        
        const { productRef, productDoc } = result;
        
        const data = productDoc.data()!;
            console.log("DEBUG: product data", data);
            
            const stock = data.quantityBought || 0; // Fixed field name based on Dashboard.tsx/useInventory.ts
            const reserved = data.reserved || 0;
            const available = stock - (data.quantitySold || 0) - reserved;
            
            console.log("DEBUG: stock details", { stock, sold: data.quantitySold, reserved, available });
            
            if (available < quantity) throw new Error('Insufficient stock');
            
            // Increment reserved
            t.update(productRef, { reserved: reserved + quantity });
            
            // Create reservation
            const reservationRef = db.collection('stock_reservations').doc();
            console.log("DEBUG: creating reservation");
            t.set(reservationRef, {
                productId: Number(productId),
                quantity,
                userId: userId || null,
                guestToken: guestToken || null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
            });
        });
        
        console.log("DEBUG: reserve-stock transaction success");
        return res.status(200).json({ success: true });
    } catch (e: any) {
        console.error("DEBUG: reserve-stock error caught:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return res.status(400).json({ error: errorMessage });
    }
}

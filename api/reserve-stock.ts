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
        
        await db.runTransaction(async (t) => {
            console.log("DEBUG: transaction attempt");
            
            // Query for the product by publicProductId
            console.log("DEBUG: Looking for products_inventory with publicProductId:", Number(productId));
            const productQuery = db.collection('products_inventory').where('publicProductId', '==', Number(productId));
            const snapshot = await t.get(productQuery);
            
            console.log("DEBUG: snapshot empty:", snapshot.empty);
            let productRef;
            let productDoc;
            if (snapshot.empty) {
                // Try looking up by ID as fallback if Number(productId) fails
                console.log("DEBUG: Trying fallback lookup by doc ID:", productId);
                productRef = db.collection('products_inventory').doc(productId);
                productDoc = await t.get(productRef);
                if (!productDoc.exists) {
                    throw new Error(`Product not found in inventory with productId: ${productId}`);
                }
                console.log("DEBUG: Found product via fallback doc ID");
            } else {
                productDoc = snapshot.docs[0];
                productRef = productDoc.ref;
            }
            
            const data = productDoc.data()!;
            console.log("DEBUG: product data", data);
            
            const stock = data.quantityBought || 0; 
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
        const errorMessage = String(e.message || "");
        if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("Database not connected") || e.code === 7) {
            console.warn("[reserve-stock] Permission Denied or Database connection error detected. Returning fallbackToClient flag.");
            return res.status(200).json({ 
                success: false, 
                fallbackToClient: true, 
                reason: "PERMISSION_DENIED or connection issues on server-side Admin SDK (local sandbox workspace fallback active)" 
            });
        }
        return res.status(400).json({ error: errorMessage });
    }
}

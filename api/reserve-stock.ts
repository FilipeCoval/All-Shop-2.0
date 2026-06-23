import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    // In a real production app, verify the Auth token here!
    const { productId, quantity, guestToken } = req.body;
    const userId = req.headers.authorization; // Simple mock of auth check
    
    if (!productId || quantity === undefined) return res.status(400).json({ error: 'Missing data' });

    const firestore = db;
    if (!firestore) {
        console.warn("[reserve-stock] Permission Denied or Database connection error detected at startup. Returning fallbackToClient flag.");
        return res.status(200).json({ 
            success: false, 
            fallbackToClient: true, 
            reason: "PERMISSION_DENIED or connection issues on server-side Admin SDK (local sandbox workspace fallback active)" 
        });
    }

    try {
        // --- CLEANUP EXPIRED RESERVATIONS BACKGROUND TASK ---
        // Runs asynchronously to not block the current request
        (async () => {
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
                
                if (expiredDocs.length > 0) {
                    console.log(`[reserve-stock] Found ${expiredDocs.length} expired reservations to clean up...`);
                    for (const doc of expiredDocs) {
                        const resData = doc.data();
                        await firestore.runTransaction(async (t) => {
                            const productQuery = firestore.collection('products_inventory').where('publicProductId', '==', Number(resData.productId));
                            const snap = await t.get(productQuery);
                            let productRef;
                            if (!snap.empty) {
                                productRef = snap.docs[0].ref;
                            } else {
                                productRef = firestore.collection('products_inventory').doc(String(resData.productId));
                            }
                            
                            const pDoc = await t.get(productRef);
                            if (pDoc.exists) {
                                const pData = pDoc.data()!;
                                t.update(productRef, {
                                    reserved: Math.max(0, (pData.reserved || 0) - (resData.quantity || 0))
                                });
                            }
                            t.delete(doc.ref);
                        });
                    }
                    console.log("[reserve-stock] Cleanup of expired reservations completed successfully.");
                }
            } catch (e) {
                console.error("[reserve-stock] Background cleanup failed:", e);
            }
        })();
        // --- END CLEANUP ---

        console.log("DEBUG: reserve-stock transaction start, productId:", productId, "quantity:", quantity);
        
        await firestore.runTransaction(async (t) => {
            console.log("DEBUG: transaction attempt");

            // Look for existing reservation for this user/token and product
            const resQuery = firestore.collection('stock_reservations')
                .where('productId', '==', Number(productId));
            
            // Filter by userId or guestToken
            const resSnap = await t.get(resQuery);
            let existingRes = null;
            for (const doc of resSnap.docs) {
                const data = doc.data();
                if ((userId && data.userId === userId) || (guestToken && data.guestToken === guestToken)) {
                    existingRes = doc;
                    break;
                }
            }

            // Query for the product by publicProductId
            const productQuery = firestore.collection('products_inventory').where('publicProductId', '==', Number(productId));
            const snapshot = await t.get(productQuery);
            
            let productRef;
            let productDoc;
            if (snapshot.empty) {
                productRef = firestore.collection('products_inventory').doc(productId);
                productDoc = await t.get(productRef);
                if (!productDoc.exists) {
                    throw new Error(`Product not found in inventory with productId: ${productId}`);
                }
            } else {
                productDoc = snapshot.docs[0];
                productRef = productDoc.ref;
            }
            
            const data = productDoc.data()!;
            
            if (quantity === 0) {
                // Delete existing reservation
                if (existingRes) {
                    const resQty = existingRes.data().quantity || 0;
                    t.update(productRef, { reserved: Math.max(0, (data.reserved || 0) - resQty) });
                    t.delete(existingRes.ref);
                }
            } else {
                // Update/Create reservation
                const stock = data.quantityBought || 0; 
                const reserved = data.reserved || 0;
                const sold = data.quantitySold || 0;
                
                // If updating, subtract the old reservation quantity first
                const oldResQty = existingRes ? (existingRes.data().quantity || 0) : 0;
                const available = stock - sold - (reserved - oldResQty);
                
                if (available < quantity) throw new Error('Insufficient stock');
                
                // Update reserved count
                t.update(productRef, { reserved: reserved - oldResQty + quantity });
                
                // Update or Create reservation
                if (existingRes) {
                    t.update(existingRes.ref, {
                        quantity,
                        expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
                    });
                } else {
                    const reservationRef = firestore.collection('stock_reservations').doc();
                    t.set(reservationRef, {
                        productId: Number(productId),
                        quantity,
                        userId: userId || null,
                        guestToken: guestToken || null,
                        createdAt: FieldValue.serverTimestamp(),
                        expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
                    });
                }
            }
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

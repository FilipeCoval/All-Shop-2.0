import { Request, Response } from 'express';
import admin from 'firebase-admin';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Admin SDK
let db: admin.firestore.Firestore;

async function getDb() {
    if (!admin.apps.length) {
        console.log("DEBUG: Initializing Admin SDK with project ID:", firebaseConfig.projectId);
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: firebaseConfig.projectId
        });
        console.log("DEBUG: Admin SDK initialized.");
    }
    if (!db) {
        db = admin.firestore();
    }
    return db;
}

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    console.log("DEBUG: Checkout handler called.");
    try {
        const theDb = await getDb();
        const { order } = req.body;
        console.log("DEBUG: Order received:", order?.id);
        const orderRef = theDb.collection('orders').doc(order.id);
        
        // Use a runTransaction on the admin SDK
        await theDb.runTransaction(async (t) => {
            const existingOrder = await t.get(orderRef);
            
            if (!existingOrder.exists) {
                // Stock update logic
                for (const item of order.items) {
                    const productRef = theDb.collection('products_public').doc(item.productId.toString());
                    const productDoc = await t.get(productRef);
                    if (productDoc.exists) {
                        const productData = productDoc.data()!;
                        if (item.selectedVariant && productData.variants) {
                            const vIndex = productData.variants.findIndex((v: any) => v.name === item.selectedVariant);
                            if (vIndex !== -1) productData.variants[vIndex].stock = (productData.variants[vIndex].stock || 0) - item.quantity;
                        } else {
                            productData.stock = (productData.stock || 0) - item.quantity;
                        }
                        t.update(productRef, productData);
                    }
                }
                t.set(orderRef, order);
            } else {
                t.update(orderRef, order);
            }
        });
        
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error("Backend checkout error:", error);
        res.status(500).json({ error: error?.message || "Unknown error" });
    }
}

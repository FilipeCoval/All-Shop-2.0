import { Request, Response } from 'express';
import admin from 'firebase-admin';

// Initialize Admin SDK - assume it picks up environment configuration
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    try {
        const { order } = req.body;
        const orderRef = db.collection('orders').doc(order.id);
        
        // Use a runTransaction on the admin SDK
        await db.runTransaction(async (t) => {
            const existingOrder = await t.get(orderRef);
            
            if (!existingOrder.exists) {
                // Stock update logic
                for (const item of order.items) {
                    const productRef = db.collection('products_public').doc(item.productId.toString());
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
        res.status(500).json({ error: error.message });
    }
}

import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    console.log("DEBUG: Checkout handler called.");
    try {
        const theDb = db;
        if (!theDb) {
            throw new Error("Database connection not defined in firebase-admin");
        }
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
                        console.log("DEBUG: Product data found:", productData);
                        if (!productData) {
                             console.error("DEBUG: productDoc.exists but productData is undefined");
                             continue;
                        }
                        if (item.selectedVariant && productData.variants) {
                            const vIndex = productData.variants.findIndex((v: any) => v.name === item.selectedVariant);
                            if (vIndex !== -1) {
                                console.log("DEBUG: Updating variant stock. Found variant:", productData.variants[vIndex]);
                                if (!productData.variants[vIndex]) {
                                    console.error("DEBUG: Variant is undefined at index", vIndex);
                                    continue;
                                }
                                productData.variants[vIndex].stock = (productData.variants[vIndex].stock || 0) - item.quantity;
                            } else {
                                console.log("DEBUG: Variant not found.");
                            }
                        } else {
                            console.log("DEBUG: Updating base product stock. Base value:", productData.stock);
                            productData.stock = (productData.stock || 0) - item.quantity;
                            console.log("DEBUG: Base product stock updated to:", productData.stock);
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

import { Request, Response } from 'express';
import { db } from '../services/firebase-admin';
import * as admin from 'firebase-admin';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { items, guestToken, shippingInfo, idempotencyKey, order } = req.body;
    const userId = req.headers.authorization;
    
    if (!items || !idempotencyKey) return res.status(400).json({ error: 'Dados em falta (Missing data)' });

    try {
        await db.runTransaction(async (t) => {
            // Check idempotency using a direct document look up with the idempotencyKey as Document ID!
            const orderRef = db.collection('orders').doc(idempotencyKey);
            const orderDoc = await t.get(orderRef);
            if (orderDoc.exists) {
                console.info(`[finalize-order] Order ${idempotencyKey} already exists. Returning success.`);
                return;
            }

            // Process items
            for (const item of items) {
                if (!item.productId) continue;
                
                const productIdStr = String(item.productId);
                let productRef = db.collection('products_inventory').doc(productIdStr);
                let productDoc = await t.get(productRef);
                
                // Fallback query if document by string identifier does not exist under that exact ID
                if (!productDoc.exists) {
                    const fallbackQuery = await db.collection('products_inventory').where('publicProductId', '==', Number(item.productId)).get();
                    if (!fallbackQuery.empty) {
                        productDoc = fallbackQuery.docs[0];
                        productRef = productDoc.ref;
                    } else {
                        throw new Error(`O produto com ID ${item.productId} não foi encontrado no inventário.`);
                    }
                }

                const data = productDoc.data()!;
                const currentQuantitySold = Number(data.quantitySold || 0);
                const currentReserved = Number(data.reserved || 0);
                const itemQty = Number(item.quantity || 1);

                // Correctly increment quantitySold and decrement reserved (ensuring >= 0)
                t.update(productRef, {
                    quantitySold: currentQuantitySold + itemQty,
                    reserved: Math.max(0, currentReserved - itemQty)
                });

                // ALSO update the public catalog document ('products_public') stock!
                const publicRef = db.collection('products_public').doc(productIdStr);
                const publicDoc = await t.get(publicRef);
                if (publicDoc.exists) {
                    const publicData = publicDoc.data()!;
                    const currentStock = Number(publicData.stock || 0);
                    const newStock = Math.max(0, currentStock - itemQty);

                    // If item has a variant, update the variant-specific stock in products_public too!
                    if (item.selectedVariant && publicData.variants) {
                        const updatedVariants = (publicData.variants || []).map((v: any) => {
                            if (String(v.name).trim() === String(item.selectedVariant).trim()) {
                                const currentVarStock = Number(v.stock || 0);
                                return {
                                    ...v,
                                    stock: Math.max(0, currentVarStock - itemQty)
                                };
                            }
                            return v;
                        });
                        t.update(publicRef, {
                            stock: newStock,
                            variants: updatedVariants
                        });
                    } else {
                        t.update(publicRef, {
                            stock: newStock
                        });
                    }
                }
            }

            // Create or update Order using idempotencyKey as the actual document ID
            let orderToSave = { ...order };
            
            // Reconstruct order properties if the full order was not passed
            if (!order) {
                orderToSave = {
                    id: idempotencyKey,
                    items,
                    userId: userId || null,
                    guestToken: guestToken || null,
                    shippingInfo,
                    status: 'Pendente',
                    date: new Date().toISOString(),
                    total: items.reduce((acc: number, cur: any) => acc + (Number(cur.price || 0) * Number(cur.quantity || 1)), 0),
                    stockDeducted: true
                };
            } else {
                orderToSave.stockDeducted = true;
                // Double check status is formatted correctly (starts as Pendente, modified to Processamento by client confirm)
                if (!orderToSave.status) {
                    orderToSave.status = 'Pendente';
                }
            }

            // Always add a server-side timestamp for Firestore sorting of recent orders
            orderToSave.createdAt = admin.firestore.FieldValue.serverTimestamp();
            orderToSave.idempotencyKey = idempotencyKey;

            t.set(orderRef, orderToSave);
        });
        
        return res.status(200).json({ success: true });
    } catch (e: any) {
        console.error("[finalize-order] Transaction error:", e);
        const errMsg = String(e.message || '');
        if (errMsg.includes("PERMISSION_DENIED") || e.code === 7) {
            console.warn("[finalize-order] Permission Denied detected. Returning fallbackToClient flag.");
            return res.status(200).json({ 
                success: false, 
                fallbackToClient: true, 
                reason: "PERMISSION_DENIED on server-side Admin SDK (local sandbox workspace fallback active)" 
            });
        }
        return res.status(400).json({ error: e.message || 'Erro ao processar a encomenda.' });
    }
}

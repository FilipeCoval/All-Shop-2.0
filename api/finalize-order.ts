import { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { items, guestToken, shippingInfo, idempotencyKey, order } = req.body;
    const userId = req.headers.authorization;
    
    if (!items || !idempotencyKey) return res.status(400).json({ error: 'Dados em falta (Missing data)' });

    const firestore = db;
    if (!firestore) {
        console.error("[finalize-order] db is not defined!");
        return res.status(200).json({ 
            success: false, 
            fallbackToClient: true, 
            reason: "Database not connected on server-side Admin SDK (local sandbox workspace fallback active)" 
        });
    }

    try {
        await firestore.runTransaction(async (t) => {
            // Check idempotency using a direct document look up with the idempotencyKey as Document ID!
            const orderRef = firestore.collection('orders').doc(idempotencyKey);
            const orderDoc = await t.get(orderRef);
            if (orderDoc.exists) {
                console.info(`[finalize-order] Order ${idempotencyKey} already exists. Updating any status/confirmations...`);
                if (order) {
                    const existingData = orderDoc.data() || {};
                    const updateObj: any = {};
                    if (order.status && order.status !== existingData.status) {
                        updateObj.status = order.status;
                    }
                    if (order.statusHistory) {
                        updateObj.statusHistory = order.statusHistory;
                    }
                    if (order.shippingInfo) {
                        updateObj.shippingInfo = order.shippingInfo;
                    }
                    if (order.trackingNumber !== undefined) {
                        updateObj.trackingNumber = order.trackingNumber;
                    }
                    if (order.pointsAwarded !== undefined) {
                        updateObj.pointsAwarded = order.pointsAwarded;
                    }
                    
                    if (Object.keys(updateObj).length > 0) {
                        t.update(orderRef, updateObj);
                    }
                }
                return;
            }

            // Process items
            for (const item of items) {
                if (!item.productId) continue;
                
                const fallbackQuery = await firestore.collection('products_inventory').where('publicProductId', '==', Number(item.productId)).get();
                if (fallbackQuery.empty) {
                    throw new Error(`O produto com ID ${item.productId} não foi encontrado no inventário.`);
                }
                
                const productIdStr = String(item.productId);
                
                // Find exact match by variant name (case-insensitive and trimmed)
                let matchedDoc = fallbackQuery.docs.find(docSnap => {
                    const data = docSnap.data();
                    const vName = String(data.variant || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const requestedV = String(item.selectedVariant || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    return vName === requestedV;
                });
                
                if (!matchedDoc) {
                    matchedDoc = fallbackQuery.docs[0];
                }
                
                const productRef = matchedDoc.ref;
                const data = matchedDoc.data()!;
                const currentQuantitySold = Number(data.quantitySold || 0);
                const currentReserved = Number(data.reserved || 0);
                const itemQty = Number(item.quantity || 1);

                // Correctly increment quantitySold and decrement reserved (ensuring >= 0)
                t.update(productRef, {
                    quantitySold: currentQuantitySold + itemQty,
                    reserved: Math.max(0, currentReserved - itemQty)
                });

                // ALSO update the public catalog document ('products_public') stock!
                const publicRef = firestore.collection('products_public').doc(productIdStr);
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
            orderToSave.createdAt = FieldValue.serverTimestamp();
            orderToSave.idempotencyKey = idempotencyKey;

            t.set(orderRef, orderToSave);
        });
        
        // --- DELETE CART RESERVATIONS NOW THAT THEY ARE CONFIRMED AS SOLD ---
        try {
            const promises = [];
            for (const item of items) {
                if (!item.productId) continue;
                let resQuery;
                if (userId) {
                    resQuery = firestore.collection('stock_reservations')
                        .where('productId', '==', Number(item.productId))
                        .where('userId', '==', userId);
                } else if (guestToken) {
                    resQuery = firestore.collection('stock_reservations')
                        .where('productId', '==', Number(item.productId))
                        .where('guestToken', '==', guestToken);
                }
                
                if (resQuery) {
                    promises.push(
                        resQuery.get().then(snap => {
                            if (!snap.empty) {
                                return firestore.collection('stock_reservations').doc(snap.docs[0].id).delete();
                            }
                        })
                    );
                }
            }
            await Promise.allSettled(promises);
            console.log(`[finalize-order] Successfully cleaned up reservations for order ${idempotencyKey}`);
        } catch (cleanupErr) {
            console.error("[finalize-order] Failed to clean up stock_reservations:", cleanupErr);
        }
        
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

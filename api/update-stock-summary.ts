
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { db as sharedDb } from '../services/firebase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = sharedDb;
        if (!db) {
            throw new Error("Database connection not defined in firebase-admin");
        }
        const { publicProductId } = req.body;

        if (!publicProductId) {
             return res.status(400).json({ error: 'Missing publicProductId' });
        }

        // 1. Get Inventory
        const inventorySnap = await db.collection('products_inventory')
            .where('publicProductId', '==', Number(publicProductId))
            .get();

        let physicalStock = 0;
        let variantStock: Record<string, number> = {};
        let variantPrice: Record<string, number> = {};
        let variantImage: Record<string, string> = {};

        const normalizeVName = (n: string) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();

        inventorySnap.forEach(doc => {
            const data = doc.data();
            let b = Number(data.quantityBought) || 0;
            let s = Number(data.quantitySold) || 0;
            if (data.units && Array.isArray(data.units) && data.units.length > 0) {
                b = data.units.length;
                s = data.units.filter((u: any) => u.status === 'SOLD').length;
            }
            const qty = Math.max(0, b - s);
            physicalStock += qty;
            
            const variant = (data.variant || '').trim();
            if (variant) {
                const norm = normalizeVName(variant);
                if (!variantStock[norm]) variantStock[norm] = 0;
                variantStock[norm] += qty;

                const lotPrice = data.salePrice || data.targetSalePrice || 0;
                if (lotPrice > 0) {
                    variantPrice[norm] = lotPrice;
                }
                if (data.images && Array.isArray(data.images) && data.images.length > 0 && data.images[0]) {
                    variantImage[norm] = data.images[0];
                }
            }
        });

        // 2. Get Cart Reservations
        // NOTA: Removido subtrair do summary porque o cliente App.tsx já tem listener
        // de 'stock_reservations' e os subtrai em realtime no getStockForProduct().
        // Se as subtrairmos aqui, causará "double-dip" (dupla dedução) sempre que
        // houver uma sincronização.
        let reservedInCart = 0;
        let variantReserved: Record<string, number> = {};

        // 3. Get Pending Orders
        const ordersSnap = await db.collection('orders')
            .where('status', 'in', ['Pendente', 'Processamento', 'Pago', 'Enviado', 'Entregue'])
            .get();
        
        // Use logic similar to usePendingOrders
        let pendingInOrders = 0;
        let variantPending: Record<string, number> = {};
        
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        ordersSnap.forEach(doc => {
            const order = doc.data();
            const orderDate = new Date(order.date || now);
            
            const isExplicitlyPending = order.stockDeducted === false;
            const isOldButStuck = order.stockDeducted === undefined && 
                                 ['Pendente', 'Processamento', 'Pago'].includes(order.status) && 
                                 orderDate > thirtyDaysAgo;

            if (isExplicitlyPending || isOldButStuck) {
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach((item: any) => {
                        if (typeof item === 'object' && Number(item.productId) === Number(publicProductId)) {
                            const qty = Math.max(0, (item.quantity || 1) - (item.fulfilledQuantity || 0));
                            pendingInOrders += qty;
                            const variant = (item.selectedVariant || '').trim();
                            if (variant) {
                                const norm = normalizeVName(variant);
                                if (!variantPending[norm]) variantPending[norm] = 0;
                                variantPending[norm] += qty;
                            }
                        }
                    });
                }
            }
        });

        const available = Math.max(0, physicalStock - reservedInCart - pendingInOrders);

        // 4. Update the actual products_public which frontend listens to
        const publicRef = db.collection('products_public').doc(String(publicProductId));
        const publicDoc = await publicRef.get();
        
        if (publicDoc.exists) {
            const publicData = publicDoc.data() || {};
            const updatedVariants: any[] = [];
            
            const allVariantNames = new Map<string, string>(); // normalizedKey -> originalCaseDisplayName
            
            Object.keys(variantStock).forEach(v => {
                if (v) {
                    const norm = normalizeVName(v);
                    if (!allVariantNames.has(norm)) {
                        allVariantNames.set(norm, v.trim());
                    }
                }
            });
            
            (publicData.variants || []).forEach((v: any) => {
                if (v && v.name) {
                    const norm = normalizeVName(v.name);
                    if (!allVariantNames.has(norm)) {
                        allVariantNames.set(norm, v.name.trim());
                    } else {
                        allVariantNames.set(norm, v.name.trim()); // Prefer public catalog casing
                    }
                }
            });

            const currentVariantsMap = new Map();
            (publicData.variants || []).forEach((v: any) => {
                if (v && v.name) {
                    currentVariantsMap.set(normalizeVName(v.name), v);
                }
            });

            allVariantNames.forEach((prefDisplayName, norm) => {
                const physical = variantStock[norm] || 0;
                const reserved = (variantReserved[norm] || 0) + (variantPending[norm] || 0);
                const variantAvailable = Math.max(0, physical - reserved);
                
                const existing = currentVariantsMap.get(norm) || {};

                let cleanImage = variantImage[norm] || existing.image || null;
                if (!cleanImage && publicData.images && Array.isArray(publicData.images) && publicData.images.length > 0) {
                    cleanImage = publicData.images[0];
                }

                const priceToUse = variantPrice[norm] || Number(existing.price) || publicData.price || publicData.salePrice || publicData.targetSalePrice || 0;

                updatedVariants.push({
                    name: prefDisplayName,
                    price: priceToUse,
                    image: cleanImage || null, // Firebase não aceita undefined
                    stock: variantAvailable
                });
            });
            
            // Remove null properties
            const cleanVariants = updatedVariants.map(v => {
                const cleaned = { ...v };
                if (cleaned.image === null) delete cleaned.image;
                return cleaned;
            });

            const updateData: any = { stock: available };
            if (cleanVariants.length > 0) {
                updateData.variants = cleanVariants;
            } else if (publicData.variants) {
                updateData.variants = FieldValue.delete();
            }

            await publicRef.set(updateData, { merge: true });
        } else {
             // Just update stock if document doesn't exist? Normally it should.
             await publicRef.set({ stock: available }, { merge: true });
        }

        // Update Summary (Secure - optional but keeping it just in case)
        await db.collection('public_stock_summary').doc(String(publicProductId)).set({
            publicProductId: Number(publicProductId),
            availableStock: available,
            updatedAt: FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, available });

    } catch (error: any) {
        console.error('Erro na API de Stock:', error);
        return res.status(500).json({ error: error.message });
    }
}

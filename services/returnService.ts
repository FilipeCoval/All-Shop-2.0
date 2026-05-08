
import {  db } from './firebaseConfig';
import { Order, OrderItem } from '../types';
import firebase from 'firebase/compat/app';

export const cancelOrderItem = async (
    orderId: string,
    productId: number,
    serialNumbersToReturn: string[], // Alterado para array de S/Ns
    reason: string
): Promise<{ success: boolean; message: string }> => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        // Procurar o produto no inventário pelo publicProductId
        const inventoryQuery = db.collection('products_inventory').where('publicProductId', '==', productId);
        console.log("Searching for publicProductId:", productId);
        let snapshots = await inventoryQuery.get();
        console.log("Found inventory docs:", snapshots.size);
        
        if (snapshots.empty) {
            // Tentativa de fallback: procurar por ID se for string ou productId se for igual a id
            const fallbackQuery = db.collection('products_inventory').where('id', '==', productId.toString());
            const fallbackSnap = await fallbackQuery.get();
            console.log("Fallback search (id) found:", fallbackSnap.size);

            if (fallbackSnap.empty) {
                throw new Error("Produto não encontrado no inventário.");
            }
            snapshots = fallbackSnap;
        }

        const publicProductRef = db.collection('products_public').doc(productId.toString());

        return await db.runTransaction(async (transaction) => {
            // ALL READS FIRST
            const orderDoc = await transaction.get(orderRef);
            
            // Get all candidate inventory batches
            const inventoryDocs = await Promise.all(
                snapshots.docs.map(doc => transaction.get(doc.ref))
            );

            // Get public product doc
            const publicDoc = await transaction.get(publicProductRef);
            
            if (!orderDoc.exists) {
                throw new Error("Encomenda não encontrada.");
            }

            const orderData = orderDoc.data() as Order;
            const itemIndex = orderData.items.findIndex(item => typeof item === 'object' && (item as OrderItem).productId === productId);
            
            if (itemIndex === -1) {
                throw new Error("Produto não encontrado nesta encomenda.");
            }

            const item = orderData.items[itemIndex] as OrderItem;
            // Valida se os S/Ns pertencem ao item
            const allItemSerials = item.serialNumbers || [];
            if (!serialNumbersToReturn.every(sn => allItemSerials.includes(sn))) {
                throw new Error("Um ou mais números de série não pertencem a esta encomenda.");
            }

            // 1. Atualizar Encomenda (PREPARAÇÃO)
            const newItems = [...orderData.items];
            const remainingSerials = allItemSerials.filter(sn => !serialNumbersToReturn.includes(sn));
            const updatedItem = { 
                ...item, 
                quantity: remainingSerials.length > 0 ? remainingSerials.length : 0,
                serialNumbers: remainingSerials
            };
            
            if (updatedItem.quantity <= 0) {
                newItems.splice(itemIndex, 1);
            } else {
                newItems[itemIndex] = updatedItem;
            }

            // 2. Preparar Stock - We might have multiple batches (docs) for the same product
            const inventoryWrites: { ref: any, data: any }[] = [];
            
            inventoryDocs.forEach(invDoc => {
                const invData = invDoc.data() as any;
                if (!invData.units) return;

                let batchChanged = false;
                let unitsChangedInBatch = 0;

                const updatedUnits = invData.units.map((unit: any) => {
                    if (serialNumbersToReturn.includes(unit.id)) {
                        batchChanged = true;
                        unitsChangedInBatch++;
                        return { ...unit, status: 'AVAILABLE', soldToOrder: null, soldAt: null };
                    }
                    return unit;
                });

                if (batchChanged) {
                    inventoryWrites.push({
                        ref: invDoc.ref,
                        data: {
                            units: updatedUnits,
                            quantitySold: Math.max(0, (invData.quantitySold || 0) - unitsChangedInBatch)
                        }
                    });
                }
            });

            // 3. EXECUTAR WRITES
            transaction.update(orderRef, {
                items: newItems,
                status: newItems.length === 0 ? 'Devolvido' : orderData.status,
                returnRequest: {
                    date: new Date().toISOString(),
                    reason: reason,
                    status: 'Aprovado'
                }
            });

            for (const write of inventoryWrites) {
                transaction.update(write.ref, write.data);
            }

            if (publicDoc.exists) {
                const publicData = publicDoc.data() as any;
                transaction.update(publicProductRef, {
                    stock: (publicData.stock || 0) + serialNumbersToReturn.length
                });
            }

            return { success: true, message: "Devolução processada e stock reposto." };
        });
    } catch (error: any) {
        console.error("Erro ao cancelar item:", error);
        return { success: false, message: error.message || "Erro desconhecido." };
    }
};

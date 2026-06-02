import { modularDb } from '../services/firebaseConfig';
import { collection, doc, query, where, getDocs, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Order, OrderItem, InventoryProduct } from '../types';

export const forceStockDeduction = async (
    productId: string,
    serialNumber: string
): Promise<{ success: boolean, message: string }> => {
    try {
        let productRef = doc(modularDb, 'products_inventory', productId);
        let productSnap = await getDoc(productRef);
        
        // Se nao encontrar pelo ID direto, tentar pelo publicProductId
        if (!productSnap.exists()) {
            const querySnap = await getDocs(query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', Number(productId))));
            if (querySnap.empty) throw new Error("Produto não encontrado no inventário.");
            productSnap = querySnap.docs[0];
            productRef = productSnap.ref;
        }

        const product = productSnap.data() as InventoryProduct;
        const targetSN = serialNumber.trim();
        const unitIndex = product.units?.findIndex((u: any) => String(u.id).trim() === targetSN);

        if (unitIndex === -1 || unitIndex === undefined) {
             throw new Error("Serial não encontrado no inventário deste produto.");                
        }

        const updatedUnits = [...(product.units || [])];
        updatedUnits[unitIndex] = {
            ...updatedUnits[unitIndex],
            status: 'SOLD'
        };

        await updateDoc(productRef, { 
            units: updatedUnits,
            quantitySold: (product.quantitySold || 0) + 1
        });

        return { success: true, message: `Stock reduzido com sucesso para o serial ${serialNumber}.` };
    } catch (error: any) {
        console.error("Erro ao forçar dedução de stock:", error);
        return { success: false, message: error.message };
    }
};

export const manualFixStockStatus = async (
    orderId: string,
    productId: string,
    serialNumber: string
): Promise<{ success: boolean, message: string }> => {
    try {
        let productRef = doc(modularDb, 'products_inventory', productId);
        let productSnap = await getDoc(productRef);
        
        // Se nao encontrar pelo ID direto, tentar pelo publicProductId
        if (!productSnap.exists()) {
            const querySnap = await getDocs(query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', Number(productId))));
            if (querySnap.empty) throw new Error("Produto não encontrado no inventário.");
            productSnap = querySnap.docs[0];
            productRef = productSnap.ref;
        }

        const product = productSnap.data() as InventoryProduct;
        const targetSN = serialNumber.trim();
        const unitIndex = product.units?.findIndex((u: any) => String(u.id).trim() === targetSN);

        if (unitIndex === -1 || unitIndex === undefined) {
            console.error(`Serial not found. Target: "${targetSN}". Units in product: ${product.units?.map(u => u.id).join(', ')}`);
            throw new Error(`Serial ${targetSN} não encontrado neste produto.`);
        }

        const updatedUnits = [...(product.units || [])];
        updatedUnits[unitIndex] = {
            ...updatedUnits[unitIndex],
            status: 'SOLD',
            soldToOrder: orderId,
            soldAt: new Date().toISOString()
        };

        await updateDoc(productRef, { 
            units: updatedUnits,
            quantitySold: (product.quantitySold || 0) + 1
        });
        
        // Ensure order also has it
        const orderRef = doc(modularDb, 'orders', orderId);
        await updateDoc(orderRef, {
            serialNumbersUsed: arrayUnion(serialNumber)
        });

        return { success: true, message: `Serial ${serialNumber} marcado como vendido para a encomenda ${orderId} e stock atualizado.` };
    } catch (error: any) {
        console.error("Erro ao corrigir stock manual:", error);
        return { success: false, message: error.message };
    }
};

// Otimização: aceita inventário já carregado
export const backfillOrderSerials = async (orderId: string, inventorySnap?: any): Promise<{ success: boolean, message: string }> => {
    try {
        const orderRef = doc(modularDb, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);
        if (!orderSnap.exists()) throw new Error("Encomenda não encontrada.");
        
        const order = orderSnap.data() as Order;
        
        // Find units in inventory sold to this order
        const docs = inventorySnap ? inventorySnap.docs : (await getDocs(collection(modularDb, 'products_inventory'))).docs;
        const updatedItems = [...order.items];
        let hasChanges = false;

        docs.forEach((doc: any) => {
            const product = { id: doc.id, ...doc.data() } as InventoryProduct;
            if (product.units) {
                const soldUnits = product.units.filter((u: any) => u.soldToOrder === orderId);
                if (soldUnits.length > 0) {
                    // Update the order items
                    updatedItems.forEach((item, idx) => {
                        if (typeof item !== 'string' && item.productId === product.publicProductId) {
                            const currentSerials = (item as OrderItem).serialNumbers || [];
                            const newSerials = [...new Set([...currentSerials, ...soldUnits.map(({ id }) => id)])];
                            if (newSerials.length > currentSerials.length) {
                                updatedItems[idx] = { ...(item as OrderItem), serialNumbers: newSerials };
                                hasChanges = true;
                            }
                        }
                    });
                }
            }
        });

        if (hasChanges) {
            await updateDoc(orderRef, { items: updatedItems });
            return { success: true, message: `Seriais recuperados para a encomenda ${orderId}.` };
        } else {
            return { success: false, message: `Já não existem seriais em falta para esta encomenda ${orderId}.` };
        }

    } catch (error: any) {
        console.error("Erro ao reparar seriais para " + orderId, error);
        return { success: false, message: error.message || "Erro desconhecido." };
    }
};

export const backfillAllOrdersSerials = async (): Promise<{ success: boolean, message: string }> => {
    try {
        const inventorySnap = await getDocs(collection(modularDb, 'products_inventory'));
        const ordersSnap = await getDocs(collection(modularDb, 'orders')); // Cuidado com o tamanho, mas ok para este caso
        
        let successCount = 0;
        
        for (const orderDoc of ordersSnap.docs) {
            const res = await backfillOrderSerials(orderDoc.id, inventorySnap);
            if (res.success) successCount++;
        }
        
        return { success: true, message: `Processamento concluído. ${successCount} encomendas foram atualizadas.` };
    } catch (error: any) {
        console.error("Erro ao reparar todos os seriais:", error);
        return { success: false, message: error.message || "Erro desconhecido no processamento de todas as encomendas." };
    }
};

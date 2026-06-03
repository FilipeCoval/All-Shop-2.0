
import { useState, useEffect } from 'react';
import { modularDb } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { InventoryProduct, StockReservation, Order, OrderItem } from '../types';

export const useStock = (isAdmin: boolean) => {
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // 1. Escutar Reservas Temporárias em Carrinhos (Todos os utilizadores)
    const resQ = query(collection(modularDb, 'stock_reservations'), where('expiresAt', '>', Date.now()));
    const unsubRes = onSnapshot(
      resQ,
      (snapshot) => {
        const resList: StockReservation[] = [];
        snapshot.forEach(doc => {
            resList.push({ id: doc.id, ...doc.data() } as StockReservation);
        });
        setReservations(resList);
      }, 
      (error) => {
        console.error("Erro no listener de reservas:", error);
      }
    );

    // Se o utilizador não for admin, não tenta aceder a dados privados.
    if (!isAdmin) {
      setLoading(false);
      return () => {
          unsubRes();
      };
    }

    // 2. Escutar Inventário Físico (Apenas Admin)
    const unsubInv = onSnapshot(
      collection(modularDb, 'products_inventory'),
      (snapshot) => {
        const items: InventoryProduct[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as InventoryProduct);
        });
        setInventory(items);
      },
      (error) => {
        console.error("Erro no listener de inventário (Admin):", error);
        setLoading(false);
      }
    );

    // 3. Escutar Encomendas Pendentes (Apenas Admin)
    const orderQ = query(
      collection(modularDb, 'orders'),
      where('status', 'in', ['Pendente', 'Processamento', 'Pago', 'Enviado', 'Entregue'])
    );
    const unsubOrders = onSnapshot(
      orderQ,
      (snapshot) => {
          const ordersList: Order[] = [];
          const now = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          snapshot.forEach(doc => {
              const data = doc.data() as Order;
              const orderDate = new Date(data.date);
              
              // Lógica de Reserva Estrita:
              // 1. Encomendas com stockDeducted: false (Novas encomendas)
              // 2. Encomendas sem o campo (antigas) mas que ainda estão em estados iniciais e são recentes (< 30 dias)
              const isExplicitlyPending = data.stockDeducted === false;
              const isOldButStuck = data.stockDeducted === undefined && 
                                   ['Pendente', 'Processamento', 'Pago'].includes(data.status) && 
                                   orderDate > thirtyDaysAgo;
              
              if (isExplicitlyPending || isOldButStuck) {
                  ordersList.push({ ...data, id: doc.id } as Order);
              }
          });
          setPendingOrders(ordersList);
          setLoading(false);
      }, 
      (error) => {
          console.error("Erro no listener de encomendas (Admin):", error);
          setLoading(false);
      }
    );

    return () => {
        unsubInv();
        unsubRes();
        unsubOrders();
    };
  }, [isAdmin]); // O efeito depende do estado de admin

  const getStockForProduct = (publicId: number, variantName?: string): number => {
    // Se não for admin, não faz cálculo. A lógica principal está no App.tsx.
    if (!isAdmin) return 0; 
    
    // Para admin, continua a usar a lógica de tempo real
    if (loading) return 999; // Retorna 999 durante o carregamento para evitar bloquear vendas no admin

    const allBatchesForProduct = inventory.filter(p => Number(p.publicProductId) === Number(publicId));
    if (allBatchesForProduct.length === 0) return 0;
    
    const hasOnlyGenericStockBatch = allBatchesForProduct.length === 1 && (!allBatchesForProduct[0].variant || allBatchesForProduct[0].variant.trim() === '');

    // A. Stock Físico
    const physicalStock = allBatchesForProduct
      .filter(p => {
          if (!variantName) return true;
          const itemVariant = (p.variant || '').trim().toLowerCase();
          const requestedVariant = variantName.trim().toLowerCase();
          return itemVariant === requestedVariant || (hasOnlyGenericStockBatch && itemVariant === '');
      })
      .reduce((acc, batch) => acc + Math.max(0, (batch.quantityBought || 0) - (batch.quantitySold || 0)), 0);

    // B. Subtrair Reservas Temporárias (Carrinhos)
    const totalReservedInCarts = reservations
        .filter(r => Number(r.productId) === Number(publicId))
        .filter(r => {
            if (!variantName) return true;
            const itemVariant = (r.variantName || '').trim().toLowerCase();
            const requestedVariant = variantName.trim().toLowerCase();
            return itemVariant === requestedVariant || (hasOnlyGenericStockBatch && itemVariant === '');
        })
        .reduce((acc, r) => acc + (r.quantity || 0), 0);

    // C. Subtrair Itens de Encomendas efetuadas mas pendentes de envio
    let totalPendingInOrders = 0;
    pendingOrders.forEach(order => {
        const items = Array.isArray(order.items) ? order.items : [];
        items.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                const orderItem = item as OrderItem;
                if (Number(orderItem.productId) === Number(publicId)) {
                    const qty = Math.max(0, (orderItem.quantity || 1) - (orderItem.fulfilledQuantity || 0));
                    if (!variantName) {
                        totalPendingInOrders += qty;
                    } else {
                        const itemVariant = (orderItem.selectedVariant || '').trim().toLowerCase();
                        const requestedVariant = variantName.trim().toLowerCase();
                        if (itemVariant === requestedVariant || (hasOnlyGenericStockBatch && itemVariant === '')) {
                            totalPendingInOrders += qty;
                        }
                    }
                }
            }
        });
    });

    return Math.max(0, physicalStock - totalReservedInCarts - totalPendingInOrders);
  };

  return { getStockForProduct, loading };
};

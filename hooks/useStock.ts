import { useState, useEffect } from 'react';
import { modularDb } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { InventoryProduct, StockReservation, Order, OrderItem } from '../types';

/**
 * Dados privados usados apenas no dashboard.
 * A loja pública usa exclusivamente products_public.stock, calculado pelo servidor.
 */
export const useStock = (isAdmin: boolean) => {
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setInventory([]);
      setReservations([]);
      setPendingOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubRes = onSnapshot(collection(modularDb, 'stock_reservations'), (snapshot) => {
      const now = Date.now();
      const resList = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as any))
        .filter((item) => {
          const expiresAt = item.expiresAt?.toMillis?.() || (typeof item.expiresAt?.seconds === 'number' ? item.expiresAt.seconds * 1000 : Number(item.expiresAt || 0));
          return expiresAt > now;
        });
      setReservations(resList);
    }, (error) => console.error('Erro no listener de reservas:', error));

    const unsubInv = onSnapshot(collection(modularDb, 'products_inventory'), (snapshot) => {
      setInventory(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as InventoryProduct)));
    }, (error) => {
      console.error('Erro no listener de inventário:', error);
      setLoading(false);
    });

    const orderQ = query(collection(modularDb, 'orders'), where('status', 'in', ['Pendente', 'Processamento', 'Pago', 'Enviado', 'Entregue']));
    const unsubOrders = onSnapshot(orderQ, (snapshot) => {
      const recent = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as Order))
        .filter((order) => order.stockDeducted === false);
      setPendingOrders(recent);
      setLoading(false);
    }, (error) => {
      console.error('Erro no listener de encomendas:', error);
      setLoading(false);
    });

    return () => {
      unsubRes();
      unsubInv();
      unsubOrders();
    };
  }, [isAdmin]);

  const getStockForProduct = (publicId: number, variantName?: string): number => {
    if (!isAdmin) return 0;
    const matchingInventory = inventory.filter((item) => Number(item.publicProductId) === Number(publicId));
    const physical = matchingInventory
      .filter((item) => !variantName || String(item.variant || '').trim().toLowerCase() === variantName.trim().toLowerCase())
      .reduce((sum, item) => sum + Math.max(0, Number(item.quantityBought || 0) - Number(item.quantitySold || 0)), 0);
    const reserved = reservations
      .filter((item: any) => Number(item.productId) === Number(publicId))
      .filter((item: any) => !variantName || String(item.variantName || '').trim().toLowerCase() === variantName.trim().toLowerCase())
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const pending = pendingOrders.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => {
      if (typeof item === 'string') return itemSum;
      if (Number((item as OrderItem).productId) !== Number(publicId)) return itemSum;
      return itemSum + Number((item as OrderItem).quantity || 0);
    }, 0), 0);
    return Math.max(0, physical - reserved - pending);
  };

  return { getStockForProduct, loading };
};

import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '../../lib/firebase';
import type { Product } from '../../types/domain';
import type { AdminAuditEntry, AdminCoupon, AdminOrder, AdminSnapshot, AdminUser, ImportShipment, InventoryLot, ProductRequest, StockReservation, StoreCategory, SupportTicket } from './adminTypes';

const getCollection = async <T>(name: string): Promise<T[]> => {
  if (!firestore) throw new Error('Firebase não configurado.');
  const snapshot = await getDocs(collection(firestore, name));
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as T);
};

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const [products, lots, reservations, orders, users, coupons, tickets, imports, requests, categories, audit] = await Promise.all([
    getCollection<Product>('products_public'),
    getCollection<InventoryLot>('products_inventory'),
    getCollection<StockReservation>('stock_reservations'),
    getCollection<AdminOrder>('orders'),
    getCollection<AdminUser>('users'),
    getCollection<AdminCoupon>('coupons'),
    getCollection<SupportTicket>('support_tickets'),
    getCollection<ImportShipment>('import_shipments'),
    getCollection<ProductRequest>('product_requests'),
    getCollection<StoreCategory>('store_categories'),
    getCollection<AdminAuditEntry>('admin_audit_log').catch(() => []),
  ]);

  return {
    products: products
      .map((product) => ({
        ...product,
        id: Number(product.id),
        stock: Math.max(0, Number(product.stock ?? 0)),
      }))
      .filter((product) => Number.isFinite(product.id) && product.id > 0 && Boolean(product.name)),
    lots: lots.map((lot) => ({
      ...lot,
      publicProductId: lot.publicProductId == null ? undefined : Number(lot.publicProductId),
      quantityBought: Math.max(0, Number(lot.quantityBought ?? 0)),
      quantitySold: Math.max(0, Number(lot.quantitySold ?? 0)),
    })),
    reservations,
    orders: orders
      .map((order) => ({
        ...order,
        status: order.status || 'Pendente',
        total: Math.max(0, Number(order.total ?? 0)),
      }))
      .sort((a, b) => {
        const right = new Date(b.date ?? 0).getTime();
        const left = new Date(a.date ?? 0).getTime();
        return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
      }),
    users,
    coupons,
    tickets,
    imports,
    requests,
    categories: categories.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)),
    audit: audit.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)).slice(0, 100),
  };
}
function timestampMillis(value: AdminAuditEntry['createdAt']) {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return Number(value.seconds ?? 0) * 1000;
}

import type { AdminOrder, AdminOrderItem, AdminUser } from './adminTypes';

export const CLIENT_TIER_THRESHOLDS = {
  silver: 250,
  gold: 600,
} as const;

const normalizedEmail = (value?: string) => String(value ?? '').trim().toLocaleLowerCase('pt');

export function orderBelongsToClient(order: AdminOrder, client: Pick<AdminUser, 'id' | 'email'>) {
  if (order.userId && order.userId === client.id) return true;
  const clientEmail = normalizedEmail(client.email);
  return Boolean(clientEmail && normalizedEmail(order.shippingInfo?.email) === clientEmail);
}

export function isCommercialOrder(order: AdminOrder) {
  return order.status !== 'Cancelado' && order.status !== 'Devolvido';
}

export function tierForTotal(totalSpent: number) {
  if (totalSpent >= CLIENT_TIER_THRESHOLDS.gold) return 'Ouro';
  if (totalSpent >= CLIENT_TIER_THRESHOLDS.silver) return 'Prata';
  return 'Bronze';
}

export function clientOrderInsights(orders: AdminOrder[], client: Pick<AdminUser, 'id' | 'email'>) {
  const allOrders = orders.filter((order) => orderBelongsToClient(order, client));
  const commercialOrders = allOrders.filter(isCommercialOrder);
  const totalSpent = commercialOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total ?? 0)), 0);
  const averageOrderValue = commercialOrders.length ? totalSpent / commercialOrders.length : 0;
  return { allOrders, commercialOrders, totalSpent, averageOrderValue, tier: tierForTotal(totalSpent) };
}

export interface ClientTopProduct {
  productId: number | null;
  name: string;
  image?: string;
  quantity: number;
}

export function clientTopProducts(orders: AdminOrder[], limit = 3): ClientTopProduct[] {
  const products = new Map<string, ClientTopProduct>();
  orders.filter(isCommercialOrder).forEach((order) => {
    (order.items ?? []).forEach((item: AdminOrderItem) => {
      const productId = Number(item.productId);
      const key = Number.isFinite(productId) && productId > 0 ? `id:${productId}` : `name:${String(item.name ?? '').trim().toLocaleLowerCase('pt')}`;
      const current = products.get(key) ?? {
        productId: Number.isFinite(productId) && productId > 0 ? productId : null,
        name: item.name || 'Produto',
        image: item.image,
        quantity: 0,
      };
      current.quantity += Math.max(0, Number(item.quantity ?? 1));
      if (!current.image && item.image) current.image = item.image;
      products.set(key, current);
    });
  });
  return [...products.values()].sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, 'pt')).slice(0, limit);
}

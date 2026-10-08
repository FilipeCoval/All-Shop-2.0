export type OrderItem = { productId?: number; quantity?: number; price?: number; selectedVariant?: string; [key: string]: unknown };
export type OrderPackage = { items?: OrderItem[]; [key: string]: unknown };
export type CancelledItem = { productId: number; quantity: number; variant: string };
type OrderLike = { total?: number; subtotal?: number; discountValue?: number; items?: OrderItem[]; packages?: OrderPackage[] };
const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt');
const itemKey = (productId: unknown, variant: unknown) => `${Number(productId)}:${normalize(variant)}`;

export const cancellationSourceItems = (order: OrderLike): OrderItem[] => {
  const packageItems = (order.packages ?? []).flatMap((pkg) => Array.isArray(pkg.items) ? pkg.items : []);
  return packageItems.length ? packageItems : order.items ?? [];
};

const groupedCancellation = (cancelled: CancelledItem[]) => {
  const grouped = new Map<string, number>();
  for (const item of cancelled) {
    const key = itemKey(item.productId, item.variant);
    grouped.set(key, (grouped.get(key) ?? 0) + Math.max(0, Number(item.quantity ?? 0)));
  }
  return grouped;
};

export function validateCancellationItems(order: OrderLike, cancelled: CancelledItem[]) {
  const ordered = new Map<string, number>();
  for (const item of cancellationSourceItems(order)) {
    const key = itemKey(item.productId, item.selectedVariant);
    ordered.set(key, (ordered.get(key) ?? 0) + Math.max(0, Number(item.quantity ?? 0)));
  }
  for (const [key, quantity] of groupedCancellation(cancelled)) {
    if (quantity <= 0 || quantity > (ordered.get(key) ?? 0)) return false;
  }
  return cancelled.length > 0;
}

const removeQuantities = (items: OrderItem[], remaining: Map<string, number>) => {
  return items.map((item) => {
    const key = itemKey(item.productId, item.selectedVariant);
    const pending = remaining.get(key) ?? 0;
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    const removed = Math.min(quantity, pending);
    const nextQuantity = quantity - removed;
    remaining.set(key, pending - removed);
    return {
      ...item,
      quantity: nextQuantity,
      ...(Array.isArray(item.unitIds) ? { unitIds: item.unitIds.slice(0, nextQuantity) } : {}),
      ...(Array.isArray(item.serialNumbers) ? { serialNumbers: item.serialNumbers.slice(0, nextQuantity) } : {}),
    };
  }).filter((item) => Number(item.quantity ?? 0) > 0);
};

export function applyPartialCancellation(order: OrderLike, cancelled: CancelledItem[]) {
  if (!validateCancellationItems(order, cancelled)) throw new Error('O pedido de cancelamento contém quantidades inválidas.');
  const packageRemaining = groupedCancellation(cancelled);
  const packages = (order.packages ?? []).map((pkg) => ({
    ...pkg,
    items: removeQuantities(Array.isArray(pkg.items) ? pkg.items : [], packageRemaining),
  })).filter((pkg) => (pkg.items ?? []).length > 0);
  const items = Array.isArray(order.items) ? removeQuantities(order.items, groupedCancellation(cancelled)) : undefined;
  const sourceAfter = packages.length ? packages.flatMap((pkg) => pkg.items ?? []) : items ?? [];
  return { items, packages, remainingQuantity: sourceAfter.reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)), 0) };
}

export function calculateCancellationRefund(order: OrderLike, cancelled: CancelledItem[], partial: boolean) {
  const total = Math.max(0, Number(order.total ?? 0));
  if (!partial) return total;
  const sourceItems = cancellationSourceItems(order);
  const orderGross = sourceItems.reduce((sum, item) => sum + Math.max(0, Number(item.price ?? 0)) * Math.max(0, Number(item.quantity ?? 0)), 0);
  const pending = groupedCancellation(cancelled);
  const cancelledGross = sourceItems.reduce((sum, item) => {
    const key = itemKey(item.productId, item.selectedVariant);
    const quantity = Math.min(Math.max(0, Number(item.quantity ?? 0)), pending.get(key) ?? 0);
    pending.set(key, Math.max(0, (pending.get(key) ?? 0) - quantity));
    return sum + Math.max(0, Number(item.price ?? 0)) * quantity;
  }, 0);
  const subtotal = Math.max(1, Number(order.subtotal ?? orderGross));
  const discountRatio = Math.min(1, Math.max(0, Number(order.discountValue ?? 0) / subtotal));
  return Math.min(total, Math.round(cancelledGross * (1 - discountRatio) * 100) / 100);
}

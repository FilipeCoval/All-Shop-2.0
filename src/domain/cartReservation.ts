import type { CartItem } from '../../types';

export const CART_STORAGE_KEY = 'allshop_cart_v2';
export const isCartReservationExpired = (item: Pick<CartItem, 'reservedUntil'>, now = Date.now()) => {
  const expiresAt = Date.parse(item.reservedUntil ?? '');
  return !Number.isFinite(expiresAt) || expiresAt <= now;
};

export function restoreCart(value: string | null): CartItem[] {
  try {
    const items = JSON.parse(value ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.filter(item => item && typeof item.cartItemId === 'string' && Number.isSafeInteger(item.id) && item.id > 0
      && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20
      && typeof item.name === 'string' && Number.isFinite(item.price) && item.price >= 0)
      .slice(0, 100).map(item => ({ cartItemId: item.cartItemId, id: item.id, name: item.name, price: item.price,
        image: typeof item.image === 'string' ? item.image : '', quantity: item.quantity,
        selectedVariant: typeof item.selectedVariant === 'string' ? item.selectedVariant : undefined,
        reservedUntil: typeof item.reservedUntil === 'string' ? item.reservedUntil : undefined,
        maxQuantityPerOrder: item.maxQuantityPerOrder,
      }));
  } catch { return []; }
}

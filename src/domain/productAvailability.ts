export const PRODUCT_AVAILABILITY_MODES = ['AUTO', 'AVAILABLE', 'COMING_SOON', 'OUT_OF_STOCK'] as const;

export type ProductAvailabilityMode = typeof PRODUCT_AVAILABILITY_MODES[number];
export type EffectiveProductAvailability = Exclude<ProductAvailabilityMode, 'AUTO'>;

type AvailabilityProduct = {
  availabilityMode?: unknown;
  comingSoon?: unknown;
  stock?: unknown;
};

/**
 * `comingSoon` is kept as a backwards-compatible fallback for products saved
 * before the explicit availability selector existed.
 */
export function normalizeProductAvailabilityMode(product: AvailabilityProduct): ProductAvailabilityMode {
  const requested = String(product.availabilityMode ?? '').trim().toUpperCase();
  if ((PRODUCT_AVAILABILITY_MODES as readonly string[]).includes(requested)) {
    return requested as ProductAvailabilityMode;
  }
  return product.comingSoon === true ? 'COMING_SOON' : 'AUTO';
}

/**
 * Presentation may block a sale, but it may never invent stock. Selecting
 * "Disponivel" therefore still falls back to "Esgotado" when the calculated
 * inventory is zero. Checkout and reservations continue to validate the real
 * inventory on the server.
 */
export function effectiveProductAvailability(
  product: AvailabilityProduct,
  calculatedStock: unknown = product.stock,
): EffectiveProductAvailability {
  const mode = normalizeProductAvailabilityMode(product);
  if (mode === 'COMING_SOON' || mode === 'OUT_OF_STOCK') return mode;

  const stock = Number(calculatedStock);
  return (stock === 999 || (Number.isFinite(stock) && stock > 0)) ? 'AVAILABLE' : 'OUT_OF_STOCK';
}

export function productSaleIsBlocked(product: AvailabilityProduct, calculatedStock?: unknown) {
  return effectiveProductAvailability(product, calculatedStock) !== 'AVAILABLE';
}


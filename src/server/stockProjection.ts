type UnitData = { id?: string; status?: string; reservedUntil?: unknown; soldAt?: string; soldToOrder?: string; soldToCustomerName?: string; soldToCustomerEmail?: string };
export type LotData = { id?: string; publicProductId?: number; variant?: string; quantityBought?: number; quantitySold?: number; units?: UnitData[] };
export type ReservationData = { id?: string; productId?: number; variantName?: string; variantKey?: string; quantity?: number; expiresAt?: unknown };
type ProductData = { stock?: number; variants?: Array<{ name?: string; stock?: number; [key: string]: unknown }> };

const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const toMillis = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (value && typeof (value as { seconds?: number }).seconds === 'number') return Number((value as { seconds: number }).seconds) * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const physicalQuantity = (lot: LotData) => Math.max(0, Number(lot.quantityBought ?? 0) - Number(lot.quantitySold ?? 0));

const projectionForLots = (lots: LotData[], reservations: ReservationData[], productId: number, variant?: string) => {
  const exactLots = variant === undefined ? lots : lots.filter((lot) => normalize(lot.variant) === normalize(variant));
  const genericLots = variant === undefined ? [] : lots.filter((lot) => !normalize(lot.variant));
  const selectedLots = variant === undefined ? lots : exactLots.length ? exactLots : genericLots;
  const physical = selectedLots.reduce((sum, lot) => sum + physicalQuantity(lot), 0);
  const cartReserved = reservations.filter((reservation) =>
    Number(reservation.productId) === productId
    && toMillis(reservation.expiresAt) > Date.now()
    && (variant === undefined
      || normalize(reservation.variantName ?? reservation.variantKey) === normalize(variant)
      || (!normalize(reservation.variantName ?? reservation.variantKey) && Boolean(normalize(variant)))),
  ).reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity ?? 0)), 0);
  return Math.max(0, physical - Math.min(physical, cartReserved));
};

export function projectPublicStock(productId: number, product: ProductData, lots: LotData[], reservations: ReservationData[]) {
  if (Array.isArray(product.variants) && product.variants.length) {
    const variants = product.variants.map((variant) => ({
      ...variant,
      stock: projectionForLots(lots, reservations, productId, String(variant.name ?? '')),
    }));
    // A quantidade total vem dos lotes físicos uma única vez. Um lote antigo
    // sem variante pode servir de fallback a várias opções e não pode, por isso,
    // ser somado novamente por cada variante.
    return { stock: projectionForLots(lots, reservations, productId), variants };
  }
  return { stock: projectionForLots(lots, reservations, productId) };
}

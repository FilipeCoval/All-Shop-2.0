import { createHash } from 'node:crypto';
import type { LotData, ReservationData } from './stockProjection.js';

export const normalizeVariant = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt');
export const toMillis = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (value && typeof (value as { seconds?: number }).seconds === 'number') return Number((value as { seconds: number }).seconds) * 1000;
  return 0;
};
export const reservationId = (ownerKey: string, productId: number, variant: string) => createHash('sha256').update(`${ownerKey}|${productId}|${normalizeVariant(variant)}`).digest('hex');
export const lotMatches = (lot: LotData, variant: string) => !normalizeVariant(variant) || normalizeVariant(lot.variant) === normalizeVariant(variant);
export const sellableInLot = (lot: LotData) => {
  // A loja 2.0 considera o stock físico (comprado - vendido) como fonte de
  // verdade. Os S/N identificam as unidades na expedição, mas podem ser
  // registados mais tarde e não devem esconder stock já recebido.
  return Math.max(0, Number(lot.quantityBought ?? 0) - Number(lot.quantitySold ?? 0));
};
export const activeReservedQuantity = (reservations: ReservationData[], productId: number, variant: string, excludedId?: string) => reservations
  .filter((reservation) => reservation.id !== excludedId && Number(reservation.productId) === productId && normalizeVariant(reservation.variantName ?? reservation.variantKey) === normalizeVariant(variant) && toMillis(reservation.expiresAt) > Date.now())
  .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity ?? 0)), 0);

export function allocateSale(lots: LotData[], productId: number, variant: string, quantity: number, reservedByOthers: number) {
  const productLots = lots.filter((lot) => Number(lot.publicProductId) === productId);
  const variantKey = normalizeVariant(variant);
  const generic = productLots.filter((lot) => !normalizeVariant(lot.variant));
  const exact = productLots.filter((lot) => normalizeVariant(lot.variant) === variantKey);
  const matching = !variantKey ? (generic.length ? generic : productLots) : (exact.length ? exact : generic);
  const available = matching.reduce((sum, lot) => sum + sellableInLot(lot), 0) - reservedByOthers;
  if (available < quantity) throw new Error('Não existe stock suficiente para concluir a encomenda.');
  let remaining = quantity;
  return matching.map((lot) => {
    const sold = Math.min(remaining, sellableInLot(lot)); remaining -= sold;
    return { lot, sold };
  }).filter((entry) => entry.sold > 0);
}

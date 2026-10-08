import type { Product } from '../../types/domain';
import type { InventoryLot, StockGroup, StockReservation } from './adminTypes';

const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt');

const reservationExpiry = (value: StockReservation['expiresAt']) => {
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const activeReservationQuantity = (
  reservations: StockReservation[],
  productId: number,
  variant?: string,
) => reservations
  .filter((reservation) =>
    Number(reservation.productId) === productId
    && reservationExpiry(reservation.expiresAt) > Date.now()
    && (!variant || normalize(reservation.variantName ?? reservation.variantKey) === normalize(variant)),
  )
  .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity ?? 0)), 0);

const lotPhysical = (lot: InventoryLot) => Math.max(0, lot.quantityBought - lot.quantitySold);

const productPublishedStock = (product?: Product) => {
  if (!product) return 0;
  if (Number.isFinite(Number(product.stock))) return Math.max(0, Number(product.stock));
  return (product.variants ?? []).reduce((sum, variant) => sum + Math.max(0, Number(variant.stock ?? 0)), 0);
};

export function buildStockGroups(
  lots: InventoryLot[],
  products: Product[],
  reservations: StockReservation[],
): StockGroup[] {
  const grouped = new Map<string, InventoryLot[]>();
  for (const lot of lots) {
    const key = lot.publicProductId == null ? `orphan:${lot.name}` : String(lot.publicProductId);
    grouped.set(key, [...(grouped.get(key) ?? []), lot]);
  }

  return [...grouped.values()].map((productLots) => {
    const productId = productLots[0]?.publicProductId ?? null;
    const product = products.find((item) => item.id === productId);
    const variants = [...new Set(productLots.map((lot) => lot.variant?.trim()).filter(Boolean) as string[])];
    const physical = productLots.reduce((sum, lot) => sum + lotPhysical(lot), 0);
    const sold = productLots.reduce((sum, lot) => sum + lot.quantitySold, 0);
    const cartReserved = productId == null ? 0 : activeReservationQuantity(reservations, productId);
    const reserved = Math.min(physical, cartReserved);
    const available = Math.max(0, physical - reserved);
    const published = productPublishedStock(product);
    const warnings: string[] = [];

    if (productId == null) warnings.push('Lote sem ligação ao catálogo');
    if (productId != null && !product) warnings.push('Produto público não encontrado');
    if (published !== available) warnings.push(`Loja mostra ${published}, inventário calcula ${available}`);
    if (productLots.some((lot) => (lot.units ?? []).filter((unit) => unit.status === 'AVAILABLE').length > lotPhysical(lot))) {
      warnings.push('Existem unidades disponíveis acima da quantidade física');
    }
    if (productLots.some((lot) => (lot.units ?? []).filter((unit) => unit.status === 'SOLD').length > Number(lot.quantitySold ?? 0))) {
      warnings.push('Existem S/N vendidos acima da quantidade vendida do lote');
    }

    return {
      productId,
      name: product?.name ?? productLots[0]?.name ?? 'Produto sem nome',
      lots: productLots.length,
      variants,
      physical,
      reserved,
      available,
      sold,
      published,
      warnings,
      lotItems: productLots,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

import { InventoryProduct, ProductUnit, StockReservation } from '../types';

const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const reservationExpiry = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  if (value && typeof (value as any).toDate === 'function') return (value as any).toDate().getTime();
  if (value && typeof (value as any).seconds === 'number') return (value as any).seconds * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isReservationActive = (reservation: StockReservation, now = Date.now()) =>
  reservationExpiry(reservation.expiresAt) > now;

export const lotPhysicalQuantity = (lot: InventoryProduct) => {
  const units = Array.isArray(lot.units) ? lot.units : [];
  if (units.length) {
    // Físico = unidades que estão no armazém; trânsito é mostrado à parte.
    return units.filter(unit => ['AVAILABLE', 'RESERVED', 'RETURNED', 'DEFECTIVE'].includes(unit.status)).length;
  }
  return Math.max(0, Number(lot.quantityBought || 0) - Number(lot.quantitySold || 0));
};

export const lotSoldQuantity = (lot: InventoryProduct) => {
  const units = Array.isArray(lot.units) ? lot.units : [];
  if (units.length) return units.filter(unit => unit.status === 'SOLD').length;
  return Math.max(0, Number(lot.quantitySold || 0));
};

export const lotUnavailableQuantity = (lot: InventoryProduct) => {
  const units = Array.isArray(lot.units) ? lot.units : [];
  return units.filter(unit => ['DEFECTIVE', 'IN_TRANSIT'].includes(unit.status)).length;
};

export const lotReservedQuantity = (
  lot: InventoryProduct,
  reservations: StockReservation[],
  now = Date.now(),
) => {
  const unitReservations = (lot.units || []).filter(unit =>
    unit.status === 'RESERVED' && (!unit.reservedUntil || new Date(unit.reservedUntil).getTime() > now),
  ).length;

  const cartReservations = reservations
    .filter(reservation =>
      String(reservation.productId) === String(lot.publicProductId)
      && isReservationActive(reservation, now)
      && (!lot.variant || normalize(reservation.variantName) === normalize(lot.variant)),
    )
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity || 0)), 0);

  // A mesma reserva pode existir nas unidades e na coleção; nunca duplicamos a contagem.
  return Math.max(unitReservations, cartReservations);
};

export interface LotStockMetrics {
  physical: number;
  reserved: number;
  available: number;
  sold: number;
  returned: number;
  defective: number;
  inTransit: number;
}

export const getLotStockMetrics = (
  lot: InventoryProduct,
  reservations: StockReservation[],
  now = Date.now(),
): LotStockMetrics => {
  const units = Array.isArray(lot.units) ? lot.units : [];
  const returned = units.filter(unit => unit.status === 'RETURNED').length;
  const defective = units.filter(unit => unit.status === 'DEFECTIVE').length;
  const inTransit = units.filter(unit => unit.status === 'IN_TRANSIT').length;
  const physical = lotPhysicalQuantity(lot);
  const reserved = Math.min(physical, lotReservedQuantity(lot, reservations, now));
  const sold = lotSoldQuantity(lot);
  const baseAvailable = units.length
    ? units.filter(unit => unit.status === 'AVAILABLE').length
    : physical;
  return {
    physical,
    reserved,
    available: Math.max(0, baseAvailable - Math.max(0, reserved - units.filter(unit => unit.status === 'RESERVED').length)),
    sold,
    returned,
    defective,
    inTransit,
  };
};

export interface ProductStockMetrics extends LotStockMetrics {
  lots: number;
}

export const getProductStockMetrics = (
  lots: InventoryProduct[],
  reservations: StockReservation[],
  now = Date.now(),
): ProductStockMetrics => {
  const productId = lots[0]?.publicProductId;
  const unitReserved = lots.reduce(
    (sum, lot) => sum + (lot.units || []).filter(unit =>
      unit.status === 'RESERVED' && (!unit.reservedUntil || new Date(unit.reservedUntil).getTime() > now),
    ).length,
    0,
  );
  const cartReserved = reservations
    .filter(reservation =>
      String(reservation.productId) === String(productId)
      && isReservationActive(reservation, now),
    )
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity || 0)), 0);

  const physical = lots.reduce((sum, lot) => sum + lotPhysicalQuantity(lot), 0);
  const sold = lots.reduce((sum, lot) => sum + lotSoldQuantity(lot), 0);
  const returned = lots.reduce((sum, lot) => sum + (lot.units || []).filter(unit => unit.status === 'RETURNED').length, 0);
  const defective = lots.reduce((sum, lot) => sum + (lot.units || []).filter(unit => unit.status === 'DEFECTIVE').length, 0);
  const inTransit = lots.reduce((sum, lot) => sum + (lot.units || []).filter(unit => unit.status === 'IN_TRANSIT').length, 0);
  const reserved = Math.min(physical, Math.max(unitReserved, cartReserved));
  const explicitAvailable = lots.reduce((sum, lot) => {
    const units = lot.units || [];
    return sum + (units.length ? units.filter(unit => unit.status === 'AVAILABLE').length : lotPhysicalQuantity(lot));
  }, 0);
  const extraReservation = Math.max(0, reserved - unitReserved);

  return {
    physical,
    reserved,
    available: Math.max(0, explicitAvailable - extraReservation),
    sold,
    returned,
    defective,
    inTransit,
    lots: lots.length,
  };
};

export const unitMatchesSearch = (unit: ProductUnit, term: string) => {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return true;
  return [unit.id, unit.serialNumber, unit.barcode, unit.internalLabel]
    .some(value => normalize(value).includes(normalizedTerm));
};

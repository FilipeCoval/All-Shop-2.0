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

const unitCounts = (lot: InventoryProduct) => {
  const units: any[] = Array.isArray(lot.units) ? lot.units as any[] : [];
  return {
    units,
    available: units.filter(unit => String(unit.status) === 'AVAILABLE').length,
    reserved: units.filter(unit => String(unit.status) === 'RESERVED').length,
    sold: units.filter(unit => String(unit.status) === 'SOLD').length,
    returned: units.filter(unit => String(unit.status) === 'RETURNED').length,
    defective: units.filter(unit => String(unit.status) === 'DEFECTIVE').length,
    inTransit: units.filter(unit => String(unit.status) === 'IN_TRANSIT').length,
    physical: units.filter(unit => ['AVAILABLE', 'RESERVED', 'RETURNED', 'DEFECTIVE'].includes(String(unit.status))).length,
  };
};

const historySoldQuantity = (lot: InventoryProduct) =>
  (lot.salesHistory || []).reduce((sum, sale: any) => sum + Math.max(0, Number(sale.quantity || 0)), 0);

export const lotSoldQuantity = (lot: InventoryProduct) => {
  const counts = unitCounts(lot);
  return Math.max(
    0,
    Number(lot.quantitySold || 0),
    counts.sold,
    historySoldQuantity(lot),
  );
};

export const lotPhysicalQuantity = (lot: InventoryProduct) => {
  const counts = unitCounts(lot);
  const bought = Math.max(0, Number(lot.quantityBought || 0));
  const sold = lotSoldQuantity(lot);

  // Regra principal: a quantidade comprada/recebida do lote é a fonte de verdade.
  // As unidades/SN servem para rastreabilidade, mas nem todos os artigos têm etiqueta individual.
  // Ex.: lote comprado com 11 unidades e só 1 S/N marcado como vendido => físico real = 10.
  if (bought > 0) return Math.max(0, bought - sold, counts.physical);

  // Compatibilidade com lotes antigos onde só existem unidades e não existe quantityBought.
  return counts.physical;
};

export const lotUnavailableQuantity = (lot: InventoryProduct) => {
  const counts = unitCounts(lot);
  return counts.defective + counts.inTransit;
};

export const lotReservedQuantity = (
  lot: InventoryProduct,
  reservations: StockReservation[],
  now = Date.now(),
) => {
  const counts = unitCounts(lot);
  const unitReservations = (lot.units || []).filter(unit =>
    String(unit.status) === 'RESERVED' && (!unit.reservedUntil || new Date(unit.reservedUntil).getTime() > now),
  ).length;

  const cartReservations = reservations
    .filter(reservation =>
      String(reservation.productId) === String(lot.publicProductId)
      && isReservationActive(reservation, now)
      && (!lot.variant || normalize(reservation.variantName) === normalize(lot.variant)),
    )
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity || 0)), 0);

  // A mesma reserva pode existir nas unidades e na coleção; nunca duplicamos a contagem.
  return Math.max(unitReservations, cartReservations, counts.reserved);
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
  const counts = unitCounts(lot);
  const returned = counts.returned;
  const defective = counts.defective;
  const inTransit = counts.inTransit;
  const physical = lotPhysicalQuantity(lot);
  const reserved = Math.min(physical, lotReservedQuantity(lot, reservations, now));
  const sold = lotSoldQuantity(lot);

  // Disponível é calculado pelo lote total, não apenas pelas unidades com S/N.
  // Isto evita esconder stock real quando ainda só algumas unidades têm etiqueta interna.
  const unavailableInsideWarehouse = defective + returned;
  const available = Math.max(0, physical - reserved - unavailableInsideWarehouse);

  return {
    physical,
    reserved,
    available,
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
  const lotMetrics = lots.map(lot => getLotStockMetrics(lot, reservations, now));
  return {
    physical: lotMetrics.reduce((sum, metric) => sum + metric.physical, 0),
    reserved: lotMetrics.reduce((sum, metric) => sum + metric.reserved, 0),
    available: lotMetrics.reduce((sum, metric) => sum + metric.available, 0),
    sold: lotMetrics.reduce((sum, metric) => sum + metric.sold, 0),
    returned: lotMetrics.reduce((sum, metric) => sum + metric.returned, 0),
    defective: lotMetrics.reduce((sum, metric) => sum + metric.defective, 0),
    inTransit: lotMetrics.reduce((sum, metric) => sum + metric.inTransit, 0),
    lots: lots.length,
  };
};

export const unitMatchesSearch = (unit: ProductUnit, term: string) => {
  const normalizedTerm = normalize(term);
  const unitData = unit as any;
  if (!normalizedTerm) return true;
  return [
    unitData.id,
    unitData.serialNumber,
    unitData.barcode,
    unitData.internalLabel,
    unitData.soldToOrder,
    unitData.soldToCustomerName,
    unitData.soldToCustomerEmail,
  ].some(value => normalize(value).includes(normalizedTerm));
};

export const lotUnidentifiedUnitCount = (lot: InventoryProduct) =>
  (lot.units || []).filter(unit => {
    const unitData = unit as any;
    return !String(unitData.serialNumber || unitData.barcode || unitData.internalLabel || unitData.id || '').trim();
  }).length;

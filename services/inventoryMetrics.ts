import { InventoryProduct, ProductUnit, StockReservation } from '../types';

export type UnitLifecycleStatus = ProductUnit['status'] | 'DEFECTIVE' | 'RETURNED' | 'IN_TRANSIT';

const normalise = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export const reservationExpiryMs = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const typed = value as any;
  if (typeof typed.toMillis === 'function') return typed.toMillis();
  if (typeof typed.toDate === 'function') return typed.toDate().getTime();
  if (typeof typed.seconds === 'number') return typed.seconds * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getLotMetrics = (lot: InventoryProduct) => {
  const units = Array.isArray(lot.units) ? lot.units : [];
  const hasTrackedUnits = units.length > 0;

  if (!hasTrackedUnits) {
    const physical = Math.max(0, Number(lot.quantityBought) || 0);
    const sold = Math.max(0, Number(lot.quantitySold) || 0);
    return {
      physical,
      sold,
      reserved: 0,
      available: Math.max(0, physical - sold),
      defective: 0,
      returned: 0,
      inTransit: 0,
      tracked: false,
    };
  }

  const count = (status: string) => units.filter(unit => String(unit.status) === status).length;
  const sold = count('SOLD');
  const reserved = count('RESERVED');
  const defective = count('DEFECTIVE');
  const returned = count('RETURNED');
  const inTransit = count('IN_TRANSIT');
  const available = count('AVAILABLE');

  return {
    physical: units.length,
    sold,
    reserved,
    available,
    defective,
    returned,
    inTransit,
    tracked: true,
  };
};

export const getGroupMetrics = (
  lots: InventoryProduct[],
  reservations: StockReservation[] = [],
  publicProductId?: number,
  variantName?: string,
) => {
  const lotsSummary = lots.reduce((sum, lot) => {
    const metrics = getLotMetrics(lot);
    return {
      physical: sum.physical + metrics.physical,
      sold: sum.sold + metrics.sold,
      reservedByUnit: sum.reservedByUnit + metrics.reserved,
      defective: sum.defective + metrics.defective,
      returned: sum.returned + metrics.returned,
      inTransit: sum.inTransit + metrics.inTransit,
      availableBeforeCart: sum.availableBeforeCart + metrics.available,
    };
  }, {
    physical: 0,
    sold: 0,
    reservedByUnit: 0,
    defective: 0,
    returned: 0,
    inTransit: 0,
    availableBeforeCart: 0,
  });

  const now = Date.now();
  const cartReserved = reservations
    .filter(reservation => {
      if (publicProductId !== undefined && String(reservation.productId) !== String(publicProductId)) return false;
      if (variantName && normalise(reservation.variantName) !== normalise(variantName)) return false;
      return reservationExpiryMs(reservation.expiresAt) > now;
    })
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity) || 0), 0);

  return {
    ...lotsSummary,
    cartReserved,
    reserved: lotsSummary.reservedByUnit + cartReserved,
    available: Math.max(0, lotsSummary.availableBeforeCart - cartReserved),
  };
};

export const matchesInventorySearch = (lot: InventoryProduct, rawTerm: string) => {
  const term = normalise(rawTerm);
  if (!term) return true;

  const values = [
    lot.name,
    lot.category,
    lot.variant,
    lot.supplierName,
    lot.supplierOrderId,
    lot.publicProductId,
    lot.id,
  ];

  const unitMatches = (lot.units || []).some((unit: any) => {
    return [
      unit.id,
      unit.serialNumber,
      unit.barcode,
      unit.ean,
      unit.internalCode,
      unit.labelCode,
      unit.soldToOrder,
      unit.soldToCustomer,
    ].some(value => normalise(value).includes(term));
  });

  return unitMatches || values.some(value => normalise(value).includes(term));
};

type CapacityUnit = { id?: string; serialNumber?: string; internalLabel?: string; barcode?: string; status?: string };
type CapacityLot = { quantityBought?: number; units?: CapacityUnit[] };

export const fulfillmentAvailableUnitCapacity = (lot: CapacityLot) => {
  const quantityBought = Math.max(0, Math.trunc(Number(lot.quantityBought ?? 0)));
  const soldUnitCount = (lot.units ?? []).filter((unit) => unit.status === 'SOLD').length;
  return Math.max(0, quantityBought - soldUnitCount);
};

export const isGeneratedInternalUnit = (unit: CapacityUnit) => {
  const serialNumber = String(unit.serialNumber ?? '').trim();
  if (serialNumber) return false;
  const displayedCode = String(unit.internalLabel || unit.id || unit.barcode || '').trim();
  return Boolean(unit.internalLabel || /^INT-/i.test(displayedCode));
};

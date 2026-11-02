type CapacityUnit = { status?: string };
type CapacityLot = { quantityBought?: number; units?: CapacityUnit[] };

export const fulfillmentAvailableUnitCapacity = (lot: CapacityLot) => {
  const quantityBought = Math.max(0, Math.trunc(Number(lot.quantityBought ?? 0)));
  const soldUnitCount = (lot.units ?? []).filter((unit) => unit.status === 'SOLD').length;
  return Math.max(0, quantityBought - soldUnitCount);
};

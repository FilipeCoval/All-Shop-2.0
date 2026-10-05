import type { InventoryUnit } from './adminTypes';

export const normalizeUnitCode = (value: unknown) => String(value ?? '').trim().toUpperCase();

export const stableUnitId = (unit: InventoryUnit) => String(unit.id ?? '').trim();

export const displayUnitCode = (unit: InventoryUnit) => String(
  unit.serialNumber || unit.internalLabel || unit.id || unit.barcode || '',
).trim();

export const unitCodes = (unit: InventoryUnit) => [...new Set([
  unit.serialNumber,
  unit.internalLabel,
  unit.barcode,
  unit.id,
].map(normalizeUnitCode).filter(Boolean))];

export const unitMatchesCode = (unit: InventoryUnit, value: unknown) => {
  const code = normalizeUnitCode(value);
  return Boolean(code && unitCodes(unit).includes(code));
};

import type { InventoryUnit } from './adminTypes';

export const normalizeUnitCode = (value: unknown) => String(value ?? '').trim().toUpperCase();

export const stableUnitId = (unit: InventoryUnit) => String(unit.id ?? '').trim();

export const resolveUnitIdForSerial = (unit: InventoryUnit, serialValue: unknown, isNewLot: boolean) => {
  const serialNumber = normalizeUnitCode(serialValue);
  const currentId = stableUnitId(unit);
  const currentSerial = normalizeUnitCode(unit.serialNumber);
  const hasIndependentIdentity = Boolean(normalizeUnitCode(unit.internalLabel) || normalizeUnitCode(unit.barcode));

  // Num lote novo, um S/N escrito à mão é também o identificador estável da unidade.
  // Isto impede que o primeiro carácter digitado (por exemplo, "6") fique preso no campo id.
  if (isNewLot && serialNumber && !hasIndependentIdentity) return serialNumber;
  if (!currentId || currentId === currentSerial) return serialNumber;
  return currentId;
};

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

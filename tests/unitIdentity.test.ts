import assert from 'node:assert/strict';
import type { InventoryUnit } from '../src/features/admin/adminTypes.js';
import { normalizeUnitCode, resolveUnitIdForSerial, unitCodes } from '../src/features/admin/unitIdentity.js';

const serials = [
  '63598/700002251964',
  '63598/700002216085',
  '63598/700002216104',
];

assert.equal(normalizeUnitCode(serials[0]), serials[0], 'a barra faz parte do S/N e deve ser preservada');

let typedUnit: InventoryUnit = { id: '', serialNumber: '', status: 'AVAILABLE' };
for (const partial of ['6', '63', '63598/7', serials[0]]) {
  typedUnit = {
    ...typedUnit,
    id: resolveUnitIdForSerial(typedUnit, partial, true),
    serialNumber: partial,
  };
}
assert.equal(typedUnit.id, serials[0], 'o id deve acompanhar o S/N completo, não ficar no primeiro carácter');

const repairedDraft: InventoryUnit = { id: '6', serialNumber: serials[1], status: 'AVAILABLE' };
assert.equal(resolveUnitIdForSerial(repairedDraft, repairedDraft.serialNumber, true), serials[1], 'rascunhos criados com o erro antigo devem ser reparados ao guardar');

const independentIdentity: InventoryUnit = { id: 'UNIT-UUID', serialNumber: 'OLD-SN', barcode: 'EAN-1', status: 'AVAILABLE' };
assert.equal(resolveUnitIdForSerial(independentIdentity, 'NEW-SN', false), 'UNIT-UUID', 'um identificador interno independente deve permanecer estável');

const units = serials.map((serialNumber) => ({
  id: resolveUnitIdForSerial({ id: '6', serialNumber, status: 'AVAILABLE' }, serialNumber, true),
  serialNumber,
  status: 'AVAILABLE',
}));
assert.equal(new Set(units.flatMap(unitCodes)).size, serials.length, 'S/N distintos não podem ser confundidos pelo primeiro carácter');

console.log('unit identity regressions: OK');

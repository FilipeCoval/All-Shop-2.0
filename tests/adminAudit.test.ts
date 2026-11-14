import assert from 'node:assert/strict';
import { adminAuditEntry, auditChanges } from '../src/server/adminAudit.js';

const changes = auditChanges(
  { name: 'Power bank', price: 12.99, images: ['https://old.example/image.jpg'], fcmToken: 'private-token' },
  { name: 'Power bank 10000 mAh', price: 14.99, images: ['https://new.example/image.jpg'], fcmToken: 'another-private-token' },
);

assert.deepEqual(changes.map((change) => change.field), ['images', 'name', 'price']);
assert.equal(changes.find((change) => change.field === 'price')?.before, '12.99');
assert.equal(changes.find((change) => change.field === 'price')?.after, '14.99');
assert.ok(changes.find((change) => change.field === 'images')?.after.includes('https://new.example/image.jpg'));
assert.equal(changes.some((change) => change.field.toLocaleLowerCase('pt').includes('token')), false);

const orderChanges = auditChanges(
  { status: 'Pendente', shippingInfo: { email: 'cliente@example.com', street: 'Rua privada' }, ownerKey: 'secret-owner' },
  { status: 'Processamento', shippingInfo: { email: 'cliente@example.com', street: 'Outra rua' }, ownerKey: 'other-secret' },
);
assert.deepEqual(orderChanges.map((change) => change.field), ['status']);

const entry = adminAuditEntry({
  action: 'save_lot',
  actor: { uid: 'admin-id', email: 'admin@example.com' },
  target: { type: 'Lote', id: 'lot-1', label: 'Power bank · 10000 mAh' },
  before: null,
  after: { quantityBought: 10, quantitySold: 0, units: [{ id: 'INT-001', status: 'AVAILABLE' }] },
});

assert.equal(entry.operation, 'CRIADO');
assert.equal(entry.targetType, 'Lote');
assert.equal(entry.targetLabel, 'Power bank · 10000 mAh');
assert.ok(entry.changedFields.includes('quantityBought'));

console.log('admin audit regressions: OK');

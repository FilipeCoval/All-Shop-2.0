import assert from 'node:assert/strict';
import { buildFilamentRequest, isFilamentProduct } from '../src/domain/filamentRequest.js';

const product = { id: 1795382330484, name: 'Filamento SUNLU PLA 1,75 mm — 1 kg', category: 'Impressão 3D' };

assert.equal(isFilamentProduct(product), true);
assert.equal(isFilamentProduct({ name: 'Impressora 3D', category: 'Impressão 3D' }), false);
assert.equal(isFilamentProduct({ name: 'Filamento PLA', category: 'Acessórios' }), false);

const request = buildFilamentRequest({
  product,
  user: { uid: 'user-1', name: 'Cliente', email: 'cliente@example.com' },
  email: ' cliente@example.com ',
  material: 'PETG',
  color: 'Verde menta',
  quantity: 3,
  notes: 'Acabamento mate',
  createdAt: '2026-11-24T14:00:00.000Z',
});

assert.equal(request.userId, 'user-1');
assert.equal(request.userEmail, 'cliente@example.com');
assert.equal(request.productName, 'Filamento pedido — PETG, Verde menta');
assert.match(request.specifications, /Quantidade pretendida: 3 rolos/);
assert.equal(request.sourceProductId, product.id);
assert.equal(request.status, 'Análise');

console.log('filament request regressions: OK');

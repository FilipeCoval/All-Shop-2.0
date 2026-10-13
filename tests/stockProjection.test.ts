import assert from 'node:assert/strict';
import { projectPublicStock } from '../src/server/stockProjection.js';

const projection = projectPublicStock(
  21,
  {
    stock: 99,
    variants: [
      { name: 'Preto', stock: 99, sku: 'BLACK' },
      { name: 'Branco', stock: 99, sku: 'WHITE' },
    ],
  },
  [{
    id: 'LEGACY-GENERIC',
    publicProductId: 21,
    variant: '',
    quantityBought: 5,
    quantitySold: 1,
  }],
  [],
);

assert.equal(projection.stock, 4);
assert.deepEqual(projection.variants?.map((variant) => variant.stock), [4, 4]);
assert.equal((projection.variants?.[0] as Record<string, unknown>).sku, 'BLACK');
assert.equal((projection.variants?.[1] as Record<string, unknown>).sku, 'WHITE');
assert.notEqual(
  projection.stock,
  projection.variants?.reduce((sum, variant) => sum + Number(variant.stock), 0),
  'o lote genérico não deve ser somado novamente por cada variante no stock público total',
);

console.log('stock projection regressions: OK');

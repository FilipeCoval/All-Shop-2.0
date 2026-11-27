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

const incomingProjection = projectPublicStock(
  22,
  { stock: 99 },
  [
    { id: 'RECEIVED', publicProductId: 22, quantityBought: 2, quantitySold: 0, receiptStatus: 'RECEIVED' },
    { id: 'ON-THE-WAY', publicProductId: 22, quantityBought: 8, quantitySold: 0, receiptStatus: 'IN_TRANSIT' },
  ],
  [],
);
assert.equal(incomingProjection.stock, 2, 'um lote a caminho nunca pode entrar no stock público');

const soldSerialProjection = projectPublicStock(
  23,
  { stock: 3 },
  [{
    id: 'STALE-SOLD-COUNTER',
    publicProductId: 23,
    quantityBought: 3,
    quantitySold: 0,
    receiptStatus: 'RECEIVED',
    units: [
      { id: 'AVAILABLE-1', status: 'AVAILABLE' },
      { id: 'SOLD-1', status: 'SOLD', soldToOrder: 'AS-1' },
      { id: 'SOLD-2', status: 'SOLD', soldToOrder: 'AS-2' },
    ],
  }],
  [],
);
assert.equal(
  soldSerialProjection.stock,
  1,
  'S/N já vendidos têm de ser descontados mesmo quando o contador antigo quantitySold ficou desatualizado',
);

const versionedProjection = projectPublicStock(
  2,
  {
    stock: 99,
    variants: [
      { name: '4 GB RAM + 32 GB', price: 39.49, stock: 99 },
      { name: '2 GB RAM + 16 GB', price: 29.49, stock: 99 },
    ],
  },
  [
    { id: 'OLD-CLASSIFIED', publicProductId: 2, variant: '4 GB RAM + 32 GB', quantityBought: 7, quantitySold: 6, receiptStatus: 'RECEIVED' },
    { id: 'NEW-INCOMING', publicProductId: 2, variant: '2 GB RAM + 16 GB', quantityBought: 5, quantitySold: 0, receiptStatus: 'IN_TRANSIT' },
  ],
  [],
);
assert.equal(versionedProjection.stock, 1, 'apenas a unidade fisicamente recebida deve ficar disponível');
assert.deepEqual(
  versionedProjection.variants?.map((variant) => ({ name: variant.name, stock: variant.stock })),
  [
    { name: '4 GB RAM + 32 GB', stock: 1 },
    { name: '2 GB RAM + 16 GB', stock: 0 },
  ],
  'cada versão deve ter stock independente e a compra a caminho não pode aparecer à venda',
);

console.log('stock projection regressions: OK');

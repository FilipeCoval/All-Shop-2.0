import assert from 'node:assert/strict';
import { productHasVariants, productStartingPrice, publicProductSummary } from '../src/domain/productPresentation.js';

const h96 = {
  name: 'TV Box H96 Max M2',
  price: 39.49,
  description: 'Texto antigo específico da versão de 4 GB.',
  variants: [
    { name: '4 GB RAM + 32 GB', price: 39.49 },
    { name: '2 GB RAM + 16 GB', price: 31.45 },
  ],
};

assert.equal(productHasVariants(h96), true);
assert.equal(productStartingPrice(h96), 31.45);
assert.equal(publicProductSummary(h96), 'Disponível em 2 versões: 4 GB RAM + 32 GB e 2 GB RAM + 16 GB.');
assert.equal(productStartingPrice({ price: 5 }), 5);
assert.equal(publicProductSummary({ description: 'Descrição normal', price: 5 }), 'Descrição normal');

console.log('product presentation regressions: OK');

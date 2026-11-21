import assert from 'node:assert/strict';
import { catalogContentIssues, catalogContentScore } from '../src/domain/catalogContentHealth.js';

const incomplete = {
  name: 'TV Box H96 Max M2',
  category: 'TV & Streaming',
  description: 'Versão com 4GB de RAM e 32GB de armazenamento.',
  image: 'one.jpg',
  images: ['one.jpg'],
  features: ['4K'],
  specs: { Material: 'Nylon Trançado', Comprimento: '2 Metros' },
  variants: [
    { name: '4 GB RAM + 32 GB', description: '', features: [] },
    { name: '2 GB RAM + 16 GB', description: '', features: [] },
  ],
};

const issueCodes = catalogContentIssues(incomplete).map((issue) => issue.code);
assert.ok(issueCodes.includes('short-description'));
assert.ok(issueCodes.includes('few-highlights'));
assert.ok(issueCodes.includes('few-images'));
assert.ok(issueCodes.includes('variant-description'));
assert.ok(issueCodes.includes('variant-highlights'));
assert.ok(issueCodes.includes('version-specific-general-copy'));
assert.ok(issueCodes.includes('suspicious-specs'));
assert.ok(catalogContentScore(incomplete) < 50);

const complete = {
  name: 'Produto completo',
  category: 'Acessórios',
  description: 'Uma apresentação geral detalhada que explica claramente para que serve o produto, como pode ser utilizado e quais são as vantagens comuns para quem o compra, sem depender de uma variante específica.',
  image: 'one.jpg',
  images: ['one.jpg', 'two.jpg'],
  features: ['Vantagem um', 'Vantagem dois', 'Vantagem três'],
  specs: { Material: 'Alumínio', Garantia: '3 anos' },
};
assert.deepEqual(catalogContentIssues(complete), []);
assert.equal(catalogContentScore(complete), 100);

console.log('catalog content health regressions: OK');

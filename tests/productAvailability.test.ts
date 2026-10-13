import assert from 'node:assert/strict';
import {
  effectiveProductAvailability,
  normalizeProductAvailabilityMode,
  productSaleIsBlocked,
} from '../src/domain/productAvailability.js';

assert.equal(normalizeProductAvailabilityMode({}), 'AUTO');
assert.equal(normalizeProductAvailabilityMode({ comingSoon: true }), 'COMING_SOON', 'produtos antigos continuam a respeitar comingSoon');
assert.equal(normalizeProductAvailabilityMode({ availabilityMode: 'OUT_OF_STOCK', comingSoon: true }), 'OUT_OF_STOCK');

assert.equal(effectiveProductAvailability({ availabilityMode: 'AUTO' }, 3), 'AVAILABLE');
assert.equal(effectiveProductAvailability({ availabilityMode: 'AUTO' }, 0), 'OUT_OF_STOCK');
assert.equal(effectiveProductAvailability({ availabilityMode: 'AVAILABLE' }, 0), 'OUT_OF_STOCK', 'a apresentação nunca pode inventar stock');
assert.equal(effectiveProductAvailability({ availabilityMode: 'AVAILABLE' }, 2), 'AVAILABLE');
assert.equal(effectiveProductAvailability({ availabilityMode: 'COMING_SOON' }, 8), 'COMING_SOON', 'em breve bloqueia a venda sem alterar o stock');
assert.equal(effectiveProductAvailability({ availabilityMode: 'OUT_OF_STOCK' }, 8), 'OUT_OF_STOCK', 'esgotado manual bloqueia a venda sem alterar o stock');
assert.equal(productSaleIsBlocked({ availabilityMode: 'COMING_SOON', stock: 5 }), true);
assert.equal(productSaleIsBlocked({ availabilityMode: 'AVAILABLE', stock: 5 }), false);

console.log('product availability regressions: OK');


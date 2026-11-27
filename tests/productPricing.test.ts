import assert from 'node:assert/strict';
import { effectiveProductPrice, isPromotionExpired } from '../src/domain/productPricing.js';

const beforeEnd = new Date('2026-11-15T12:00:00Z').getTime();
const afterEnd = new Date('2026-11-23T12:00:00Z').getTime();
const timedPromotion = {
  price: 57.49,
  originalPrice: 59.49,
  promoEndsAt: '2026-11-16T00:00:00Z',
};

assert.equal(isPromotionExpired(timedPromotion, beforeEnd), false);
assert.equal(effectiveProductPrice(timedPromotion, beforeEnd), 57.49);
assert.equal(isPromotionExpired(timedPromotion, afterEnd), true);
assert.equal(effectiveProductPrice(timedPromotion, afterEnd), 59.49);
assert.equal(effectiveProductPrice({ price: 12.99, originalPrice: 15.99 }), 12.99);
assert.equal(effectiveProductPrice({ price: 20, variants: [{ price: 18.5 }, { price: 16.5 }] }), 16.5);

console.log('product pricing regressions: OK');

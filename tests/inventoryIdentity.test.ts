import assert from 'node:assert/strict';
import { inventoryUnitCodeDocumentId } from '../src/server/inventoryIdentity.ts';

const withSlash = inventoryUnitCodeDocumentId('63598/700002215964');
assert.match(withSlash, /^[a-f0-9]{64}$/);
assert.equal(withSlash, inventoryUnitCodeDocumentId(' 63598/700002215964 '));
assert.equal(withSlash, inventoryUnitCodeDocumentId('63598/700002215964'.toLowerCase()));
assert.notEqual(withSlash, inventoryUnitCodeDocumentId('63598/700002216085'));

console.log('inventory identity regression tests passed');

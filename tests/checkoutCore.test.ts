import assert from 'node:assert/strict';
import { activeReservedQuantity, allocateSale, reservationId } from '../src/server/checkoutCore.js';

const lots = [
  { id: 'GENERIC', publicProductId: 7, variant: '', quantityBought: 4, quantitySold: 1 },
  { id: 'BLACK', publicProductId: 7, variant: 'Preto', quantityBought: 3, quantitySold: 1 },
  { id: 'WHITE', publicProductId: 7, variant: 'Branco', quantityBought: 5, quantitySold: 0 },
];

const exact = allocateSale(lots, 7, '  PRETO ', 2, 0);
assert.deepEqual(exact.map((entry) => entry.lot.id), ['BLACK']);
assert.equal(exact[0].sold, 2, 'uma variante exata não deve retirar stock de outro lote');

const fallback = allocateSale(lots, 7, 'Azul', 2, 0);
assert.deepEqual(fallback.map((entry) => entry.lot.id), ['GENERIC']);
assert.equal(fallback[0].sold, 2, 'um lote antigo genérico continua compatível quando não existe variante exata');

assert.throws(
  () => allocateSale(lots, 7, 'Preto', 2, 1),
  /stock suficiente/i,
  'reservas de outros clientes têm de reduzir o stock que pode ser vendido',
);

const future = Date.now() + 60_000;
const past = Date.now() - 60_000;
const reservations = [
  { id: 'OTHER-1', productId: 7, variantName: ' preto ', quantity: 2, expiresAt: future },
  { id: 'OWN', productId: 7, variantName: 'PRETO', quantity: 1, expiresAt: future },
  { id: 'EXPIRED', productId: 7, variantName: 'Preto', quantity: 8, expiresAt: past },
  { id: 'OTHER-PRODUCT', productId: 8, variantName: 'Preto', quantity: 9, expiresAt: future },
];
assert.equal(activeReservedQuantity(reservations, 7, 'Preto', 'OWN'), 2);
assert.equal(reservationId('guest:abc', 7, ' PRETO '), reservationId('guest:abc', 7, 'preto'));

console.log('checkout reservation and allocation regressions: OK');

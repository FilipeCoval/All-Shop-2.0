import assert from 'node:assert/strict';
import { getPreorderOffer, hasPreorderAvailability } from '../src/domain/preorder.js';

assert.equal(getPreorderOffer({}), null, 'uma pré-reserva só existe quando for explicitamente ativada');
assert.equal(getPreorderOffer({ preorder: { enabled: true, capacity: 3 } }), null, 'a previsão de expedição é obrigatória');

const offer = getPreorderOffer({
  preorder: {
    enabled: true,
    capacity: 5,
    reservedQuantity: 2,
    estimatedDispatchDate: '2026-12-10',
    paymentDeadlineHours: 96,
  },
});

assert.ok(offer);
assert.equal(offer.depositPercent, 50, 'o sinal é sempre claro e fixo em 50%');
assert.equal(offer.remaining, 3, 'a capacidade não é stock físico');
assert.equal(offer.paymentDeadlineHours, 72, 'o prazo tem um limite seguro');
assert.equal(hasPreorderAvailability({ preorder: { enabled: true, capacity: 2, reservedQuantity: 2, estimatedDispatchDate: '2026-12-10' } }), false);
assert.equal(hasPreorderAvailability({ preorder: { enabled: true, capacity: 2, reservedQuantity: 1, estimatedDispatchDate: '2026-12-10' } }), true);

console.log('preorder offer regressions: OK');

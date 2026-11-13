import assert from 'node:assert/strict';
import { getPreorderOffer, getPreorderRemainingForVariant, hasPreorderAvailability } from '../src/domain/preorder.js';

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

const byVariant = getPreorderOffer({
  preorder: {
    enabled: true,
    capacity: 10,
    reservedQuantity: 3,
    variantCapacities: { '2 GB + 16 GB': 2, '4 GB + 32 GB': 8 },
    reservedByVariant: { '2 GB + 16 GB': 1, '4 GB + 32 GB': 2 },
    estimatedDispatchDate: '2026-12-10',
  },
});
assert.ok(byVariant);
assert.equal(byVariant.capacity, 10, 'as vagas por versão formam a capacidade total');
assert.equal(getPreorderRemainingForVariant(byVariant, '2 GB + 16 GB'), 1, 'cada versão mantém a sua própria vaga');
assert.equal(getPreorderRemainingForVariant(byVariant, '4 GB + 32 GB'), 6, 'uma versão não pode gastar as vagas da outra');
assert.equal(getPreorderRemainingForVariant(byVariant, 'inexistente'), 0, 'uma versão sem vaga configurada não pode ser pré-reservada');

console.log('preorder offer regressions: OK');

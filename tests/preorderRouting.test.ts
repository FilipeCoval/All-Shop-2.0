import assert from 'node:assert/strict';
import { isPreorderStatusManaged, isPreorderWorkflowOrder } from '../src/features/admin/preorderRouting.js';

const preorder = (status: 'DEPOSIT_PENDING' | 'DEPOSIT_RECEIVED' | 'BALANCE_RECEIVED' | 'CANCELLED' | 'EXPIRED' | 'FULFILLED') => ({
  preorder: { kind: 'PREORDER' as const, status },
});

assert.equal(isPreorderStatusManaged(preorder('DEPOSIT_PENDING')), true);
assert.equal(isPreorderStatusManaged(preorder('BALANCE_RECEIVED')), true, 'A expedição ainda é gerida pelo fluxo de pré-reserva.');
assert.equal(isPreorderStatusManaged(preorder('FULFILLED')), false, 'Após a expedição, o estado volta a ter gestão normal.');
assert.equal(isPreorderStatusManaged({}), false);

assert.equal(isPreorderWorkflowOrder(preorder('DEPOSIT_RECEIVED')), true);
assert.equal(isPreorderWorkflowOrder(preorder('FULFILLED')), false, 'Uma pré-reserva concluída aparece nas encomendas normais.');

console.log('preorderRouting tests passed');

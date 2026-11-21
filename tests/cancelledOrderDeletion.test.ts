import assert from 'node:assert/strict';
import { cancelledOrderDeletionIssue } from '../src/server/cancelledOrderDeletion.js';

assert.equal(
  cancelledOrderDeletionIssue({ status: 'Processamento' }),
  'Só é possível apagar encomendas já canceladas.',
);

assert.equal(
  cancelledOrderDeletionIssue({ status: 'Cancelado', stockDeducted: true, hasInventoryItems: true }),
  'Esta encomenda cancelada não tem a reposição de stock confirmada. Não pode ser apagada por segurança.',
);

assert.equal(
  cancelledOrderDeletionIssue({
    status: 'Cancelado',
    preorder: { kind: 'PREORDER', capacityHeld: true },
  }),
  'Esta pré-reserva ainda tem uma vaga ocupada. Cancele-a corretamente antes de apagar.',
);

assert.equal(
  cancelledOrderDeletionIssue({ status: 'Cancelado', stockDeducted: true, hasInventoryItems: true, stockRestoredAt: '2026-11-14T10:00:00.000Z' }),
  null,
);

assert.equal(
  cancelledOrderDeletionIssue({ status: 'Cancelado', stockDeducted: true, hasInventoryItems: false }),
  null,
);

console.log('cancelled order deletion safety: OK');

export type CancelledOrderDeletionCandidate = {
  status?: unknown;
  stockDeducted?: unknown;
  stockRestoredAt?: unknown;
  hasInventoryItems?: boolean;
  preorder?: { kind?: unknown; capacityHeld?: unknown } | null;
};

/**
 * Deleting an order is only safe after it was genuinely cancelled.  This
 * deliberately refuses uncertain stock/pre-order cases instead of guessing.
 */
export function cancelledOrderDeletionIssue(order: CancelledOrderDeletionCandidate) {
  if (order.status !== 'Cancelado') {
    return 'Só é possível apagar encomendas já canceladas.';
  }
  if (order.stockDeducted === true && order.hasInventoryItems && !order.stockRestoredAt) {
    return 'Esta encomenda cancelada não tem a reposição de stock confirmada. Não pode ser apagada por segurança.';
  }
  if (order.preorder?.kind === 'PREORDER' && order.preorder.capacityHeld === true) {
    return 'Esta pré-reserva ainda tem uma vaga ocupada. Cancele-a corretamente antes de apagar.';
  }
  return null;
}

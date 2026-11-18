/** Confirming a message never creates another order or changes its money/stock. */
export function preorderMessageConfirmation(order: Record<string, any>, platform: unknown, now: Date) {
  if (order.preorder?.kind !== 'PREORDER') throw new Error('Esta encomenda não é uma pré-reserva.');
  if (platform !== 'WHATSAPP' && platform !== 'TELEGRAM') throw new Error('Escolha WhatsApp ou Telegram.');
  if (['Cancelado', 'Devolvido'].includes(order.status) || ['CANCELLED', 'EXPIRED'].includes(order.preorder.status)) {
    throw new Error('Esta pré-reserva foi cancelada ou expirou.');
  }
  if (order.preorder.messageConfirmedAt) return null;
  if (order.preorder.status === 'DEPOSIT_PENDING' && new Date(order.preorder.depositDeadlineAt).getTime() <= now.getTime()) {
    throw new Error('O prazo desta pré-reserva terminou. Contacte a loja antes de pagar.');
  }
  return {
    status: order.status === 'A confirmar' ? 'Pendente' : order.status,
    preorder: { ...order.preorder, messagePending: false, messagePlatform: platform, messageConfirmedAt: now.toISOString() },
  };
}

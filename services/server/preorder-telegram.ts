import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../../constants.js';

const text = (value: unknown, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const money = (value: unknown) => Math.max(0, Number(value ?? 0) || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

/**
 * Alerts the operations chat after the preorder has been explicitly confirmed
 * by the customer in the message step. It deliberately runs on the server:
 * returning from WhatsApp/Telegram must not determine whether the admin gets
 * the alert.
 */
export async function notifyTelegramOfConfirmedPreorder(order: Record<string, any>) {
  // The environment variables allow the token to be removed from the public
  // app config without changing this workflow. The fallback preserves the
  // existing deployment until the production variables are configured.
  const token = text(process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN, 300);
  const chatId = text(process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID, 120);
  if (!token || !chatId) return { sent: false, skipped: true };

  const items = Array.isArray(order.items)
    ? order.items.map((item: any) => `• ${Math.max(1, Number(item?.quantity ?? 1))}x ${text(item?.name, 180) || 'Artigo'}${text(item?.selectedVariant, 100) ? ` (${text(item.selectedVariant, 100)})` : ''}`).join('\n')
    : '• Artigo não indicado';
  const shipping = order.shippingInfo && typeof order.shippingInfo === 'object' ? order.shippingInfo : {};
  const preorder = order.preorder && typeof order.preorder === 'object' ? order.preorder : {};
  const message = [
    '🟠 NOVA PRÉ-RESERVA CONFIRMADA',
    '',
    `Ref: #${text(order.id, 80).replace(/^#/, '')}`,
    `Cliente: ${text(shipping.name, 120) || 'Cliente'} (${text(shipping.phone, 50) || 'sem telefone'})`,
    `Pagamento do sinal: ${text(shipping.paymentMethod, 80) || 'não indicado'}`,
    `Entrega: ${shipping.deliveryMethod === 'Pickup' ? 'Levantamento em loja' : 'Envio'}`,
    '',
    'Itens:',
    items,
    '',
    `Preço garantido: ${money(order.total)}`,
    `Sinal a receber (50%): ${money(preorder.depositDue)}`,
    `Saldo antes da expedição: ${money(preorder.balanceDue)}`,
    preorder.estimatedDispatchDate ? `Expedição prevista: ${text(preorder.estimatedDispatchDate, 20)}` : '',
    '',
    'Mensagem do cliente confirmada no site. Registe o sinal ou cancele a vaga na Dashboard.',
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Telegram devolveu ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return { sent: true, skipped: false };
  } catch (error) {
    console.warn('[preorder-telegram] A pré-reserva foi guardada, mas o alerta Telegram falhou.', error instanceof Error ? error.message : error);
    return { sent: false, skipped: false };
  }
}

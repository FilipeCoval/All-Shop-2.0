import { useRef, useState } from 'react';
import type { Order } from '../types';
import { SELLER_PHONE, TELEGRAM_LINK } from '../constants';
import { confirmPreorderMessage } from '../services/api';

const euro = (value: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

/** Shared by checkout and the account: an interrupted message can always resume. */
export default function PreorderMessageActions({ order, guestToken, onConfirmed }: { order: Order; guestToken?: string; onConfirmed?: (order: Order) => void }) {
  const [platform, setPlatform] = useState<'WHATSAPP' | 'TELEGRAM'>('WHATSAPP');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const info = order.shippingInfo;
  const message = [
    `Olá! Quero confirmar a pré-reserva #${order.id} na All-Shop.`,
    ...order.items.map((item) => typeof item === 'string' ? item : `${item.quantity}x ${item.name}${item.selectedVariant ? ` (${item.selectedVariant})` : ''}`),
    `Preço total: ${euro(order.total)}`,
    `Sinal (50%): ${euro(order.preorder?.depositDue ?? 0)}`,
    `Saldo antes da expedição: ${euro(order.preorder?.balanceDue ?? 0)}`,
    `Cliente: ${info.name} (${info.phone})`, `Email: ${info.email}`,
    `Pagamento: ${info.paymentMethod}`,
    info.deliveryMethod === 'Pickup' ? 'Levantamento em loja' : `Envio: ${info.street}, ${info.doorNumber}, ${info.zip} ${info.city}`,
  ].join('\n');
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await confirmPreorderMessage(order.id, platform, guestToken);
      setDone(true);
      window.dispatchEvent(new Event('allshop:orders-changed'));
      onConfirmed?.(result.order as Order);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar. O pedido continua guardado; tente novamente.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (done) return <p role="status" className="mt-4 font-bold text-emerald-700 dark:text-emerald-300">Mensagem confirmada. Obrigado! A pré-reserva está guardada.</p>;
  return <div className="mt-4 grid gap-3 text-sm">
    <p>O pedido <strong>#{order.id}</strong> já está guardado. Envie a mensagem e depois confirme aqui. Se sair, pode continuar na Área de Cliente.</p>
    <label className="font-bold">1. Escolha a aplicação<select className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" value={platform} disabled={busy} onChange={(event) => setPlatform(event.target.value as typeof platform)}><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option></select></label>
    <textarea aria-label="Mensagem da pré-reserva" readOnly value={message} className="h-32 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" onFocus={(event) => event.currentTarget.select()} />
    <p className="text-xs">No Telegram, copie o texto acima e cole-o na conversa.</p>
    <a target="_blank" rel="noopener noreferrer" href={platform === 'WHATSAPP' ? `https://wa.me/${SELLER_PHONE}?text=${encodeURIComponent(message)}` : TELEGRAM_LINK} className="rounded-xl bg-sky-600 px-4 py-3 text-center font-bold text-white">2. Abrir {platform === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'} e enviar</a>
    <button type="button" disabled={busy} onClick={() => void confirm()} className="rounded-xl bg-orange-500 px-4 py-3 font-extrabold text-white disabled:opacity-50">{busy ? 'A confirmar…' : '3. Já enviei a mensagem — confirmar'}</button>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, MapPin, PackageCheck, ShieldCheck, Store, X } from 'lucide-react';
import type { Product, ProductVariant, User } from '../types';
import { SELLER_PHONE, TELEGRAM_LINK } from '../constants';
import { createPreorder } from '../services/api';
import type { PreorderOffer } from '../src/domain/preorder';
import { formatPreorderDate } from '../src/domain/preorder';
import OrderTutorial from './OrderTutorial';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getGuestToken = () => {
  let token = localStorage.getItem('guestToken');
  if (!token) {
    token = `guest_${Math.random().toString(36).slice(2, 15)}_${Date.now()}`;
    localStorage.setItem('guestToken', token);
  }
  return token;
};

type Props = {
  product: Product;
  selectedVariant?: ProductVariant;
  currentUser: User | null;
  offer: PreorderOffer;
  remaining: number;
  onClose: () => void;
};

type Stage = 'form' | 'channel' | 'message' | 'success';
type Channel = 'wa' | 'tg';

export default function PreorderModal({ product, selectedVariant, currentUser, offer, remaining, onClose }: Props) {
  const savedAddress = currentUser?.addresses?.[0];
  const [stage, setStage] = useState<Stage>('form');
  const [quantity, setQuantity] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState<'Shipping' | 'Pickup'>('Shipping');
  const [paymentMethod, setPaymentMethod] = useState<'MB Way' | 'Transferência' | 'Outro'>('MB Way');
  const [form, setForm] = useState({
    name: currentUser?.name ?? '', email: currentUser?.email ?? '', phone: currentUser?.phone ?? '', nif: currentUser?.nif ?? '',
    street: savedAddress?.street ?? '', doorNumber: '', zip: savedAddress?.zip ?? '', city: savedAddress?.city ?? '',
  });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [channel, setChannel] = useState<Channel>('wa');
  const [created, setCreated] = useState<{ id: string; depositDue: number; balanceDue: number } | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, []);

  const maxQuantity = Math.max(1, Math.min(remaining, Number(product.maxQuantityPerOrder ?? remaining), 10));
  const price = Number(selectedVariant?.price ?? product.price);
  const summary = useMemo(() => {
    const subtotal = roundMoney(price * quantity);
    const shipping = deliveryMethod === 'Pickup' || subtotal >= 50 ? 0 : 4.99;
    const total = roundMoney(subtotal + shipping);
    const deposit = roundMoney(total * 0.5);
    return { total, shipping, deposit, balance: roundMoney(total - deposit) };
  }, [deliveryMethod, price, quantity]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const message = useMemo(() => [
    `Olá! Quero confirmar a pré-reserva #${reference || 'a criar'} na All-Shop.`,
    '',
    `Artigo: ${quantity}x ${product.name}${selectedVariant ? ` (${selectedVariant.name})` : ''}`,
    `Preço garantido: ${euro.format(summary.total)}`,
    `Sinal a pagar agora (50%): ${euro.format(summary.deposit)}`,
    `Saldo antes da expedição: ${euro.format(summary.balance)}`,
    `Método para o sinal: ${paymentMethod}`,
    `Entrega: ${deliveryMethod === 'Pickup' ? 'Levantamento em loja' : 'Envio'}`,
    `Cliente: ${form.name} (${form.phone})`,
    `Email: ${form.email}`,
    deliveryMethod === 'Shipping' ? `Morada: ${form.street}, ${form.doorNumber}, ${form.zip} ${form.city}` : '',
  ].filter(Boolean).join('\n'), [deliveryMethod, form, paymentMethod, product.name, quantity, reference, selectedVariant, summary]);

  const beginMessageStage = (event: FormEvent) => {
    event.preventDefault();
    if (!accepted) return;
    setError('');
    setReference((current) => current || `AS-${String(Date.now()).slice(-12)}`);
    setStage('channel');
  };

  const chooseChannel = (nextChannel: Channel) => {
    setChannel(nextChannel);
    setStage('message');
  };

  const confirmMessageAndCreate = async () => {
    if (!reference || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await createPreorder({
        idempotencyKey: reference,
        productId: product.id,
        selectedVariant: selectedVariant?.name ?? '',
        quantity,
        termsAccepted: true,
        messagePlatform: channel === 'wa' ? 'WHATSAPP' : 'TELEGRAM',
        messageConfirmedAt: new Date().toISOString(),
        shippingInfo: { ...form, deliveryMethod, paymentMethod },
      }, getGuestToken()) as { order?: { id?: string; preorder?: { depositDue?: number; balanceDue?: number } } };
      setCreated({
        id: String(result.order?.id ?? reference),
        depositDue: Number(result.order?.preorder?.depositDue ?? summary.deposit),
        balanceDue: Number(result.order?.preorder?.balanceDue ?? summary.balance),
      });
      // The account page normally refreshes every minute. Notify it now so a
      // client who immediately opens “Área de Cliente” sees this preorder.
      window.dispatchEvent(new Event('allshop:orders-changed'));
      setStage('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a pré-reserva.');
      setStage('channel');
    } finally {
      setBusy(false);
    }
  };

  const shellClass = 'flex h-[100dvh] min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-[2rem]';
  const closeToAccount = () => {
    onClose();
    window.location.hash = '#account?tab=orders';
  };

  return <div className="fixed inset-0 z-[100] flex min-h-0 bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-label="Fazer pré-reserva">
    {stage === 'success' && created ? <section className={`${shellClass} justify-center p-6 sm:p-8`}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50"><CheckCircle2 size={34} /></div>
      <h2 className="mt-5 text-center text-2xl font-black text-slate-950 dark:text-white">Obrigado pela encomenda!</h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">A pré-reserva ficou registada e a nossa equipa recebeu o pedido. A vaga e o preço estão garantidos enquanto o sinal for recebido dentro do prazo.</p>
      <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center dark:border-orange-900/70 dark:bg-orange-950/25">
        <p className="text-xs font-extrabold uppercase tracking-wide text-orange-700 dark:text-orange-300">Referência do pedido</p>
        <p className="mt-1 font-mono text-xl font-black text-slate-950 dark:text-white">#{created.id}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-orange-200 pt-4 text-left text-sm dark:border-orange-900/70"><span><small className="block text-slate-500">Sinal a pagar</small><strong>{euro.format(created.depositDue)}</strong></span><span><small className="block text-slate-500">Saldo mais tarde</small><strong>{euro.format(created.balanceDue)}</strong></span></div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">Pode acompanhar este pedido na sua Área de Cliente.</p>
      {currentUser && <button type="button" onClick={closeToAccount} className="mt-5 w-full rounded-2xl bg-orange-500 px-5 py-4 font-extrabold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600">Ver a minha pré-reserva</button>}
      <button type="button" onClick={onClose} className="mt-3 w-full rounded-2xl border border-slate-200 px-5 py-3.5 font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Voltar à loja</button>
    </section> : stage === 'message' ? <section className={shellClass}>
      <OrderTutorial
        message={message}
        platform={channel}
        actionUrl={channel === 'wa' ? `https://wa.me/${SELLER_PHONE}?text=${encodeURIComponent(message)}` : TELEGRAM_LINK}
        onComplete={() => void confirmMessageAndCreate()}
        isLoading={busy}
      />
      <div className="shrink-0 border-t border-slate-200 p-4 dark:border-slate-700"><button type="button" disabled={busy} onClick={() => setStage('channel')} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft size={17}/> Voltar à escolha da mensagem</button></div>
    </section> : stage === 'channel' ? <section className={`${shellClass} justify-center p-5 sm:p-8`}>
      <button type="button" onClick={() => setStage('form')} className="absolute left-5 top-5 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Voltar"><ArrowLeft /></button>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950/50"><PackageCheck size={28} /></div>
      <h2 className="mt-5 text-center text-2xl font-black text-slate-950 dark:text-white">Confirme o seu pedido</h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">Escolha como quer enviar a mensagem. O pedido só é criado depois de voltar e confirmar que a enviou.</p>
      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/80"><div className="flex justify-between gap-4"><span>Pré-reserva #{reference}</span><strong>{euro.format(summary.total)}</strong></div><div className="mt-2 flex justify-between gap-4 text-orange-700 dark:text-orange-300"><span>Sinal de 50%</span><strong>{euro.format(summary.deposit)}</strong></div></div>
      <button type="button" onClick={() => chooseChannel('wa')} className="mt-6 flex w-full items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 font-extrabold text-white hover:bg-emerald-700"><span>Enviar pelo WhatsApp</span><ChevronRight size={20}/></button>
      <button type="button" onClick={() => chooseChannel('tg')} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-sky-600 px-5 py-4 font-extrabold text-white hover:bg-sky-700"><span>Enviar pelo Telegram</span><ChevronRight size={20}/></button>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
    </section> : <form onSubmit={beginMessageStage} className={shellClass}>
      <header className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-700 sm:px-7"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-orange-600">Pré-reserva</p><h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Garanta o preço com 50%</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A mesma confirmação de uma compra, sem mexer no stock físico.</p></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X /></button></header>
      <div className="grid min-h-0 flex-1 touch-pan-y gap-5 overflow-y-auto overscroll-contain p-5 [-webkit-overflow-scrolling:touch] sm:p-7">
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm dark:border-orange-900/70 dark:bg-orange-950/25"><div className="flex gap-3"><PackageCheck className="mt-0.5 shrink-0 text-orange-600" size={21} /><div><strong className="text-slate-950 dark:text-white">{quantity}× {product.name}{selectedVariant ? ` · ${selectedVariant.name}` : ''}</strong><p className="mt-1 text-slate-700 dark:text-slate-200">Expedição prevista: <strong>{formatPreorderDate(offer.estimatedDispatchDate)}</strong>{offer.note ? ` · ${offer.note}` : ''}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{remaining} vaga{remaining === 1 ? '' : 's'} disponível{remaining === 1 ? '' : 'is'}{selectedVariant ? ' nesta versão' : ' nesta previsão'}.</p></div></div></section>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700 dark:text-slate-200">Quantidade<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-semibold outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800">{Array.from({ length: maxQuantity }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} unidade{value === 1 ? '' : 's'}</option>)}</select></label><label className="text-sm font-bold text-slate-700 dark:text-slate-200">Pagamento do sinal<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-semibold outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"><option>MB Way</option><option>Transferência</option><option>Outro</option></select></label></div>
        <section className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/80"><div className="flex justify-between gap-5"><span>Preço total garantido</span><strong>{euro.format(summary.total)}</strong></div><div className="flex justify-between gap-5 border-t border-slate-200 pt-3 text-orange-700 dark:border-slate-700 dark:text-orange-300"><span>Sinal a pagar agora (50%)</span><strong className="text-lg">{euro.format(summary.deposit)}</strong></div><div className="flex justify-between gap-5 text-slate-600 dark:text-slate-300"><span>Saldo antes da expedição</span><strong>{euro.format(summary.balance)}</strong></div>{summary.shipping > 0 && <small className="text-slate-500">Inclui {euro.format(summary.shipping)} de portes.</small>}</section>
        <section><div className="mb-3 flex gap-2"><MapPin size={19} className="text-orange-600" /><h3 className="font-extrabold text-slate-950 dark:text-white">Entrega e contacto</h3></div><div className="grid gap-3 sm:grid-cols-2"><input required placeholder="Nome completo" value={form.name} onChange={(event) => update('name', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required type="email" placeholder="Email" value={form.email} onChange={(event) => update('email', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="Telemóvel" value={form.phone} onChange={(event) => update('phone', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input placeholder="NIF (opcional)" value={form.nif} onChange={(event) => update('nif', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setDeliveryMethod('Shipping')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${deliveryMethod === 'Shipping' ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30' : 'border-slate-300 dark:border-slate-600'}`}><MapPin className="mr-1 inline" size={16}/> Envio</button><button type="button" onClick={() => setDeliveryMethod('Pickup')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${deliveryMethod === 'Pickup' ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30' : 'border-slate-300 dark:border-slate-600'}`}><Store className="mr-1 inline" size={16}/> Levantamento</button></div>{deliveryMethod === 'Shipping' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><input required placeholder="Rua / Avenida" value={form.street} onChange={(event) => update('street', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="N.º da porta" value={form.doorNumber} onChange={(event) => update('doorNumber', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="Código-postal" value={form.zip} onChange={(event) => update('zip', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="Localidade" value={form.city} onChange={(event) => update('city', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/></div>}</section>
        <label className="flex gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300"><input required type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-orange-500"/><span><strong className="text-slate-950 dark:text-white">Confirmo as condições da pré-reserva.</strong><br/>O preço total fica garantido. Pagarei o sinal de 50% em {offer.paymentDeadlineHours} horas; o saldo é pedido antes da expedição. Se a All-Shop não puder fornecer o artigo, o sinal é reembolsado. Mantêm-se os direitos legais aplicáveis.</span></label>
      </div>
      <footer className="shrink-0 flex flex-col-reverse gap-3 border-t border-slate-200 p-5 dark:border-slate-700 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="rounded-xl px-5 py-3 font-bold text-slate-600 dark:text-slate-300">Cancelar</button><button type="submit" disabled={!accepted} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-extrabold text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={18}/> Continuar para enviar pedido</button></footer>
    </form>}
  </div>;
}

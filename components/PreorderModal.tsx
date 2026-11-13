import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, CreditCard, Loader2, MapPin, PackageCheck, ShieldCheck, Store, X } from 'lucide-react';
import type { Product, ProductVariant, User } from '../types';
import { SELLER_PHONE } from '../constants';
import { createPreorder } from '../services/api';
import type { PreorderOffer } from '../src/domain/preorder';
import { formatPreorderDate } from '../src/domain/preorder';

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

export default function PreorderModal({ product, selectedVariant, currentUser, offer, remaining, onClose }: Props) {
  const savedAddress = currentUser?.addresses?.[0];
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
  const [created, setCreated] = useState<{ id: string; depositDue: number } | null>(null);
  const maxQuantity = Math.max(1, Math.min(remaining, Number(product.maxQuantityPerOrder ?? remaining), 10));
  const price = Number(selectedVariant?.price ?? product.price);
  const summary = useMemo(() => {
    const subtotal = roundMoney(price * quantity);
    const shipping = deliveryMethod === 'Pickup' || subtotal >= 50 ? 0 : 4.99;
    const total = roundMoney(subtotal + shipping);
    const deposit = roundMoney(total * 0.5);
    return { subtotal, shipping, total, deposit, balance: roundMoney(total - deposit) };
  }, [deliveryMethod, price, quantity]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accepted || busy) return;
    setBusy(true); setError('');
    try {
      const result = await createPreorder({
        idempotencyKey: `AS-${String(Date.now()).slice(-12)}`,
        productId: product.id,
        selectedVariant: selectedVariant?.name ?? '',
        quantity,
        termsAccepted: true,
        shippingInfo: { ...form, deliveryMethod, paymentMethod },
      }, getGuestToken()) as { order?: { id?: string; preorder?: { depositDue?: number } } };
      setCreated({ id: String(result.order?.id ?? '—'), depositDue: Number(result.order?.preorder?.depositDue ?? summary.deposit) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a pré-reserva.');
    } finally { setBusy(false); }
  };

  if (created) {
    const message = `Olá! Criei a pré-reserva ${created.id} para ${quantity}x ${product.name}${selectedVariant ? ` (${selectedVariant.name})` : ''}. O sinal a pagar é ${euro.format(created.depositDue)}.`;
    return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Pré-reserva criada">
      <section className="w-full max-w-lg rounded-t-[2rem] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50"><CheckCircle2 size={34} /></div>
        <h2 className="mt-5 text-center text-2xl font-black text-slate-950 dark:text-white">Pré-reserva registada</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">A vaga e o preço estão guardados. Para a confirmar, envie o sinal de <strong>{euro.format(created.depositDue)}</strong> dentro de {offer.paymentDeadlineHours} horas.</p>
        <a href={`https://wa.me/${SELLER_PHONE}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-extrabold text-white transition hover:bg-emerald-700"><CreditCard size={19} /> Enviar pedido de pagamento</a>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-2xl border border-slate-200 px-5 py-3.5 font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Fechar</button>
      </section>
    </div>;
  }

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/65 p-0 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-label="Fazer pré-reserva">
    <form onSubmit={submit} className="min-h-full w-full max-w-2xl bg-white shadow-2xl dark:bg-slate-900 sm:min-h-0 sm:rounded-[2rem]">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-700 sm:px-7"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-orange-600">Pré-reserva</p><h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Garanta o preço com 50%</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sem mexer no stock real até o artigo ser recebido.</p></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X /></button></header>
      <div className="grid gap-5 p-5 sm:p-7">
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm dark:border-orange-900/70 dark:bg-orange-950/25"><div className="flex gap-3"><PackageCheck className="mt-0.5 shrink-0 text-orange-600" size={21} /><div><strong className="text-slate-950 dark:text-white">{quantity}× {product.name}{selectedVariant ? ` · ${selectedVariant.name}` : ''}</strong><p className="mt-1 text-slate-700 dark:text-slate-200">Expedição prevista: <strong>{formatPreorderDate(offer.estimatedDispatchDate)}</strong>{offer.note ? ` · ${offer.note}` : ''}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{remaining} vaga{remaining === 1 ? '' : 's'} disponível{remaining === 1 ? '' : 'is'}{selectedVariant ? ' nesta versão' : ' nesta previsão'}.</p></div></div></section>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700 dark:text-slate-200">Quantidade<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-semibold outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800">{Array.from({ length: maxQuantity }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} unidade{value === 1 ? '' : 's'}</option>)}</select></label><label className="text-sm font-bold text-slate-700 dark:text-slate-200">Pagamento do sinal<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-semibold outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"><option>MB Way</option><option>Transferência</option><option>Outro</option></select></label></div>
        <section className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/80"><div className="flex justify-between gap-5"><span>Preço total garantido</span><strong>{euro.format(summary.total)}</strong></div><div className="flex justify-between gap-5 border-t border-slate-200 pt-3 text-orange-700 dark:border-slate-700 dark:text-orange-300"><span>Sinal a pagar agora (50%)</span><strong className="text-lg">{euro.format(summary.deposit)}</strong></div><div className="flex justify-between gap-5 text-slate-600 dark:text-slate-300"><span>Saldo antes da expedição</span><strong>{euro.format(summary.balance)}</strong></div>{summary.shipping > 0 && <small className="text-slate-500">Inclui {euro.format(summary.shipping)} de portes.</small>}</section>
        <section><div className="mb-3 flex gap-2"><MapPin size={19} className="text-orange-600" /><h3 className="font-extrabold text-slate-950 dark:text-white">Entrega e contacto</h3></div><div className="grid gap-3 sm:grid-cols-2"><input required placeholder="Nome completo" value={form.name} onChange={(event) => update('name', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required type="email" placeholder="Email" value={form.email} onChange={(event) => update('email', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="Telemóvel" value={form.phone} onChange={(event) => update('phone', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input placeholder="NIF (opcional)" value={form.nif} onChange={(event) => update('nif', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setDeliveryMethod('Shipping')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${deliveryMethod === 'Shipping' ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30' : 'border-slate-300 dark:border-slate-600'}`}><MapPin className="mr-1 inline" size={16}/> Envio</button><button type="button" onClick={() => setDeliveryMethod('Pickup')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${deliveryMethod === 'Pickup' ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30' : 'border-slate-300 dark:border-slate-600'}`}><Store className="mr-1 inline" size={16}/> Levantamento</button></div>{deliveryMethod === 'Shipping' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><input required placeholder="Rua / Avenida" value={form.street} onChange={(event) => update('street', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="N.º da porta" value={form.doorNumber} onChange={(event) => update('doorNumber', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="Código-postal" value={form.zip} onChange={(event) => update('zip', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/><input required placeholder="Localidade" value={form.city} onChange={(event) => update('city', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800"/></div>}</section>
        <label className="flex gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300"><input required type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-orange-500"/><span><strong className="text-slate-950 dark:text-white">Confirmo as condições da pré-reserva.</strong><br/>O preço total fica garantido. Pagarei o sinal de 50% em {offer.paymentDeadlineHours} horas; o saldo é pedido antes da expedição. Se a All-Shop não puder fornecer o artigo, o sinal é reembolsado. Mantêm-se os direitos legais aplicáveis.</span></label>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
      </div>
      <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 p-5 dark:border-slate-700 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="rounded-xl px-5 py-3 font-bold text-slate-600 dark:text-slate-300">Cancelar</button><button type="submit" disabled={!accepted || busy} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-extrabold text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin"/> : <ShieldCheck size={18}/>} Criar pré-reserva</button></footer>
    </form>
  </div>;
}

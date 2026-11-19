import { useMemo, useRef, useState } from 'react';
import { Save, Trash2, X } from 'lucide-react';
import type { Order, Product } from '../types';
import { cancelCustomerPreorder, editPreorder } from '../services/api';
import PreorderItemsEditor, { type PreorderSelection } from './PreorderItemsEditor';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

export default function PreorderEditModal({ order, products, onClose }: { order: Order; products: Product[]; onClose: () => void }) {
  const initial = order.items.filter((item) => typeof item === 'object').map((item: any) => ({ productId: Number(item.productId), selectedVariant: String(item.selectedVariant ?? ''), quantity: Number(item.quantity) || 1 }));
  const [items, setItems] = useState<PreorderSelection[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const subtotal = useMemo(() => items.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants?.find((candidate) => candidate.name === item.selectedVariant);
    const existing = order.items.find((candidate: any) => Number(candidate?.productId) === item.productId && String(candidate?.selectedVariant ?? '') === item.selectedVariant) as any;
    return sum + Number(existing?.price ?? variant?.price ?? product?.price ?? 0) * item.quantity;
  }, 0), [items, order.items, products]);
  const shipping = order.shippingInfo.deliveryMethod === 'Pickup' || subtotal >= 50 ? 0 : 4.99;
  const total = Math.round((subtotal + shipping) * 100) / 100;

  const save = async () => {
    if (!items.length || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await editPreorder(order.id, items);
      window.dispatchEvent(new Event('allshop:orders-changed'));
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a pré-reserva.'); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const cancelAll = async () => {
    if (inFlight.current || !window.confirm('Cancelar toda a pré-reserva? As vagas serão libertadas e esta ação não pode ser anulada pelo cliente.')) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await cancelCustomerPreorder(order.id);
      window.dispatchEvent(new Event('allshop:orders-changed'));
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a pré-reserva.'); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <div className="fixed inset-0 z-[120] flex bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-label="Editar pré-reserva"><section className="flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white dark:bg-slate-900 sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-[2rem]">
    <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-700 sm:px-7"><div><p className="text-xs font-extrabold uppercase tracking-[.15em] text-orange-600">#{order.id}</p><h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Editar pré-reserva</h2><p className="mt-1 text-sm text-slate-500">Disponível apenas antes de o sinal ser registado.</p></div><button type="button" aria-label="Fechar" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X/></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7"><PreorderItemsEditor items={items} products={products} onChange={setItems} includeCurrentCapacity/>{items.length === 1 && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Uma pré-reserva precisa de pelo menos um artigo. Para remover o último, use “Cancelar toda a pré-reserva” abaixo.</p>}<section className="mt-5 grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800"><div className="flex justify-between"><span>Novo total garantido</span><strong>{euro.format(total)}</strong></div><div className="flex justify-between text-orange-700 dark:text-orange-300"><span>Novo sinal (50%)</span><strong>{euro.format(Math.round(total * 50) / 100)}</strong></div><small className="text-slate-500">Depois de guardar, envie novamente a mensagem atualizada para a All-Shop.</small></section>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}</div>
    <footer className="flex flex-col gap-3 border-t border-slate-200 p-5 dark:border-slate-700 sm:flex-row sm:items-center sm:px-7"><button type="button" onClick={() => void cancelAll()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-bold text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-300"><Trash2 size={17}/> Cancelar toda a pré-reserva</button><div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row"><button type="button" onClick={onClose} className="rounded-xl px-5 py-3 font-bold text-slate-600 dark:text-slate-300">Voltar</button><button type="button" onClick={() => void save()} disabled={!items.length || busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-extrabold text-white disabled:opacity-50"><Save size={18}/>{busy ? 'A processar…' : 'Guardar alterações'}</button></div></footer>
  </section></div>;
}

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, Palette, Send } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import type { Product, User } from '../types';
import { modularDb } from '../services/firebaseConfig';
import { buildFilamentRequest, isFilamentProduct } from '../src/domain/filamentRequest';

const MATERIALS = ['PLA', 'PLA+', 'PETG', 'TPU (flexível)', 'ABS', 'ASA', 'Silk', 'Madeira', 'Outro'];

export default function FilamentRequestPanel({ product, currentUser }: { product: Product; currentUser: User | null }) {
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState('PLA');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setOpen(false);
    setMaterial('PLA');
    setColor('');
    setQuantity(1);
    setEmail(currentUser?.email ?? '');
    setNotes('');
    setError('');
    setSent(false);
  }, [product.id, currentUser?.email]);

  if (!isFilamentProduct(product)) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim();
    const cleanColor = color.trim();
    if (!cleanColor || !cleanEmail) return;
    setBusy(true);
    setError('');
    try {
      const request = buildFilamentRequest({
        product,
        user: currentUser,
        email: cleanEmail,
        material,
        color: cleanColor,
        quantity,
        notes,
      });
      await addDoc(collection(modularDb, 'product_requests'), request);
      setSent(true);
      setColor('');
      setQuantity(1);
      setNotes('');
    } catch (cause) {
      console.error('[FilamentRequestPanel] Não foi possível guardar o pedido:', cause);
      setError('Não foi possível enviar o pedido. Tente novamente dentro de alguns instantes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-orange-50 dark:border-violet-900/70 dark:from-violet-950/30 dark:to-orange-950/20">
      <button type="button" onClick={() => { setOpen((value) => !value); setSent(false); setError(''); }} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm"><Palette size={21} /></span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-extrabold text-slate-950 dark:text-white">Não encontra a cor ou o material que procura?</strong>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">Diga-nos o que gostaria de comprar e tentaremos incluir numa próxima reposição.</span>
        </span>
        <ChevronDown size={20} className={`shrink-0 text-violet-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-violet-200/80 bg-white/80 p-4 dark:border-violet-900/60 dark:bg-slate-950/40 sm:p-5">
          {sent ? (
            <div className="py-2 text-center">
              <CheckCircle2 size={34} className="mx-auto text-emerald-500" />
              <h4 className="mt-2 font-extrabold text-emerald-800 dark:text-emerald-300">Pedido enviado</h4>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">Vamos analisar a cor e o material pedidos. Isto não cria uma encomenda nem implica qualquer pagamento.</p>
              <button type="button" onClick={() => setSent(false)} className="mt-3 text-sm font-bold text-violet-700 hover:underline dark:text-violet-300">Fazer outro pedido</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Material ou tipo
                  <select value={material} onChange={(event) => setMaterial(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    {MATERIALS.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Cor pretendida
                  <input required maxLength={80} value={color} onChange={(event) => setColor(event.target.value)} placeholder="Ex.: verde menta, dourado…" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Quantidade aproximada
                  <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((item) => <option value={item} key={item}>{item} rolo{item === 1 ? '' : 's'}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Email para contacto
                  <input required type="email" maxLength={180} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@email.com" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Informação adicional <span className="font-normal text-slate-400">(opcional)</span>
                <textarea rows={2} maxLength={800} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: tonalidade específica, marca ou acabamento preferido" className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">É apenas uma manifestação de interesse; confirmaremos preço e disponibilidade antes de qualquer compra.</p>
                <button disabled={busy || !color.trim() || !email.trim()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} {busy ? 'A enviar…' : 'Enviar pedido'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

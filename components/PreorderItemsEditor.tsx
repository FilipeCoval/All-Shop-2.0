import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Product } from '../types';
import { formatPreorderDate, getPreorderOffer, getPreorderRemainingForVariant } from '../src/domain/preorder';

export type PreorderSelection = { productId: number; selectedVariant: string; quantity: number };

const availableVariant = (product: Product) => {
  const offer = getPreorderOffer(product);
  if (!offer) return '';
  if (!product.variants?.length) return '';
  return product.variants.find((variant) => getPreorderRemainingForVariant(offer, variant.name) > 0)?.name ?? product.variants[0]?.name ?? '';
};

export const firstPreorderSelection = (product: Product): PreorderSelection => ({
  productId: product.id,
  selectedVariant: availableVariant(product),
  quantity: 1,
});

export default function PreorderItemsEditor({ items, products, onChange, allowRemoveLast = false, includeCurrentCapacity = false }: {
  items: PreorderSelection[];
  products: Product[];
  onChange: (items: PreorderSelection[]) => void;
  allowRemoveLast?: boolean;
  includeCurrentCapacity?: boolean;
}) {
  const eligible = products.filter((product) => {
    const offer = getPreorderOffer(product);
    return Boolean(offer && (offer.remaining > 0 || items.some((item) => item.productId === product.id)));
  });
  const [addProductId, setAddProductId] = useState<number>(eligible[0]?.id ?? 0);
  const update = (index: number, patch: Partial<PreorderSelection>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const add = () => {
    const product = eligible.find((candidate) => candidate.id === addProductId) ?? eligible[0];
    if (!product) return;
    const variants = product.variants?.length ? product.variants.map((variant) => variant.name) : [''];
    const selectedVariant = variants.find((variant) => !items.some((item) => item.productId === product.id && item.selectedVariant === variant) && getPreorderRemainingForVariant(getPreorderOffer(product), variant) > 0);
    if (selectedVariant === undefined) return;
    onChange([...items, { productId: product.id, selectedVariant, quantity: 1 }]);
  };

  return <section className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold text-slate-950 dark:text-white">Artigos da pré-reserva</h3><p className="text-xs text-slate-500 dark:text-slate-400">Pode juntar produtos e versões diferentes na mesma referência.</p></div><div className="flex max-w-full gap-2"><select aria-label="Produto a adicionar" value={addProductId} onChange={(event) => setAddProductId(Number(event.target.value))} className="min-w-0 max-w-[15rem] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">{eligible.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button type="button" onClick={add} disabled={!eligible.length || items.length >= 10} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700 disabled:opacity-40 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300"><Plus size={16}/> Adicionar</button></div></div>
    {items.map((item, index) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product) return null;
      const offer = getPreorderOffer(product);
      const rawRemaining = product.variants?.length ? getPreorderRemainingForVariant(offer, item.selectedVariant) : Number(offer?.remaining ?? 0);
      const remaining = Math.max(0, rawRemaining + (includeCurrentCapacity ? item.quantity : 0));
      const max = Math.max(1, Math.min(10, Number(product.maxQuantityPerOrder ?? 10), remaining || item.quantity));
      return <article key={`${item.productId}-${index}`} className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900/70 dark:bg-orange-950/20">
        <div className="flex gap-3"><img src={product.image} alt="" className="h-14 w-14 rounded-xl bg-white object-contain p-1 dark:bg-slate-800"/><div className="min-w-0 flex-1"><strong className="block text-sm text-slate-950 dark:text-white">{product.name}</strong><small className="text-slate-600 dark:text-slate-300">Expedição prevista: {offer ? formatPreorderDate(offer.estimatedDispatchDate) : 'a confirmar'}</small></div>{(items.length > 1 || allowRemoveLast) && <button type="button" aria-label={`Remover ${product.name}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="self-start rounded-lg p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-950/40"><Trash2 size={17}/></button>}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{product.variants?.length ? <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Versão<select value={item.selectedVariant} onChange={(event) => update(index, { selectedVariant: event.target.value, quantity: 1 })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-600 dark:bg-slate-800">{product.variants.map((variant) => { const count = getPreorderRemainingForVariant(offer, variant.name) + (includeCurrentCapacity && variant.name === item.selectedVariant ? item.quantity : 0); return <option key={variant.name} value={variant.name} disabled={count <= 0}>{variant.name} · {count} vaga{count === 1 ? '' : 's'}</option>; })}</select></label> : <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Sem variantes<br/><span className="text-orange-700 dark:text-orange-300">{remaining} vaga{remaining === 1 ? '' : 's'} disponível{remaining === 1 ? '' : 'is'}</span></div>}<label className="text-xs font-bold text-slate-600 dark:text-slate-300">Quantidade<select value={Math.min(item.quantity, max)} onChange={(event) => update(index, { quantity: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-600 dark:bg-slate-800">{Array.from({ length: max }, (_, quantityIndex) => quantityIndex + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label></div>
      </article>;
    })}
  </section>;
}

import { Barcode, Calculator, Camera, CircleDollarSign, Plus, Save, Sparkles, Trash2, Truck, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Product, ProductVariant } from '../../types/domain';
import type { InventoryLot, StoreCategory } from './adminTypes';
import { adminMutationsAvailable, deleteInventoryLot, saveCatalogProduct, saveInventoryLot } from './adminMutations';
import { SerialScanner } from './SerialScanner';
import { displayUnitCode, normalizeUnitCode, resolveUnitIdForSerial, stableUnitId, unitCodes } from './unitIdentity';
import { normalizeProductAvailabilityMode, type ProductAvailabilityMode } from '../../domain/productAvailability';

type EditorProps = { open: boolean; onClose: () => void; onSaved: () => Promise<void> };
const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const NEW_LOT_DRAFT_PREFIX = 'allshop:admin:new-lot-draft:v1';
const emptyLotForm = () => ({ publicProductId: '', variant: '', name: '', supplierName: '', supplierOrderId: '', purchaseDate: '', quantityBought: '1', quantitySold: '0', grossPurchaseTotal: '', supplierShippingCost: '', customsCost: '', salePrice: '', cashbackValue: '', cashbackStatus: 'NONE', cashbackPlatform: '', cashbackExpectedDate: '', cashbackPaidDate: '' });
type LotFormState = ReturnType<typeof emptyLotForm>;
type NewLotDraft = { version: 1; lotId: string; savedAt: number; form: LotFormState; units: NonNullable<InventoryLot['units']>; nextSerial: string };

const newLotDraftKey = (initialProductId?: number) => `${NEW_LOT_DRAFT_PREFIX}:${initialProductId ?? 'general'}`;
const createDraftLotId = () => `lot-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const readNewLotDraft = (key: string): NewLotDraft | null => {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewLotDraft>;
    if (parsed.version !== 1 || !parsed.form || typeof parsed.form !== 'object') return null;
    return {
      version: 1,
      lotId: typeof parsed.lotId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(parsed.lotId) ? parsed.lotId : createDraftLotId(),
      savedAt: Number(parsed.savedAt) || Date.now(),
      form: { ...emptyLotForm(), ...parsed.form },
      units: Array.isArray(parsed.units) ? parsed.units.filter((unit) => unit && typeof unit === 'object') : [],
      nextSerial: typeof parsed.nextSerial === 'string' ? parsed.nextSerial : '',
    };
  } catch {
    return null;
  }
};
const writeNewLotDraft = (key: string, lotId: string, form: LotFormState, units: NonNullable<InventoryLot['units']>, nextSerial: string) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ version: 1, lotId, savedAt: Date.now(), form, units, nextSerial } satisfies NewLotDraft));
  } catch {
    // A entrada continua utilizável mesmo que o browser bloqueie o armazenamento.
  }
};
const clearNewLotDraft = (key: string) => {
  try { window.sessionStorage.removeItem(key); } catch { /* Sem armazenamento, não há rascunho a limpar. */ }
};

export function CatalogEditor({ open, product, categories, onClose, onSaved }: EditorProps & { product: Product | null; categories: StoreCategory[] }) {
  const [form, setForm] = useState({ name: '', category: '', price: '', originalPrice: '', image: '', description: '', features: '', badges: '', variantLabel: 'Opção', isPrivate: false, availabilityMode: 'AUTO' as ProductAvailabilityMode, maxQuantityPerOrder: '' });
  const [variants, setVariants] = useState<Array<{ name: string; price: string; image: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(product ? {
      name: product.name, category: product.category, price: String(product.price), originalPrice: product.originalPrice == null ? '' : String(product.originalPrice), image: product.image ?? '', description: product.description ?? '',
      features: (product.features ?? []).join('\n'), badges: (product.badges ?? []).join('\n'), variantLabel: product.variantLabel ?? 'Opção', isPrivate: Boolean(product.isPrivate), availabilityMode: normalizeProductAvailabilityMode(product), maxQuantityPerOrder: product.maxQuantityPerOrder == null ? '' : String(product.maxQuantityPerOrder),
    } : { name: '', category: categories[0]?.name ?? 'Outros', price: '', originalPrice: '', image: '', description: '', features: '', badges: '', variantLabel: 'Opção', isPrivate: false, availabilityMode: 'AUTO' as ProductAvailabilityMode, maxQuantityPerOrder: '' });
    setVariants((product?.variants ?? []).map((variant) => ({ name: variant.name, price: String(variant.price), image: variant.image ?? '' })));
    setError(null);
    // As categorias são lidas ao abrir; uma atualização em segundo plano não pode apagar o formulário.
  }, [product, open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const existingImages = product?.images ?? [];
      const images = [form.image, ...existingImages.filter((image) => image && image !== form.image)];
      await saveCatalogProduct({ ...form, id: product?.id, price: Number(form.price), originalPrice: form.originalPrice, maxQuantityPerOrder: form.maxQuantityPerOrder, features: lines(form.features), badges: lines(form.badges), images, variants: variants.map((variant) => ({ ...variant, price: Number(variant.price) })) });
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar.'); }
    finally { setBusy(false); }
  };

  return <EditorFrame open={open} title={product ? 'Editar produto' : 'Novo produto'} subtitle="Catálogo" onClose={onClose}>
    <form className="editor-form" onSubmit={submit}>
      <p className="editor-lead">Toda a informação visível na loja é editada aqui. O stock continua a ser calculado automaticamente pelos lotes.</p>
      <section className="editor-section"><header><span>1</span><div><strong>Informação principal</strong><small>Nome, categoria e descrição que o cliente vê.</small></div></header><div className="form-grid"><Field label="Nome do produto"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><Field label="Categoria"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category.id}>{category.name}</option>)}<option>Outros</option></select></Field></div><Field label="Descrição"><textarea rows={5} placeholder="Explique de forma simples para que serve e quais as vantagens." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field><Field label="Imagem principal (endereço)"><input type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></Field>{form.image && <div className="editor-image-preview"><img src={form.image} alt="Pré-visualização do produto" /></div>}</section>
      <section className="editor-section"><header><span>2</span><div><strong>Preço e venda</strong><small>Um preço atual e, se existir promoção, o preço anterior.</small></div></header><div className="form-grid"><Field label="Preço atual"><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></Field><Field label="Preço anterior (opcional)"><input type="number" min="0" step="0.01" value={form.originalPrice} onChange={(event) => setForm({ ...form, originalPrice: event.target.value })} /></Field></div><Field label="Máximo por encomenda"><input type="number" min="1" value={form.maxQuantityPerOrder} onChange={(event) => setForm({ ...form, maxQuantityPerOrder: event.target.value })} /></Field><p className="editor-info">O custo, cashback e lucro previsto pertencem a cada compra. Depois de criar o produto, registe esses valores em “Entrada de stock”.</p></section>
      <section className="editor-section"><header><span>3</span><div><strong>Opções do produto</strong><small>Ex.: tamanho, cor ou comprimento. Cada opção poderá ter preço e lote próprios.</small></div></header><Field label="Nome apresentado acima das opções"><input placeholder="Ex.: Tamanho, Cor ou Opção" value={form.variantLabel} onChange={(event) => setForm({ ...form, variantLabel: event.target.value })} /></Field><div className="variant-editor"><header><div><strong>Variantes</strong><small>{variants.length ? `${variants.length} opções configuradas` : 'Sem opções — o produto terá um único preço'}</small></div><button type="button" onClick={() => setVariants([...variants, { name: '', price: form.price, image: '' }])}><Plus /> Adicionar opção</button></header>{variants.map((variant, index) => <div className="variant-row" key={index}><input aria-label={`Nome da opção ${index + 1}`} placeholder="Nome (ex.: 1 Metro)" value={variant.name} onChange={(event) => setVariants(variants.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input aria-label={`Preço da opção ${index + 1}`} placeholder="Preço" type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariants(variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} /><button type="button" aria-label={`Remover opção ${index + 1}`} onClick={() => setVariants(variants.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>)}</div></section>
      <section className="editor-section"><header><span>4</span><div><strong>Detalhes e publicação</strong><small>Informação complementar e visibilidade na loja.</small></div></header><div className="form-grid"><Field label="Características (uma por linha)"><textarea rows={4} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} /></Field><Field label="Etiquetas (uma por linha)"><textarea rows={4} value={form.badges} onChange={(event) => setForm({ ...form, badges: event.target.value })} /></Field></div><div className="form-grid"><Field label="Estado apresentado na loja"><select value={form.availabilityMode} onChange={(event) => setForm({ ...form, availabilityMode: event.target.value as ProductAvailabilityMode })}><option value="AUTO">Automático (recomendado)</option><option value="AVAILABLE">Disponível</option><option value="COMING_SOON">Em breve</option><option value="OUT_OF_STOCK">Esgotado</option></select></Field><div className="editor-info"><strong>O stock físico não é alterado.</strong><br />“Em breve” e “Esgotado” impedem compras. “Disponível” nunca permite vender sem unidades reais.</div></div><div className="check-row"><label><input type="checkbox" checked={form.isPrivate} onChange={(event) => setForm({ ...form, isPrivate: event.target.checked })} /> Manter privado</label></div></section>
      {!adminMutationsAvailable && <p className="safe-action-note">O formulário já está pronto. Guardar será ativado no endereço Vercel de testes.</p>}{error && <p className="form-error">{error}</p>}
      <div className="editor-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="save-button" disabled={!adminMutationsAvailable || busy}><Save /> {busy ? 'A guardar…' : 'Guardar produto'}</button></div>
    </form>
  </EditorFrame>;
}

export function LotEditor({ open, lot, initialProductId, products, onClose, onSaved }: EditorProps & { lot: InventoryLot | null; initialProductId?: number; products: Product[] }) {
  const [form, setForm] = useState<LotFormState>(emptyLotForm);
  const [units, setUnits] = useState<NonNullable<InventoryLot['units']>>([]);
  const [nextSerial, setNextSerial] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);
  const skipNextDraftWrite = useRef(true);
  const draftLotIdRef = useRef(createDraftLotId());
  const draftKey = newLotDraftKey(initialProductId);
  const product = useMemo(() => products.find((item) => item.id === Number(form.publicProductId)), [products, form.publicProductId]);
  const catalogSalePrice = useMemo(() => {
    const selectedVariant = product?.variants?.find((variant) => normalizeUnitCode(variant.name) === normalizeUnitCode(form.variant));
    return Math.max(0, Number(selectedVariant?.price ?? product?.price ?? 0));
  }, [form.variant, product]);
  const variantLocked = Boolean(lot && (Number(lot.quantitySold ?? 0) > 0 || (lot.units ?? []).some((unit) => unit.status && unit.status !== 'AVAILABLE')));
  const calculation = useMemo(() => {
    const quantity = Math.max(1, Number(form.quantityBought) || 1);
    const paid = Math.max(0, Number(form.grossPurchaseTotal) || 0);
    const extras = Math.max(0, Number(form.supplierShippingCost) || 0) + Math.max(0, Number(form.customsCost) || 0);
    const cashback = ['PENDING', 'RECEIVED'].includes(form.cashbackStatus) ? Math.min(paid + extras, Math.max(0, Number(form.cashbackValue) || 0)) : 0;
    const grossUnitCost = (paid + extras) / quantity;
    const netUnitCost = Math.max(0, (paid + extras - cashback) / quantity);
    // O preço da loja tem uma única fonte de verdade: o produto/variante no catálogo.
    // O lote guarda apenas uma fotografia desse valor para relatórios históricos.
    const salePrice = catalogSalePrice;
    const shippingPerSale = salePrice <= 0 ? 0 : salePrice >= 50 ? 5.4 : 0.41;
    const predictedProfit = salePrice - netUnitCost - shippingPerSale;
    return { quantity, paid, extras, cashback, grossUnitCost, netUnitCost, salePrice, shippingPerSale, predictedProfit, margin: salePrice ? (predictedProfit / salePrice) * 100 : 0, complete: form.grossPurchaseTotal !== '' };
  }, [catalogSalePrice, form]);

  useEffect(() => {
    if (!open) return;
    skipNextDraftWrite.current = true;
    if (!lot) {
      const draft = readNewLotDraft(draftKey);
      const draftProductId = Number(draft?.form.publicProductId);
      const draftProduct = products.find((item) => item.id === draftProductId);
      const matchesRequestedProduct = !initialProductId || draftProductId === initialProductId;
      if (draft && draftProduct && matchesRequestedProduct) {
        draftLotIdRef.current = draft.lotId;
        const restoredForm = { ...draft.form };
        if (restoredForm.variant && draftProduct.variants?.length && !draftProduct.variants.some((variant) => normalizeUnitCode(variant.name) === normalizeUnitCode(restoredForm.variant))) {
          restoredForm.variant = '';
        }
        setForm(restoredForm);
        setUnits(draft.units.map((unit) => ({ ...unit })));
        setNextSerial(draft.nextSerial);
        setDraftRestored(true);
        setScannerOpen(false);
        setError(null);
        return;
      }
      if (draft) clearNewLotDraft(draftKey);
      draftLotIdRef.current = createDraftLotId();
    }
    const productId = lot?.publicProductId ?? initialProductId ?? products[0]?.id;
    const selected = products.find((item) => item.id === productId);
    const quantity = Math.max(1, Number(lot?.quantityBought ?? 1));
    const extras = Number(lot?.supplierShippingCost ?? 0) + Number(lot?.customsCost ?? 0);
    const total = lot?.grossPurchaseTotal ?? Math.max(0, Number(lot?.purchasePrice ?? 0) * quantity - extras);
    setForm({ publicProductId: productId ? String(productId) : '', variant: lot?.variant ?? '', name: lot?.name ?? selected?.name ?? '', supplierName: lot?.supplierName ?? '', supplierOrderId: lot?.supplierOrderId ?? '', purchaseDate: lot?.purchaseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), quantityBought: String(lot?.quantityBought ?? 1), quantitySold: String(lot?.quantitySold ?? 0), grossPurchaseTotal: total ? String(total) : '', supplierShippingCost: lot?.supplierShippingCost ? String(lot.supplierShippingCost) : '', customsCost: lot?.customsCost ? String(lot.customsCost) : '', salePrice: lot?.salePrice == null ? String(selected?.price ?? '') : String(lot.salePrice), cashbackValue: lot?.cashbackValue ? String(lot.cashbackValue) : '', cashbackStatus: lot?.cashbackStatus ?? 'NONE', cashbackPlatform: lot?.cashbackPlatform ?? '', cashbackExpectedDate: lot?.cashbackExpectedDate?.slice(0, 10) ?? '', cashbackPaidDate: lot?.cashbackPaidDate?.slice(0, 10) ?? '' });
    setUnits((lot?.units ?? []).map((unit) => ({ ...unit })));
    setNextSerial(''); setDraftRestored(false); setScannerOpen(false); setError(null);
    // A lista de produtos é lida ao abrir; refreshes automáticos não podem reiniciar um lote em curso.
  }, [lot, initialProductId, open]);

  useEffect(() => {
    if (!open || lot) return;
    if (skipNextDraftWrite.current) {
      skipNextDraftWrite.current = false;
      return;
    }
    writeNewLotDraft(draftKey, draftLotIdRef.current, form, units, nextSerial);
  }, [draftKey, form, lot, nextSerial, open, units]);

  const closePreservingDraft = () => {
    if (!lot) writeNewLotDraft(draftKey, draftLotIdRef.current, form, units, nextSerial);
    onClose();
  };

  const quantityForUnits = Math.max(0, Number(form.quantityBought) || 0);
  const visibleUnits = Array.from({ length: Math.max(quantityForUnits, units.length) }, (_, index) => units[index] ?? { id: '', status: 'AVAILABLE' });
  const registeredUnits = visibleUnits.slice(0, quantityForUnits).filter((unit) => displayUnitCode(unit)).length;
  const setUnitSerial = (index: number, value: string) => setUnits((previous) => {
    const next = [...previous];
    while (next.length <= index) next.push({ id: '', status: 'AVAILABLE' });
    const current = next[index];
    const serialNumber = normalizeUnitCode(value);
    next[index] = {
      ...current,
      id: resolveUnitIdForSerial(current, serialNumber, !lot),
      serialNumber,
      status: current.status || 'AVAILABLE',
    };
    return next;
  });
  const addSerial = (value: string) => {
    const serial = normalizeUnitCode(value);
    setError(null);
    if (!serial) return;
    if (visibleUnits.some((unit) => unitCodes(unit).includes(serial))) { setError(`O S/N ${serial} já foi registado neste lote.`); return; }
    const emptyIndex = visibleUnits.slice(0, quantityForUnits).findIndex((unit) => !displayUnitCode(unit));
    if (emptyIndex < 0) { setError('Todas as unidades deste lote já têm S/N.'); return; }
    setUnitSerial(emptyIndex, serial); setNextSerial('');
    window.setTimeout(() => serialInputRef.current?.focus(), 0);
  };
  const addNextSerial = () => addSerial(nextSerial);
  const generateInternalSerials = () => setUnits((previous) => Array.from({ length: quantityForUnits }, (_, index) => {
    const current = previous[index];
    if (current && displayUnitCode(current)) return current;
    const random = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const internalLabel = `INT-${random}`;
    return { id: internalLabel, internalLabel, status: 'AVAILABLE', addedAt: new Date().toISOString() };
  }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    const lockedOutsideQuantity = units.slice(quantityForUnits).some((unit) => unit.status && unit.status !== 'AVAILABLE');
    if (lockedOutsideQuantity) { setError('A quantidade não pode ser inferior ao número de unidades já reservadas ou vendidas.'); return; }
    const unitsToSave = units.slice(0, quantityForUnits).filter((unit) => displayUnitCode(unit)).map((unit) => {
      const serialNumber = unit.serialNumber ? normalizeUnitCode(unit.serialNumber) : undefined;
      return {
        ...unit,
        id: resolveUnitIdForSerial(unit, serialNumber || displayUnitCode(unit), !lot) || normalizeUnitCode(displayUnitCode(unit)),
        serialNumber,
        internalLabel: unit.internalLabel ? normalizeUnitCode(unit.internalLabel) : undefined,
        barcode: unit.barcode ? normalizeUnitCode(unit.barcode) : undefined,
        status: unit.status || 'AVAILABLE',
        addedAt: unit.addedAt || new Date().toISOString(),
      };
    });
    const ownerByCode = new Map<string, number>();
    for (let index = 0; index < unitsToSave.length; index += 1) {
      for (const code of unitCodes(unitsToSave[index])) {
        const owner = ownerByCode.get(code);
        if (owner !== undefined && owner !== index) { setError(`O código ${code} está repetido neste lote.`); return; }
        ownerByCode.set(code, index);
      }
    }
    setBusy(true);
    try { await saveInventoryLot({ ...form, publicProductId: Number(form.publicProductId), quantityBought: Number(form.quantityBought), quantitySold: Number(form.quantitySold), grossPurchaseTotal: calculation.paid, supplierShippingCost: Number(form.supplierShippingCost), customsCost: Number(form.customsCost), purchasePrice: calculation.grossUnitCost, salePrice: catalogSalePrice, cashbackValue: Number(form.cashbackValue), units: unitsToSave }, lot?.id || draftLotIdRef.current); if (!lot) clearNewLotDraft(draftKey); await onSaved(); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar o lote.'); } finally { setBusy(false); }
  };
  const remove = async () => { if (!lot?.id || !lot.publicProductId || !window.confirm('Apagar este lote e recalcular o stock da loja?')) return; setBusy(true); try { await deleteInventoryLot(lot.publicProductId, lot.id); await onSaved(); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível apagar o lote.'); } finally { setBusy(false); } };

  return <EditorFrame open={open} title={lot ? 'Editar lote' : 'Entrada de stock'} subtitle="Produtos e stock" onClose={closePreservingDraft}><form className="editor-form" onSubmit={submit}>
    <p className="editor-lead">Este é o único local para registar stock. Escolha o produto e a opção correta; a disponibilidade da loja será recalculada automaticamente.</p>
    {!lot && <p className="editor-info">{draftRestored ? 'Rascunho recuperado. Pode continuar exatamente onde ficou.' : 'Este lote fica guardado como rascunho neste separador até ser concluído.'}</p>}
    <section className="editor-section"><header><span>1</span><div><strong>Produto e opção</strong><small>Associe o lote ao artigo exato que será vendido.</small></div></header>
      <Field label="Produto do catálogo"><select value={form.publicProductId} disabled={Boolean(lot)} onChange={(event) => { const selected = products.find((item) => item.id === Number(event.target.value)); setForm({ ...form, publicProductId: event.target.value, name: selected?.name ?? form.name, variant: '' }); }} required>{products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
      {lot && <p className="editor-info">O produto deste lote fica protegido para evitar stock duplicado. Se escolheu o produto errado, crie um novo lote.</p>}
      <Field label="Opção / variante"><select value={form.variant} required={Boolean(product?.variants?.length) && !lot} disabled={variantLocked} onChange={(event) => setForm({ ...form, variant: event.target.value })}><option value="">{product?.variants?.length ? 'Escolha uma opção' : 'Sem variante'}</option>{product?.variants?.map((variant: ProductVariant) => <option key={variant.name}>{variant.name}</option>)}</select></Field>
      {variantLocked && <p className="editor-info">A opção fica protegida porque este lote já tem vendas ou unidades associadas.</p>}
      {product?.variants?.length ? <p className="editor-info">Selecione a opção com atenção. O stock de cada variante é independente.</p> : null}
    </section>
    <section className="editor-section"><header><span>2</span><div><strong>Origem da compra</strong><small>Dados úteis para custos e rastreabilidade.</small></div></header>
      <div className="form-grid"><Field label="Fornecedor"><input value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} /></Field><Field label="Data de compra"><input type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} /></Field></div>
      <Field label="N.º encomenda fornecedor"><input value={form.supplierOrderId} onChange={(event) => setForm({ ...form, supplierOrderId: event.target.value })} /></Field>
    </section>
    <section className="editor-section"><header><span>3</span><div><strong>Quantidade e custo da compra</strong><small>Indique os totais; o custo por produto é calculado automaticamente.</small></div></header>
      <div className="form-grid"><Field label="Quantidade comprada"><input type="number" min="0" value={form.quantityBought} onChange={(event) => setForm({ ...form, quantityBought: event.target.value })} required /></Field><Field label="Já vendida"><input type="number" min="0" max={form.quantityBought || undefined} value={form.quantitySold} onChange={(event) => setForm({ ...form, quantitySold: event.target.value })} required /></Field></div>
      <Field label="Total pago pelos produtos"><input type="number" min="0" step="0.01" value={form.grossPurchaseTotal} onChange={(event) => setForm({ ...form, grossPurchaseTotal: event.target.value })} placeholder="Total das unidades, antes do cashback" required /></Field>
      <div className="form-grid"><Field label="Portes do fornecedor"><input type="number" min="0" step="0.01" value={form.supplierShippingCost} onChange={(event) => setForm({ ...form, supplierShippingCost: event.target.value })} /></Field><Field label="Alfândega / outros custos"><input type="number" min="0" step="0.01" value={form.customsCost} onChange={(event) => setForm({ ...form, customsCost: event.target.value })} /></Field></div>
    </section>
    <section className="editor-section cashback-section"><header><span>4</span><div><strong>Cashback</strong><small>Registe o valor total, o estado e quando espera recebê-lo.</small></div></header>
      <div className="form-grid"><Field label="Estado"><select value={form.cashbackStatus} onChange={(event) => setForm({ ...form, cashbackStatus: event.target.value })}><option value="NONE">Sem cashback</option><option value="PENDING">Por receber</option><option value="RECEIVED">Recebido</option><option value="REJECTED">Recusado / expirado</option></select></Field><Field label="Valor total do cashback"><input type="number" min="0" step="0.01" disabled={form.cashbackStatus === 'NONE'} value={form.cashbackValue} onChange={(event) => setForm({ ...form, cashbackValue: event.target.value })} /></Field></div>
      {form.cashbackStatus !== 'NONE' && <><Field label="Plataforma / campanha"><input value={form.cashbackPlatform} onChange={(event) => setForm({ ...form, cashbackPlatform: event.target.value })} placeholder="Ex.: iGraal, AliExpress, promoção do fornecedor" /></Field><div className="form-grid"><Field label="Previsão de pagamento"><input type="date" value={form.cashbackExpectedDate} onChange={(event) => setForm({ ...form, cashbackExpectedDate: event.target.value })} /></Field>{form.cashbackStatus === 'RECEIVED' && <Field label="Data em que foi recebido"><input type="date" value={form.cashbackPaidDate} onChange={(event) => setForm({ ...form, cashbackPaidDate: event.target.value })} /></Field>}</div></>}
    </section>
    <section className="editor-section serial-management"><header><span>5</span><div><strong>Unidades e S/N</strong><small>Leia ou escreva um número por unidade deste lote.</small></div><b>{registeredUnits}/{quantityForUnits}</b></header>
      <div className="serial-quick-entry">
        <label><Barcode /><input ref={serialInputRef} value={nextSerial} onChange={(event) => setNextSerial(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addNextSerial(); } }} placeholder="Leia o próximo S/N e carregue Enter" autoComplete="off" /></label>
        <button type="button" className="camera-button" onClick={() => setScannerOpen(true)}><Camera /> Câmara</button>
        <button type="button" onClick={addNextSerial} disabled={!nextSerial.trim()}>Adicionar</button>
      </div>
      <div className="serial-unit-list">{visibleUnits.map((unit, index) => {
        const locked = Boolean(unit.status && unit.status !== 'AVAILABLE');
        return <label key={stableUnitId(unit) || index} className={index >= quantityForUnits ? 'outside-quantity' : ''}><span><b>Unidade {index + 1}</b><small>{locked ? unit.status === 'SOLD' ? 'Vendida — S/N protegido' : 'Reservada — S/N protegido' : index >= quantityForUnits ? 'Fora da quantidade indicada' : displayUnitCode(unit) ? 'Pronta' : 'S/N por registar'}</small></span><input value={displayUnitCode(unit)} disabled={locked || index >= quantityForUnits} onChange={(event) => setUnitSerial(index, event.target.value)} placeholder="Número de série" /></label>;
      })}</div>
      <div className="serial-management-footer"><p>{registeredUnits === quantityForUnits ? 'Todas as unidades têm identificação.' : `Faltam registar ${quantityForUnits - registeredUnits} unidade(s). Pode guardar e continuar mais tarde.`}</p><button type="button" onClick={generateInternalSerials} disabled={!quantityForUnits || registeredUnits === quantityForUnits}><Sparkles /> Gerar códigos internos</button></div>
    </section>
    <section className="editor-section lot-calculator"><header><span><Calculator /></span><div><strong>Resultado por produto</strong><small>Cálculo atualizado automaticamente.</small></div></header>
      <div className="calculator-results"><article><CircleDollarSign /><span><small>Custo antes do cashback</small><strong>{calculation.complete ? euro.format(calculation.grossUnitCost) : '—'}</strong></span></article><article className="net-cost"><Sparkles /><span><small>Custo final estimado</small><strong>{calculation.complete ? euro.format(calculation.netUnitCost) : '—'}</strong></span></article></div>
      <div className="form-grid"><Field label="Preço atual da loja (automático)"><input type="text" value={euro.format(catalogSalePrice)} readOnly aria-readonly="true" /></Field><div className={`profit-preview ${calculation.complete && calculation.predictedProfit < 0 ? 'negative' : ''}`}><Truck /><span><small>Lucro previsto por unidade</small><strong>{calculation.complete ? euro.format(calculation.predictedProfit) : '—'}</strong><em>{calculation.complete ? `Margem ${calculation.margin.toFixed(1)}% · envio líquido ${euro.format(calculation.shippingPerSale)}` : 'Preencha o total pago'}</em></span></div></div>
      <p className="editor-info">Este valor vem do catálogo e não pode ser alterado no lote. Para mudar o preço apresentado ao cliente, edite apenas o produto.</p>
      <p className="calculator-note">A previsão assume uma venda individual com envio: acima de 50 € desconta 5,40 € de portes; abaixo de 50 € desconta apenas a diferença entre os portes cobrados e pagos pela loja. O levantamento em loja não terá este custo.</p>
    </section>
    {!adminMutationsAvailable && <p className="safe-action-note">O formulário já está pronto. Guardar será ativado no endereço Vercel de testes.</p>}{error && <p className="form-error">{error}</p>}
    <div className="editor-footer">{lot && <button type="button" className="danger-button" onClick={() => void remove()} disabled={!adminMutationsAvailable || busy}><Trash2 /> Apagar lote</button>}<span /><button type="button" className="secondary-button" onClick={closePreservingDraft}>Fechar</button><button className="save-button" disabled={!adminMutationsAvailable || busy}><Save /> {busy ? 'A guardar…' : 'Guardar lote'}</button></div>
    {scannerOpen && <SerialScanner onClose={() => setScannerOpen(false)} onScan={(value) => { setScannerOpen(false); addSerial(value); }} />}
  </form></EditorFrame>;
}

function EditorFrame({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <>{open && <button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" />}<aside className={`editor-drawer ${open ? 'open' : ''}`} aria-hidden={!open}><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>{children}</aside></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="editor-field"><span>{label}</span>{children}</label>; }

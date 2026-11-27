import { Calculator, ChevronLeft, CircleDollarSign, PackagePlus, Plus, Save, Sparkles, Trash2, Truck, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Product } from '../../types/domain';
import type { ImportItem, ImportOrder, ImportShipment } from './adminTypes';
import { adminMutationsAvailable, deleteImportShipment, saveImportShipment } from './adminMutations';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emptyOrder = (): ImportOrder => ({ id: uid('order'), supplierName: '', orderNumber: '', localShippingCost: 0, items: [] });
const emptyItem = (): ImportItem => ({ id: uid('item'), name: '', variant: '', quantity: 1, unitPrice: 0, purchaseTotal: 0, salePrice: 0, cashbackValue: 0, cashbackStatus: 'NONE', cashbackPlatform: '', cashbackExpectedDate: '' });
const emptyShipment = (): ImportShipment => ({ id: '', name: `Importação ${new Date().toLocaleDateString('pt-PT')}`, status: 'GATHERING', agentShippingCost: 0, customsCost: 0, distributionMethod: 'QUANTITY', purchaseCurrency: 'EUR', actualPaidEur: 0, exchangeRate: 1, trackingNumber: '', estimatedArrival: '', notes: '', orders: [emptyOrder()], createdAt: new Date().toISOString() });

export function ImportEditor({ open, shipment, products, onClose, onSaved }: { open: boolean; shipment: ImportShipment | null; products: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ImportShipment>(emptyShipment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const source = shipment ? structuredClone(shipment) : emptyShipment();
    source.orders = (source.orders ?? []).map((order) => ({ ...order, id: order.id || uid('order'), items: (order.items ?? []).map((item) => ({ ...item, id: item.id || uid('item'), cashbackStatus: item.cashbackStatus ?? (Number(item.cashbackValue) > 0 ? 'PENDING' : 'NONE') })) }));
    if (!source.orders.length) source.orders = [emptyOrder()];
    setDraft(source); setError(null);
  }, [open, shipment]);

  const summary = useMemo(() => calculateImportShipment(draft), [draft]);
  if (!open) return null;

  const updateOrder = (orderId: string, update: Partial<ImportOrder>) => setDraft((current) => ({ ...current, orders: (current.orders ?? []).map((order) => order.id === orderId ? { ...order, ...update } : order) }));
  const updateItem = (orderId: string, itemId: string, update: Partial<ImportItem>) => setDraft((current) => ({ ...current, orders: (current.orders ?? []).map((order) => order.id === orderId ? { ...order, items: (order.items ?? []).map((item) => item.id === itemId ? { ...item, ...update } : item) } : order) }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { await saveImportShipment({ ...draft, exchangeRate: summary.rate }); await onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar a importação.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft.id || !window.confirm('Apagar esta importação? Os lotes de stock não serão apagados.')) return;
    setBusy(true); setError(null);
    try { await deleteImportShipment(draft.id); await onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível apagar a importação.'); }
    finally { setBusy(false); }
  };

  return <><button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" /><aside className="editor-drawer import-editor open"><header><div><p className="eyebrow">Importações</p><h2>{shipment ? 'Gerir importação' : 'Nova importação'}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><form className="editor-form" onSubmit={submit}>
    <p className="editor-lead">Reúna aqui as encomendas de fornecedores. Os portes, cashback e restantes custos são distribuídos automaticamente por cada produto.</p>
    <section className="editor-section"><header><span>1</span><div><strong>Envio principal</strong><small>Identificação, estado e previsão de chegada.</small></div></header>
      <div className="form-grid"><Field label="Nome da importação"><input value={draft.name ?? ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field><Field label="Estado"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ImportShipment['status'] })}><option value="GATHERING">A reunir / no agente</option><option value="SHIPPED">A caminho</option><option value="RECEIVED">Recebido</option></select></Field></div>
      <div className="form-grid"><Field label="Rastreio"><input value={draft.trackingNumber ?? ''} onChange={(event) => setDraft({ ...draft, trackingNumber: event.target.value })} /></Field><Field label="Previsão de chegada"><input type="date" value={draft.estimatedArrival ?? ''} onChange={(event) => setDraft({ ...draft, estimatedArrival: event.target.value })} /></Field></div>
      <div className="form-grid"><Field label="Moeda apresentada na compra"><select value={draft.purchaseCurrency ?? 'EUR'} onChange={(event) => setDraft({ ...draft, purchaseCurrency: event.target.value as ImportShipment['purchaseCurrency'] })}><option value="EUR">Euro (EUR)</option><option value="USD">Dólar (USD)</option><option value="GBP">Libra (GBP)</option><option value="CNY">Yuan (CNY)</option><option value="OTHER">Outra moeda</option></select></Field><Field label="Total realmente debitado (€)"><input type="number" min="0" step="0.01" value={draft.actualPaidEur || ''} onChange={(event) => setDraft({ ...draft, actualPaidEur: Number(event.target.value) })} placeholder="Ex.: 152,18" /><small className="field-help">Copie o total do PayPal, cartão ou banco.</small></Field></div>
      <div className="form-grid"><Field label={summary.automaticRate ? 'Câmbio calculado automaticamente' : 'Câmbio: 1 unidade = X €'}><input type="number" min="0.0001" step="0.0001" value={summary.automaticRate ? summary.rate.toFixed(4) : (draft.exchangeRate ?? 1)} readOnly={summary.automaticRate} onChange={(event) => setDraft({ ...draft, exchangeRate: Number(event.target.value) })} /><small className="field-help">{summary.automaticRate ? `Calculado com ${formatPurchaseMoney(summary.invoiceTotal, draft.purchaseCurrency)} e ${euro.format(Number(draft.actualPaidEur))}.` : 'Será automático depois de indicar o total debitado e os valores da fatura.'}</small></Field><Field label="Distribuir custos"><select value={draft.distributionMethod ?? 'QUANTITY'} onChange={(event) => setDraft({ ...draft, distributionMethod: event.target.value as ImportShipment['distributionMethod'] })}><option value="QUANTITY">Igualmente por unidade</option><option value="VALUE">Proporcional ao valor</option></select></Field></div>
      {draft.purchaseCurrency === 'EUR' && summary.automaticRate && Math.abs(summary.rate - 1) > 0.005 && <p className="import-currency-warning">Atenção: selecionou Euro, mas o total da fatura não coincide com o valor debitado. Se a fatura estiver em dólares, escolha “Dólar (USD)”.</p>}
      <div className="form-grid"><Field label="Transporte agente → Portugal (€)"><input type="number" min="0" step="0.01" value={draft.agentShippingCost || ''} onChange={(event) => setDraft({ ...draft, agentShippingCost: Number(event.target.value) })} /></Field><Field label="Alfândega / impostos (€)"><input type="number" min="0" step="0.01" value={draft.customsCost || ''} onChange={(event) => setDraft({ ...draft, customsCost: Number(event.target.value) })} /></Field></div>
      <Field label="Notas"><textarea rows={3} value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
    </section>

    <section className="import-summary"><article><PackagePlus /><span><small>Unidades</small><strong>{summary.units}</strong></span></article><article><CircleDollarSign /><span><small>Total da fatura</small><strong>{formatPurchaseMoney(summary.invoiceTotal, draft.purchaseCurrency)}</strong></span></article><article><Truck /><span><small>Custos adicionais</small><strong>{euro.format(summary.extraCosts)}</strong></span></article><article><Calculator /><span><small>Custo final total</small><strong>{euro.format(summary.finalCost)}</strong></span></article></section>

    <div className="import-orders-heading"><div><p className="eyebrow">Encomendas</p><h3>Fornecedores e produtos</h3></div><button type="button" onClick={() => setDraft({ ...draft, orders: [...(draft.orders ?? []), emptyOrder()] })}><Plus /> Adicionar encomenda</button></div>
    <div className="import-orders">{(draft.orders ?? []).map((order, orderIndex) => <section className="import-order-card" key={order.id}><header><div><span>{orderIndex + 1}</span><div><strong>{order.supplierName || 'Nova encomenda'}</strong><small>{(order.items ?? []).length} produtos</small></div></div><button type="button" onClick={() => setDraft({ ...draft, orders: (draft.orders ?? []).filter((item) => item.id !== order.id) })} aria-label="Remover encomenda"><Trash2 /></button></header>
      <div className="import-order-fields"><Field label="Fornecedor"><input value={order.supplierName ?? ''} onChange={(event) => updateOrder(order.id, { supplierName: event.target.value })} placeholder="Nome da loja ou fornecedor" /></Field><Field label="N.º da encomenda"><input value={order.orderNumber ?? ''} onChange={(event) => updateOrder(order.id, { orderNumber: event.target.value })} /></Field><Field label="Portes, seguro e taxas (moeda da compra)"><input type="number" min="0" step="0.01" value={order.localShippingCost || ''} onChange={(event) => updateOrder(order.id, { localShippingCost: Number(event.target.value) })} /><small className="field-help">Some apenas os valores que aparecem na fatura desta encomenda.</small></Field></div>
      <div className="import-items">{(order.items ?? []).map((item) => {
        const result = summary.items.get(item.id);
        const selectedProduct = products.find((product) => product.id === Number(item.publicProductId));
        return <article className="import-item" key={item.id}><div className="import-item-main"><Field label="Produto do catálogo (opcional)"><select value={item.publicProductId ?? ''} onChange={(event) => { const product = products.find((entry) => entry.id === Number(event.target.value)); updateItem(order.id, item.id, { publicProductId: product?.id, name: product?.name ?? item.name, salePrice: product?.price ?? item.salePrice, variant: '' }); }}><option value="">Produto ainda não criado</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></Field><Field label="Nome"><input value={item.name ?? ''} onChange={(event) => updateItem(order.id, item.id, { name: event.target.value })} required /></Field><Field label="Variante"><select value={item.variant ?? ''} onChange={(event) => { const variant = selectedProduct?.variants?.find((entry) => entry.name === event.target.value); updateItem(order.id, item.id, { variant: event.target.value, salePrice: variant?.price ?? item.salePrice }); }}><option value="">Sem variante</option>{selectedProduct?.variants?.map((variant) => <option key={variant.name}>{variant.name}</option>)}</select></Field></div>
          <div className="import-item-numbers"><Field label="Quantidade"><input type="number" min="1" value={item.quantity ?? 1} onChange={(event) => { const quantity = Math.max(1, Number(event.target.value)); updateItem(order.id, item.id, { quantity, unitPrice: Number(item.purchaseTotal) > 0 ? Number(item.purchaseTotal) / quantity : item.unitPrice }); }} /></Field><Field label={`Subtotal dos produtos (${draft.purchaseCurrency ?? 'moeda da compra'})`}><input type="number" min="0" step="0.01" value={Number(item.purchaseTotal) > 0 ? item.purchaseTotal : (Number(item.unitPrice) > 0 ? Number(item.unitPrice) * Math.max(1, Number(item.quantity ?? 1)) : '')} onChange={(event) => { const total = Number(event.target.value); const quantity = Math.max(1, Number(item.quantity ?? 1)); updateItem(order.id, item.id, { purchaseTotal: total, unitPrice: total / quantity }); }} /><small className="field-help">Copie o subtotal desta linha na fatura. {itemGrossPurchase(item) > 0 ? `Equivale a ${formatPurchaseMoney(itemGrossPurchase(item) / Math.max(1, Number(item.quantity ?? 1)), draft.purchaseCurrency)} por unidade.` : ''}</small></Field><Field label="Preço de venda (€)"><input type="number" min="0" step="0.01" value={item.salePrice || ''} onChange={(event) => updateItem(order.id, item.id, { salePrice: Number(event.target.value) })} /></Field></div>
          <div className="import-cashback"><Field label="Cashback"><select value={item.cashbackStatus ?? 'NONE'} onChange={(event) => updateItem(order.id, item.id, { cashbackStatus: event.target.value as ImportItem['cashbackStatus'] })}><option value="NONE">Sem cashback</option><option value="PENDING">Por receber</option><option value="RECEIVED">Recebido</option><option value="REJECTED">Recusado</option></select></Field><Field label="Cashback por unidade (€)"><input type="number" min="0" step="0.01" disabled={item.cashbackStatus === 'NONE'} value={item.cashbackValue || ''} onChange={(event) => updateItem(order.id, item.id, { cashbackValue: Number(event.target.value) })} /></Field><Field label="Plataforma"><input disabled={item.cashbackStatus === 'NONE'} value={item.cashbackPlatform ?? ''} onChange={(event) => updateItem(order.id, item.id, { cashbackPlatform: event.target.value })} /></Field><Field label="Previsão"><input type="date" disabled={item.cashbackStatus === 'NONE'} value={item.cashbackExpectedDate ?? ''} onChange={(event) => updateItem(order.id, item.id, { cashbackExpectedDate: event.target.value })} /></Field></div>
          <div className="import-item-result"><span><Sparkles /><small>Custo final por unidade</small><strong>{euro.format(result?.unitCost ?? 0)}</strong></span><span className={(result?.profit ?? 0) < 0 ? 'negative' : ''}><Calculator /><small>Lucro previsto por unidade</small><strong>{euro.format(result?.profit ?? 0)}</strong><em>Margem {(result?.margin ?? 0).toFixed(1)}%</em></span><button type="button" onClick={() => updateOrder(order.id, { items: (order.items ?? []).filter((entry) => entry.id !== item.id) })} aria-label="Remover produto"><Trash2 /></button></div>
        </article>; })}</div>
      <button className="add-import-item" type="button" onClick={() => updateOrder(order.id, { items: [...(order.items ?? []), emptyItem()] })}><Plus /> Adicionar produto</button>
    </section>)}</div>

    {error && <p className="form-error">{error}</p>}
    <div className="editor-footer import-editor-footer">{draft.id && <button type="button" className="danger-button" onClick={() => void remove()} disabled={!adminMutationsAvailable || busy}><Trash2 /> Apagar</button>}<span /><button type="button" className="secondary-button" onClick={onClose}><ChevronLeft /> Voltar</button><button className="save-button" disabled={!adminMutationsAvailable || busy}><Save /> {busy ? 'A guardar…' : 'Guardar importação'}</button></div>
  </form></aside></>;
}

export function calculateImportShipment(shipment: ImportShipment) {
  const orders = shipment.orders ?? [];
  const invoiceTotal = orders.reduce((total, order) => total + Math.max(0, Number(order.localShippingCost ?? 0)) + (order.items ?? []).reduce((sum, item) => sum + itemGrossPurchase(item), 0), 0);
  const actualPaidEur = Math.max(0, Number(shipment.actualPaidEur ?? 0));
  const automaticRate = actualPaidEur > 0 && invoiceTotal > 0;
  const rate = automaticRate ? actualPaidEur / invoiceTotal : Math.max(0.0001, Number(shipment.exchangeRate ?? 1));
  const units = orders.flatMap((order) => order.items ?? []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1)), 0);
  const globalCosts = Math.max(0, Number(shipment.agentShippingCost ?? 0)) + Math.max(0, Number(shipment.customsCost ?? 0));
  const allNetValue = orders.flatMap((order) => order.items ?? []).reduce((sum, item) => {
    const cashback = ['PENDING', 'RECEIVED'].includes(item.cashbackStatus ?? '') ? Number(item.cashbackValue ?? 0) : 0;
    const quantity = Math.max(1, Number(item.quantity ?? 1));
    return sum + Math.max(0, itemGrossPurchase(item) / quantity * rate - cashback) * quantity;
  }, 0);
  const results = new Map<string, { unitCost: number; profit: number; margin: number }>();
  let netProducts = 0;
  let localCosts = 0;
  orders.forEach((order) => {
    const items = order.items ?? [];
    const orderUnits = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1)), 0);
    const orderNetValue = items.reduce((sum, item) => {
      const cashback = ['PENDING', 'RECEIVED'].includes(item.cashbackStatus ?? '') ? Number(item.cashbackValue ?? 0) : 0;
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      return sum + Math.max(0, itemGrossPurchase(item) / quantity * rate - cashback) * quantity;
    }, 0);
    const localShipping = Math.max(0, Number(order.localShippingCost ?? 0)) * rate;
    localCosts += localShipping;
    items.forEach((item) => {
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      const cashback = ['PENDING', 'RECEIVED'].includes(item.cashbackStatus ?? '') ? Number(item.cashbackValue ?? 0) : 0;
      const netUnit = Math.max(0, itemGrossPurchase(item) / quantity * rate - cashback);
      const itemNetTotal = netUnit * quantity;
      netProducts += itemNetTotal;
      const localShare = shipment.distributionMethod === 'VALUE' ? (orderNetValue ? localShipping * (itemNetTotal / orderNetValue) / quantity : 0) : (orderUnits ? localShipping / orderUnits : 0);
      const globalShare = shipment.distributionMethod === 'VALUE' ? (allNetValue ? globalCosts * (itemNetTotal / allNetValue) / quantity : 0) : (units ? globalCosts / units : 0);
      const unitCost = netUnit + localShare + globalShare;
      const salePrice = Math.max(0, Number(item.salePrice ?? 0));
      const saleShipping = salePrice <= 0 ? 0 : salePrice >= 50 ? 5.4 : 0.41;
      const profit = salePrice - unitCost - saleShipping;
      results.set(item.id, { unitCost, profit, margin: salePrice ? profit / salePrice * 100 : 0 });
    });
  });
  return { units, invoiceTotal, automaticRate, rate, netProducts, extraCosts: globalCosts + localCosts, finalCost: netProducts + globalCosts + localCosts, items: results };
}

function itemGrossPurchase(item: ImportItem) {
  const explicitTotal = Math.max(0, Number(item.purchaseTotal ?? 0));
  return explicitTotal > 0 ? explicitTotal : Math.max(0, Number(item.unitPrice ?? 0)) * Math.max(1, Number(item.quantity ?? 1));
}

function formatPurchaseMoney(value: number, currency: ImportShipment['purchaseCurrency']) {
  if (!currency || currency === 'OTHER') return `${new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} (moeda da compra)`;
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(value);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="editor-field"><span>{label}</span>{children}</label>; }

import { Plus, Save, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '../../types/domain';
import { inventoryLotPhysicalQuantity, isInventoryLotInTransit } from '../../domain/inventoryReceipt';
import { adminMutationsAvailable, createManualOrder } from './adminMutations';
import type { InventoryLot, StockReservation } from './adminTypes';

type Row = { productId: number | ''; variantName: string; quantity: number; price: number };
const emptyRow = (): Row => ({ productId: '', variantName: '', quantity: 1, price: 0 });
const newReference = () => `AS-${Date.now().toString().slice(-9)}`;
const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt');
const reservationExpiry = (value: StockReservation['expiresAt']) => {
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return Number(value.seconds) * 1000;
  return 0;
};

export function ManualOrderEditor({ open, products, lots, reservations, onClose, onSaved }: { open: boolean; products: Product[]; lots: InventoryLot[]; reservations: StockReservation[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [orderId, setOrderId] = useState(newReference);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('MB Way');
  const [status, setStatus] = useState('Pendente');
  const [deliveryMethod, setDeliveryMethod] = useState('Pickup');
  const [shippingCost, setShippingCost] = useState(0);
  const [discountValue, setDiscountValue] = useState(0);
  const [address, setAddress] = useState({ street: '', doorNumber: '', zip: '', city: '' });
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [allowWithoutStock, setAllowWithoutStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const productMap = useMemo(() => new Map(products.map((product) => [Number(product.id), product])), [products]);
  const subtotal = rows.reduce((sum, row) => sum + Math.max(0, Number(row.price)) * Math.max(0, Number(row.quantity)), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(discountValue)));
  const shipping = deliveryMethod === 'Shipping' ? Math.max(0, Number(shippingCost)) : 0;
  const total = subtotal - discount + shipping;

  const availableFor = (productId: number, variantName: string) => {
    const productLots = lots.filter((lot) => Number(lot.publicProductId) === productId && !isInventoryLotInTransit(lot));
    const variant = normalize(variantName);
    const exact = productLots.filter((lot) => normalize(lot.variant) === variant);
    const generic = productLots.filter((lot) => !normalize(lot.variant));
    const matching = variant ? (exact.length ? exact : generic) : (generic.length ? generic : productLots);
    const physical = matching.reduce((sum, lot) => sum + inventoryLotPhysicalQuantity(lot), 0);
    const reserved = reservations.filter((reservation) => Number(reservation.productId) === productId
      && reservationExpiry(reservation.expiresAt) > Date.now()
      && normalize(reservation.variantName ?? reservation.variantKey) === variant)
      .reduce((sum, reservation) => sum + Math.max(0, Number(reservation.quantity ?? 0)), 0);
    return Math.max(0, physical - reserved);
  };

  const shortages = rows.flatMap((row) => {
    if (!row.productId) return [];
    const available = availableFor(Number(row.productId), row.variantName);
    return Number(row.quantity) > available ? [{ productId: Number(row.productId), available, quantity: Number(row.quantity) }] : [];
  });

  useEffect(() => {
    if (!open) return;
    setOrderId(newReference()); setName(''); setPhone(''); setEmail(''); setPaymentMethod('MB Way'); setStatus('Pendente');
    setDeliveryMethod('Pickup'); setShippingCost(0); setDiscountValue(0); setAddress({ street: '', doorNumber: '', zip: '', city: '' });
    setRows([emptyRow()]); setAllowWithoutStock(false); setBusy(false); setError(null); setSuccess(null);
  }, [open]);

  if (!open) return null;

  const setProduct = (index: number, id: number) => {
    const product = productMap.get(id);
    const firstVariant = product?.variants?.[0];
    setRows((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, productId: id, variantName: firstVariant?.name ?? '', price: Number(firstVariant?.price ?? product?.price ?? 0) } : row));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      if (deliveryMethod === 'Shipping' && (!address.street.trim() || !address.zip.trim() || !address.city.trim())) throw new Error('Preencha a morada, código postal e localidade do envio.');
      if (shortages.length && !allowWithoutStock) {
        const first = shortages[0];
        const product = productMap.get(first.productId);
        throw new Error(`“${product?.name ?? 'Este produto'}” tem apenas ${first.available} unidade(s) livres. Reduza a quantidade ou escolha “acerto posterior” para uma venda histórica.`);
      }
      const items = rows.map((row) => ({ productId: Number(row.productId), variantName: row.variantName, quantity: Number(row.quantity), price: Number(row.price) }));
      const result = await createManualOrder({ orderId, name, phone, email, paymentMethod, status, deliveryMethod, shippingCost: shipping, discountValue: discount, total, items, allowWithoutStock, ...address });
      const savedOrder = result.order && typeof result.order === 'object' ? result.order as Record<string, unknown> : null;
      setSuccess(savedOrder?.stockDeducted === true ? `Encomenda ${orderId} criada e stock abatido com segurança.` : `Encomenda ${orderId} criada e marcada para acerto de stock.`);
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a encomenda.'); }
    finally { setBusy(false); }
  };

  return <><button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" /><aside className="editor-drawer manual-order-editor open"><header><div><p className="eyebrow">Encomendas</p><h2>Nova encomenda manual</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><form className="editor-form" onSubmit={submit}>
    <p className="editor-lead">Registe uma venda feita por telefone, mensagem ou presencialmente. O servidor usa a mesma lógica protegida da loja para validar e abater o stock.</p>
    <section className="editor-section"><header><span>1</span><div><strong>Encomenda e cliente</strong><small>Dados que ficam associados ao pedido.</small></div></header>
      <div className="form-grid"><label className="editor-field"><span>Referência</span><input value={orderId} onChange={(event) => setOrderId(event.target.value.toUpperCase())} pattern="AS-[0-9]{6,16}" required /></label><label className="editor-field"><span>Estado inicial</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Pendente</option><option>Processamento</option><option>Pago</option></select></label></div>
      <div className="form-grid"><label className="editor-field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="editor-field"><span>Telemóvel</span><input value={phone} onChange={(event) => setPhone(event.target.value)} required /></label></div>
      <div className="form-grid"><label className="editor-field"><span>Email (opcional)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="editor-field"><span>Pagamento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>MB Way</option><option>Transferência</option><option>Dinheiro</option><option>Multibanco</option><option>Cobrança</option><option>Outro</option></select></label></div>
    </section>
    <section className="editor-section"><header><span>2</span><div><strong>Entrega</strong><small>Levantamento ou envio para o cliente.</small></div></header>
      <div className="form-grid"><label className="editor-field"><span>Método</span><select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)}><option value="Pickup">Levantamento em Loja (Leiria)</option><option value="Shipping">Envio</option></select></label>{deliveryMethod === 'Shipping' && <label className="editor-field"><span>Portes cobrados ao cliente</span><input type="number" min="0" step="0.01" value={shippingCost} onChange={(event) => setShippingCost(Number(event.target.value))} /></label>}</div>
      {deliveryMethod === 'Shipping' && <><div className="form-grid"><label className="editor-field"><span>Morada</span><input value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} required /></label><label className="editor-field"><span>Porta / complemento</span><input value={address.doorNumber} onChange={(event) => setAddress({ ...address, doorNumber: event.target.value })} /></label></div><div className="form-grid"><label className="editor-field"><span>Código postal</span><input value={address.zip} onChange={(event) => setAddress({ ...address, zip: event.target.value })} required /></label><label className="editor-field"><span>Localidade</span><input value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} required /></label></div></>}
    </section>
    <section className="editor-section"><header><span>3</span><div><strong>Artigos</strong><small>O preço pode ser ajustado apenas para esta venda.</small></div></header>
      <div className="recovery-items">{rows.map((row, index) => { const product = row.productId ? productMap.get(Number(row.productId)) : undefined; const available = row.productId ? availableFor(Number(row.productId), row.variantName) : null; const hasShortage = available !== null && Number(row.quantity) > available; return <div className="recovery-item" key={index}>
        <label className="editor-field"><span>Produto</span><select value={row.productId} onChange={(event) => setProduct(index, Number(event.target.value))} required><option value="">Selecionar…</option>{products.filter((item) => !item.isPrivate).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="editor-field"><span>Variante</span><select value={row.variantName} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, variantName: event.target.value, price: Number(product?.variants?.find((variant) => variant.name === event.target.value)?.price ?? item.price) } : item))}><option value="">Sem variante</option>{product?.variants?.map((variant) => <option key={variant.name}>{variant.name}</option>)}</select></label>
        <label className="editor-field"><span>Qtd.</span><input type="number" min="1" max="100" value={row.quantity} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label>
        <label className="editor-field"><span>Preço un.</span><input type="number" step="0.01" min="0" value={row.price} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item))} /></label>
        <button type="button" className="danger-button" onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={rows.length === 1}><Trash2 /></button>
        {available !== null && <p className={`manual-order-stock ${hasShortage ? 'shortage' : ''}`}>{hasShortage ? `Só existem ${available} unidade(s) livres para esta versão.` : `${available} unidade(s) livres para esta versão.`}</p>}
      </div>; })}</div>
      <button type="button" className="secondary-button" onClick={() => setRows((current) => [...current, emptyRow()])}><Plus /> Adicionar artigo</button>
      <label className="recovery-fallback"><input type="checkbox" checked={allowWithoutStock} onChange={(event) => setAllowWithoutStock(event.target.checked)} /><span><strong>Permitir registo para acerto posterior</strong><small>Use apenas para uma venda histórica. Se faltar stock, nenhuma unidade é abatida e a encomenda fica sinalizada para reconciliação manual.</small></span></label>
    </section>
    <section className="manual-order-total"><ShoppingBag /><span><small>Subtotal dos artigos</small><strong>{euro.format(subtotal)}</strong></span><label><small>Desconto desta venda</small><input type="number" min="0" max={subtotal} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(Math.max(0, Number(event.target.value)))} /><em>{discount ? `-${euro.format(discount)}` : 'Sem desconto'}</em></label><span><small>Portes do cliente</small><strong>{euro.format(shipping)}</strong></span><span className="manual-order-final"><small>Total da encomenda</small><strong>{euro.format(total)}</strong></span></section>
    {error && <p className="form-error">{error}</p>}{success && <p className="form-success">{success}</p>}
    <div className="editor-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="save-button" disabled={!adminMutationsAvailable || busy || rows.some((row) => !row.productId)}><Save /> {busy ? 'A criar…' : 'Criar encomenda'}</button></div>
  </form></aside></>;
}

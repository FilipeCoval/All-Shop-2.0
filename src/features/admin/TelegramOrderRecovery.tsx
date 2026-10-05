import { Plus, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Product } from '../../types/domain';
import { adminMutationsAvailable, recoverTelegramOrder } from './adminMutations';

type Row = { productId: number | ''; variantName: string; quantity: number; price: number };

const newRow = (): Row => ({ productId: '', variantName: '', quantity: 1, price: 0 });

export function TelegramOrderRecovery({ open, products, onClose, onSaved }: { open: boolean; products: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [orderId, setOrderId] = useState('AS-970041');
  const [name, setName] = useState('RODRIGO Silva MONTEIRO');
  const [phone, setPhone] = useState('915196583');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('MB Way');
  const [deliveryMethod, setDeliveryMethod] = useState('Pickup');
  const [total, setTotal] = useState(14);
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()]);
  const [allowWithoutStock, setAllowWithoutStock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  if (!open) return null;

  const setProduct = (index: number, id: number) => {
    const product = productMap.get(id);
    setRows((current) => current.map((row, i) => i === index ? { ...row, productId: id, variantName: product?.variants?.[0]?.name ?? '', price: product?.variants?.[0]?.price ?? product?.price ?? 0 } : row));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      const items = rows.map((row) => ({ productId: Number(row.productId), variantName: row.variantName, quantity: Number(row.quantity), price: Number(row.price) }));
      const result = await recoverTelegramOrder({ orderId, name, phone, email, paymentMethod, deliveryMethod, total, items, allowWithoutStock });
      const deducted = result?.order?.stockDeducted === true;
      setSuccess(deducted ? `Pedido ${orderId} recuperado e stock abatido.` : `Pedido ${orderId} recuperado. O stock ficou marcado para acerto manual.`);
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível recuperar a encomenda.'); }
    finally { setBusy(false); }
  };

  return <><button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" /><aside className="editor-drawer open"><header><div><p className="eyebrow">Encomendas</p><h2>Recuperar pedido do Telegram</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><form className="editor-form" onSubmit={submit}>
    <p className="editor-lead">Use esta opção quando a mensagem chegou ao Telegram mas a encomenda não foi gravada. A criação é protegida pelo servidor e abate o stock dos artigos selecionados.</p>
    <section className="editor-section"><header><span>1</span><div><strong>Pedido e cliente</strong><small>Dados recebidos na mensagem do Telegram.</small></div></header>
      <div className="form-grid"><label className="editor-field"><span>Referência</span><input value={orderId} onChange={(e) => setOrderId(e.target.value)} required /></label><label className="editor-field"><span>Total</span><input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(Number(e.target.value))} required /></label></div>
      <div className="form-grid"><label className="editor-field"><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label><label className="editor-field"><span>Telemóvel</span><input value={phone} onChange={(e) => setPhone(e.target.value)} required /></label></div>
      <div className="form-grid"><label className="editor-field"><span>Email (opcional)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="editor-field"><span>Pagamento</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>MB Way</option><option>Transferência</option><option>Cobrança</option><option>Outro</option></select></label></div>
      <label className="editor-field"><span>Entrega</span><select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}><option value="Pickup">Levantamento em Loja (Leiria)</option><option value="Shipping">Envio</option></select></label>
    </section>
    <section className="editor-section"><header><span>2</span><div><strong>Artigos</strong><small>Escolha exatamente os produtos e variantes vendidos.</small></div></header>
      <div className="recovery-items">{rows.map((row, index) => { const product = row.productId ? productMap.get(Number(row.productId)) : undefined; return <div className="recovery-item" key={index}>
        <label className="editor-field"><span>Produto</span><select value={row.productId} onChange={(e) => setProduct(index, Number(e.target.value))} required><option value="">Selecionar…</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="editor-field"><span>Variante</span><select value={row.variantName} onChange={(e) => setRows((current) => current.map((item, i) => i === index ? { ...item, variantName: e.target.value, price: product?.variants?.find((v) => v.name === e.target.value)?.price ?? item.price } : item))}><option value="">Sem variante</option>{product?.variants?.map((variant) => <option key={variant.name}>{variant.name}</option>)}</select></label>
        <label className="editor-field"><span>Qtd.</span><input type="number" min="1" value={row.quantity} onChange={(e) => setRows((current) => current.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item))} /></label>
        <label className="editor-field"><span>Preço un.</span><input type="number" step="0.01" min="0" value={row.price} onChange={(e) => setRows((current) => current.map((item, i) => i === index ? { ...item, price: Number(e.target.value) } : item))} /></label>
        <button type="button" className="danger-button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} disabled={rows.length === 1}><Trash2 /></button>
      </div>; })}</div>
      <button type="button" className="secondary-button" onClick={() => setRows((current) => [...current, newRow()])}><Plus /> Adicionar artigo</button>
      <label className="recovery-fallback"><input type="checkbox" checked={allowWithoutStock} onChange={(e) => setAllowWithoutStock(e.target.checked)} /><span><strong>Recuperar mesmo se já não houver stock livre</strong><small>Se algum artigo estiver esgotado, a encomenda entra na dashboard sem mexer no inventário e fica marcada como stock por acertar.</small></span></label>
    </section>
    {error && <p className="form-error">{error}</p>}{success && <p className="form-success">{success}</p>}
    <div className="editor-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="save-button" disabled={!adminMutationsAvailable || busy}><Save /> {busy ? 'A recuperar…' : 'Recuperar pedido'}</button></div>
  </form></aside></>;
}

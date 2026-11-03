import { Calculator, Clock, ExternalLink, Image as ImageIcon, MessageSquare, Save, Send, UserRound, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../../lib/firebase';
import type { AdminCoupon, AdminOrder, AdminUser, ProductRequest, StoreCategory, SupportTicket } from './adminTypes';
import type { Product } from '../../types/domain';
import { adminMutationsAvailable, markSupportTicketRead, saveCategory, saveCoupon, updateProductRequest, updateSupportTicket } from './adminMutations';
import { buildSupportConversation } from './supportConversation';
import { ClientDetailsEditor } from './ClientDetailsEditor';

export type AdminActionTarget =
  | { kind: 'coupon'; value: AdminCoupon | null }
  | { kind: 'ticket'; value: SupportTicket }
  | { kind: 'request'; value: ProductRequest }
  | { kind: 'client'; value: AdminUser }
  | { kind: 'category'; value: StoreCategory | null };

export function AdminActionEditor({ target, orders = [], users = [], products = [], onClose, onSaved }: { target: AdminActionTarget | null; orders?: AdminOrder[]; users?: AdminUser[]; products?: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [calculator, setCalculator] = useState({ original: '', final: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    if (target.kind === 'coupon') {
      setForm({ code: target.value?.code ?? '', type: target.value?.type ?? 'PERCENTAGE', value: String(target.value?.value ?? ''), minPurchase: String(target.value?.minPurchase ?? 0), maxUsages: String(target.value?.maxUsages ?? ''), maxDiscount: String(target.value?.maxDiscount ?? ''), validProductId: target.value?.validProductId ? String(target.value.validProductId) : '', isActive: target.value?.isActive !== false });
      setCalculator({ original: '', final: '' });
    }
    if (target.kind === 'request') setForm({ status: target.value.status ?? 'Análise', adminComment: target.value.adminComment ?? '' });
    if (target.kind === 'category') setForm({ name: target.value?.name ?? '', image: target.value?.image ?? '', order: String(target.value?.order ?? 0) });
    setError(null);
  }, [target]);

  if (!target) return null;
  if (target.kind === 'ticket') return <SupportTicketEditor ticket={target.value} onClose={onClose} onSaved={onSaved} />;
  if (target.kind === 'client') return <ClientDetailsEditor client={target.value} orders={orders} users={users} onClose={onClose} onSaved={onSaved} />;
  const title = target.kind === 'coupon' ? (target.value ? 'Editar cupão' : 'Novo cupão') : target.kind === 'request' ? 'Gerir pedido' : (target.value ? 'Editar categoria' : 'Nova categoria');
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (target.kind === 'coupon') await saveCoupon({ ...target.value, ...form, value: Number(form.value), minPurchase: Number(form.minPurchase), maxUsages: form.maxUsages ? Number(form.maxUsages) : null, maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null, validProductId: form.validProductId ? Number(form.validProductId) : null });
      if (target.kind === 'request') await updateProductRequest(target.value.id, String(form.status), String(form.adminComment));
      if (target.kind === 'category') await saveCategory({ ...target.value, ...form, order: Number(form.order) });
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar.'); }
    finally { setBusy(false); }
  };

  const original = Number(calculator.original); const finalPrice = Number(calculator.final);
  const calculated = original > 0 && finalPrice >= 0 && finalPrice < original ? { fixed: original - finalPrice, percentage: (original - finalPrice) / original * 100 } : null;
  return <><button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" /><aside className={`editor-drawer ${target.kind === 'request' ? 'request-editor' : 'compact'} open`}><header><div><p className="eyebrow">Administração</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><form className="editor-form" onSubmit={submit}>
    {target.kind === 'coupon' && <>
      <Field label="Código"><input value={String(form.code)} onChange={(event) => set('code', event.target.value)} required /></Field>
      <div className="form-grid"><Field label="Tipo"><select value={String(form.type)} onChange={(event) => set('type', event.target.value)}><option value="PERCENTAGE">Percentagem</option><option value="FIXED">Valor fixo</option></select></Field><Field label="Desconto"><input type="number" min="0.01" step="0.01" value={String(form.value)} onChange={(event) => set('value', event.target.value)} required /></Field></div>
      <Field label="Aplicar apenas a um produto"><select value={String(form.validProductId)} onChange={(event) => set('validProductId', event.target.value)}><option value="">Toda a loja</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.isPrivate ? ' (privado)' : ''}</option>)}</select></Field>
      <div className="form-grid"><Field label="Compra mínima"><input type="number" min="0" step="0.01" value={String(form.minPurchase)} onChange={(event) => set('minPurchase', event.target.value)} /></Field><Field label="Limite de utilizações"><input type="number" min="1" value={String(form.maxUsages)} onChange={(event) => set('maxUsages', event.target.value)} /></Field></div>
      {form.type === 'PERCENTAGE' && <Field label="Desconto máximo em euros (opcional)"><input type="number" min="0" step="0.01" value={String(form.maxDiscount)} onChange={(event) => set('maxDiscount', event.target.value)} /></Field>}
      <section className="coupon-calculator"><header><Calculator /><div><strong>Calculadora de promoção</strong><small>Indique o preço normal e o preço pretendido.</small></div></header><div className="form-grid"><Field label="Preço normal"><input type="number" min="0" step="0.01" value={calculator.original} onChange={(event) => setCalculator({ ...calculator, original: event.target.value })} /></Field><Field label="Preço final"><input type="number" min="0" step="0.01" value={calculator.final} onChange={(event) => setCalculator({ ...calculator, final: event.target.value })} /></Field></div>{calculated && <div className="coupon-calculator-result"><span><small>Valor fixo</small><strong>{calculated.fixed.toFixed(2)} €</strong><button type="button" onClick={() => setForm({ ...form, type: 'FIXED', value: calculated.fixed.toFixed(2) })}>Usar</button></span><span><small>Percentagem</small><strong>{calculated.percentage.toFixed(2)}%</strong><button type="button" onClick={() => setForm({ ...form, type: 'PERCENTAGE', value: calculated.percentage.toFixed(2) })}>Usar</button></span></div>}</section>
      <div className="check-row"><label><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => set('isActive', event.target.checked)} /> Cupão ativo</label></div>
    </>}
    {target.kind === 'request' && <>
      <div className="request-overview"><div><strong>{target.value.productName || 'Produto sem nome'}</strong><span>{target.value.userEmail || 'Cliente sem email'}</span></div><b className={target.value.userDecision === 'Aceite' ? 'accepted' : target.value.userDecision === 'Recusada' ? 'refused' : ''}>{target.value.userDecision ? `Cliente: ${target.value.userDecision}` : 'A aguardar decisão'}</b></div>
      <section className="request-details-grid"><RequestDetail label="Categoria" value={target.value.category} /><RequestDetail label="Estado pretendido" value={target.value.state} /><RequestDetail label="Urgência" value={target.value.urgency} /><RequestDetail label="Orçamento" value={target.value.budgetRange} /><RequestDetail label="Criado em" value={formatSupportDate(target.value.createdAt)} /><RequestDetail label="Notificações" value={target.value.notificationsEnabled ? 'Ativadas' : 'Não solicitadas'} /></section>
      {target.value.specifications && <RequestText title="Especificações" value={target.value.specifications} />}
      {target.value.details && <RequestText title="Informação adicional" value={target.value.details} />}
      {target.value.referenceLink && /^https?:\/\//i.test(target.value.referenceLink) && <a className="request-reference" href={target.value.referenceLink} target="_blank" rel="noreferrer"><ExternalLink /> Abrir produto de referência</a>}
      {target.value.photos?.length ? <section className="request-photos"><header><ImageIcon /><strong>Fotografias enviadas pelo cliente</strong></header><div>{target.value.photos.filter((photo) => /^https?:\/\//i.test(photo)).map((photo, index) => <a key={`${photo}:${index}`} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt={`Fotografia ${index + 1} do pedido`} /></a>)}</div></section> : null}
      <div className="form-grid"><Field label="Estado"><select value={String(form.status)} onChange={(event) => set('status', event.target.value)}><option>Análise</option><option>Concluído</option><option>Anulado</option></select></Field><div className="request-decision-note"><strong>Resposta do cliente</strong><span>{target.value.userDecision || 'Ainda não respondeu à proposta.'}</span></div></div>
      <Field label="Comentário ou proposta para o cliente"><textarea rows={7} value={String(form.adminComment)} onChange={(event) => set('adminComment', event.target.value)} placeholder="Escreva o preço, prazo, ligação ou condições da proposta…" /></Field>
    </>}
    {target.kind === 'category' && <><Field label="Nome"><input value={String(form.name)} onChange={(event) => set('name', event.target.value)} required /></Field><Field label="Endereço da imagem"><input type="url" value={String(form.image)} onChange={(event) => set('image', event.target.value)} placeholder="https://…" required /></Field>{Boolean(form.image) && <div className="category-image-preview"><img src={String(form.image)} alt="Pré-visualização da categoria" /></div>}<Field label="Posição no menu"><input type="number" min="0" value={String(form.order)} onChange={(event) => set('order', event.target.value)} /></Field></>}
    {!adminMutationsAvailable && <p className="safe-action-note">Esta ação será ativada no ambiente Vercel de testes.</p>}{error && <p className="form-error">{error}</p>}<div className="editor-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="save-button" disabled={!adminMutationsAvailable || busy}><Save /> {busy ? 'A guardar…' : 'Guardar'}</button></div>
  </form></aside></>;
}

function SupportTicketEditor({ ticket, onClose, onSaved }: { ticket: SupportTicket; onClose: () => void; onSaved: () => Promise<void> }) {
  const [current, setCurrent] = useState(ticket);
  const [status, setStatus] = useState(ticket.status ?? 'Aberto');
  const [priority, setPriority] = useState(ticket.priority ?? 'Média');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const markingRead = useRef(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(ticket);
    setStatus(ticket.status ?? 'Aberto');
    setPriority(ticket.priority ?? 'Média');
    setReply('');
    setError(null);
    setNotice(null);
    if (!firestore) {
      setError('Firebase não configurado.');
      return undefined;
    }
    return onSnapshot(doc(firestore, 'support_tickets', ticket.id), (snapshot) => {
      if (!snapshot.exists()) {
        setError('Este pedido de suporte já não existe.');
        return;
      }
      setCurrent({ id: snapshot.id, ...snapshot.data() } as SupportTicket);
    }, () => setError('Não foi possível acompanhar esta conversa em tempo real.'));
  }, [ticket.id]);

  useEffect(() => {
    if (!current.unreadAdmin) {
      markingRead.current = false;
      return;
    }
    if (markingRead.current || !adminMutationsAvailable) return;
    markingRead.current = true;
    void markSupportTicketRead(current.id)
      .then(() => onSaved())
      .catch(() => { markingRead.current = false; });
  }, [current.id, current.unreadAdmin, onSaved]);

  const conversation = useMemo(() => buildSupportConversation(current), [current]);
  useEffect(() => threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [conversation.length]);

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      await updateSupportTicket(current.id, status, priority);
      setNotice('Estado e prioridade atualizados.');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o pedido.'); }
    finally { setSaving(false); }
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const message = reply.trim();
    if (!message) return;
    setSending(true); setError(null); setNotice(null);
    try {
      await updateSupportTicket(current.id, status, priority, message);
      setReply('');
      setNotice('Mensagem enviada ao cliente.');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.'); }
    finally { setSending(false); }
  };

  return <>
    <button className="editor-backdrop" onClick={onClose} aria-label="Fechar conversa" />
    <aside className="editor-drawer support-editor open">
      <header>
        <div><p className="eyebrow">Suporte</p><h2>{current.subject || 'Pedido de suporte'}</h2><small>#{current.id.slice(-6)}</small></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button>
      </header>
      <div className="support-editor-body">
        <section className="support-ticket-summary">
          <div><UserRound /><span><strong>{current.customerName || 'Cliente'}</strong><small>{current.customerEmail || 'Sem email registado'}</small></span></div>
          <div><MessageSquare /><span><strong>{current.category || 'Assistência'}</strong><small>{current.orderId ? `Encomenda ${current.orderId}` : 'Sem encomenda associada'}</small></span></div>
          <div><Clock /><span><strong>Última atividade</strong><small>{formatSupportDate(current.updatedAt || current.createdAt)}</small></span></div>
        </section>

        <form className="support-settings" onSubmit={saveSettings}>
          <Field label="Estado"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Aberto</option><option>Em Análise</option><option>Resolvido</option><option>Fechado</option></select></Field>
          <Field label="Prioridade"><select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Baixa</option><option>Média</option><option>Alta</option></select></Field>
          <button className="secondary-button" disabled={!adminMutationsAvailable || saving}><Save /> {saving ? 'A guardar…' : 'Guardar estado'}</button>
        </form>

        <section className="support-thread-card">
          <header><div><MessageSquare /><span><strong>Conversa com o cliente</strong><small>{conversation.length} {conversation.length === 1 ? 'mensagem' : 'mensagens'}</small></span></div>{current.unreadAdmin && <b>Nova mensagem</b>}</header>
          <div className="support-thread" aria-live="polite">
            {conversation.length === 0 && <p className="support-empty">Ainda não existem mensagens nesta conversa.</p>}
            {conversation.map((message) => <article key={message.id} className={`support-message ${message.role === 'admin' ? 'from-admin' : message.role === 'system' ? 'from-system' : 'from-client'}`}>
              <div><strong>{message.role === 'admin' ? 'All-Shop' : message.role === 'system' ? 'Sistema' : message.senderName || current.customerName || 'Cliente'}</strong><time>{formatSupportDate(message.timestamp)}</time></div>
              <p>{message.text}</p>
              {message.attachments?.length ? <div className="support-attachments">{message.attachments.map((attachment, index) => <a key={`${message.id}:${index}`} href={attachment} target="_blank" rel="noreferrer">Ver anexo {index + 1}</a>)}</div> : null}
            </article>)}
            <div ref={threadEnd} />
          </div>
          <form className="support-compose" onSubmit={sendReply}>
            <textarea rows={4} maxLength={3000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Escreva a resposta para o cliente…" aria-label="Resposta ao cliente" />
            <div><small>{reply.length}/3000</small><button className="save-button" disabled={!adminMutationsAvailable || sending || !reply.trim()}><Send /> {sending ? 'A enviar…' : 'Enviar mensagem'}</button></div>
          </form>
        </section>
        {!adminMutationsAvailable && <p className="safe-action-note">As respostas estão disponíveis no ambiente publicado.</p>}
        {notice && <p className="form-success">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </aside>
  </>;
}

function formatSupportDate(value?: string | { seconds?: number; toDate?: () => Date }) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : typeof value.toDate === 'function' ? value.toDate() : new Date(Number(value.seconds ?? 0) * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function RequestDetail({ label, value }: { label: string; value?: string }) {
  return <div><small>{label}</small><strong>{value || '—'}</strong></div>;
}

function RequestText({ title, value }: { title: string; value: string }) {
  return <section className="request-text"><strong>{title}</strong><p>{value}</p></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="editor-field"><span>{label}</span>{children}</label>; }

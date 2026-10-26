import { Clock, MessageSquare, Save, Send, UserRound, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../../lib/firebase';
import type { AdminCoupon, AdminUser, ProductRequest, StoreCategory, SupportTicket } from './adminTypes';
import { adjustClientPoints, adminMutationsAvailable, markSupportTicketRead, saveCategory, saveCoupon, updateProductRequest, updateSupportTicket } from './adminMutations';
import { buildSupportConversation } from './supportConversation';

export type AdminActionTarget =
  | { kind: 'coupon'; value: AdminCoupon | null }
  | { kind: 'ticket'; value: SupportTicket }
  | { kind: 'request'; value: ProductRequest }
  | { kind: 'client'; value: AdminUser }
  | { kind: 'category'; value: StoreCategory | null };

export function AdminActionEditor({ target, onClose, onSaved }: { target: AdminActionTarget | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    if (target.kind === 'coupon') setForm({ code: target.value?.code ?? '', type: target.value?.type ?? 'PERCENTAGE', value: String(target.value?.value ?? ''), minPurchase: String(target.value?.minPurchase ?? 0), maxUsages: String(target.value?.maxUsages ?? ''), isActive: target.value?.isActive !== false });
    if (target.kind === 'request') setForm({ status: target.value.status ?? 'Análise', adminComment: '' });
    if (target.kind === 'client') setForm({ amount: '', reason: '' });
    if (target.kind === 'category') setForm({ name: target.value?.name ?? '', image: target.value?.image ?? '', order: String(target.value?.order ?? 0) });
    setError(null);
  }, [target]);

  if (!target) return null;
  if (target.kind === 'ticket') return <SupportTicketEditor ticket={target.value} onClose={onClose} onSaved={onSaved} />;
  const title = target.kind === 'coupon' ? (target.value ? 'Editar cupão' : 'Novo cupão') : target.kind === 'request' ? 'Gerir pedido' : target.kind === 'category' ? (target.value ? 'Editar categoria' : 'Nova categoria') : 'Ajustar AllPoints';
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (target.kind === 'coupon') await saveCoupon({ ...target.value, ...form, value: Number(form.value), minPurchase: Number(form.minPurchase), maxUsages: form.maxUsages ? Number(form.maxUsages) : null });
      if (target.kind === 'request') await updateProductRequest(target.value.id, String(form.status), String(form.adminComment));
      if (target.kind === 'client') await adjustClientPoints(target.value.id, Number(form.amount), String(form.reason));
      if (target.kind === 'category') await saveCategory({ ...target.value, ...form, order: Number(form.order) });
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar.'); }
    finally { setBusy(false); }
  };

  return <><button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" /><aside className="editor-drawer compact open"><header><div><p className="eyebrow">Administração</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><form className="editor-form" onSubmit={submit}>
    {target.kind === 'coupon' && <><Field label="Código"><input value={String(form.code)} onChange={(event) => set('code', event.target.value)} required /></Field><div className="form-grid"><Field label="Tipo"><select value={String(form.type)} onChange={(event) => set('type', event.target.value)}><option value="PERCENTAGE">Percentagem</option><option value="FIXED">Valor fixo</option></select></Field><Field label="Desconto"><input type="number" min="0.01" step="0.01" value={String(form.value)} onChange={(event) => set('value', event.target.value)} required /></Field></div><div className="form-grid"><Field label="Compra mínima"><input type="number" min="0" step="0.01" value={String(form.minPurchase)} onChange={(event) => set('minPurchase', event.target.value)} /></Field><Field label="Limite de utilizações"><input type="number" min="1" value={String(form.maxUsages)} onChange={(event) => set('maxUsages', event.target.value)} /></Field></div><div className="check-row"><label><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => set('isActive', event.target.checked)} /> Cupão ativo</label></div></>}
    {target.kind === 'request' && <><div className="editor-summary"><strong>{target.value.productName}</strong><span>{target.value.userEmail}</span></div><Field label="Estado"><select value={String(form.status)} onChange={(event) => set('status', event.target.value)}><option>Análise</option><option>Concluído</option><option>Anulado</option></select></Field><Field label="Comentário administrativo"><textarea rows={6} value={String(form.adminComment)} onChange={(event) => set('adminComment', event.target.value)} /></Field></>}
    {target.kind === 'client' && <><div className="editor-summary"><strong>{target.value.name ?? 'Cliente'}</strong><span>{target.value.email} · Saldo atual: {Number(target.value.loyaltyPoints ?? 0)} pontos</span></div><Field label="Pontos a adicionar ou retirar"><input type="number" value={String(form.amount)} onChange={(event) => set('amount', event.target.value)} placeholder="Ex.: 50 ou -20" required /></Field><Field label="Motivo obrigatório"><textarea rows={4} value={String(form.reason)} onChange={(event) => set('reason', event.target.value)} required /></Field></>}
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

function formatSupportDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="editor-field"><span>{label}</span>{children}</label>; }

import { Save, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { AdminCoupon, AdminUser, ProductRequest, StoreCategory, SupportTicket } from './adminTypes';
import { adjustClientPoints, adminMutationsAvailable, saveCategory, saveCoupon, updateProductRequest, updateSupportTicket } from './adminMutations';

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
    if (target.kind === 'ticket') setForm({ status: target.value.status ?? 'Aberto', priority: target.value.priority ?? 'Média', message: '' });
    if (target.kind === 'request') setForm({ status: target.value.status ?? 'Análise', adminComment: '' });
    if (target.kind === 'client') setForm({ amount: '', reason: '' });
    if (target.kind === 'category') setForm({ name: target.value?.name ?? '', image: target.value?.image ?? '', order: String(target.value?.order ?? 0) });
    setError(null);
  }, [target]);

  if (!target) return null;
  const title = target.kind === 'coupon' ? (target.value ? 'Editar cupão' : 'Novo cupão') : target.kind === 'ticket' ? 'Gerir suporte' : target.kind === 'request' ? 'Gerir pedido' : target.kind === 'category' ? (target.value ? 'Editar categoria' : 'Nova categoria') : 'Ajustar AllPoints';
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (target.kind === 'coupon') await saveCoupon({ ...target.value, ...form, value: Number(form.value), minPurchase: Number(form.minPurchase), maxUsages: form.maxUsages ? Number(form.maxUsages) : null });
      if (target.kind === 'ticket') await updateSupportTicket(target.value.id, String(form.status), String(form.priority), String(form.message));
      if (target.kind === 'request') await updateProductRequest(target.value.id, String(form.status), String(form.adminComment));
      if (target.kind === 'client') await adjustClientPoints(target.value.id, Number(form.amount), String(form.reason));
      if (target.kind === 'category') await saveCategory({ ...target.value, ...form, order: Number(form.order) });
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar.'); }
    finally { setBusy(false); }
  };

  return <><button className="editor-backdrop" onClick={onClose} aria-label="Fechar editor" /><aside className="editor-drawer compact open"><header><div><p className="eyebrow">Administração</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><form className="editor-form" onSubmit={submit}>
    {target.kind === 'coupon' && <><Field label="Código"><input value={String(form.code)} onChange={(event) => set('code', event.target.value)} required /></Field><div className="form-grid"><Field label="Tipo"><select value={String(form.type)} onChange={(event) => set('type', event.target.value)}><option value="PERCENTAGE">Percentagem</option><option value="FIXED">Valor fixo</option></select></Field><Field label="Desconto"><input type="number" min="0.01" step="0.01" value={String(form.value)} onChange={(event) => set('value', event.target.value)} required /></Field></div><div className="form-grid"><Field label="Compra mínima"><input type="number" min="0" step="0.01" value={String(form.minPurchase)} onChange={(event) => set('minPurchase', event.target.value)} /></Field><Field label="Limite de utilizações"><input type="number" min="1" value={String(form.maxUsages)} onChange={(event) => set('maxUsages', event.target.value)} /></Field></div><div className="check-row"><label><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => set('isActive', event.target.checked)} /> Cupão ativo</label></div></>}
    {target.kind === 'ticket' && <><div className="editor-summary"><strong>{target.value.subject}</strong><span>{target.value.customerName ?? target.value.customerEmail}</span></div><div className="form-grid"><Field label="Estado"><select value={String(form.status)} onChange={(event) => set('status', event.target.value)}><option>Aberto</option><option>Em Análise</option><option>Resolvido</option><option>Fechado</option></select></Field><Field label="Prioridade"><select value={String(form.priority)} onChange={(event) => set('priority', event.target.value)}><option>Baixa</option><option>Média</option><option>Alta</option></select></Field></div><Field label="Responder ao cliente (opcional)"><textarea rows={6} value={String(form.message)} onChange={(event) => set('message', event.target.value)} /></Field></>}
    {target.kind === 'request' && <><div className="editor-summary"><strong>{target.value.productName}</strong><span>{target.value.userEmail}</span></div><Field label="Estado"><select value={String(form.status)} onChange={(event) => set('status', event.target.value)}><option>Análise</option><option>Concluído</option><option>Anulado</option></select></Field><Field label="Comentário administrativo"><textarea rows={6} value={String(form.adminComment)} onChange={(event) => set('adminComment', event.target.value)} /></Field></>}
    {target.kind === 'client' && <><div className="editor-summary"><strong>{target.value.name ?? 'Cliente'}</strong><span>{target.value.email} · Saldo atual: {Number(target.value.loyaltyPoints ?? 0)} pontos</span></div><Field label="Pontos a adicionar ou retirar"><input type="number" value={String(form.amount)} onChange={(event) => set('amount', event.target.value)} placeholder="Ex.: 50 ou -20" required /></Field><Field label="Motivo obrigatório"><textarea rows={4} value={String(form.reason)} onChange={(event) => set('reason', event.target.value)} required /></Field></>}
    {target.kind === 'category' && <><Field label="Nome"><input value={String(form.name)} onChange={(event) => set('name', event.target.value)} required /></Field><Field label="Endereço da imagem"><input type="url" value={String(form.image)} onChange={(event) => set('image', event.target.value)} placeholder="https://…" required /></Field>{Boolean(form.image) && <div className="category-image-preview"><img src={String(form.image)} alt="Pré-visualização da categoria" /></div>}<Field label="Posição no menu"><input type="number" min="0" value={String(form.order)} onChange={(event) => set('order', event.target.value)} /></Field></>}
    {!adminMutationsAvailable && <p className="safe-action-note">Esta ação será ativada no ambiente Vercel de testes.</p>}{error && <p className="form-error">{error}</p>}<div className="editor-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="save-button" disabled={!adminMutationsAvailable || busy}><Save /> {busy ? 'A guardar…' : 'Guardar'}</button></div>
  </form></aside></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="editor-field"><span>{label}</span>{children}</label>; }

import { BellRing, Database, Download, Image as ImageIcon, Megaphone, Pencil, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import type { AdminAuditEntry, AdminSnapshot, AdminUser, StoreCategory } from './adminTypes';
import { adminMutationsAvailable, deleteCategory, sendMarketingPush } from './adminMutations';

export function CategoriesSection({ categories, search, onCreate, onEdit, onChanged }: { categories: StoreCategory[]; search: string; onCreate: () => void; onEdit: (category: StoreCategory) => void; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visible = categories.filter((category) => String(category.name ?? '').toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));

  const remove = async (category: StoreCategory) => {
    if (!adminMutationsAvailable || !window.confirm(`Apagar a categoria “${category.name ?? 'Sem nome'}”?`)) return;
    setBusyId(category.id); setError(null);
    try { await deleteCategory(category.id); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível apagar a categoria.'); }
    finally { setBusyId(null); }
  };

  return <div className="admin-table-card">
    <div className="table-heading"><div><h2>Categorias da loja</h2><p>Organizam o menu e a navegação do catálogo público.</p></div><div className="table-heading-actions"><span>{visible.length} categorias</span><button className="heading-action" onClick={onCreate}><Plus /> Nova categoria</button></div></div>
    {error && <p className="inline-error">{error}</p>}
    <div className="category-admin-grid">{visible.map((category) => <article key={category.id}>
      <div className="category-admin-image">{category.image ? <img src={category.image} alt="" /> : <ImageIcon />}</div>
      <div><small>Posição {Number(category.order ?? 0)}</small><strong>{category.name ?? 'Sem nome'}</strong></div>
      <button className="icon-button" onClick={() => onEdit(category)} title="Editar"><Pencil /></button>
      <button className="icon-button danger" disabled={!adminMutationsAvailable || busyId === category.id} onClick={() => void remove(category)} title="Apagar"><Trash2 /></button>
    </article>)}</div>
    {!visible.length && <p className="empty-inline spacious">Nenhuma categoria encontrada.</p>}
    {!adminMutationsAvailable && <p className="safe-action-note utility-note">A edição e eliminação serão ativadas no ambiente Vercel de testes.</p>}
  </div>;
}
export function BackupsSection({ data }: { data: AdminSnapshot }) {
  const exportBackup = () => {
    const payload = { exportedAt: new Date().toISOString(), format: 'all-shop-3-backup-v1', collections: data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `all-shop-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const records = data.products.length + data.lots.length + data.orders.length + data.users.length + data.coupons.length + data.tickets.length + data.imports.length + data.requests.length + data.categories.length;
  return <div className="backup-grid">
    <article className="admin-panel backup-main"><span className="backup-icon"><Database /></span><div><p className="eyebrow">Cópia manual</p><h2>Exportar dados administrativos</h2><p>Cria um ficheiro JSON com os dados que a dashboard acabou de carregar. Não altera a base de dados.</p></div><button className="save-button" onClick={exportBackup}><Download /> Descarregar cópia</button></article>
    <article className="backup-stat"><strong>{records}</strong><span>registos nesta cópia</span></article>
    <article className="backup-stat"><strong>{data.products.length}</strong><span>produtos públicos</span></article>
    <article className="backup-stat"><strong>{data.orders.length}</strong><span>encomendas</span></article>
    <article className="admin-panel backup-note"><ShieldCheck /><div><h3>Exportação segura</h3><p>O ficheiro só é criado no seu navegador e fica na pasta de transferências. A reposição automática será ligada apenas depois de testarmos o novo servidor.</p></div></article>
  </div>;
}

export function MarketingSection({ users, onSent }: { users: AdminUser[]; onSent: () => Promise<void> }) {
  const [form, setForm] = useState({ title: '', body: '', image: '', link: 'https://www.all-shop.net', target: 'all' });
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const devices = useMemo(() => new Set(users.flatMap((user) => [...(user.deviceTokens ?? []), ...(user.fcmToken ? [user.fcmToken] : [])])).size, [users]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm(`Enviar esta notificação para ${form.target === 'admins' ? 'os administradores' : 'todos os dispositivos registados'}?`)) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const response = await sendMarketingPush(form);
      const serverMessage = typeof response.message === 'string' ? response.message : '';
      setResult(serverMessage || `${Number(response.sentCount ?? 0)} notificações enviadas; ${Number(response.failureCount ?? 0)} falharam.`);
      setForm((current) => ({ ...current, title: '', body: '', image: '' }));
      await onSent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a campanha.'); }
    finally { setBusy(false); }
  };
  return <div className="marketing-grid">
    <article className="marketing-hero"><div><p className="eyebrow">Comunicação</p><h2><Megaphone /> Central de campanhas</h2><p>Envie notificações para os clientes que aceitaram recebê-las.</p></div><div><strong>{devices}</strong><span>dispositivos registados</span></div></article>
    <form className="admin-panel marketing-form" onSubmit={submit}><header><BellRing /><div><h3>Nova notificação</h3><p>Confirme sempre o texto antes do envio.</p></div></header>
      <label className="editor-field"><span>Título</span><input maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Novidades acabaram de chegar" required /></label>
      <label className="editor-field"><span>Mensagem</span><textarea rows={4} maxLength={500} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required /></label>
      <div className="form-grid"><label className="editor-field"><span>Público</span><select value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })}><option value="all">Todos os clientes</option><option value="admins">Só administradores</option></select></label><label className="editor-field"><span>Destino ao abrir</span><input type="url" value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} required /></label></div>
      <label className="editor-field"><span>Imagem HTTPS (opcional)</span><input type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="https://…" /></label>
      {!adminMutationsAvailable && <p className="safe-action-note">O envio será ativado apenas no ambiente Vercel de testes.</p>}{result && <p className="form-success">{result}</p>}{error && <p className="form-error">{error}</p>}
      <button className="save-button marketing-submit" disabled={!adminMutationsAvailable || busy || !form.title || !form.body}><Send /> {busy ? 'A enviar…' : 'Rever e enviar'}</button>
    </form>
    <article className="admin-panel marketing-help"><h3>Proteções incluídas</h3><p>Apenas administradores autenticados podem enviar. Os dispositivos repetidos são removidos, os envios são divididos em lotes e os endereços inválidos são limpos automaticamente.</p></article>
  </div>;
}

export function AuditSection({ entries, search }: { entries: AdminAuditEntry[]; search: string }) {
  const visible = entries.filter((entry) => `${entry.action ?? ''} ${entry.targetId ?? ''} ${entry.adminEmail ?? ''}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  return <div className="admin-table-card"><div className="table-heading"><div><h2>Histórico administrativo</h2><p>Registo das alterações feitas através do novo servidor protegido.</p></div><span>{visible.length} ações</span></div><div className="table-scroll"><table><thead><tr><th>Ação</th><th>Alvo</th><th>Administrador</th><th>Data</th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id}><td><strong>{auditLabel(entry.action)}</strong><small>{entry.action ?? '—'}</small></td><td>{entry.targetId ?? '—'}</td><td>{entry.adminEmail ?? '—'}</td><td>{formatAuditDate(entry.createdAt)}</td></tr>)}</tbody></table></div>{!visible.length && <p className="empty-inline spacious">Ainda não existem ações registadas na nova versão.</p>}</div>;
}

const auditNames: Record<string, string> = { save_product: 'Produto guardado', save_lot: 'Lote guardado', delete_lot: 'Lote apagado', sync_product: 'Stock sincronizado', set_status: 'Estado da encomenda alterado', update_tracking: 'Rastreio atualizado', review_request: 'Pedido revisto', save_coupon: 'Cupão guardado', update_ticket: 'Ticket atualizado', update_request: 'Pedido de produto atualizado', update_import_status: 'Importação atualizada', save_import: 'Importação guardada', delete_import: 'Importação apagada', adjust_points: 'AllPoints ajustados', save_category: 'Categoria guardada', delete_category: 'Categoria apagada', send_marketing_push: 'Notificação enviada' };
const auditLabel = (action?: string) => auditNames[action ?? ''] ?? 'Ação administrativa';
function formatAuditDate(value: AdminAuditEntry['createdAt']) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : typeof value.toDate === 'function' ? value.toDate() : new Date(Number(value.seconds ?? 0) * 1000);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—';
}

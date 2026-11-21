import { AlertTriangle, Combine, Coins, Gift, Loader2, RefreshCw, Save, ShoppingCart, Star, TicketPercent, UserRound, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adjustClientPoints, adminMutationsAvailable, mergeClientAccounts, recalculateClientLoyalty, updateClientFreebieQuota } from './adminMutations';
import type { AdminOrder, AdminUser } from './adminTypes';
import { clientOrderInsights, clientTopProducts } from './clientInsights';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

export function ClientDetailsEditor({ client, orders, users, onClose, onSaved }: {
  client: AdminUser;
  orders: AdminOrder[];
  users: AdminUser[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [quota, setQuota] = useState(String(client.freebieQuota ?? 0));
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setQuota(String(client.freebieQuota ?? 0));
    setError(null);
  }, [client.id, client.freebieQuota]);

  const insights = useMemo(() => clientOrderInsights(orders, client), [orders, client]);
  const topProducts = useMemo(() => clientTopProducts(insights.allOrders), [insights.allOrders]);
  const pointHistory = useMemo(() => [...(client.pointsHistory ?? [])].sort((left, right) => dateValue(right.date) - dateValue(left.date)), [client.pointsHistory]);
  const duplicates = useMemo(() => users
    .filter((user) => user.id !== client.id && !user.isMerged)
    .sort((left, right) => String(left.email ?? left.name ?? '').localeCompare(String(right.email ?? right.name ?? ''), 'pt')),
  [users, client.id]);
  const duplicate = duplicates.find((user) => user.id === duplicateId);
  const duplicateInsights = useMemo(() => duplicate ? clientOrderInsights(orders, duplicate) : null, [orders, duplicate]);
  const pushTokens = new Set([...(client.deviceTokens ?? []), ...(client.fcmToken ? [client.fcmToken] : [])]).size;

  const run = async (key: string, action: () => Promise<unknown>, message: string, after?: () => void) => {
    setBusy(key); setError(null); setNotice(null);
    try {
      await action();
      await onSaved();
      setNotice(message);
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(null);
    }
  };

  const saveQuota = (event: FormEvent) => {
    event.preventDefault();
    const value = Math.trunc(Number(quota));
    if (!Number.isFinite(value) || value < 0 || value > 1000) { setError('Indique uma quota de ofertas entre 0 e 1000.'); return; }
    void run('quota', () => updateClientFreebieQuota(client.id, value), 'Quota de ofertas atualizada.');
  };

  const savePoints = (event: FormEvent) => {
    event.preventDefault();
    const amount = Math.trunc(Number(pointAmount));
    if (!amount || !pointReason.trim()) { setError('Indique o valor dos pontos e o motivo do ajuste.'); return; }
    void run('points', () => adjustClientPoints(client.id, amount, pointReason.trim()), 'AllPoints atualizados e registados no histórico.', () => {
      setPointAmount(''); setPointReason('');
    });
  };

  const recalculate = () => {
    if (!window.confirm('Recalcular o total gasto e o nível deste cliente a partir das encomendas?')) return;
    void run('recalculate', () => recalculateClientLoyalty(client.id), 'Total gasto e nível sincronizados com as encomendas.');
  };

  const merge = (event: FormEvent) => {
    event.preventDefault();
    if (!duplicate) { setError('Escolha a conta duplicada.'); return; }
    if (confirmation.trim().toUpperCase() !== 'FUNDIR') { setError('Escreva FUNDIR para confirmar a fusão.'); return; }
    void run('merge', () => mergeClientAccounts(client.id, duplicate.id, confirmation), 'Contas fundidas. A conta antiga ficou arquivada para segurança.', () => {
      setDuplicateId(''); setConfirmation('');
    });
  };

  return <>
    <button className="editor-backdrop" onClick={onClose} aria-label="Fechar detalhes do cliente" />
    <aside className="editor-drawer client-details-editor open">
      <header>
        <div><p className="eyebrow">Clientes</p><h2>Detalhes do cliente</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button>
      </header>

      <div className="client-details-body">
        <section className="client-identity-card">
          <span className="client-avatar">{String(client.name || client.email || '?').charAt(0).toUpperCase()}</span>
          <div><h3>{client.name || 'Cliente'}</h3><p>{client.email || 'Sem email registado'}</p><small>{client.phone || 'Sem telefone'} · {pushTokens} {pushTokens === 1 ? 'dispositivo com notificações' : 'dispositivos com notificações'}</small></div>
        </section>

        <section className="client-metrics" aria-label="Resumo comercial do cliente">
          <article><small>Total gasto calculado</small><strong>{euro.format(insights.totalSpent)}</strong><span>{insights.commercialOrders.length} encomendas válidas</span></article>
          <article><small>Média por encomenda</small><strong>{euro.format(insights.averageOrderValue)}</strong><span>sem canceladas/devolvidas</span></article>
          <article><small>Nível</small><strong>{client.tier || insights.tier}</strong><span>calculado: {insights.tier}</span></article>
          <article><small>AllPoints</small><strong>{Number(client.loyaltyPoints ?? 0)}</strong><span>{pointHistory.length} movimentos</span></article>
        </section>

        <ClientSection icon={<Star />} title="Produtos mais comprados">
          {topProducts.length > 0 ? <div className="client-top-products">{topProducts.map((product, index) => <article key={`${product.productId ?? product.name}:${index}`}>
            <span>{product.image ? <img src={product.image} alt="" /> : index + 1}</span>
            <div><strong>{product.name}</strong><small>{product.quantity} {product.quantity === 1 ? 'unidade comprada' : 'unidades compradas'}</small></div>
          </article>)}</div> : <p className="client-empty">Ainda não existem produtos comprados.</p>}
        </ClientSection>

        <ClientSection icon={<ShoppingCart />} title={`Histórico de encomendas (${insights.allOrders.length})`}>
          <div className="client-history-table"><table><thead><tr><th>Data</th><th>Encomenda</th><th>Estado</th><th>Total</th></tr></thead><tbody>
            {insights.allOrders.map((order) => <tr key={order.id}><td>{formatDate(order.date)}</td><td><strong>#{order.id.replace(/^#/, '').slice(-8)}</strong></td><td><span className={statusClass(order.status)}>{order.status}</span></td><td><strong>{euro.format(Number(order.total ?? 0))}</strong></td></tr>)}
            {insights.allOrders.length === 0 && <tr><td colSpan={4} className="client-empty">Sem encomendas associadas.</td></tr>}
          </tbody></table></div>
        </ClientSection>

        <ClientSection icon={<TicketPercent />} title={`Histórico de AllPoints (${pointHistory.length})`}>
          <div className="client-history-table"><table><thead><tr><th>Data</th><th>Motivo</th><th>Valor</th></tr></thead><tbody>
            {pointHistory.map((entry, index) => <tr key={entry.id || `${entry.date}:${index}`}><td>{formatDate(entry.date)}</td><td>{entry.reason || 'Movimento de pontos'}</td><td><strong className={Number(entry.amount ?? 0) >= 0 ? 'points-positive' : 'points-negative'}>{Number(entry.amount ?? 0) > 0 ? '+' : ''}{Number(entry.amount ?? 0)}</strong></td></tr>)}
            {pointHistory.length === 0 && <tr><td colSpan={3} className="client-empty">Sem histórico de pontos.</td></tr>}
          </tbody></table></div>
        </ClientSection>

        <ClientSection icon={<Combine />} title="Ferramentas de gestão" className="client-management-section">
          <div className="client-management-grid">
            <form className="client-tool-card green" onSubmit={saveQuota}>
              <header><Gift /><div><strong>Ofertas disponíveis</strong><small>Quantas ofertas este cliente pode escolher.</small></div></header>
              <label><span>Quota</span><input type="number" min="0" max="1000" value={quota} onChange={(event) => setQuota(event.target.value)} /></label>
              <button className="save-button" disabled={!adminMutationsAvailable || busy !== null}>{busy === 'quota' ? <Loader2 className="spin" /> : <Save />} Guardar quota</button>
            </form>

            <article className="client-tool-card orange">
              <header><RefreshCw /><div><strong>Recalcular fidelização</strong><small>Corrige o total gasto e o nível através das encomendas.</small></div></header>
              <p>Encontrámos {insights.commercialOrders.length} encomendas válidas, no total de {euro.format(insights.totalSpent)}.</p>
              <button className="save-button" type="button" onClick={recalculate} disabled={!adminMutationsAvailable || busy !== null}>{busy === 'recalculate' ? <Loader2 className="spin" /> : <RefreshCw />} Sincronizar agora</button>
            </article>

            <form className="client-tool-card blue" onSubmit={savePoints}>
              <header><Coins /><div><strong>Ajuste manual de AllPoints</strong><small>Adicione ou retire pontos, sempre com motivo.</small></div></header>
              <div className="client-tool-fields"><label><span>Pontos (+/−)</span><input type="number" value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="Ex.: 50 ou -20" /></label><label><span>Motivo</span><input value={pointReason} onChange={(event) => setPointReason(event.target.value)} placeholder="Ex.: compensação por atraso" /></label></div>
              <button className="save-button" disabled={!adminMutationsAvailable || busy !== null || !pointAmount || !pointReason.trim()}>{busy === 'points' ? <Loader2 className="spin" /> : <Coins />} Atualizar pontos</button>
            </form>

            <form className="client-tool-card red" onSubmit={merge}>
              <header><AlertTriangle /><div><strong>Fundir conta duplicada</strong><small>Transfere encomendas, pontos, ofertas e notificações.</small></div></header>
              <label><span>Conta a fundir nesta</span><select value={duplicateId} onChange={(event) => { setDuplicateId(event.target.value); setConfirmation(''); }}><option value="">Escolher conta duplicada…</option>{duplicates.map((user) => <option key={user.id} value={user.id}>{user.email || user.name || user.id}</option>)}</select></label>
              {duplicate && <div className="client-duplicate-summary"><strong>{duplicate.name || 'Conta sem nome'}</strong><span>{duplicate.email || duplicate.id}</span><small>{duplicateInsights?.allOrders.length ?? 0} encomendas · {Number(duplicate.loyaltyPoints ?? 0)} pontos · {euro.format(duplicateInsights?.totalSpent ?? 0)}</small></div>}
              {duplicate && <label><span>Escreva FUNDIR para confirmar</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>}
              <p>A conta antiga será arquivada, não apagada, para permitir auditoria e recuperação.</p>
              <button className="danger-button" disabled={!adminMutationsAvailable || busy !== null || !duplicate || confirmation.trim().toUpperCase() !== 'FUNDIR'}>{busy === 'merge' ? <Loader2 className="spin" /> : <Combine />} Confirmar fusão segura</button>
            </form>
          </div>
        </ClientSection>

        {!adminMutationsAvailable && <p className="safe-action-note">As ferramentas de gestão ficam disponíveis no site publicado.</p>}
        {notice && <p className="form-success client-action-message">{notice}</p>}
        {error && <p className="form-error client-action-message">{error}</p>}
      </div>
    </aside>
  </>;
}

function ClientSection({ icon, title, className = '', children }: { icon: React.ReactNode; title: string; className?: string; children: React.ReactNode }) {
  return <section className={`client-details-section ${className}`}><header>{icon}<h3>{title}</h3></header>{children}</section>;
}

function dateValue(value?: string) {
  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string) {
  const parsed = new Date(value ?? 0);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('pt-PT').format(parsed) : '—';
}

function statusClass(status: string) {
  return `status status-${String(status || 'pendente').toLocaleLowerCase('pt').replace(/\s/g, '-')}`;
}

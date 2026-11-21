import { AlertTriangle, CalendarCheck, CheckCircle2, CircleDollarSign, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { adminMutationsAvailable, confirmInventoryCashbackReceived } from './adminMutations';
import type { InventoryLot } from './adminTypes';

type CashbackFilter = 'PENDING' | 'OVERDUE' | 'RECEIVED' | 'REJECTED' | 'ALL';
type CashbackState = 'NONE' | 'PENDING' | 'RECEIVED' | 'REJECTED';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const shortDate = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short' });

const localIsoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateOnly = (value?: string) => String(value ?? '').slice(0, 10);

const formatDate = (value?: string) => {
  const normalized = dateOnly(value);
  if (!normalized) return '—';
  const parsed = new Date(`${normalized}T12:00:00`);
  return Number.isFinite(parsed.getTime()) ? shortDate.format(parsed) : '—';
};

const cashbackState = (lot: InventoryLot): CashbackState => {
  const state = String(lot.cashbackStatus ?? '').toUpperCase();
  if (state === 'NONE' || state === 'PENDING' || state === 'RECEIVED' || state === 'REJECTED') return state;
  return Number(lot.cashbackValue ?? 0) > 0 ? 'PENDING' : 'NONE';
};

const stateLabel: Record<CashbackState, string> = {
  NONE: 'Sem cashback',
  PENDING: 'Por receber',
  RECEIVED: 'Recebido',
  REJECTED: 'Recusado',
};

const filterOptions: Array<{ key: CashbackFilter; label: string }> = [
  { key: 'PENDING', label: 'Por receber' },
  { key: 'OVERDUE', label: 'Atrasados' },
  { key: 'RECEIVED', label: 'Recebidos' },
  { key: 'REJECTED', label: 'Recusados' },
  { key: 'ALL', label: 'Todos' },
];

export function AdminCashbackSection({ lots, onChanged }: {
  lots: InventoryLot[];
  onChanged: () => Promise<void> | void;
}) {
  const today = localIsoDate();
  const currentMonth = today.slice(0, 7);
  const [filter, setFilter] = useState<CashbackFilter>('PENDING');
  const [platform, setPlatform] = useState('ALL');
  const [search, setSearch] = useState('');
  const [receivedDates, setReceivedDates] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cashbackLots = useMemo(() => lots.filter((lot) => (
    Number(lot.cashbackValue ?? 0) > 0 && cashbackState(lot) !== 'NONE'
  )), [lots]);

  const pending = useMemo(() => cashbackLots.filter((lot) => cashbackState(lot) === 'PENDING'), [cashbackLots]);
  const overdue = useMemo(() => pending.filter((lot) => {
    const expected = dateOnly(lot.cashbackExpectedDate);
    return Boolean(expected && expected < today);
  }), [pending, today]);
  const totalPending = pending.reduce((sum, lot) => sum + Number(lot.cashbackValue ?? 0), 0);
  const receivedThisMonth = cashbackLots
    .filter((lot) => cashbackState(lot) === 'RECEIVED' && dateOnly(lot.cashbackPaidDate).slice(0, 7) === currentMonth)
    .reduce((sum, lot) => sum + Number(lot.cashbackValue ?? 0), 0);

  const platforms = useMemo(() => [...new Set(cashbackLots
    .map((lot) => String(lot.cashbackPlatform ?? '').trim() || 'Sem plataforma'))]
    .sort((left, right) => left.localeCompare(right, 'pt')), [cashbackLots]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt');
    return cashbackLots.filter((lot) => {
      const state = cashbackState(lot);
      const expected = dateOnly(lot.cashbackExpectedDate);
      const isOverdue = state === 'PENDING' && Boolean(expected && expected < today);
      const matchesState = filter === 'ALL'
        || (filter === 'OVERDUE' ? isOverdue : state === filter);
      const lotPlatform = String(lot.cashbackPlatform ?? '').trim() || 'Sem plataforma';
      const matchesPlatform = platform === 'ALL' || lotPlatform === platform;
      const haystack = `${lot.name} ${lot.variant ?? ''} ${lot.supplierName ?? ''} ${lot.supplierOrderId ?? ''} ${lotPlatform} ${lot.id}`.toLocaleLowerCase('pt');
      return matchesState && matchesPlatform && (!query || haystack.includes(query));
    }).sort((left, right) => {
      const leftOverdue = cashbackState(left) === 'PENDING' && Boolean(dateOnly(left.cashbackExpectedDate) && dateOnly(left.cashbackExpectedDate) < today);
      const rightOverdue = cashbackState(right) === 'PENDING' && Boolean(dateOnly(right.cashbackExpectedDate) && dateOnly(right.cashbackExpectedDate) < today);
      if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
      const leftExpected = dateOnly(left.cashbackExpectedDate) || '9999-12-31';
      const rightExpected = dateOnly(right.cashbackExpectedDate) || '9999-12-31';
      return leftExpected.localeCompare(rightExpected) || left.name.localeCompare(right.name, 'pt');
    });
  }, [cashbackLots, filter, platform, search, today]);

  const confirmReceived = async (lot: InventoryLot) => {
    const receivedDate = receivedDates[lot.id] || today;
    if (!receivedDate) { setError('Indique a data em que recebeu o cashback.'); return; }
    if (receivedDate > today) { setError('A data de receção não pode estar no futuro.'); return; }
    if (!window.confirm(`Confirmar a receção de ${euro.format(Number(lot.cashbackValue ?? 0))} para “${lot.name}” em ${formatDate(receivedDate)}?`)) return;

    setBusyId(lot.id); setError(null); setSuccess(null);
    try {
      await confirmInventoryCashbackReceived(lot.id, receivedDate);
      setSuccess(`Cashback de ${lot.name} marcado como recebido.`);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a receção do cashback.');
    } finally {
      setBusyId(null);
    }
  };

  return <div className="cashback-manager">
    <section className="cashback-manager-summary" aria-label="Resumo de cashback">
      <article><span className="cashback-manager-summary-icon amber"><CircleDollarSign /></span><small>Total por receber</small><strong>{euro.format(totalPending)}</strong><em>valor previsto nos lotes</em></article>
      <article><span className="cashback-manager-summary-icon blue"><Wallet /></span><small>Pendentes</small><strong>{pending.length}</strong><em>cashbacks por validar</em></article>
      <article className={overdue.length ? 'warning' : ''}><span className="cashback-manager-summary-icon red"><AlertTriangle /></span><small>Atrasados</small><strong>{overdue.length}</strong><em>{overdue.length ? 'previsão já ultrapassada' : 'nenhum valor vencido'}</em></article>
      <article><span className="cashback-manager-summary-icon green"><CalendarCheck /></span><small>Recebido este mês</small><strong>{euro.format(receivedThisMonth)}</strong><em>confirmado com data</em></article>
    </section>

    <section className="admin-table-card cashback-manager-card">
      <div className="table-heading cashback-manager-heading">
        <div><h2>Controlo de cashback</h2><p>Os lotes são a fonte oficial. Confirmar a receção atualiza o custo real usado nos relatórios.</p></div>
        <span>{visible.length} registos</span>
      </div>

      <div className="cashback-manager-toolbar">
        <label className="cashback-manager-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar produto, fornecedor ou pedido…" /></label>
        <label className="cashback-manager-platform"><span>Plataforma</span><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="ALL">Todas</option>{platforms.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
        <div className="cashback-manager-filters" aria-label="Filtrar por estado">{filterOptions.map((option) => <button type="button" key={option.key} className={filter === option.key ? 'active' : ''} aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}>{option.label}{option.key === 'OVERDUE' && overdue.length > 0 ? <b>{overdue.length}</b> : null}</button>)}</div>
      </div>

      {success && <p className="form-success cashback-manager-feedback" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" /> {success}</p>}
      {error && <p className="form-error cashback-manager-feedback" role="alert"><AlertTriangle aria-hidden="true" /> {error}</p>}
      {!adminMutationsAvailable && <p className="safe-action-note cashback-manager-feedback">A confirmação fica disponível no ambiente Vercel de testes.</p>}

      <div className="table-scroll cashback-manager-table-wrap">
        <table className="cashback-manager-table">
          <thead><tr><th>Produto / lote</th><th>Fornecedor</th><th>Plataforma</th><th>Previsão</th><th>Valor</th><th>Estado</th><th>Confirmar receção</th></tr></thead>
          <tbody>{visible.map((lot) => {
            const state = cashbackState(lot);
            const expected = dateOnly(lot.cashbackExpectedDate);
            const isOverdue = state === 'PENDING' && Boolean(expected && expected < today);
            const receivedDate = receivedDates[lot.id] || today;
            return <tr key={lot.id} className={isOverdue ? 'cashback-manager-row-overdue' : ''}>
              <td data-label="Produto / lote"><strong>{lot.name}</strong><small>{lot.variant || `Lote ${lot.id}`}</small></td>
              <td data-label="Fornecedor"><span>{lot.supplierName || '—'}</span><small>{lot.supplierOrderId || `Compra ${formatDate(lot.purchaseDate)}`}</small></td>
              <td data-label="Plataforma"><span className="cashback-manager-platform-pill">{lot.cashbackPlatform || 'Sem plataforma'}</span></td>
              <td data-label="Previsão"><strong className={isOverdue ? 'cashback-manager-overdue-date' : ''}>{formatDate(lot.cashbackExpectedDate)}</strong>{isOverdue && <small>Atrasado</small>}</td>
              <td data-label="Valor"><strong>{euro.format(Number(lot.cashbackValue ?? 0))}</strong><small>Total do lote</small></td>
              <td data-label="Estado"><span className={`cashback-manager-status ${state.toLocaleLowerCase('pt')}`}>{stateLabel[state]}</span>{state === 'RECEIVED' && <small>{formatDate(lot.cashbackPaidDate)}</small>}</td>
              <td data-label="Confirmar receção">{state === 'PENDING' ? <div className="cashback-manager-confirm"><input type="date" max={today} aria-label={`Data de receção do cashback de ${lot.name}`} value={receivedDate} disabled={busyId === lot.id} onChange={(event) => setReceivedDates((current) => ({ ...current, [lot.id]: event.target.value }))} /><button type="button" disabled={!adminMutationsAvailable || busyId !== null} onClick={() => void confirmReceived(lot)}><CheckCircle2 /> {busyId === lot.id ? 'A guardar…' : 'Confirmar'}</button></div> : <span className="cashback-manager-closed">{state === 'RECEIVED' ? 'Receção validada' : 'Sem ação pendente'}</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!visible.length && <p className="empty-inline spacious">Nenhum cashback corresponde aos filtros escolhidos.</p>}
    </section>
  </div>;
}

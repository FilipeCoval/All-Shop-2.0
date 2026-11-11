import { AlertTriangle, CalendarDays, CheckCircle2, Mail, MapPin, Package, Phone, RefreshCw, Save, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AdminOrder, InventoryLot, OrderStatus, StockGroup } from './adminTypes';
import type { Product } from '../../types/domain';
import { adminMutationsAvailable, classifyLegacyInventoryLots, confirmInventoryLotReceived, linkOrderToCustomerAccount, reviewOrderRequest, setOrderStatus, syncProductStock, updateOrderTracking } from './adminMutations';
import { OrderFulfillmentPanel } from './OrderFulfillmentPanel';
import { inventoryLotIncomingQuantity, inventoryLotPhysicalQuantity, inventoryLotSoldQuantity, isInventoryLotInTransit } from '../../domain/inventoryReceipt';
import { unitMatchesCode } from './unitIdentity';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (value?: string) => {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? date.format(parsed) : '—';
};

export function AdminDetails({ order, stock, lots, products, onClose, onChanged, onEditLot }: { order: AdminOrder | null; stock: StockGroup | null; lots: InventoryLot[]; products: Product[]; onClose: () => void; onChanged: () => Promise<void>; onEditLot: (lot: StockGroup['lotItems'][number]) => void }) {
  const open = Boolean(order || stock);
  return <>
    <button className={`drawer-backdrop ${open ? 'visible' : ''}`} onClick={onClose} aria-label="Fechar detalhes" />
    <aside className={`admin-detail-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header><div><p className="eyebrow">Detalhes</p><h2>{order ? `Encomenda #${order.id.replace(/^#/, '')}` : stock?.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
      {order && <OrderDetail order={order} lots={lots} onChanged={onChanged} />}
      {stock && <StockDetail group={stock} product={products.find((product) => product.id === Number(stock.productId))} onChanged={onChanged} onEditLot={onEditLot} />}
    </aside>
  </>;
}

const ORDER_STATUSES: OrderStatus[] = ['A confirmar', 'Pendente', 'Processamento', 'Pago', 'Enviado', 'Entregue', 'Cancelado', 'Reclamação', 'Devolvido', 'Levantamento em Loja'];

function OrderDetail({ order, lots, onChanged }: { order: AdminOrder; lots: InventoryLot[]; onChanged: () => Promise<void> }) {
  const customer = order.shippingInfo;
  const fulfillmentComplete = order.fulfillmentStatus === 'COMPLETED' || ['Enviado', 'Entregue'].includes(order.status);
  const terminal = ['Cancelado', 'Devolvido'].includes(order.status);
  const awaitingConfirmation = order.awaitingCustomerConfirmation === true || order.status === 'A confirmar';
  const displayedItems = order.packages?.length
    ? order.packages.flatMap((pkg, packageIndex) => (pkg.items ?? []).map((item) => ({ item, packageIndex })))
    : (order.items ?? []).map((item) => ({ item, packageIndex: -1 }));
  const displayedQuantity = displayedItems.reduce((sum, entry) => sum + Math.max(0, Number(entry.item.quantity ?? 0)), 0);
  const productRevenue = Math.max(0, Number(order.subtotal ?? (order.items ?? []).reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 1), 0)) - Number(order.discountValue ?? 0));
  const recordedCost = order.totalProductCost == null ? null : Math.max(0, Number(order.totalProductCost));
  const unitCodes = [...new Set([...(order.serialNumbersUsed ?? []), ...(order.items ?? []).flatMap((item) => item.unitIds ?? [])])];
  const cashbackReceived = unitCodes.reduce((sum, code) => {
    const lot = lots.find((item) => item.units?.some((unit) => unitMatchesCode(unit, code)));
    return sum + (lot?.cashbackStatus === 'RECEIVED' ? Math.max(0, Number(lot.cashbackValue ?? 0)) / Math.max(1, Number(lot.quantityBought ?? 1)) : 0);
  }, 0);
  const netProductCost = recordedCost == null ? null : Math.max(0, recordedCost - cashbackReceived);
  const pickup = customer?.deliveryMethod === 'Pickup' || order.status === 'Levantamento em Loja';
  const customerShipping = pickup ? 0 : Math.max(0, Number(order.shippingCost ?? Math.max(0, Number(order.total ?? 0) - productRevenue)));
  const storeShipping = pickup ? 0 : Math.max(0, Number(order.storeShippingCost ?? 5.4));
  const shippingExpense = Math.max(0, storeShipping - customerShipping);
  const profit = netProductCost == null ? null : productRevenue - netProductCost - shippingExpense;
  const pendingRequest = order.cancellationRequest?.status === 'Pendente' ? { label: 'Cancelamento', ...order.cancellationRequest } : order.returnRequest?.status === 'Pendente' ? { label: 'Devolução', ...order.returnRequest } : null;
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [packageTrackings, setPackageTrackings] = useState<string[]>(() => (order.packages ?? []).map((pkg) => pkg.trackingNumber ?? ''));
  const [accountEmail, setAccountEmail] = useState(customer?.email ?? '');
  const [accountLinked, setAccountLinked] = useState(Boolean(order.userId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setStatus(order.status); setTracking(order.trackingNumber ?? ''); setPackageTrackings((order.packages ?? []).map((pkg) => pkg.trackingNumber ?? '')); setAccountEmail(customer?.email ?? ''); setAccountLinked(Boolean(order.userId)); setMessage(null); setError(null); }, [order, customer?.email]);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); setMessage(success); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar.'); }
    finally { setBusy(false); }
  };

  const changeStatus = () => {
    if (terminal) return;
    if (status === 'Cancelado' && !window.confirm('Cancelar esta encomenda e repor o stock?')) return;
    void run(() => setOrderStatus(order.id, status), `Estado alterado para ${status}.`);
  };

  const linkCustomerAccount = () => {
    const email = accountEmail.trim().toLowerCase();
    if (!email) { setError('Indique o e-mail que o cliente usa para iniciar sessão.'); return; }
    void run(async () => {
      await linkOrderToCustomerAccount(order.id, email);
      setAccountLinked(true);
    }, 'Encomenda associada à conta. Na próxima abertura da Área de Cliente, a compra será apresentada.');
  };

  return <div className="detail-body">
    <div className="detail-status"><span className={`status status-${order.status.toLocaleLowerCase('pt').replace(/\s/g, '-')}`}>{order.status}</span><strong>{euro.format(Number(order.total ?? 0))}</strong></div>
    <DetailSection title={order.status === 'Entregue' ? 'Resultado desta encomenda' : 'Resultado previsto'}>
      {profit == null ? <p className="order-financial-pending">O custo final é confirmado quando a encomenda é expedida/levantada. Depois de entregue, este resumo passa a refletir o valor usado nos relatórios.</p> : <><div className="order-financials"><span><small>Receita dos artigos</small><strong>{euro.format(productRevenue)}</strong></span><span><small>Custo dos produtos</small><strong>{euro.format(netProductCost ?? 0)}</strong></span>{!pickup && <span><small>Portes suportados</small><strong>{euro.format(shippingExpense)}</strong></span>}<span className={profit < 0 ? 'negative' : ''}><small>Lucro líquido</small><strong>{euro.format(profit)}</strong></span></div>{cashbackReceived > 0 && <p className="order-financial-note">Inclui {euro.format(cashbackReceived)} de cashback já recebido.</p>}{order.status !== 'Entregue' && <p className="order-financial-note">Este é o valor previsto; entra no relatório financeiro quando a encomenda for marcada como entregue.</p>}</>}
    </DetailSection>
    {pendingRequest && <section className="request-alert"><AlertTriangle /><div><strong>Pedido de {pendingRequest.label} pendente</strong><p>{pendingRequest.reason ?? 'Sem motivo indicado.'}</p></div></section>}
    {awaitingConfirmation && <section className="request-alert"><AlertTriangle /><div><strong>Aguarda confirmação do cliente</strong><p>A mensagem foi preparada/enviada pelo cliente, mas ainda não há pagamento nem baixa de stock. A encomenda só passa a processamento quando o cliente a confirma.</p></div></section>}
    {!terminal && !awaitingConfirmation && <DetailSection title="Baixa e expedição"><OrderFulfillmentPanel order={order} lots={lots} onChanged={onChanged} /></DetailSection>}
    <DetailSection title="Gestão da encomenda">
      <div className="admin-form-row"><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)} disabled={!adminMutationsAvailable || busy || terminal || awaitingConfirmation}>{ORDER_STATUSES.map((item) => <option key={item} disabled={!fulfillmentComplete && (item === 'Enviado' || item === 'Entregue')}>{item}</option>)}</select></label><button className="save-button" onClick={changeStatus} disabled={!adminMutationsAvailable || busy || terminal || awaitingConfirmation || status === order.status}><Save /> Guardar estado</button></div>
      {order.packages?.length ? <div className="admin-form-row"><div className="package-tracking-fields">{order.packages.map((pkg, index) => <label key={pkg.id || index}>Rastreio do volume {index + 1}<input value={packageTrackings[index] ?? ''} onChange={(event) => setPackageTrackings((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} disabled={!adminMutationsAvailable || busy || terminal || awaitingConfirmation} placeholder="Código de rastreio" /></label>)}</div><button className="save-button secondary" onClick={() => void run(() => updateOrderTracking(order.id, '', packageTrackings), 'Rastreios atualizados.')} disabled={!adminMutationsAvailable || busy || terminal || awaitingConfirmation || packageTrackings.every((value, index) => value === (order.packages?.[index]?.trackingNumber ?? ''))}><Save /> Guardar rastreios</button></div> : <div className="admin-form-row"><label>Rastreio<input value={tracking} onChange={(event) => setTracking(event.target.value)} disabled={!adminMutationsAvailable || busy || terminal || awaitingConfirmation} placeholder="Código de rastreio" /></label><button className="save-button secondary" onClick={() => void run(() => updateOrderTracking(order.id, tracking), 'Rastreio atualizado.')} disabled={!adminMutationsAvailable || busy || terminal || awaitingConfirmation || tracking === (order.trackingNumber ?? '')}><Save /> Guardar rastreio</button></div>}
      {pendingRequest && <div className="review-actions"><button disabled={!adminMutationsAvailable || busy} onClick={() => void run(() => reviewOrderRequest(order.id, pendingRequest.label === 'Cancelamento' ? 'cancellation' : 'return', 'approve'), 'Pedido aprovado.')}>Aprovar pedido</button><button disabled={!adminMutationsAvailable || busy} onClick={() => void run(() => reviewOrderRequest(order.id, pendingRequest.label === 'Cancelamento' ? 'cancellation' : 'return', 'reject'), 'Pedido recusado.')}>Recusar</button></div>}
      {message && <p className="form-success">{message}</p>}{error && <p className="form-error">{error}</p>}
    </DetailSection>
    <DetailSection title="Cliente"><div className="contact-list"><span><Mail />{customer?.email ?? '—'}</span><span><Phone />{customer?.phone ?? '—'}</span><span><MapPin />{customer?.deliveryMethod === 'Pickup' ? 'Levantamento em loja' : [customer?.street, customer?.doorNumber, customer?.zip, customer?.city].filter(Boolean).join(', ') || '—'}</span></div>{accountLinked ? <p className="account-link-status"><CheckCircle2 /> Compra associada a uma conta de cliente.</p> : <div className="account-link-panel"><div><strong>Associar à conta do cliente</strong><p>Use o e-mail com que o cliente inicia sessão. Isto apenas liga a encomenda; não mexe no stock, valor ou estado.</p></div><div className="admin-form-row"><label>E-mail da conta<input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} disabled={!adminMutationsAvailable || busy} placeholder="cliente@email.pt" /></label><button className="save-button secondary" type="button" onClick={linkCustomerAccount} disabled={!adminMutationsAvailable || busy || !accountEmail.trim()}><Save /> Associar conta</button></div></div>}</DetailSection>
    <DetailSection title={`Artigos (${displayedQuantity})`}><div className="detail-items">{displayedItems.map(({ item, packageIndex }, index) => <article key={`${packageIndex}:${item.productId}:${item.selectedVariant}:${index}`}><div>{item.image ? <img src={item.image} alt="" /> : <span className="item-placeholder"><Package /></span>}</div><span><strong>{item.quantity ?? 0}× {item.name ?? `Produto ${item.productId ?? ''}`}</strong><small>{packageIndex >= 0 ? `Volume ${packageIndex + 1} · ` : ''}{item.selectedVariant || 'Sem variante'}</small></span><b>{euro.format(Number(item.price ?? 0) * Number(item.quantity ?? 0))}</b></article>)}</div></DetailSection>
    <DetailSection title="Entrega e pagamento"><div className="contact-list"><span><Truck />{customer?.deliveryMethod === 'Pickup' ? 'Levantamento' : 'Envio'} · {customer?.paymentMethod ?? '—'}</span>{order.packages?.length ? order.packages.map((pkg, index) => <span key={pkg.id || index}><Package />Volume {index + 1}: {pkg.trackingNumber || 'rastreio por indicar'}</span>) : order.trackingNumber && <span><Package />Rastreio: {order.trackingNumber}</span>}</div></DetailSection>
    <DetailSection title="Histórico"><div className="timeline">{(order.statusHistory ?? []).slice().reverse().map((entry, index) => <div key={`${entry.date}:${index}`}><i /><span><strong>{entry.status ?? 'Atualização'}</strong><small>{formatDate(entry.date)}{entry.notes ? ` · ${entry.notes}` : ''}</small></span></div>)}</div></DetailSection>
    {!adminMutationsAvailable && <div className="safe-action-note">Os botões ficam disponíveis na versão Vercel de testes, onde existe um servidor protegido.</div>}
  </div>;
}

type StockLotFilter = 'all' | 'available' | 'incoming' | 'sold' | 'empty';

function StockDetail({ group, product, onChanged, onEditLot }: { group: StockGroup; product?: Product; onChanged: () => Promise<void>; onEditLot: (lot: StockGroup['lotItems'][number]) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [legacyVariant, setLegacyVariant] = useState('');
  const [receivingLotId, setReceivingLotId] = useState<string | null>(null);
  const [lotFilter, setLotFilter] = useState<StockLotFilter>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publicProductId = Number(group.productId);
  const storeNeedsSync = Number.isInteger(publicProductId) && publicProductId > 0 && group.published !== group.available;
  const legacyLots = group.lotItems.filter((lot) => !String(lot.variant ?? '').trim());
  const catalogVariants = product?.variants ?? [];
  const lotMatchesFilter = (lot: InventoryLot, filter: StockLotFilter) => {
    if (filter === 'available') return !isInventoryLotInTransit(lot) && inventoryLotPhysicalQuantity(lot) > 0;
    if (filter === 'incoming') return isInventoryLotInTransit(lot) && inventoryLotIncomingQuantity(lot) > 0;
    if (filter === 'sold') return inventoryLotSoldQuantity(lot) > 0;
    if (filter === 'empty') return !isInventoryLotInTransit(lot) && inventoryLotPhysicalQuantity(lot) === 0;
    return true;
  };
  const filteredLotItems = group.lotItems.filter((lot) => lotMatchesFilter(lot, lotFilter));
  const lotFilters: Array<{ value: StockLotFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'available', label: 'Disponíveis' },
    { value: 'incoming', label: 'A caminho' },
    { value: 'sold', label: 'Com vendas' },
    { value: 'empty', label: 'Sem stock' },
  ];

  useEffect(() => {
    setMessage(null);
    setError(null);
    setLegacyVariant('');
    setLotFilter('all');
  }, [group.productId]);

  const syncStore = async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      await syncProductStock(publicProductId);
      await onChanged();
      setMessage(`Loja sincronizada: ${group.available} ${group.available === 1 ? 'unidade disponível' : 'unidades disponíveis'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar o stock da loja.');
    } finally {
      setSyncing(false);
    }
  };

  const receiveLot = async (lot: InventoryLot) => {
    if (!lot.publicProductId || !window.confirm(`Confirmar que recebeu ${lot.quantityBought} unidade(s) de “${lot.name}”?`)) return;
    setReceivingLotId(lot.id); setMessage(null); setError(null);
    try {
      await confirmInventoryLotReceived(lot.id, lot.publicProductId);
      await onChanged();
      setMessage('Receção confirmada. O stock da loja foi recalculado automaticamente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a receção do lote.');
    } finally {
      setReceivingLotId(null);
    }
  };

  const classifyLegacyLots = async () => {
    if (!legacyVariant || !legacyLots.length || !Number.isInteger(publicProductId) || publicProductId <= 0) return;
    if (!window.confirm(`Classificar definitivamente ${legacyLots.length} lote(s) antigo(s) de “${group.name}” como “${legacyVariant}”? Os S/N, vendas, quantidades, custos e histórico serão preservados.`)) return;
    setClassifying(true); setMessage(null); setError(null);
    try {
      const result = await classifyLegacyInventoryLots(publicProductId, legacyVariant) as { updatedLots?: number };
      await onChanged();
      setMessage(`${Number(result.updatedLots ?? legacyLots.length)} lote(s) classificado(s) como “${legacyVariant}”. O stock de cada versão foi recalculado.`);
      setLegacyVariant('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível classificar os lotes antigos.');
    } finally {
      setClassifying(false);
    }
  };

  return <div className="detail-body">
    <div className="stock-detail-kpis"><span><small>Físico</small><strong>{group.physical}</strong></span><span><small>A caminho</small><strong>{group.incoming}</strong></span><span><small>Reservado</small><strong>{group.reserved}</strong></span><span><small>Disponível</small><strong>{group.available}</strong></span><span><small>Loja</small><strong>{group.published}</strong></span></div>
    {group.warnings.length > 0 && <section className="request-alert"><AlertTriangle /><div><strong>Dados a verificar</strong>{group.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></section>}
    {legacyLots.length > 0 && catalogVariants.length > 0 && <section className="legacy-variant-panel">
      <div><strong>Classificar stock antigo</strong><p>{legacyLots.length} lote(s) ainda estão “Sem variante”. Escolha a versão correta uma única vez; nenhum S/N, venda, quantidade, custo ou histórico será alterado.</p></div>
      <div className="legacy-variant-actions"><select aria-label="Versão dos lotes antigos" value={legacyVariant} onChange={(event) => setLegacyVariant(event.target.value)}><option value="">Escolher versão</option>{catalogVariants.map((variant) => <option key={variant.name} value={variant.name}>{variant.name}</option>)}</select><button className="save-button" type="button" onClick={() => void classifyLegacyLots()} disabled={!adminMutationsAvailable || classifying || !legacyVariant}>{classifying ? 'A classificar…' : `Aplicar aos ${legacyLots.length} lotes`}</button></div>
    </section>}
    {storeNeedsSync && <section className="stock-sync-panel">
      <div><strong>O catálogo está desatualizado</strong><p>Esta ação publica o valor calculado pelos lotes e reservas. Não altera nem apaga S/N.</p></div>
      <button className="save-button" type="button" onClick={() => void syncStore()} disabled={!adminMutationsAvailable || syncing}>
        <RefreshCw className={syncing ? 'spin' : ''} /> {syncing ? 'A sincronizar…' : 'Sincronizar loja'}
      </button>
    </section>}
    {message && <p className="form-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <DetailSection title={lotFilter === 'all' ? `Lotes (${group.lots})` : `Lotes (${filteredLotItems.length} de ${group.lots})`}>
      <div className="lot-filters" aria-label="Filtrar lotes por estado">{lotFilters.map((filter) => <button key={filter.value} type="button" className={lotFilter === filter.value ? 'active' : ''} aria-pressed={lotFilter === filter.value} onClick={() => setLotFilter(filter.value)}>{filter.label}<span>{group.lotItems.filter((lot) => lotMatchesFilter(lot, filter.value)).length}</span></button>)}</div>
      {filteredLotItems.length === 0 && <p className="lot-filter-empty">Não existem lotes neste estado.</p>}
      <div className="lot-list">{filteredLotItems.map((lot) => {
      const inTransit = isInventoryLotInTransit(lot);
      return <article key={lot.id} className={inTransit ? 'lot-in-transit' : ''}><header><span><strong>{lot.variant || 'Sem variante'}</strong><small>{lot.supplierName || 'Fornecedor não indicado'}</small></span><div className="lot-heading-actions"><b className={inTransit ? 'incoming' : ''}>{inTransit ? `${inventoryLotIncomingQuantity(lot)} a caminho` : `${inventoryLotPhysicalQuantity(lot)} disponíveis fisicamente`}</b>{inTransit && <button className="receive-lot-button compact" onClick={() => void receiveLot(lot)} disabled={!adminMutationsAvailable || receivingLotId !== null}><CheckCircle2 /> {receivingLotId === lot.id ? 'A confirmar…' : 'Confirmar receção'}</button>}<button className="table-action" onClick={() => onEditLot(lot)}>Editar</button></div></header><div><span><CalendarDays />Compra: {lot.purchaseDate ? formatDate(lot.purchaseDate) : 'sem data'}</span>{inTransit && <span><Truck />Previsão: {lot.expectedArrivalDate ? formatDate(lot.expectedArrivalDate) : 'não indicada'}</span>}<span>Comprado: {lot.quantityBought}</span><span>Vendido: {inventoryLotSoldQuantity(lot)}</span><span>Unidades: {lot.units?.length ?? 0}</span></div><small className="lot-id">Lote {lot.id}</small></article>;
    })}</div></DetailSection>
    <div className="safe-action-note">Criar, editar e apagar lotes será feito pelo servidor com sincronização automática da loja.</div>
  </div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}

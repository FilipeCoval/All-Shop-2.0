import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, PackagePlus, PackageSearch, Pencil, Plus, ShoppingBag, Sparkles, TrendingUp, UsersRound } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Product } from '../../types/domain';
import type { AdminCoupon, AdminOrder, AdminUser, ImportShipment, ProductRequest, StockGroup, StoreCategory, SupportTicket } from './adminTypes';
import { unitMatchesCode } from './unitIdentity';
import { normalizeProductAvailabilityMode } from '../../domain/productAvailability';
import { catalogContentIssues } from '../../domain/catalogContentHealth';
import { buildReportTimeline, type ReportTimelinePoint } from './reportTimeline';

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const shortDate = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short' });
const safeDate = (value?: string | { seconds?: number; toDate?: () => Date }) => {
  if (!value) return '—';
  const parsed = typeof value === 'string' ? new Date(value) : typeof value.toDate === 'function' ? value.toDate() : new Date(Number(value.seconds ?? 0) * 1000);
  return Number.isFinite(parsed.getTime()) ? shortDate.format(parsed) : '—';
};
const statusClass = (status = '') => `status status-${status.toLocaleLowerCase('pt').replace(/\s/g, '-')}`;
const availabilityLabel = (product: Product) => ({ AUTO: 'Automático', AVAILABLE: 'Disponível', COMING_SOON: 'Em breve', OUT_OF_STOCK: 'Esgotado' }[normalizeProductAvailabilityMode(product)]);

function ReportTimelineTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload?: ReportTimelinePoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="report-chart-tooltip">
    <strong>{point.label}</strong>
    <span><i className="revenue-dot" /> Receita <b>{euro.format(point.revenue)}</b></span>
    <span><i className={point.profit < 0 ? 'loss-dot' : 'profit-dot'} /> Lucro <b>{euro.format(point.profit)}</b></span>
    <small>{point.orders} encomenda{point.orders === 1 ? '' : 's'} entregue{point.orders === 1 ? '' : 's'}</small>
  </div>;
}

export function ProductsSection({ products, groups, search, reviewingContent, onReviewContent, onCreateProduct, onEditProduct, onCreateLot, onOpenStock }: {
  products: Product[];
  groups: StockGroup[];
  search: string;
  reviewingContent: boolean;
  onReviewContent: () => void;
  onCreateProduct: () => void;
  onEditProduct: (product: Product) => void;
  onCreateLot: (productId?: number) => void;
  onOpenStock: (group: StockGroup) => void;
}) {
  const query = search.toLocaleLowerCase('pt');
  const visible = products.filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase('pt').includes(query));
  const groupFor = (product: Product) => groups.find((group) => group.productId === product.id);
  const available = groups.reduce((sum, group) => sum + group.available, 0);
  const incoming = groups.reduce((sum, group) => sum + group.incoming, 0);
  const attention = groups.filter((group) => group.warnings.length).length;
  const contentAttention = products.filter((product) => catalogContentIssues(product).length).length;
  return <div className="products-workspace">
    <section className="products-summary">
      <div><small>Produtos</small><strong>{products.length}</strong><span>{products.filter((item) => !item.isPrivate).length} publicados</span></div>
      <div><small>Disponível / a caminho</small><strong>{available} <em>+ {incoming}</em></strong><span>{available} para venda · {incoming} por receber</span></div>
      <div className={attention || contentAttention ? 'needs-attention' : ''}><small>A verificar</small><strong>{attention + contentAttention}</strong><span>{attention ? `${attention} no inventário · ${contentAttention} no conteúdo` : contentAttention ? `${contentAttention} fichas de produto a melhorar` : 'inventário e conteúdo consistentes'}</span></div>
      <div className="products-primary-actions"><button onClick={onCreateProduct}><Plus /> Novo produto</button><button onClick={() => onCreateLot()}><PackagePlus /> Entrada de stock</button><button className="catalog-review-action" onClick={onReviewContent} disabled={reviewingContent}><Sparkles /> {reviewingContent ? 'A rever…' : 'Rever fichas'}</button></div>
    </section>
    <TableCard title="Produtos e inventário" description="Preço, descrição, variantes e lotes organizados por produto — sem caminhos duplicados." count={`${visible.length} produtos`}>
      <table className="products-table"><colgroup><col className="product-col" /><col className="price-col" /><col className="number-col" /><col className="number-col" /><col className="number-col" /><col className="state-col" /><col className="actions-col" /></colgroup><thead><tr><th>Produto</th><th>Preço e opções</th><th>Físico</th><th>Reserva</th><th>Livre</th><th>Estado</th><th>Ações</th></tr></thead>
        <tbody>{visible.map((product) => { const group = groupFor(product); const contentIssues = catalogContentIssues(product); return <tr key={product.id}>
          <td><div className="product-cell"><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.category} · ID {product.id}</small>{contentIssues.length ? <button type="button" className="catalog-content-warning" onClick={() => onEditProduct(product)} title={contentIssues.map((issue) => issue.label).join('\n')}>{contentIssues.length} melhoria{contentIssues.length === 1 ? '' : 's'} no conteúdo</button> : <em className="catalog-content-ok">Conteúdo completo</em>}</span></div></td>
          <td><strong>{euro.format(product.price)}</strong><small>{product.variants?.length ? `${product.variants.length} opções: ${product.variants.map((item) => item.name).join(' · ')}` : 'Sem variantes'}</small></td>
          <td>{group?.physical ?? 0}</td><td>{group?.reserved ?? 0}</td><td><b className="number-good">{group?.available ?? 0}</b></td>
          <td>{group?.warnings.length ? <button className="warning-pill workspace-status" onClick={() => group && onOpenStock(group)} title={group.warnings.join('\n')}><AlertTriangle /> Verificar</button> : <span className={product.isPrivate ? 'neutral-pill' : normalizeProductAvailabilityMode(product) === 'OUT_OF_STOCK' ? 'warning-pill' : 'ok-pill'}>{product.isPrivate ? 'Privado' : availabilityLabel(product)}</span>}</td>
          <td><div className="product-row-actions"><button onClick={() => onEditProduct(product)} title="Gerir produto"><Pencil /> Gerir</button><button onClick={() => onCreateLot(product.id)} title="Adicionar lote"><PackagePlus /> Lote</button>{group && <button onClick={() => onOpenStock(group)} title="Ver stock"><PackageSearch /> Stock</button>}</div></td>
        </tr>; })}</tbody>
      </table>
    </TableCard>
  </div>;
}

export function CatalogSection({ products, search, onCreate, onEdit }: { products: Product[]; search: string; onCreate: () => void; onEdit: (product: Product) => void }) {
  const visible = products.filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  return <TableCard title="Catálogo da loja" description="Conteúdo público, preços, variantes e estado de publicação." count={`${visible.length} produtos`} action={<button className="heading-action" onClick={onCreate}>Novo produto</button>}>
    <table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Variantes</th><th>Stock publicado</th><th>Visibilidade</th><th></th></tr></thead>
      <tbody>{visible.map((product) => <tr key={product.id}>
        <td><div className="product-cell"><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>ID {product.id}</small></span></div></td>
        <td>{product.category}</td><td><strong>{euro.format(product.price)}</strong></td>
        <td>{product.variants?.length ?? 0}</td><td>{product.variants?.length ? product.variants.reduce((sum, item) => sum + Number(item.stock ?? 0), 0) : product.stock}</td>
        <td><span className={product.isPrivate || normalizeProductAvailabilityMode(product) === 'OUT_OF_STOCK' ? 'warning-pill' : 'ok-pill'}>{product.isPrivate ? 'Privado' : availabilityLabel(product)}</span></td><td><button className="table-action" onClick={() => onEdit(product)}>Editar</button></td>
      </tr>)}</tbody>
    </table>
  </TableCard>;
}

export function StockSection({ groups, search, onOpen, onCreate }: { groups: StockGroup[]; search: string; onOpen: (group: StockGroup) => void; onCreate: () => void }) {
  const visible = groups.filter((group) => group.name.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  return <TableCard title="Produtos e inventário" description="O físico vem dos lotes; o disponível desconta reservas ativas." count={`${visible.length} produtos`} action={<button className="heading-action" onClick={onCreate}>Novo lote</button>}>
    <table><thead><tr><th>Produto</th><th>Lotes</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Loja</th><th>Estado</th><th></th></tr></thead>
      <tbody>{visible.map((group) => <tr key={`${group.productId}:${group.name}`}>
        <td><strong>{group.name}</strong><small>{group.variants.length ? group.variants.join(' · ') : 'Sem variantes'}</small></td>
        <td>{group.lots}</td><td>{group.physical}</td><td>{group.reserved}</td><td><b className="number-good">{group.available}</b></td><td>{group.published}</td>
        <td>{group.warnings.length ? <span className="warning-pill" title={group.warnings.join('\n')}><AlertTriangle /> Verificar</span> : <span className="ok-pill"><CheckCircle2 /> Certo</span>}</td><td><button className="table-action" onClick={() => onOpen(group)}>Abrir</button></td>
      </tr>)}</tbody>
    </table>
  </TableCard>;
}

export function OrdersSection({ orders, search, onOpen }: { orders: AdminOrder[]; search: string; onOpen: (order: AdminOrder) => void }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'pending' | 'registered' | 'legacy'>('all');
  const [requestFilter, setRequestFilter] = useState<'all' | 'cancellation' | 'return'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const now = new Date();
  const searchQuery = search.toLocaleLowerCase('pt');
  const statusOptions = Array.from(new Set(orders.map((order) => order.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt'));
  const activeOrders = orders.filter((order) => ['A confirmar', 'Pendente', 'Processamento', 'Pago'].includes(order.status)).length;
  const pendingStock = orders.filter((order) => order.stockDeducted === false && !order.awaitingCustomerConfirmation && order.status !== 'A confirmar').length;
  const pendingRequests = orders.filter((order) => order.cancellationRequest?.status === 'Pendente' || order.returnRequest?.status === 'Pendente').length;
  const visible = orders.filter((order) => {
    const textMatches = `${order.id} ${order.shippingInfo?.name ?? ''} ${order.shippingInfo?.email ?? ''}`.toLocaleLowerCase('pt').includes(searchQuery);
    const statusMatches = statusFilter === 'all' || (statusFilter === 'active' ? ['A confirmar', 'Pendente', 'Processamento', 'Pago'].includes(order.status) : order.status === statusFilter);
    const stockMatches = stockFilter === 'all' || (stockFilter === 'pending' ? order.stockDeducted === false && !order.awaitingCustomerConfirmation && order.status !== 'A confirmar' : stockFilter === 'registered' ? order.stockDeducted === true : typeof order.stockDeducted === 'undefined');
    const requestMatches = requestFilter === 'all' || (requestFilter === 'cancellation' ? order.cancellationRequest?.status === 'Pendente' : order.returnRequest?.status === 'Pendente');
    const date = order.date ? new Date(order.date) : null;
    const dateMatches = dateFilter === 'all' || (date && Number.isFinite(date.getTime()) && (dateFilter === 'today'
      ? date.toDateString() === now.toDateString()
      : dateFilter === 'week'
        ? date.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000
        : date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()));
    return textMatches && statusMatches && stockMatches && requestMatches && Boolean(dateMatches);
  });
  const filtersActive = statusFilter !== 'all' || stockFilter !== 'all' || requestFilter !== 'all' || dateFilter !== 'all';
  const resetFilters = () => { setStatusFilter('all'); setStockFilter('all'); setRequestFilter('all'); setDateFilter('all'); };
  return <TableCard title="Encomendas" description="Estados e stock serão alterados apenas pelo servidor protegido." count={`${visible.length} encomendas`}>
    <div className="orders-toolbar" aria-label="Filtros de encomendas">
      <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os estados</option><option value="active">Por tratar ({activeOrders})</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label>Stock<select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}><option value="all">Todo o stock</option><option value="pending">Baixa pendente ({pendingStock})</option><option value="registered">Baixa registada</option><option value="legacy">Histórico antigo</option></select></label>
      <label>Pedido<select value={requestFilter} onChange={(event) => setRequestFilter(event.target.value as typeof requestFilter)}><option value="all">Todos os pedidos</option><option value="cancellation">Cancelamentos pendentes ({orders.filter((order) => order.cancellationRequest?.status === 'Pendente').length})</option><option value="return">Devoluções pendentes ({orders.filter((order) => order.returnRequest?.status === 'Pendente').length})</option></select></label>
      <label>Período<select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}><option value="all">Todas as datas</option><option value="today">Hoje</option><option value="week">Últimos 7 dias</option><option value="month">Este mês</option></select></label>
      {filtersActive && <button type="button" className="orders-filter-reset" onClick={resetFilters}>Limpar filtros</button>}
      {pendingRequests > 0 && <span className="orders-filter-note">{pendingRequests} pedido{pendingRequests === 1 ? '' : 's'} a tratar</span>}
    </div>
    <table><thead><tr><th>Encomenda</th><th>Cliente</th><th>Data</th><th>Total</th><th>Estado</th><th>Stock</th><th>Pedidos</th><th></th></tr></thead>
      <tbody>{visible.map((order) => <tr key={order.id}>
        <td><strong>#{order.id.replace(/^#/, '')}</strong></td><td><strong>{order.shippingInfo?.name ?? 'Cliente'}</strong><small>{order.shippingInfo?.email ?? '—'}</small></td>
        <td>{safeDate(order.date)}</td><td><strong>{euro.format(Number(order.total ?? 0))}</strong></td><td><span className={statusClass(order.status)}>{order.status}</span></td>
        <td>{order.awaitingCustomerConfirmation || order.status === 'A confirmar' ? 'Sem reserva' : order.stockDeducted === true ? 'Registado' : order.stockDeducted === false ? 'Pendente' : 'Antigo'}</td>
        <td>{order.cancellationRequest?.status === 'Pendente' ? <span className="warning-pill">Cancelamento</span> : order.returnRequest?.status === 'Pendente' ? <span className="warning-pill">Devolução</span> : '—'}</td><td><button className="table-action" onClick={() => onOpen(order)}>Abrir</button></td>
      </tr>)}{visible.length === 0 && <tr><td className="orders-empty" colSpan={8}>Não existem encomendas com estes filtros.</td></tr>}</tbody>
    </table>
  </TableCard>;
}

export function ClientsSection({ users, search, onOpen }: { users: AdminUser[]; search: string; onOpen: (user: AdminUser) => void }) {
  const visible = users.filter((user) => !user.isMerged && `${user.name ?? ''} ${user.email ?? ''} ${user.phone ?? ''}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  return <TableCard title="Clientes" description="Contas, pontos e histórico comercial." count={`${visible.length} clientes`}>
    <table><thead><tr><th>Cliente</th><th>Contacto</th><th>Nível</th><th>AllPoints</th><th>Total gasto</th><th>Tipo</th><th></th></tr></thead>
      <tbody>{visible.map((user) => <tr key={user.id}><td><strong>{user.name ?? 'Sem nome'}</strong><small>{user.email ?? '—'}</small></td><td>{user.phone ?? '—'}</td><td>{user.tier ?? 'Bronze'}</td><td>{Number(user.loyaltyPoints ?? 0)}</td><td>{euro.format(Number(user.totalSpent ?? 0))}</td><td>{user.isGuest ? 'Convidado' : 'Conta'}</td><td><button className="table-action" onClick={() => onOpen(user)}>Gerir</button></td></tr>)}</tbody>
    </table>
  </TableCard>;
}

export function CouponsSection({ coupons, products, search, onCreate, onEdit }: { coupons: AdminCoupon[]; products: Product[]; search: string; onCreate: () => void; onEdit: (coupon: AdminCoupon) => void }) {
  const visible = coupons.filter((coupon) => String(coupon.code ?? '').toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  return <TableCard title="Cupões" description="Campanhas, utilização e limites." count={`${visible.length} cupões`} action={<button className="heading-action" onClick={onCreate}>Novo cupão</button>}>
    <table><thead><tr><th>Código</th><th>Desconto</th><th>Aplicação</th><th>Compra mínima</th><th>Utilizações</th><th>Estado</th><th></th></tr></thead>
      <tbody>{visible.map((coupon) => { const product = coupon.validProductId ? products.find((item) => Number(item.id) === Number(coupon.validProductId)) : null; return <tr key={coupon.id}><td><strong>{coupon.code ?? '—'}</strong></td><td>{coupon.type === 'PERCENTAGE' ? `${Number(coupon.value ?? 0)}%${coupon.maxDiscount ? ` (máx. ${euro.format(coupon.maxDiscount)})` : ''}` : euro.format(Number(coupon.value ?? 0))}</td><td>{product?.name ?? (coupon.validProductId ? `Produto ${coupon.validProductId}` : 'Toda a loja')}</td><td>{euro.format(Number(coupon.minPurchase ?? 0))}</td><td>{Number(coupon.usageCount ?? 0)}{coupon.maxUsages ? ` / ${coupon.maxUsages}` : ''}</td><td><span className={coupon.isActive ? 'ok-pill' : 'warning-pill'}>{coupon.isActive ? 'Ativo' : 'Inativo'}</span></td><td><button className="table-action" onClick={() => onEdit(coupon)}>Editar</button></td></tr>; })}</tbody>
    </table>
  </TableCard>;
}

export function SupportSection({ tickets, requests, search, onTicket, onRequest }: { tickets: SupportTicket[]; requests: ProductRequest[]; search: string; onTicket: (ticket: SupportTicket) => void; onRequest: (request: ProductRequest) => void }) {
  const visibleTickets = tickets.filter((ticket) => `${ticket.subject ?? ''} ${ticket.customerName ?? ''} ${ticket.customerEmail ?? ''}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  const visibleRequests = requests.filter((request) => `${request.productName ?? ''} ${request.userEmail ?? ''} ${request.category ?? ''} ${request.urgency ?? ''} ${request.budgetRange ?? ''}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  return <div className="stacked-tables">
    <TableCard title="Suporte" description="Conversas e pedidos de assistência." count={`${visibleTickets.length} tickets`}><table><thead><tr><th>Assunto</th><th>Cliente</th><th>Categoria</th><th>Prioridade</th><th>Estado</th><th>Atualizado</th><th></th></tr></thead><tbody>{visibleTickets.map((ticket) => <tr key={ticket.id}><td><strong>{ticket.subject ?? 'Sem assunto'}</strong>{ticket.unreadAdmin && <small className="unread-note">Nova mensagem</small>}</td><td>{ticket.customerName ?? ticket.customerEmail ?? '—'}</td><td>{ticket.category ?? '—'}</td><td>{ticket.priority ?? '—'}</td><td><span className={statusClass(ticket.status)}>{ticket.status ?? 'Aberto'}</span></td><td>{safeDate(ticket.updatedAt)}</td><td><button className="table-action" onClick={() => onTicket(ticket)}>Gerir</button></td></tr>)}</tbody></table></TableCard>
    <TableCard title="Pedidos de produtos" description="Produtos procurados pelos clientes." count={`${visibleRequests.length} pedidos`}><table><thead><tr><th>Produto</th><th>Cliente</th><th>Categoria</th><th>Orçamento</th><th>Urgência</th><th>Estado</th><th>Data</th><th></th></tr></thead><tbody>{visibleRequests.map((request) => <tr key={request.id}><td><strong>{request.productName ?? '—'}</strong>{request.photos?.length ? <small>{request.photos.length} fotografia(s)</small> : null}</td><td>{request.userEmail ?? '—'}</td><td>{request.category ?? '—'}</td><td>{request.budgetRange ?? '—'}</td><td>{request.urgency ?? '—'}</td><td><span className={statusClass(request.status)}>{request.status ?? 'Análise'}</span>{request.userDecision && <small>Cliente: {request.userDecision}</small>}</td><td>{safeDate(request.createdAt)}</td><td><button className="table-action" onClick={() => onRequest(request)}>Gerir</button></td></tr>)}</tbody></table></TableCard>
  </div>;
}

export function ImportsSection({ shipments, search, onOpen, onCreate }: { shipments: ImportShipment[]; search: string; onOpen: (shipment: ImportShipment) => void; onCreate: () => void }) {
  const visible = shipments.filter((shipment) => String(shipment.name ?? '').toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
  const labels = { GATHERING: 'A reunir', SHIPPED: 'Enviado', RECEIVED: 'Recebido' };
  const totalUnits = shipments.flatMap((shipment) => shipment.orders ?? []).flatMap((order) => order.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const pendingCashback = shipments.reduce((total, shipment) => total + (shipment.orders ?? []).flatMap((order) => order.items ?? []).filter((item) => item.cashbackStatus === 'PENDING' || (!item.cashbackStatus && Number(item.cashbackValue) > 0)).reduce((sum, item) => sum + Number(item.cashbackValue ?? 0) * Number(item.quantity ?? 1), 0), 0);
  return <div className="imports-workspace"><section className="imports-summary-row"><article><small>Importações ativas</small><strong>{shipments.filter((item) => item.status !== 'RECEIVED').length}</strong><span>{shipments.length} no histórico</span></article><article><small>Unidades registadas</small><strong>{totalUnits}</strong><span>em todas as importações</span></article><article><small>Cashback previsto</small><strong>{euro.format(pendingCashback)}</strong><span>ainda por receber</span></article><button onClick={onCreate}><PackagePlus /><span><strong>Nova importação</strong><small>Adicionar fornecedores e produtos</small></span></button></section>
    <TableCard title="Importações" description="Envios, encomendas, produtos, custos e cashback reunidos num só local." count={`${visible.length} envios`} action={<button className="heading-action" onClick={onCreate}>Nova importação</button>}>
      <table><thead><tr><th>Envio</th><th>Estado</th><th>Encomendas</th><th>Unidades</th><th>Transporte</th><th>Alfândega</th><th>Chegada</th><th></th></tr></thead>
        <tbody>{visible.map((shipment) => { const units = (shipment.orders ?? []).flatMap((order) => order.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0); return <tr key={shipment.id}><td><strong>{shipment.name ?? 'Sem nome'}</strong><small>{shipment.trackingNumber || `Criado em ${safeDate(shipment.createdAt)}`}</small></td><td><span className={statusClass(shipment.status)}>{shipment.status ? labels[shipment.status] : '—'}</span></td><td>{shipment.orders?.length ?? 0}</td><td>{units}</td><td>{euro.format(Number(shipment.agentShippingCost ?? 0))}</td><td>{euro.format(Number(shipment.customsCost ?? 0))}</td><td>{safeDate(shipment.estimatedArrival)}</td><td><button className="table-action" onClick={() => onOpen(shipment)}>Gerir</button></td></tr>; })}</tbody>
      </table>
    </TableCard>
  </div>;
}

export function ReportsSection({ orders, groups, users, categories }: { orders: AdminOrder[]; groups: StockGroup[]; users: AdminUser[]; categories: StoreCategory[] }) {
  const validDates = orders.map((order) => order.date ? new Date(order.date) : null).filter((date): date is Date => Boolean(date && Number.isFinite(date.getTime())));
  const years = [...new Set(validDates.map((date) => date.getFullYear()))].sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number | 'all'>(years.includes(currentYear) ? currentYear : (years[0] ?? currentYear));
  const [month, setMonth] = useState<number | 'all'>('all');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const report = useMemo(() => {
    const filtered = orders.filter((order) => {
      if (year === 'all') return true;
      if (!order.date) return false;
      const date = new Date(order.date);
      return Number.isFinite(date.getTime()) && date.getFullYear() === year && (month === 'all' || date.getMonth() === month);
    });
    const delivered = filtered.filter((order) => order.status === 'Entregue');
    const getProductRevenue = (order: AdminOrder) => {
      const itemsSubtotal = (order.items ?? []).reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 1), 0);
      return Math.max(0, Number(order.subtotal ?? itemsSubtotal) - Number(order.discountValue ?? 0));
    };
    const getProductCost = (order: AdminOrder) => {
      const allLots = groups.flatMap((group) => group.lotItems);
      const serials = [...new Set([...(order.serialNumbersUsed ?? []), ...(order.items ?? []).flatMap((item) => item.unitIds ?? [])])];
      const fallbackLot = (productId?: number, variant?: string) => allLots.find((lot) => lot.publicProductId === productId && lot.status !== 'SOLD' && (!variant || lot.variant === variant))
        ?? allLots.find((lot) => lot.publicProductId === productId && (!variant || lot.variant === variant))
        ?? allLots.find((lot) => lot.publicProductId === productId);
      const cashbackPerUnit = (lot?: typeof allLots[number]) => lot?.cashbackStatus === 'RECEIVED' ? Number(lot.cashbackValue ?? 0) / Math.max(1, Number(lot.quantityBought ?? 1)) : 0;
      let cashback = 0;
      if (serials.length) cashback = serials.reduce((sum, serial) => {
        const lot = allLots.find((item) => item.units?.some((unit) => unitMatchesCode(unit, serial)));
        return sum + cashbackPerUnit(lot);
      }, 0);
      else cashback = (order.items ?? []).filter((item) => item.isCustom !== true).reduce((sum, item) => sum + cashbackPerUnit(fallbackLot(item.productId, item.selectedVariant)) * Number(item.quantity ?? 1), 0);
      if (order.totalProductCost != null) return Math.max(0, Number(order.totalProductCost) - cashback);
      let cost = 0;
      if (serials.length) {
        cost = serials.reduce((sum, serial) => {
          const lot = allLots.find((item) => item.units?.some((unit) => unitMatchesCode(unit, serial)));
          return sum + Number(lot?.purchasePrice ?? 0);
        }, 0);
        const totalQuantity = (order.items ?? []).filter((item) => item.isCustom !== true).reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);
        if (totalQuantity > serials.length) {
          const items = (order.items ?? []).filter((item) => item.isCustom !== true);
          const averageFallback = items.length ? items.reduce((sum, item) => sum + Number(fallbackLot(item.productId, item.selectedVariant)?.purchasePrice ?? 0), 0) / items.length : 0;
          cost += averageFallback * (totalQuantity - serials.length);
        }
        cost += (order.items ?? []).filter((item) => item.isCustom === true).reduce((sum, item) => sum + Math.max(0, Number(item.unitCost ?? 0)) * Number(item.quantity ?? 1), 0);
      } else cost = (order.items ?? []).reduce((sum, item) => item.isCustom === true
        ? sum + Math.max(0, Number(item.unitCost ?? 0)) * Number(item.quantity ?? 1)
        : sum + Number(fallbackLot(item.productId, item.selectedVariant)?.purchasePrice ?? 0) * Number(item.quantity ?? 1), 0);
      return Math.max(0, cost - cashback);
    };
    const getFinancials = (order: AdminOrder) => {
      const productRevenue = getProductRevenue(order);
      const productCost = getProductCost(order);
      const pickup = order.shippingInfo?.deliveryMethod === 'Pickup';
      const customerShipping = pickup ? 0 : Number(order.shippingCost ?? Math.max(0, Number(order.total ?? 0) - productRevenue));
      const carrierCost = pickup ? 0 : Number(order.storeShippingCost ?? 5.4);
      const shippingExpense = Math.max(0, carrierCost - customerShipping);
      return { revenue: productRevenue, productCost, shippingExpense, profit: productRevenue - productCost - shippingExpense };
    };
    const financials = delivered.map(getFinancials);
    const revenue = financials.reduce((sum, item) => sum + item.revenue, 0);
    const productCost = financials.reduce((sum, item) => sum + item.productCost, 0);
    const shippingExpense = financials.reduce((sum, item) => sum + item.shippingExpense, 0);
    const profit = financials.reduce((sum, item) => sum + item.profit, 0);
    const states = [...new Set(filtered.map((order) => order.status))]
      .map((status) => ({ status, count: filtered.filter((order) => order.status === status).length }))
      .sort((a, b) => b.count - a.count);
    const timelineRows = delivered.flatMap((order) => {
      const date = order.date ? new Date(order.date) : null;
      if (!date || !Number.isFinite(date.getTime())) return [];
      const financial = getFinancials(order);
      return [{ date, revenue: financial.revenue, profit: financial.profit }];
    });
    const timeline = buildReportTimeline(timelineRows, year, month, months);
    const products = new Map<string, { name: string; quantity: number; revenue: number }>();
    filtered.filter((order) => order.status !== 'Cancelado').forEach((order) => (order.items ?? []).forEach((item) => {
      const name = item.name?.trim() || `Produto ${item.productId ?? ''}`.trim();
      const key = `${item.productId ?? name}:${item.selectedVariant ?? ''}`;
      const current = products.get(key) ?? { name: item.selectedVariant ? `${name} · ${item.selectedVariant}` : name, quantity: 0, revenue: 0 };
      current.quantity += Number(item.quantity ?? 1);
      current.revenue += Number(item.price ?? 0) * Number(item.quantity ?? 1);
      products.set(key, current);
    }));
    return {
      filtered,
      delivered,
      revenue,
      productCost,
      shippingExpense,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
      average: delivered.length ? revenue / delivered.length : 0,
      states,
      timeline,
      topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    };
  }, [groups, month, orders, year]);

  const maxState = Math.max(1, ...report.states.map((item) => item.count));
  const periodLabel = year === 'all' ? 'Todo o histórico' : month === 'all' ? `Ano ${year}` : `${months[month]} ${year}`;
  const timelineGranularity = year === 'all' ? 'por ano' : month === 'all' ? 'por mês' : 'por dia';

  return <div className="reports-workspace">
    <section className="report-toolbar">
      <div><span><BarChart3 /></span><div><h2>Relatórios da loja</h2><p>Vendas e desempenho · {periodLabel}</p></div></div>
      <div className="report-filters">
        <label><CalendarDays /><span>Ano</span><select aria-label="Ano do relatório" value={year} onChange={(event) => { const value = event.target.value; setYear(value === 'all' ? 'all' : Number(value)); if (value === 'all') setMonth('all'); }}><option value="all">Histórico</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Vista</span><select aria-label="Mês do relatório" value={month} disabled={year === 'all'} onChange={(event) => setMonth(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">12 meses</option>{months.map((item, index) => <option key={item} value={index}>{item}</option>)}</select></label>
      </div>
    </section>

    <div className="reports-grid">
      <article className="report-highlight"><span><CircleDollarSign /></span><p>Receita entregue</p><strong>{euro.format(report.revenue)}</strong><small>{report.delivered.length} encomendas concluídas</small></article>
      <article className="report-highlight"><span><ShoppingBag /></span><p>Encomendas</p><strong>{report.filtered.length}</strong><small>{report.filtered.length - report.delivered.length} ainda não entregues</small></article>
      <article className="report-highlight"><span><Clock3 /></span><p>Valor médio</p><strong>{euro.format(report.average)}</strong><small>por encomenda entregue</small></article>
      <article className="report-highlight"><span><PackageSearch /></span><p>Stock atual</p><strong>{groups.reduce((sum, group) => sum + group.available, 0)}</strong><small>{users.length} clientes · {categories.length} categorias</small></article>
      <article className={`report-highlight report-profit ${report.profit < 0 ? 'negative' : ''}`}><span><TrendingUp /></span><p>Lucro líquido</p><strong>{euro.format(report.profit)}</strong><small>Margem {report.margin.toFixed(1)}% · custos {euro.format(report.productCost + report.shippingExpense)}</small></article>
    </div>

    <div className="report-dashboard-grid">
      <article className="admin-panel report-chart report-sales-chart"><header><div><h2>Receita e lucro</h2><p>Evolução das encomendas entregues {timelineGranularity}</p></div><div className="chart-legend"><span><i /> Receita</span><span><i /> Lucro</span></div></header>
        <div className="report-timeline-chart" role="img" aria-label={`Gráfico de receita e lucro de ${periodLabel}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.timeline} margin={{ top: 12, right: 8, left: 2, bottom: 2 }} barGap={3}>
              <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="var(--report-chart-grid)" />
              <XAxis dataKey="axisLabel" axisLine={false} tickLine={false} tick={{ fill: 'var(--report-chart-text)', fontSize: 11, fontWeight: 700 }} interval={0} minTickGap={2} />
              <YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: 'var(--report-chart-muted)', fontSize: 10 }} tickFormatter={(value) => `${Number(value).toLocaleString('pt-PT')} €`} />
              <Tooltip cursor={{ fill: 'var(--report-chart-hover)' }} content={<ReportTimelineTooltip />} />
              <Bar dataKey="revenue" name="Receita" fill="#f97316" radius={[6, 6, 2, 2]} maxBarSize={34} />
              <Bar dataKey="profit" name="Lucro" fill="#059669" radius={[6, 6, 2, 2]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className="admin-panel report-chart"><header><div><h2>Encomendas por estado</h2><p>Distribuição no período escolhido</p></div></header><div className="report-state-list">{report.states.length ? report.states.map((item) => <div className="bar-row" key={item.status}><span>{item.status}</span><div><i style={{ width: `${(item.count / maxState) * 100}%` }} /></div><strong>{item.count}</strong></div>) : <p className="report-empty">Sem encomendas neste período.</p>}</div></article>
      <article className="admin-panel report-chart report-top-products"><header><div><h2>Produtos mais vendidos</h2><p>Exclui encomendas canceladas</p></div></header><div>{report.topProducts.length ? report.topProducts.map((item, index) => <div className="top-product-row" key={item.name}><span>{index + 1}</span><div><strong>{item.name}</strong><small>{euro.format(item.revenue)} em vendas</small></div><b>{item.quantity} un.</b></div>) : <p className="report-empty">Ainda não há produtos vendidos neste período.</p>}</div></article>
    </div>
  </div>;
}

function TableCard({ title, description, count, action, children }: { title: string; description: string; count: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="admin-table-card"><div className="table-heading"><div><h2>{title}</h2><p>{description}</p></div><div className="table-heading-actions"><span>{count}</span>{action}</div></div><div className="table-scroll">{children}</div></div>;
}

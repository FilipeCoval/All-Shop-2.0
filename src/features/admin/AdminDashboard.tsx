import { AlertTriangle, Boxes, CircleDollarSign, ClipboardList, Database, FileBarChart, Headphones, History, Import, Layers, LayoutDashboard, LogOut, Megaphone, Moon, PackageCheck, PackagePlus, Plus, RefreshCw, Search, Sun, TicketPercent, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadAdminSnapshot } from './adminApi';
import type { AdminOrder, AdminSnapshot, InventoryLot, StockGroup } from './adminTypes';
import { buildStockGroups } from './stockMetrics';
import { ClientsSection, CouponsSection, ImportsSection, OrdersSection, ProductsSection, ReportsSection, SupportSection } from './AdminSections';
import { AdminDetails } from './AdminDetails';
import { CatalogEditor, LotEditor } from './AdminEditors';
import { AdminActionEditor, type AdminActionTarget } from './AdminActionEditor';
import { AuditSection, BackupsSection, CategoriesSection, MarketingSection } from './AdminUtilitySections';
import type { Product } from '../../types/domain';
import { ImportEditor } from './ImportEditor';
import { TelegramOrderRecovery } from './TelegramOrderRecovery';
import { LOGO_URL, STORE_NAME } from '../../../constants';

interface AdminDashboardProps {
  email: string;
  isDarkMode: boolean;
  onLogout: () => Promise<void>;
  onToggleDarkMode: () => void;
}

type AdminTab = 'overview' | 'products' | 'orders' | 'clients' | 'coupons' | 'support' | 'marketing' | 'imports' | 'categories' | 'reports' | 'audit' | 'backups';
const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const statusClass = (status: string) => `status status-${status.toLocaleLowerCase('pt').replace(/\s/g, '-')}`;
const tabTitles: Record<AdminTab, string> = {
  overview: 'Hoje na loja', products: 'Produtos e stock', orders: 'Encomendas', clients: 'Clientes',
  coupons: 'Cupões', support: 'Suporte', marketing: 'Marketing', imports: 'Importações', categories: 'Categorias', reports: 'Relatórios', audit: 'Histórico', backups: 'Backups',
};
const tabDescriptions: Record<AdminTab, string> = {
  overview: 'O que precisa da sua atenção, sem ruído.',
  products: 'Um único local para catálogo, preços, variantes e lotes.',
  orders: 'Acompanhe o pedido desde a entrada até à entrega.',
  clients: 'Contas, contactos, compras e AllPoints.',
  coupons: 'Crie e acompanhe descontos da loja.',
  support: 'Pedidos de apoio e produtos procurados.',
  marketing: 'Comunicação com clientes que aceitaram notificações.',
  imports: 'Compras a fornecedores, envios e custos.',
  categories: 'Organização visual do catálogo.',
  reports: 'Indicadores essenciais da operação.',
  audit: 'Registo das alterações administrativas.',
  backups: 'Exportação segura dos dados atuais.',
};

export function AdminDashboard({ email, isDarkMode, onLogout, onToggleDarkMode }: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [selectedStock, setSelectedStock] = useState<StockGroup | null>(null);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [lotEditorOpen, setLotEditorOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<InventoryLot | null>(null);
  const [initialLotProductId, setInitialLotProductId] = useState<number | undefined>();
  const [actionTarget, setActionTarget] = useState<AdminActionTarget | null>(null);
  const [importEditorOpen, setImportEditorOpen] = useState(false);
  const [editingImport, setEditingImport] = useState<AdminSnapshot['imports'][number] | null>(null);
  const [telegramRecoveryOpen, setTelegramRecoveryOpen] = useState(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const snapshot = await loadAdminSnapshot();
      setData(snapshot);
      setSelectedOrder((current) => current ? snapshot.orders.find((order) => order.id === current.id) ?? current : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a dashboard.');
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);

  const stockGroups = useMemo(
    () => data ? buildStockGroups(data.lots, data.products, data.reservations) : [],
    [data],
  );
  const totalAvailable = stockGroups.reduce((sum, group) => sum + group.available, 0);
  const pendingOrders = (data?.orders ?? []).filter((order) => ['Pendente', 'Processamento', 'Pago'].includes(order.status)).length;
  const completedRevenue = (data?.orders ?? []).filter((order) => order.status === 'Entregue').reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const warningCount = stockGroups.filter((group) => group.warnings.length > 0).length;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="admin-brand" aria-label="All-Shop, voltar à loja">
          <img src={LOGO_URL} alt={STORE_NAME} className="admin-brand-logo" />
        </a>
        <nav>
          <p className="admin-nav-label">Operação</p>
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard /> Hoje</button>
          <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><Boxes /> Produtos e stock</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ClipboardList /> Encomendas</button>
          <button className={tab === 'clients' ? 'active' : ''} onClick={() => setTab('clients')}><UsersRound /> Clientes</button>
          <button className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}><Headphones /> Suporte</button>
          <p className="admin-nav-label">Crescimento</p>
          <button className={tab === 'coupons' ? 'active' : ''} onClick={() => setTab('coupons')}><TicketPercent /> Cupões</button>
          <button className={tab === 'marketing' ? 'active' : ''} onClick={() => setTab('marketing')}><Megaphone /> Marketing</button>
          <p className="admin-nav-label">Gestão</p>
          <button className={tab === 'imports' ? 'active' : ''} onClick={() => setTab('imports')}><Import /> Importações</button>
          <button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}><Layers /> Categorias</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}><FileBarChart /> Relatórios</button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><History /> Histórico</button>
          <button className={tab === 'backups' ? 'active' : ''} onClick={() => setTab('backups')}><Database /> Backups</button>
        </nav>
        <div className="admin-sidebar-footer">
          <span>{email}</span>
          <button onClick={() => void onLogout()}><LogOut /> Terminar sessão</button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div><p className="eyebrow">Centro de controlo</p><h1>{tabTitles[tab]}</h1><p className="admin-page-description">{tabDescriptions[tab]}</p></div>
          <div className="admin-actions">
            {!['overview', 'marketing', 'reports', 'backups'].includes(tab) && <label className="admin-search"><Search /><input placeholder={`Pesquisar em ${tabTitles[tab].toLocaleLowerCase('pt')}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
            {tab === 'orders' && <button className="telegram-recovery-button" type="button" onClick={() => setTelegramRecoveryOpen(true)}><Plus /> Recuperar pedido Telegram</button>}
            <button className="admin-theme-button" type="button" onClick={onToggleDarkMode} aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'} aria-pressed={isDarkMode} title={isDarkMode ? 'Modo claro' : 'Modo escuro'}>
              {isDarkMode ? <Sun /> : <Moon />}
              <span>{isDarkMode ? 'Modo claro' : 'Modo escuro'}</span>
            </button>
            <button className="refresh-button" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} /> Atualizar</button>
          </div>
        </header>

        {error && <div className="admin-error">{error}</div>}
        {loading && !data && <div className="admin-loading"><RefreshCw className="spin" /> A carregar dados protegidos…</div>}

        {data && tab === 'overview' && (
          <>
            <div className="kpi-grid">
              <article><span className="kpi-icon blue"><PackageCheck /></span><p>Disponível</p><strong>{totalAvailable}</strong><small>unidades para venda</small></article>
              <article><span className="kpi-icon orange"><ClipboardList /></span><p>Por tratar</p><strong>{pendingOrders}</strong><small>encomendas ativas</small></article>
              <article><span className="kpi-icon green"><CircleDollarSign /></span><p>Vendas entregues</p><strong>{euro.format(completedRevenue)}</strong><small>histórico carregado</small></article>
              <article><span className="kpi-icon red"><AlertTriangle /></span><p>Atenção</p><strong>{warningCount}</strong><small>produtos a verificar</small></article>
            </div>
            <section className="admin-quick-actions">
              <div><p className="eyebrow">Ações rápidas</p><h2>O que quer fazer?</h2></div>
              <button onClick={() => { setEditingProduct(null); setCatalogEditorOpen(true); }}><span><Plus /></span><strong>Novo produto</strong><small>Criar ficha, preço e descrição</small></button>
              <button onClick={() => { setEditingLot(null); setInitialLotProductId(undefined); setLotEditorOpen(true); }}><span><PackagePlus /></span><strong>Entrada de stock</strong><small>Adicionar um lote a um produto</small></button>
              <button onClick={() => setTab('orders')}><span><ClipboardList /></span><strong>Gerir encomendas</strong><small>Estados, cancelamentos e envios</small></button>
            </section>
            <div className="admin-panels">
              <article className="admin-panel">
                <header><div><h2>Alertas de stock</h2><p>Inconsistências detetadas automaticamente</p></div><button onClick={() => setTab('products')}>Ver todos</button></header>
                <div className="alert-list">
                  {stockGroups.filter((group) => group.warnings.length).slice(0, 6).map((group) => (
                    <div key={`${group.productId}:${group.name}`}><AlertTriangle /><span><strong>{group.name}</strong><small>{group.warnings[0]}</small></span></div>
                  ))}
                  {warningCount === 0 && <p className="empty-inline">Sem divergências detetadas.</p>}
                </div>
              </article>
              <article className="admin-panel">
                <header><div><h2>Encomendas recentes</h2><p>Última atividade da loja</p></div><button onClick={() => setTab('orders')}>Ver todas</button></header>
                <div className="recent-orders">
                  {data.orders.slice(0, 6).map((order) => (
                    <div key={order.id}><span><strong>#{order.id.replace(/^#/, '')}</strong><small>{order.shippingInfo?.name ?? 'Cliente'}</small></span><b className={statusClass(order.status)}>{order.status}</b></div>
                  ))}
                </div>
              </article>
            </div>
          </>
        )}

        {data && tab === 'products' && <ProductsSection products={data.products} groups={stockGroups} search={search} onCreateProduct={() => { setEditingProduct(null); setCatalogEditorOpen(true); }} onEditProduct={(product) => { setEditingProduct(product); setCatalogEditorOpen(true); }} onCreateLot={(productId) => { setEditingLot(null); setInitialLotProductId(productId); setLotEditorOpen(true); }} onOpenStock={(group) => { setSelectedStock(group); setSelectedOrder(null); }} />}
        {data && tab === 'orders' && <OrdersSection orders={data.orders} search={search} onOpen={(order) => { setSelectedOrder(order); setSelectedStock(null); }} />}
        {data && tab === 'clients' && <ClientsSection users={data.users} search={search} onOpen={(user) => setActionTarget({ kind: 'client', value: user })} />}
        {data && tab === 'coupons' && <CouponsSection coupons={data.coupons} search={search} onCreate={() => setActionTarget({ kind: 'coupon', value: null })} onEdit={(coupon) => setActionTarget({ kind: 'coupon', value: coupon })} />}
        {data && tab === 'support' && <SupportSection tickets={data.tickets} requests={data.requests} search={search} onTicket={(ticket) => setActionTarget({ kind: 'ticket', value: ticket })} onRequest={(request) => setActionTarget({ kind: 'request', value: request })} />}
        {data && tab === 'marketing' && <MarketingSection users={data.users} onSent={refresh} />}
        {data && tab === 'imports' && <ImportsSection shipments={data.imports} search={search} onCreate={() => { setEditingImport(null); setImportEditorOpen(true); }} onOpen={(shipment) => { setEditingImport(shipment); setImportEditorOpen(true); }} />}
        {data && tab === 'categories' && <CategoriesSection categories={data.categories} search={search} onCreate={() => setActionTarget({ kind: 'category', value: null })} onEdit={(category) => setActionTarget({ kind: 'category', value: category })} onChanged={refresh} />}
        {data && tab === 'reports' && <ReportsSection orders={data.orders} groups={stockGroups} users={data.users} categories={data.categories} />}
        {data && tab === 'audit' && <AuditSection entries={data.audit} search={search} />}
        {data && tab === 'backups' && <BackupsSection data={data} />}
      </section>
      <AdminDetails order={selectedOrder} stock={selectedStock} lots={data?.lots ?? []} onClose={() => { setSelectedOrder(null); setSelectedStock(null); }} onChanged={refresh} onEditLot={(lot) => { setEditingLot(lot); setInitialLotProductId(lot.publicProductId); setLotEditorOpen(true); }} />
      {data && <CatalogEditor open={catalogEditorOpen} product={editingProduct} categories={data.categories} onClose={() => setCatalogEditorOpen(false)} onSaved={refresh} />}
      {data && <LotEditor open={lotEditorOpen} lot={editingLot} initialProductId={initialLotProductId} products={data.products} onClose={() => setLotEditorOpen(false)} onSaved={refresh} />}
      {data && <ImportEditor open={importEditorOpen} shipment={editingImport} products={data.products} onClose={() => setImportEditorOpen(false)} onSaved={refresh} />}
      {data && <TelegramOrderRecovery open={telegramRecoveryOpen} products={data.products} onClose={() => setTelegramRecoveryOpen(false)} onSaved={refresh} />}
      <AdminActionEditor target={actionTarget} onClose={() => setActionTarget(null)} onSaved={refresh} />
    </main>
  );
}

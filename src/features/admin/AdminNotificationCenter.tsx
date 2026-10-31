import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Headphones,
  PackageSearch,
  SearchCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdminOrder,
  AdminSnapshot,
  InventoryLot,
  ProductRequest,
  StockGroup,
  SupportTicket,
} from './adminTypes';

export type AdminNotificationFilter = 'all' | 'orders' | 'support' | 'requests' | 'stock' | 'cashback';

export type AdminCashbackNotificationTarget =
  { source: 'lot'; lot: InventoryLot };

export interface AdminNotificationCenterProps {
  data: AdminSnapshot;
  stockGroups: StockGroup[];
  onOrder: (order: AdminOrder) => void;
  onSupport: (ticket: SupportTicket) => void;
  onRequest: (request: ProductRequest) => void;
  onStock: (group: StockGroup) => void;
  onCashback: (target: AdminCashbackNotificationTarget) => void;
}

type NotificationSeverity = 'info' | 'warning' | 'urgent';
type NotificationTarget =
  | { kind: 'orders'; order: AdminOrder }
  | { kind: 'support'; ticket: SupportTicket }
  | { kind: 'requests'; request: ProductRequest }
  | { kind: 'stock'; group: StockGroup }
  | { kind: 'cashback'; cashback: AdminCashbackNotificationTarget };

interface AdminNotificationItem {
  id: string;
  severity: NotificationSeverity;
  title: string;
  description: string;
  meta: string;
  sortTime: number;
  target: NotificationTarget;
}

const ACTIVE_ORDER_STATUSES = new Set(['Pendente', 'Processamento', 'Pago']);
const CLOSED_REQUEST_STATUSES = new Set(['concluído', 'concluido', 'anulado', 'cancelado', 'rejeitado', 'fechado']);
const CASHBACK_WARNING_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const shortDate = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });

const filterLabels: Record<AdminNotificationFilter, string> = {
  all: 'Tudo',
  orders: 'Encomendas',
  support: 'Suporte',
  requests: 'Pedidos',
  stock: 'Stock',
  cashback: 'Cashback',
};

const severityRank: Record<NotificationSeverity, number> = { info: 1, warning: 2, urgent: 3 };

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-PT');

const toTimestamp = (value: unknown) => {
  if (typeof value !== 'string' || !value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const parseLocalDate = (value?: string) => {
  if (!value) return null;
  const simpleDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = simpleDate
    ? new Date(Number(simpleDate[1]), Number(simpleDate[2]) - 1, Number(simpleDate[3]))
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const calendarDayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

const notificationIcon = (kind: AdminNotificationFilter) => {
  if (kind === 'orders') return <ClipboardList aria-hidden="true" />;
  if (kind === 'support') return <Headphones aria-hidden="true" />;
  if (kind === 'requests') return <SearchCheck aria-hidden="true" />;
  if (kind === 'stock') return <PackageSearch aria-hidden="true" />;
  if (kind === 'cashback') return <CircleDollarSign aria-hidden="true" />;
  return <Bell aria-hidden="true" />;
};

function cashbackTiming(expectedDate: string | undefined, now: Date) {
  if (!expectedDate) return { include: true, severity: 'warning' as const, label: 'Sem previsão de receção', sortTime: now.getTime() };
  const expected = parseLocalDate(expectedDate);
  if (!expected) return { include: true, severity: 'warning' as const, label: 'Previsão inválida', sortTime: now.getTime() };
  const days = calendarDayNumber(expected) - calendarDayNumber(now);
  if (days < 0) return { include: true, severity: 'urgent' as const, label: `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`, sortTime: expected.getTime() };
  if (days === 0) return { include: true, severity: 'urgent' as const, label: 'Previsto para hoje', sortTime: expected.getTime() };
  if (days <= CASHBACK_WARNING_WINDOW_DAYS) return { include: true, severity: 'warning' as const, label: `Previsto dentro de ${days} dia${days === 1 ? '' : 's'}`, sortTime: expected.getTime() };
  return { include: false, severity: 'info' as const, label: shortDate.format(expected), sortTime: expected.getTime() };
}

function buildNotifications(data: AdminSnapshot, stockGroups: StockGroup[], now: Date): AdminNotificationItem[] {
  const items: AdminNotificationItem[] = [];

  for (const order of data.orders) {
    const orderId = order.id.replace(/^#/, '');
    const customer = order.shippingInfo?.name ?? order.shippingInfo?.email ?? 'Cliente';
    const cancellationPending = normalize(order.cancellationRequest?.status) === 'pendente';
    const returnPending = normalize(order.returnRequest?.status) === 'pendente';

    if (cancellationPending || returnPending) {
      const request = cancellationPending ? order.cancellationRequest : order.returnRequest;
      const requestName = cancellationPending ? 'cancelamento' : 'devolução';
      const requestDate = cancellationPending ? order.cancellationRequest?.requestedAt : order.returnRequest?.requestedAt ?? order.returnRequest?.date;
      items.push({
        id: `order-request:${order.id}:${requestName}`,
        severity: 'urgent',
        title: `Pedido de ${requestName} · #${orderId}`,
        description: request?.reason || `${customer} aguarda uma decisão.`,
        meta: customer,
        sortTime: toTimestamp(requestDate) || toTimestamp(order.date),
        target: { kind: 'orders', order },
      });
    }

    if (ACTIVE_ORDER_STATUSES.has(order.status)) {
      items.push({
        id: `active-order:${order.id}`,
        severity: order.status === 'Pendente' ? 'warning' : 'info',
        title: `Encomenda #${orderId} por tratar`,
        description: `${customer} · ${order.status}`,
        meta: euro.format(Number(order.total ?? 0)),
        sortTime: toTimestamp(order.date),
        target: { kind: 'orders', order },
      });
    }
  }

  for (const ticket of data.tickets) {
    if (!ticket.unreadAdmin) continue;
    items.push({
      id: `support:${ticket.id}`,
      severity: normalize(ticket.priority) === 'alta' ? 'urgent' : 'warning',
      title: ticket.subject || 'Nova mensagem de suporte',
      description: ticket.customerName ?? ticket.customerEmail ?? 'Cliente por identificar',
      meta: ticket.priority ? `Prioridade ${ticket.priority}` : 'Por ler',
      sortTime: toTimestamp(ticket.updatedAt),
      target: { kind: 'support', ticket },
    });
  }

  for (const request of data.requests) {
    if (CLOSED_REQUEST_STATUSES.has(normalize(request.status))) continue;
    items.push({
      id: `request:${request.id}`,
      severity: normalize(request.urgency) === 'urgente' || normalize(request.urgency) === 'alta' ? 'urgent' : 'warning',
      title: request.productName || 'Pedido de produto por analisar',
      description: request.userEmail ?? 'Cliente por identificar',
      meta: [request.category, request.urgency].filter(Boolean).join(' · ') || 'Por analisar',
      sortTime: toTimestamp(request.createdAt),
      target: { kind: 'requests', request },
    });
  }

  for (const group of stockGroups) {
    if (!group.warnings.length) continue;
    items.push({
      id: `stock:${group.productId ?? group.name}`,
      severity: 'warning',
      title: `${group.name} precisa de verificação`,
      description: group.warnings.slice(0, 2).join(' · '),
      meta: `${group.available} disponível${group.warnings.length > 2 ? ` · +${group.warnings.length - 2} aviso${group.warnings.length - 2 === 1 ? '' : 's'}` : ''}`,
      sortTime: 0,
      target: { kind: 'stock', group },
    });
  }

  for (const lot of data.lots) {
    const value = Math.max(0, Number(lot.cashbackValue ?? 0));
    const pending = normalize(lot.cashbackStatus) === 'pending' || (!lot.cashbackStatus && value > 0);
    if (!pending || value <= 0) continue;
    const timing = cashbackTiming(lot.cashbackExpectedDate, now);
    if (!timing.include) continue;
    items.push({
      id: `cashback:lot:${lot.id}`,
      severity: timing.severity,
      title: `Cashback ${timing.severity === 'urgent' ? 'a confirmar' : 'pendente'} · ${lot.name}`,
      description: `${lot.supplierName || 'Lote de stock'} · ${timing.label}`,
      meta: `${euro.format(value)}${lot.cashbackPlatform ? ` · ${lot.cashbackPlatform}` : ''}`,
      sortTime: timing.sortTime,
      target: { kind: 'cashback', cashback: { source: 'lot', lot } },
    });
  }

  return items.sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || right.sortTime - left.sortTime || left.title.localeCompare(right.title, 'pt'));
}

export function AdminNotificationCenter({ data, stockGroups, onOrder, onSupport, onRequest, onStock, onCashback }: AdminNotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AdminNotificationFilter>('all');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previouslyOpen = useRef(false);
  const notifications = useMemo(() => buildNotifications(data, stockGroups, new Date()), [data, stockGroups]);
  const visible = filter === 'all' ? notifications : notifications.filter((item) => item.target.kind === filter);
  const urgentCount = notifications.filter((item) => item.severity === 'urgent').length;
  const counts = useMemo(() => notifications.reduce<Record<AdminNotificationFilter, number>>((current, item) => {
    current.all += 1;
    current[item.target.kind] += 1;
    return current;
  }, { all: 0, orders: 0, support: 0, requests: 0, stock: 0, cashback: 0 }), [notifications]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('.admin-notification-close')?.focus());
    } else if (previouslyOpen.current) {
      triggerRef.current?.focus();
    }
    previouslyOpen.current = open;
  }, [open]);

  const navigate = (target: NotificationTarget) => {
    setOpen(false);
    if (target.kind === 'orders') onOrder(target.order);
    if (target.kind === 'support') onSupport(target.ticket);
    if (target.kind === 'requests') onRequest(target.request);
    if (target.kind === 'stock') onStock(target.group);
    if (target.kind === 'cashback') onCashback(target.cashback);
  };

  return (
    <div className="admin-notification-center" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-notification-trigger${urgentCount ? ' urgent' : ''}`}
        aria-label={`${notifications.length} alerta${notifications.length === 1 ? '' : 's'} na administração`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="admin-notification-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell aria-hidden="true" />
        {notifications.length > 0 && <span aria-hidden="true">{notifications.length > 99 ? '99+' : notifications.length}</span>}
      </button>

      {open && (
        <section id="admin-notification-panel" ref={panelRef} className="admin-notification-panel" role="dialog" aria-modal="false" aria-labelledby="admin-notification-title">
          <header className="admin-notification-header">
            <div>
              <p>Centro de alertas</p>
              <h2 id="admin-notification-title">O que precisa de atenção</h2>
            </div>
            <button type="button" className="admin-notification-close" onClick={() => setOpen(false)} aria-label="Fechar notificações"><X aria-hidden="true" /></button>
          </header>

          <div className="admin-notification-filters" role="group" aria-label="Filtrar alertas">
            {(Object.keys(filterLabels) as AdminNotificationFilter[]).map((item) => (
              <button type="button" key={item} className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>
                {filterLabels[item]} <span>{counts[item]}</span>
              </button>
            ))}
          </div>

          {visible.length > 0 ? (
            <ul className="admin-notification-list" aria-label={`${visible.length} alertas em ${filterLabels[filter]}`}>
              {visible.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`admin-notification-item ${item.severity}`} onClick={() => navigate(item.target)}>
                    <span className="admin-notification-icon">{notificationIcon(item.target.kind)}</span>
                    <span className="admin-notification-copy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                      <em>{item.meta}</em>
                    </span>
                    <ChevronRight className="admin-notification-arrow" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="admin-notification-empty"><SearchCheck aria-hidden="true" /><strong>Sem alertas nesta área</strong><p>Não existe nada pendente neste filtro.</p></div>
          )}

          <footer className="admin-notification-footer"><AlertTriangle aria-hidden="true" /> Estes alertas acompanham a última atualização da dashboard e não são marcados como lidos.</footer>
        </section>
      )}
    </div>
  );
}

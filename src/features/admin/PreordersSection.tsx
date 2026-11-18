import { useState } from 'react';
import type { AdminOrder } from './adminTypes';

const euro = (value?: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value ?? 0);
const phase = (order: AdminOrder) => {
  const p = order.preorder;
  if (order.status === 'Cancelado' || ['CANCELLED', 'EXPIRED'].includes(p?.status ?? '')) return 'closed';
  if (p?.status === 'FULFILLED') return 'fulfilled';
  if (p?.status === 'BALANCE_RECEIVED') return 'ready';
  if (p?.status === 'DEPOSIT_RECEIVED') return 'balance';
  return p?.messagePending ? 'message' : 'deposit';
};
const labels: Record<string, string> = { message: 'Mensagem por confirmar', deposit: 'Aguarda sinal', balance: 'Sinal recebido · aguarda saldo', ready: 'Saldo recebido · a expedir', fulfilled: 'Expedida / concluída', closed: 'Cancelada / expirada' };

export function PreordersSection({ orders, search, onOpen }: { orders: AdminOrder[]; search: string; onOpen: (order: AdminOrder) => void }) {
  const [filter, setFilter] = useState('all');
  const preorders = orders.filter((order) => order.preorder?.kind === 'PREORDER');
  const active = preorders.filter((order) => !['closed', 'fulfilled'].includes(phase(order)));
  const visible = preorders.filter((order) => (filter === 'all' || phase(order) === filter) && `${order.id} ${order.shippingInfo?.name} ${order.shippingInfo?.email} ${(order.items ?? []).map((item) => `${item.name} ${item.selectedVariant}`).join(' ')}`.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')))
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  return <>
    <div className="kpi-grid preorder-kpis">
      <article><p>Pré-reservas ativas</p><strong>{active.length}</strong><small>{active.reduce((sum, order) => sum + Number(order.preorder?.quantity ?? 0), 0)} unidades pedidas</small></article>
      <article><p>Mensagem por confirmar</p><strong>{active.filter((order) => phase(order) === 'message').length}</strong><small>Pedidos guardados, mesmo sem regressar ao site</small></article>
      <article><p>Sinal por receber</p><strong>{euro(active.filter((order) => ['message', 'deposit'].includes(phase(order))).reduce((sum, order) => sum + Number(order.preorder?.depositDue ?? 0), 0))}</strong><small>Não representa pagamentos recebidos</small></article>
      <article><p>Prontas a expedir</p><strong>{active.filter((order) => phase(order) === 'ready').length}</strong><small>Validar stock e S/N antes da expedição</small></article>
    </div>
    <section className="admin-panel">
      <header><div><h2>Pré-reservas</h2><p>Mensagem, sinal, saldo e expedição — sem confundir vagas com stock físico.</p></div><span>{visible.length} pedidos</span></header>
      <div className="orders-toolbar"><label>Fase<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todas as pré-reservas</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <div className="preorder-list">{visible.map((order) => <article key={order.id} className="preorder-list-card">
        <div><strong>#{order.id}</strong><small>{order.shippingInfo?.name ?? 'Cliente'} · {order.shippingInfo?.email}</small><p>{(order.items ?? []).map((item) => `${item.quantity}× ${item.name}${item.selectedVariant ? ` · ${item.selectedVariant}` : ''}`).join(', ')}</p></div>
        <div><span className="status">{labels[phase(order)]}</span><small>Total: {euro(order.total)} · Sinal: {euro(order.preorder?.depositDue)} · Saldo: {euro(order.preorder?.balanceDue)}</small></div>
        <button type="button" className="table-action" onClick={() => onOpen(order)}>Gerir pré-reserva</button>
      </article>)}{!visible.length && <p className="empty-inline">Não existem pré-reservas com estes filtros.</p>}</div>
    </section>
  </>;
}

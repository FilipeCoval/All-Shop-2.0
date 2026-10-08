
import React, { useState, useMemo } from 'react';
import { BarChart2, ClipboardEdit, Trash2, Package, AlertTriangle, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { Order, InventoryProduct } from '../types';
import { db } from '../services/firebaseConfig';

interface OrdersTabProps {
  orders: Order[];
  inventoryProducts: InventoryProduct[];
  isAdmin: boolean;
  onStatusChange: (orderId: string, newStatus: string) => Promise<void>;
  onDeleteOrder: (orderId: string) => void;
  onViewDetails: (order: Order) => void;
  onOpenManualOrder: () => void;
  onOpenFulfillment: (order: Order) => void;
  onReviewRequest: (orderId: string, requestKind: 'cancellation' | 'return', decision: 'approve' | 'reject', reviewNote?: string) => Promise<void> | void;
}

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

const OrdersTab: React.FC<OrdersTabProps> = ({ 
  orders, inventoryProducts, isAdmin, 
  onStatusChange, onDeleteOrder, onViewDetails, onOpenManualOrder, onOpenFulfillment, onReviewRequest
}) => {
  const [chartTimeframe, setChartTimeframe] = useState<'7d' | '30d' | '1y'>('7d');
  const [searchTerm, setSearchTerm] = useState('');
  const [reviewingRequest, setReviewingRequest] = useState<string | null>(null);
  const [updatingStatusOrderId, setUpdatingStatusOrderId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    return orders.filter(order => 
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.shippingInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.items.some(item => typeof item !== 'string' && item.serialNumbers?.some(sn => sn.includes(searchTerm)))
    );
  }, [orders, searchTerm]);

  const pendingRequests = useMemo(() => orders.flatMap(order => {
    const requests: Array<{ order: Order; kind: 'cancellation' | 'return'; title: string; reason: string; requestedAt?: string }> = [];
    if (order.cancellationRequest?.status === 'Pendente') {
      requests.push({
        order,
        kind: 'cancellation',
        title: order.cancellationRequest.type === 'PARCIAL' ? 'Cancelamento parcial' : 'Cancelamento de encomenda',
        reason: order.cancellationRequest.reason || 'Sem motivo indicado',
        requestedAt: order.cancellationRequest.requestedAt,
      });
    }
    if (order.returnRequest?.status === 'Pendente') {
      requests.push({
        order,
        kind: 'return',
        title: 'Pedido de devolução',
        reason: order.returnRequest.reason || 'Sem motivo indicado',
        requestedAt: order.returnRequest.requestedAt || order.returnRequest.date,
      });
    }
    return requests;
  }), [orders]);

  const handleReviewRequest = async (order: Order, kind: 'cancellation' | 'return', decision: 'approve' | 'reject') => {
    const label = kind === 'cancellation' ? 'pedido de cancelamento' : 'pedido de devolução';
    const decisionLabel = decision === 'approve' ? 'aprovar' : 'recusar';
    if (!window.confirm(`Pretende ${decisionLabel} este ${label} da encomenda ${order.id}?`)) return;
    const reviewNote = window.prompt('Nota para o cliente (opcional):') || '';
    setReviewingRequest(`${order.id}:${kind}`);
    try {
      await onReviewRequest(order.id, kind, decision, reviewNote);
    } catch (error) {
      console.error('Erro ao analisar pedido:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.');
    } finally {
      setReviewingRequest(null);
    }
  };

  const handleStatusChange = async (order: Order, newStatus: string) => {
    if (order.status === newStatus) return;
    setUpdatingStatusOrderId(order.id);
    try {
      await onStatusChange(order.id, newStatus);
    } catch (error) {
      console.error('Erro ao alterar estado da encomenda:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível alterar o estado da encomenda.');
    } finally {
      setUpdatingStatusOrderId(null);
    }
  };

  const chartData = useMemo(() => {
    const numDays = chartTimeframe === '1y' ? 365 : chartTimeframe === '30d' ? 30 : 7;
    const toLocalISO = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      if (dateStr.length === 10 && !dateStr.includes('T')) return dateStr;
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const manualSales = inventoryProducts.flatMap(p => (p.salesHistory || []).filter(s => !s.id.startsWith('ORDER-') && !s.id.startsWith('FULFILL-')).map(s => ({ date: toLocalISO(s.date), total: (Number(s.quantity) || 0) * (Number(s.unitPrice) || 0) })));
    const onlineOrders = orders.filter(o => o.status !== 'Cancelado').map(o => ({ date: toLocalISO(o.date), total: (Number(o.total) || 0) }));
    const allSales = [...manualSales, ...onlineOrders];
    
    const today = new Date();
    let totalPeriod = 0;

    if (chartTimeframe === '1y') {
      const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(today.getMonth() - i, 1);
        return d;
      }).reverse();

      const monthlyData = months.map(monthStart => {
        const year = monthStart.getFullYear();
        const month = monthStart.getMonth() + 1;
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
        
        const totalForMonth = allSales.reduce((acc, sale) => {
          return sale.date.startsWith(monthStr) ? acc + sale.total : acc;
        }, 0);
        
        totalPeriod += totalForMonth;
        return { label: monthStart.toLocaleDateString('pt-PT', { month: 'short' }), value: totalForMonth };
      });

      const maxValue = Math.max(...monthlyData.map(d => d.value), 1);
      return { days: monthlyData, maxValue, totalPeriod };
    } else {
      const days = [];
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const dateLabel = `${year}-${month}-${day}`;
        
        const totalForDay = allSales.reduce((acc, sale) => sale.date === dateLabel ? acc + sale.total : acc, 0);
        totalPeriod += totalForDay;
        
        days.push({ label: d.toLocaleDateString('pt-PT', { day: 'numeric' }), date: dateLabel, value: totalForDay });
      }
      
      const maxValue = Math.max(...days.map(d => d.value), 1);
      return { days, maxValue, totalPeriod };
    }
  }, [orders, inventoryProducts, chartTimeframe]);

  return (
    <div className="space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 transition-colors">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <BarChart2 className="text-indigo-600 dark:text-indigo-400" /> Faturação Geral
                    </h3>
                    <div className="bg-gray-100 dark:bg-slate-700 p-1 rounded-lg flex gap-1 text-xs font-medium transition-colors">
                        <button onClick={() => setChartTimeframe('7d')} className={`px-2 py-1 rounded transition-colors ${chartTimeframe === '7d' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>7D</button>
                        <button onClick={() => setChartTimeframe('30d')} className={`px-2 py-1 rounded transition-colors ${chartTimeframe === '30d' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>30D</button>
                        <button onClick={() => setChartTimeframe('1y')} className={`px-2 py-1 rounded transition-colors ${chartTimeframe === '1y' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>1A</button>
                    </div>
                </div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 px-3 py-1 rounded-full transition-colors">
                    Total: {formatCurrency(chartData.totalPeriod)}
                </span>
            </div>
            <div className="flex items-stretch h-64 gap-4">
                <div className="flex flex-col justify-between text-xs font-medium text-gray-400 dark:text-gray-500 py-2 min-w-[30px] text-right transition-colors">
                    <span>{formatCurrency(chartData.maxValue)}</span>
                    <span>{formatCurrency(chartData.maxValue / 2)}</span>
                    <span>0€</span>
                </div>
                <div className="flex items-end flex-1 gap-2 md:gap-4 relative border-l border-b border-gray-200 dark:border-slate-700 transition-colors">
                    <div className="absolute w-full border-t border-dashed border-gray-100 dark:border-slate-700/50 top-2 left-0 z-0"></div>
                    <div className="absolute w-full border-t border-dashed border-gray-100 dark:border-slate-700/50 top-1/2 left-0 z-0"></div>
                    {chartData.days.map((day, idx) => { 
                        const heightPercent = (day.value / chartData.maxValue) * 100; 
                        const isZero = day.value === 0; 
                        return (
                            <div key={idx} className="flex-1 flex flex-col justify-end h-full group relative z-10">
                                <div 
                                    className={`w-full rounded-t-md transition-all duration-700 ease-out relative group-hover:brightness-110 ${isZero ? 'bg-gray-100 dark:bg-slate-700' : 'bg-gradient-to-t from-blue-500 to-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none'}`} 
                                    style={{ height: isZero ? '4px' : `${heightPercent}%`, minHeight: '4px' }}
                                >
                                    {!isZero && (
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-20">
                                            {formatCurrency(day.value)}
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-white"></div>
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 font-medium mt-2 text-center uppercase tracking-wide transition-colors">{day.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
        
        {pendingRequests.length > 0 && (
            <section className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2"><AlertTriangle size={19}/> Pedidos de clientes pendentes</h3>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">{pendingRequests.length}</span>
                </div>
                <div className="space-y-3">
                    {pendingRequests.map(({ order, kind, title, reason, requestedAt }) => {
                        const key = `${order.id}:${kind}`;
                        const loading = reviewingRequest === key;
                        return (
                            <div key={key} className="bg-white dark:bg-slate-900 rounded-lg border border-amber-100 dark:border-amber-900/70 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-bold text-gray-900 dark:text-white">{title} · {order.id}</div>
                                    <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{order.shippingInfo?.name || 'Cliente'} — {reason}</div>
                                    {requestedAt && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pedido em {new Date(requestedAt).toLocaleString('pt-PT')}</div>}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button disabled={loading} onClick={() => handleReviewRequest(order, kind, 'reject')} className="px-3 py-2 rounded-lg text-xs font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/40 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 flex items-center gap-1"><XCircle size={15}/> Recusar</button>
                                    <button disabled={loading} onClick={() => handleReviewRequest(order, kind, 'approve')} className="px-3 py-2 rounded-lg text-xs font-bold text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-950/40 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 flex items-center gap-1"><CheckCircle size={15}/> {loading ? 'A guardar…' : 'Aprovar'}</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-3"><RotateCcw size={13} className="inline mr-1"/>Ao aprovar um cancelamento, o stock é reposto. Aprovar uma devolução não repõe stock: primeiro confirma que o artigo regressou e está em condições de venda.</p>
            </section>
        )}

        <div className="flex justify-between gap-2">
                <input 
                    type="text" 
                    placeholder="Procurar (ID, Nome, SN)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded text-sm w-64 dark:bg-slate-700 dark:text-white"
                />
                <button onClick={onOpenManualOrder} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 font-bold shadow-md">
                    <ClipboardEdit size={18} /> Registar Encomenda Manual
                </button>
            </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden transition-colors">
            <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-gray-50 dark:bg-slate-700 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase transition-colors">
                        <tr>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Cliente</th>
                            <th className="px-6 py-4">Total</th>
                            <th className="px-6 py-4">Estado</th>
                            <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm transition-colors">
                        {filteredOrders.map(order => (
                            <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-400">{order.id}</td>
                                <td className="px-6 py-4 text-gray-900 dark:text-white"><div className="flex items-center gap-2"><span>{order.shippingInfo?.name || 'N/A'}</span>{(order.cancellationRequest?.status === 'Pendente' || order.returnRequest?.status === 'Pendente') && <span title="Pedido pendente" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"><AlertTriangle size={11}/> Pedido</span>}</div></td>
                                <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{formatCurrency(order.total)}</td>
                                <td className="px-6 py-4">
                                    <select 
                                        value={order.status} 
                                        onChange={(e) => void handleStatusChange(order, e.target.value)}
                                        disabled={updatingStatusOrderId === order.id}
                                        aria-label={`Estado da encomenda ${order.id}`}
                                        className={`text-xs font-bold px-2 py-1 rounded-full border-none cursor-pointer outline-none ${
                                            order.status === 'Entregue' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 
                                            order.status === 'Enviado' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' : 
                                            order.status === 'Pago' ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300' : 
                                            order.status === 'Cancelado' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : 
                                            ['Devolvido', 'Reclamação'].includes(order.status) ? 'bg-red-200 dark:bg-red-900/40 text-red-900 dark:text-red-200' :
                                            order.status === 'Levantamento em Loja' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 
                                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                                        } disabled:cursor-wait disabled:opacity-60`}
                                    >
                                        <option value="Pendente">Pendente</option>
                                        <option value="Processamento">Processamento</option>
                                        <option value="Pago">Pago</option>
                                        <option value="Enviado">Enviado</option>
                                        <option value="Levantamento em Loja">Levantamento em Loja</option>
                                        <option value="Entregue">Entregue</option>
                                        <option value="Reclamação">Reclamação</option>
                                        <option value="Devolvido">Devolvido</option>
                                        <option value="Cancelado">Cancelado</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end items-center gap-2">
                                    {isAdmin && ['Processamento', 'Pago', 'Levantamento em Loja'].includes(order.status) && (
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log('Button "Expedir" clicked for order:', order.id);
                                                onOpenFulfillment(order);
                                            }} 
                                            className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 flex items-center gap-1 shadow-sm mr-2 transition-colors" 
                                            title="Preparar Envio/Levantamento e Stock"
                                        >
                                            <Package size={14} /> {order.status === 'Levantamento em Loja' ? 'Processar' : 'Expedir'}
                                        </button>
                                    )}
                                    <button onClick={() => onViewDetails(order)} className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline">Detalhes</button>
                                    {isAdmin && (
                                        <button onClick={() => onDeleteOrder(order.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Apagar Encomenda">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default OrdersTab;

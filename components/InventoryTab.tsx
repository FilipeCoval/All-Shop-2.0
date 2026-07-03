import React, { useState, useMemo } from 'react';
import { 
  Search, Edit2, Trash2, RefreshCw, Camera, BrainCircuit, UploadCloud, Plus, 
  ChevronDown, ChevronRight, Globe, FileText, Copy, DollarSign, Package, TrendingUp, AlertCircle, Users, Loader2, Layers, BellRing, Info, X, Check, Wallet
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { modularDb } from '../services/firebaseConfig';
import { InventoryProduct, Order, Product, StockReservation } from '../types';
import KpiCard from './KpiCard';

interface InventoryTabProps {
  products: InventoryProduct[];
  catalogProducts?: Product[]; // NOVO: Para poder ir buscar imagens
  pendingOrders: Order[];
  reservations: StockReservation[];
  stats: {
    totalInvested: number;
    realizedRevenue: number;
    realizedProfit: number;
    pendingCashback: number;
    potentialProfit: number;
  };
  onlineUsersCount: number;
  stockAlerts: any[];
  onEdit: (product: InventoryProduct) => void;
  onEditProduct?: (product: InventoryProduct) => void;
  onCreateVariant: (product: InventoryProduct) => void;
  onDeleteGroup: (groupId: string, items: InventoryProduct[]) => void;
  onSale: (product: InventoryProduct) => void;
  onDelete: (id: string) => void;
  onSyncStock: () => void;
  isSyncingStock: boolean;
  onOpenScanner: (mode: 'search' | 'add_unit' | 'sell_unit' | 'tracking' | 'verify_product') => void;
  onOpenCalculator: () => void;
  onAddNew: () => void;
  onOpenInvestedModal: () => void;
  onOpenRevenueModal: () => void;
  onOpenProfitModal: () => void;
  onOpenCashbackManager: () => void;
  onOpenOnlineDetails: () => void;
  onOpenStockAlerts: (product: InventoryProduct) => void;

  copyToClipboard: (text: string) => boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);


type StockSummary = { physical: number; reserved: number; available: number; sold: number; processing: number; };

const reservationExpiresAt = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  if (value && typeof (value as any).toDate === 'function') return (value as any).toDate().getTime();
  if (value && typeof (value as any).seconds === 'number') return (value as any).seconds * 1000;
  return 0;
};

const lotStock = (lot: InventoryProduct) => {
  if (Array.isArray(lot.units) && lot.units.length > 0) {
    const sold = lot.units.filter(unit => unit.status === 'SOLD').length;
    return { physical: Math.max(0, lot.units.length - sold), sold };
  }
  const bought = Math.max(0, Number(lot.quantityBought) || 0);
  const sold = Math.max(0, Number(lot.quantitySold) || 0);
  return { physical: Math.max(0, bought - sold), sold };
};

const summarizeProductStock = (lots: InventoryProduct[], reservations: StockReservation[], pendingOrders: Order[]): StockSummary => {
  const productId = lots[0]?.publicProductId;
  const physical = lots.reduce((total, lot) => total + lotStock(lot).physical, 0);
  const sold = lots.reduce((total, lot) => total + lotStock(lot).sold, 0);
  const now = Date.now();
  const reserved = productId === undefined || productId === null ? 0 : reservations
    .filter(reservation => String(reservation.productId) === String(productId) && reservationExpiresAt(reservation.expiresAt) > now)
    .reduce((total, reservation) => total + Math.max(0, Number(reservation.quantity) || 0), 0);

  // O checkout seguro já desconta stock quando a encomenda passa a Processamento.
  // Por isso, encomendas pendentes são contexto, não um segundo desconto de stock.
  const processing = productId === undefined || productId === null ? 0 : pendingOrders.reduce((total, order) => total + (Array.isArray(order.items)
    ? order.items.reduce((subtotal, item: any) => String(item?.productId) === String(productId)
      ? subtotal + Math.max(0, Number(item?.quantity) || 1)
      : subtotal, 0)
    : 0), 0);

  return { physical, reserved: Math.min(physical, reserved), available: Math.max(0, physical - reserved), sold, processing };
};

const InventoryTab: React.FC<InventoryTabProps> = ({
  products, catalogProducts, pendingOrders, reservations, stats, onlineUsersCount, stockAlerts,
  onEdit, onEditProduct, onCreateVariant, onDeleteGroup, onSale, onDelete,
  onSyncStock, isSyncingStock,
  onOpenScanner, onOpenCalculator, 
  onAddNew,
  onOpenInvestedModal, onOpenRevenueModal, onOpenProfitModal, onOpenCashbackManager, onOpenOnlineDetails,
  onOpenStockAlerts,

  copyToClipboard,
  searchTerm, onSearchChange
}) => {
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingUnitValue, setEditingUnitValue] = useState<string>('');
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);

  const handleSaveUnitSN = async (productId: string, oldSn: string, newSnTrimmed: string) => {
    const newSn = newSnTrimmed.trim();
    if (!newSn) return;
    if (newSn === oldSn) {
      setEditingUnitId(null);
      return;
    }
    
    setSavingUnitId(oldSn);
    try {
      const productRef = doc(modularDb, 'products_inventory', productId);
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        const data = productSnap.data() as InventoryProduct;
        if (data.units) {
          const alreadyExists = data.units.some(u => u.id === newSn);
          if (alreadyExists) {
            alert(`O número de série "${newSn}" já existe neste produto.`);
            setSavingUnitId(null);
            return;
          }
          
          const updatedUnits = data.units.map(u => {
            if (u.id === oldSn) {
              return { ...u, id: newSn };
            }
            return u;
          });
          
          await updateDoc(productRef, { units: updatedUnits });
          console.log(`Unidade de S/N ${oldSn} atualizada para ${newSn}`);
        }
      }
    } catch (e) {
      console.error("Erro ao atualizar S/N:", e);
    } finally {
      setSavingUnitId(null);
      setEditingUnitId(null);
    }
  };

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'SOLD'>('ALL');
  const [cashbackFilter, setCashbackFilter] = useState<'ALL' | 'PENDING' | 'RECEIVED' | 'NONE'>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedReservationProduct, setSelectedReservationProduct] = useState<{ name: string, orders: { id: string, customer: string, qty: number }[] } | null>(null);

  const suppliers = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      if (p.supplierName) s.add(p.supplierName.trim());
    });
    return Array.from(s).sort();
  }, [products]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const summary = summarizeProductStock([p], reservations, pendingOrders);
    const matchesStatus = statusFilter === 'ALL'
      || (statusFilter === 'IN_STOCK' && summary.available > 0)
      || (statusFilter === 'SOLD' && summary.available <= 0);
    const matchesCashback = cashbackFilter === 'ALL' || p.cashbackStatus === cashbackFilter;
    const matchesSupplier = supplierFilter === 'ALL' || p.supplierName === supplierFilter;
    return matchesSearch && matchesStatus && matchesCashback && matchesSupplier;
  });

  const groupedInventory = useMemo(() => {
    const groups: { [key: string]: InventoryProduct[] } = {};
    filteredProducts.forEach(p => {
      const key = p.publicProductId ? p.publicProductId.toString() : `local-${p.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.entries(groups).sort(([, itemsA], [, itemsB]) => (itemsA[0]?.name || '').localeCompare(itemsB[0]?.name || ''));
  }, [filteredProducts]);

  const dashboardStockSummary = useMemo(() => {
    const groups = new Map<string, InventoryProduct[]>();
    products.forEach(product => {
      const key = product.publicProductId !== undefined && product.publicProductId !== null ? String(product.publicProductId) : `local-${product.id}`;
      groups.set(key, [...(groups.get(key) || []), product]);
    });
    return [...groups.values()].reduce<StockSummary>((total, lots) => {
      const stock = summarizeProductStock(lots, reservations, pendingOrders);
      return {
        physical: total.physical + stock.physical, reserved: total.reserved + stock.reserved,
        available: total.available + stock.available, sold: total.sold + stock.sold, processing: total.processing + stock.processing,
      };
    }, { physical: 0, reserved: 0, available: 0, sold: 0, processing: 0 });
  }, [products, reservations, pendingOrders]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
  };

  const handleCopy = (text: string) => {
      if (!copyToClipboard(text)) alert("Não foi possível copiar.");
  };

  return (
    <div className="animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <KpiCard title="Total Investido" value={stats.totalInvested} icon={<Package size={18} />} color="blue" onClick={onOpenInvestedModal} />
            <KpiCard title="Vendas Reais" value={stats.realizedRevenue} icon={<DollarSign size={18} />} color="indigo" onClick={onOpenRevenueModal} />
            <KpiCard title="Lucro Líquido" value={stats.realizedProfit} icon={<TrendingUp size={18} />} color={stats.realizedProfit >= 0 ? "green" : "red"} onClick={onOpenProfitModal} />
            <KpiCard title="Cashback Pendente" value={stats.pendingCashback} icon={<AlertCircle size={18} />} color="yellow" onClick={onOpenCashbackManager} />
            <div onClick={onOpenOnlineDetails} className="p-4 rounded-xl border bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm flex flex-col justify-between h-full cursor-pointer hover:border-green-300 dark:hover:border-green-500 transition-colors relative overflow-hidden">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase flex items-center gap-1">Online Agora</span>
                    <div className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 relative">
                        <Users size={18} />
                        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"></span>
                    </div>
                </div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400 flex items-end gap-2">
                    {onlineUsersCount}
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-normal mb-1">visitantes</span>
                </div>
            </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden transition-colors">
            <div className="bg-gray-50 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-600 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-medium transition-colors">
                <div className="text-gray-500 dark:text-gray-300"><span className="block uppercase text-[10px] text-gray-400">Lotes</span><strong className="text-gray-900 dark:text-white">{products.length}</strong></div>
                <div className="text-blue-600 dark:text-blue-400"><span className="block uppercase text-[10px] text-gray-400">Físico</span><strong>{dashboardStockSummary.physical} un.</strong></div>
                <div className="text-amber-600 dark:text-amber-400"><span className="block uppercase text-[10px] text-gray-400">Reservado</span><strong>{dashboardStockSummary.reserved} un.</strong></div>
                <div className="text-green-600 dark:text-green-400"><span className="block uppercase text-[10px] text-gray-400">Disponível</span><strong>{dashboardStockSummary.available} un.</strong></div>
                <div className="text-slate-600 dark:text-slate-300"><span className="block uppercase text-[10px] text-gray-400">Vendido</span><strong>{dashboardStockSummary.sold} un.</strong></div>
            </div>
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex flex-col lg:flex-row justify-between items-center gap-4 transition-colors">
                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="py-2 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                        <option value="ALL">📦 Todos Estados</option>
                        <option value="IN_STOCK">✅ Em Stock</option>
                        <option value="SOLD">❌ Esgotado</option>
                    </select>
                    <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="py-2 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                        <option value="ALL">🏪 Fornecedores</option>
                        {suppliers.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <select value={cashbackFilter} onChange={(e) => setCashbackFilter(e.target.value as any)} className="py-2 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                        <option value="ALL">💰 Cashbacks</option>
                        <option value="PENDING">Pendente</option>
                        <option value="RECEIVED">Recebido</option>
                    </select>
                </div>
                <div className="flex flex-wrap lg:flex-nowrap gap-2 w-full lg:w-auto">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            placeholder="Pesquisar ou escanear..." 
                            value={searchTerm} 
                            onChange={(e) => onSearchChange(e.target.value)} 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white transition-colors" 
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                    </div>
        
                    <button onClick={onSyncStock} disabled={isSyncingStock} className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1" title="Atualizar stock da loja a partir dos lotes">
                        {isSyncingStock ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    </button>
                    <button onClick={() => onOpenScanner('search')} className="bg-gray-700 dark:bg-slate-600 text-white px-3 py-2 rounded-lg hover:bg-gray-900 dark:hover:bg-slate-500 transition-colors" title="Escanear Código de Barras">
                        <Camera size={18} />
                    </button>
                    <button onClick={onOpenCalculator} className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1" title="Calculadora de Lucro">
                        <BrainCircuit size={18} />
                    </button>
                    <button onClick={onAddNew} className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                        <Plus size={18} />
                    </button>
                </div>
            </div>
        
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="bg-gray-50 dark:bg-slate-700 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase transition-colors">
                        <tr>
                            <th className="px-6 py-3 w-10"></th>
                            <th className="px-6 py-3">Produto (Loja)</th>
                            <th className="px-3 py-3 text-center">Físico</th>
                            <th className="px-3 py-3 text-center hidden lg:table-cell">Reservado</th>
                            <th className="px-3 py-3 text-center">Disponível</th>
                            <th className="px-3 py-3 text-center hidden xl:table-cell">Vendido</th>
                            <th className="px-3 py-3 text-center">Estado</th>
                            <th className="px-4 py-3 text-right">Preço Loja</th>
                            <th className="px-4 py-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm transition-colors">
                        {groupedInventory.map(([groupId, items]) => {
                            const mainItem = items[0]; 
                            const isExpanded = expandedGroups.includes(groupId);
                            
                            // Fetch catalog product as source of truth for stock
                            const catalogProd = catalogProducts?.find(p => String(p.id) === String(mainItem.publicProductId));
                            
                            // Uma única leitura de stock: físico, reservas de carrinho e disponível.
                            const stockSummary = summarizeProductStock(items, reservations, pendingOrders);
                            const totalPhysicalStock = stockSummary.physical;
                            const activeReservationsCount = stockSummary.reserved;
                            const availableStock = stockSummary.available;
                            const soldStock = stockSummary.sold;
                            const pendingInOrders = stockSummary.processing;
                            const catalogAvailableStock = Number(catalogProd?.stock);
                            const hasStockMismatch = Number.isFinite(catalogAvailableStock) && catalogAvailableStock !== availableStock;

                            const alertsCount = mainItem.publicProductId 
                                ? stockAlerts.filter(a => a.productId === mainItem.publicProductId).length
                                : 0;

                            return (
                                <React.Fragment key={groupId}>
                                    <tr onClick={() => toggleGroup(groupId)} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${isExpanded ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                                        <td className="px-6 py-4">
                                            <button onClick={(event) => { event.stopPropagation(); toggleGroup(groupId); }} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 transition-colors">
                                                {isExpanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {(() => {
                                                    const catalogProd = catalogProducts?.find(p => String(p.id) === String(mainItem.publicProductId));
                                                    const imgUrl = catalogProd?.image || (catalogProd?.images && catalogProd.images[0]) || (mainItem.images && mainItem.images[0]);
                                                    return imgUrl ? (
                                                        <img src={imgUrl} className="w-10 h-10 object-cover rounded bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600" alt="" />
                                                    ) : null;
                                                })()}
                                                <div>
                                                    <div className="font-bold text-gray-900 dark:text-white">{mainItem.name}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                                                        <span>{mainItem.category} • {items.length} Lote(s)</span>
                                                        {(() => {
                                                            const totalCashback = items.reduce((acc, current) => acc + (current.cashbackValue || 0), 0);
                                                            const hasPending = items.some(current => current.cashbackStatus === 'PENDING' && (current.cashbackValue || 0) > 0);
                                                            if (totalCashback > 0) {
                                                                return (
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${hasPending ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`} title={`Total Cashback: ${formatCurrency(totalCashback)}`}>
                                                                        <Wallet size={10} />
                                                                        {formatCurrency(totalCashback)} {hasPending ? 'Pendente' : 'Recebido'}
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-center">
                                            <span className={`font-bold px-2 py-1 rounded text-sm ${totalPhysicalStock > 0 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{totalPhysicalStock}</span>
                                        </td>
                                        <td className="px-3 py-4 text-center hidden lg:table-cell">
                                            <span className={`font-bold px-2 py-1 rounded text-sm ${activeReservationsCount > 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'text-gray-400 dark:text-gray-500'}`}>{activeReservationsCount}</span>
                                        </td>
                                        <td className="px-3 py-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`font-bold px-2 py-1 rounded text-sm ${availableStock > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{availableStock}</span>
                                                {hasStockMismatch && <button onClick={(event) => { event.stopPropagation(); onSyncStock(); }} className="text-[9px] font-bold text-orange-600 dark:text-orange-400 hover:underline" title={`A loja mostra ${catalogAvailableStock}; os lotes calculam ${availableStock}. Clique para atualizar a loja a partir dos lotes.`}>Atualizar loja</button>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-center hidden xl:table-cell"><span className="font-bold text-gray-600 dark:text-gray-300">{soldStock}</span></td>

                                        <td className="px-4 py-4 text-center">
                                            {mainItem.comingSoon ? (
                                                <span className="text-purple-600 dark:text-purple-400 font-bold text-xs uppercase bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded">Em Breve</span>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={`text-xs font-bold uppercase ${availableStock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                                        {availableStock > 0 ? 'Disponível' : 'Esgotado'}
                                                    </span>
                                                    {activeReservationsCount > 0 && <span className="text-[9px] text-amber-600 dark:text-amber-400">{activeReservationsCount} em reserva</span>}
                                                    {pendingInOrders > 0 && <span className="text-[9px] text-slate-500 dark:text-slate-400">{pendingInOrders} em processamento</span>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right font-medium text-gray-900 dark:text-white">
                                            {formatCurrency(mainItem.salePrice || mainItem.targetSalePrice || 0)}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                {alertsCount > 0 && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onOpenStockAlerts(mainItem); }} 
                                                        className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors animate-pulse"
                                                        title="Notificar Clientes"
                                                    >
                                                        <BellRing size={14} /> {alertsCount}
                                                    </button>
                                                )}
                                                
                                                <button onClick={(e) => { e.stopPropagation(); onCreateVariant(mainItem); }} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" title="Adicionar um novo lote ou variante">
                                                    <Layers size={14} /> <span className="hidden xl:inline">Novo lote</span>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); onDeleteGroup(groupId, items); }} className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Apagar todos os lotes deste produto">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 transition-colors">
                                            <td colSpan={9} className="px-4 py-4">
                                                <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm ml-10 transition-colors">
                                                    <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                        <div>
                                                            <div className="font-bold text-sm text-gray-900 dark:text-white">Lotes, unidades e rastreabilidade</div>
                                                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                                {items.length} lote(s) · Preço da loja: <strong className="text-gray-700 dark:text-gray-200">{formatCurrency(catalogProd?.price ?? mainItem.salePrice ?? mainItem.targetSalePrice ?? 0)}</strong>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {onEditProduct && mainItem.publicProductId && (
                                                                <button onClick={(event) => { event.stopPropagation(); onEditProduct(mainItem); }} className="flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors" title="Editar preço, imagens, descrição e promoções do catálogo">
                                                                    <Globe size={14} /> Catálogo
                                                                </button>
                                                            )}
                                                            <button onClick={(event) => { event.stopPropagation(); onCreateVariant(mainItem); }} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                                                <Plus size={14} /> Lote
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 uppercase transition-colors">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left">Lote / Variante</th>
                                                                <th className="px-4 py-2 text-left">Origem</th>
                                                                <th className="px-4 py-2 text-center">Unidades</th>
                                                                <th className="px-4 py-2 text-right">Custo unit.</th>
                                                                <th className="px-4 py-2 text-center">Margem estimada</th>
                                                                <th className="px-4 py-2 text-right">Ações</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800 transition-colors">
                                                            {items.map(p => { 
                                                                let qtyBought = p.quantityBought || 0;
                                                                let qtySold = p.quantitySold || 0;
                                                                if (p.units && Array.isArray(p.units) && p.units.length > 0) {
                                                                    qtyBought = p.units.length;
                                                                    qtySold = p.units.filter(u => u.status === 'SOLD').length;
                                                                }
                                                                const batchPhysical = Math.max(0, qtyBought - qtySold);
                                                                const batchReserved = Math.min(batchPhysical, Math.max(0, Number((p as any).reserved || 0)));
                                                                const batchStock = Math.max(0, batchPhysical - batchReserved);

                                                                const salePrice = Number(catalogProd?.price ?? p.salePrice ?? p.targetSalePrice ?? 0); 
                                                                const purchasePrice = p.purchasePrice || 0; 
                                                                const cashbackValue = (p.cashbackValue || 0) / (qtyBought || 1); 
                                                                const finalProfit = salePrice - purchasePrice + cashbackValue; 
                                                                const hasLossBeforeCashback = salePrice < purchasePrice; 
                                                                const profitColor = finalProfit > 0 ? 'text-green-600 dark:text-green-400' : finalProfit < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'; 
                                                                
                                                                return ( 
                                                                    <tr key={p.id} className="hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
                                                                        <td className="px-4 py-3">
                                                                            <div className="font-bold whitespace-normal text-gray-900 dark:text-white">{new Date(p.purchaseDate).toLocaleDateString()}</div>
                                                                            <div className="flex flex-wrap gap-1 mt-1 items-center">
                                                                                {p.variant && <span className="text-[10px] text-blue-500 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded mr-1">{p.variant}</span>}
                                                                                {p.cashbackValue > 0 && (
                                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${p.cashbackStatus === 'PENDING' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                                                                                        <Wallet size={10} />
                                                                                        {formatCurrency(p.cashbackValue)} ({p.cashbackStatus === 'PENDING' ? 'Pendente' : 'Recebido'})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {(p.cashbackPlatform || p.cashbackAccount || p.cashbackExpectedDate) && p.cashbackValue > 0 && (
                                                                                <div className="text-[9px] text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-slate-800/40 p-1.5 rounded border border-gray-100 dark:border-slate-800/60 mt-1.5 space-y-0.5 max-w-[240px]">
                                                                                    {p.cashbackPlatform && <div><span className="font-bold">Plataforma:</span> {p.cashbackPlatform}</div>}
                                                                                    {p.cashbackAccount && <div><span className="font-bold">Conta:</span> {p.cashbackAccount}</div>}
                                                                                    {p.cashbackExpectedDate && <div><span className="font-bold">Previsão:</span> {new Date(p.cashbackExpectedDate).toLocaleDateString()}</div>}
                                                                                </div>
                                                                            )}
                                                                            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{p.description?.substring(0, 30)}...</div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            {p.supplierName ? (
                                                                                <div>
                                                                                    <div className="flex items-center gap-1 font-bold text-gray-700 dark:text-gray-300 text-[10px]">
                                                                                        <Globe size={10} className="text-indigo-500 dark:text-indigo-400" /> {p.supplierName}
                                                                                    </div>
                                                                                    {p.supplierOrderId && (
                                                                                        <div 
                                                                                            className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded w-fit mt-1 group cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors" 
                                                                                            onClick={() => handleCopy(p.supplierOrderId!)} 
                                                                                            title="Clique para copiar"
                                                                                        >
                                                                                            <FileText size={10} /> {p.supplierOrderId} <Copy size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <div className="flex justify-center text-[10px] mb-1 font-medium text-gray-600 dark:text-gray-300"><span>{batchStock} disponível / {batchPhysical} físico</span></div>
                                                                            {batchReserved > 0 && <div className="text-[9px] text-amber-600 dark:text-amber-400 mb-1">{batchReserved} reservado</div>}
                                                                            <div className="w-20 bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden mx-auto">
                                                                                <div 
                                                                                    className={`h-full rounded-full ${ qtyBought > 0 && (qtySold / Math.max(qtyBought, 1)) >= 1 ? 'bg-gray-400 dark:bg-gray-600' : 'bg-blue-500 dark:bg-blue-400'}`} 
                                                                                    style={{ width: `${qtyBought > 0 ? ((qtySold / Math.max(qtyBought, 1)) * 100) : 0}%` }}
                                                                                ></div>
                                                                            </div>
                                                                            {p.units && p.units.length > 0 && (
                                                                                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800 space-y-1.5 max-w-[200px] mx-auto">
                                                                                    {p.units.sort((a,b) => a.status.localeCompare(b.status)).map(unit => {
                                                                                        const statusColor = unit.status === 'AVAILABLE' 
                                                                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
                                                                                            : unit.status === 'SOLD' 
                                                                                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                                                                                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
                                                                                        const statusText = unit.status === 'AVAILABLE' ? 'Disponível' : unit.status === 'SOLD' ? 'Vendido' : 'Reservado';
                                                                                        
                                                                                        const isEditing = editingUnitId === unit.id;
                                                                                        const isSaving = savingUnitId === unit.id;

                                                                                        if (isEditing) {
                                                                                            return (
                                                                                                <div key={unit.id} className="flex justify-between items-center text-[10px] gap-1 py-0.5">
                                                                                                    <div className="flex items-center gap-1 w-full">
                                                                                                        <input 
                                                                                                            type="text" 
                                                                                                            value={editingUnitValue} 
                                                                                                            onChange={(e) => setEditingUnitValue(e.target.value)}
                                                                                                            disabled={isSaving}
                                                                                                            className="w-full bg-white dark:bg-slate-800 border border-indigo-400 rounded px-1.5 py-0.5 font-mono text-[10px] text-gray-800 dark:text-gray-200 focus:outline-none"
                                                                                                            autoFocus
                                                                                                            onKeyDown={(e) => {
                                                                                                                if (e.key === 'Enter') handleSaveUnitSN(p.id, unit.id, editingUnitValue);
                                                                                                                if (e.key === 'Escape') setEditingUnitId(null);
                                                                                                            }}
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                                                        {isSaving ? (
                                                                                                            <Loader2 size={10} className="animate-spin text-indigo-500" />
                                                                                                        ) : (
                                                                                                            <>
                                                                                                                <button 
                                                                                                                    onClick={() => handleSaveUnitSN(p.id, unit.id, editingUnitValue)} 
                                                                                                                    className="text-green-600 hover:text-green-800 p-0.5" 
                                                                                                                    title="Guardar"
                                                                                                                >
                                                                                                                    <Check size={10} />
                                                                                                                </button>
                                                                                                                <button 
                                                                                                                    onClick={() => setEditingUnitId(null)} 
                                                                                                                    className="text-red-500 hover:text-red-700 p-0.5" 
                                                                                                                    title="Cancelar"
                                                                                                                >
                                                                                                                    <X size={10} />
                                                                                                                </button>
                                                                                                            </>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        }

                                                                                        return (
                                                                                            <div key={unit.id} className="flex justify-between items-center text-[10px] group py-0.5">
                                                                                                <div className="flex items-center gap-1 overflow-hidden w-full">
                                                                                                    <span className={`font-mono truncate max-w-[85px] ${unit.status !== 'AVAILABLE' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`} title={unit.id}>{unit.id}</span>
                                                                                                    <span className={`px-1 py-0.2 rounded-full font-medium ${statusColor} shrink-0`}>{statusText}</span>
                                                                                                    {unit.status === 'AVAILABLE' && (
                                                                                                        <button 
                                                                                                            onClick={() => {
                                                                                                                setEditingUnitId(unit.id);
                                                                                                                setEditingUnitValue(unit.id);
                                                                                                            }} 
                                                                                                            title="Editar S/N" 
                                                                                                            className="text-indigo-500 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 shrink-0"
                                                                                                        >
                                                                                                            <Edit2 size={10} />
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                                                                                    <span className="text-gray-400 dark:text-gray-500 text-[9px]">{unit.addedAt ? new Date(unit.addedAt).toLocaleDateString('pt-PT') : '-'}</span>
                                                                                                    <button onClick={() => handleCopy(unit.id)} title="Copiar S/N" className="text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                                                                                                        <Copy size={10} />
                                                                                                    </button>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{formatCurrency(p.purchasePrice)}</td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            {salePrice > 0 ? (
                                                                                <div title={`Cálculo: preço da loja (${formatCurrency(salePrice)}) - custo (${formatCurrency(purchasePrice)}) ${cashbackValue > 0 ? `+ Cashback (${formatCurrency(cashbackValue)})` : ''}`}>
                                                                                    <div className={`font-bold text-sm ${profitColor}`}>
                                                                                        {finalProfit >= 0 ? '+' : ''}{formatCurrency(finalProfit)}
                                                                                    </div>
                                                                                    {cashbackValue > 0 && (
                                                                                        <div className={`text-[10px] font-medium mt-0.5 ${p.cashbackStatus === 'PENDING' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-700 dark:text-green-400'}`}>
                                                                                            Cashback {p.cashbackStatus === 'PENDING' ? 'Pendente' : 'Recebido'}
                                                                                        </div>
                                                                                    )}
                                                                                    {hasLossBeforeCashback && cashbackValue > 0 && finalProfit > 0 && (
                                                                                        <div className="text-[10px] font-bold text-orange-500 dark:text-orange-400 mt-0.5" title="O preço de venda é inferior ao de compra, mas o cashback compensa.">
                                                                                            Lucro c/ Cashback
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right flex justify-end gap-1">
                                                                            <button onClick={() => onEdit(p)} className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 p-1.5 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm transition-colors" title="Editar este lote">
                                                                                <Edit2 size={14}/>
                                                                            </button>
                                                                            <button onClick={() => onDelete(p.id)} className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/30 shadow-sm transition-colors" title="Apagar lote">
                                                                                <Trash2 size={14}/>
                                                                            </button>
                                                                        </td>
                                                                    </tr> 
                                                                ); 
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
        {/* Modal de Detalhes de Reservas */}
        {selectedReservationProduct && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-colors">
                    <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-orange-50 dark:bg-orange-900/20 transition-colors">
                        <h3 className="font-bold text-orange-900 dark:text-orange-300 flex items-center gap-2">
                            <Package size={18} /> Reservas: {selectedReservationProduct.name}
                        </h3>
                        <button onClick={() => setSelectedReservationProduct(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-4 max-h-[60vh] overflow-y-auto bg-white dark:bg-slate-900 transition-colors">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Estas encomendas têm este produto mas o stock ainda não foi descontado oficialmente no inventário físico.</p>
                        <div className="space-y-2">
                            {selectedReservationProduct.orders.map((order, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 transition-colors">
                                    <div>
                                        <div className="text-sm font-bold text-gray-900 dark:text-white">#{order.id}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{order.customer}</div>
                                    </div>
                                    <div className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-1 rounded font-bold text-xs">
                                        {order.qty} un.
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 flex justify-end transition-colors">
                        <button 
                            onClick={() => setSelectedReservationProduct(null)}
                            className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-bold text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default InventoryTab;

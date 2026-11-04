import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  BellRing,
  BrainCircuit,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Edit2,
  Globe,
  Info,
  Layers,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { modularDb } from '../services/firebaseConfig';
import { InventoryProduct, Order, Product, ProductUnit, StockReservation } from '../types';
import KpiCard from './KpiCard';
import {
  getLotStockMetrics,
  getProductStockMetrics,
  isReservationActive,
  lotUnidentifiedUnitCount,
  unitMatchesSearch,
} from '../services/inventoryMetrics';

interface InventoryTabProps {
  products: InventoryProduct[];
  catalogProducts?: Product[];
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

type StockFilter = 'ALL' | 'AVAILABLE' | 'LOW' | 'OUT' | 'TRACKED';
type UnitFilter = 'ALL' | 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RETURNED' | 'DEFECTIVE' | 'IN_TRANSIT' | 'UNIDENTIFIED';
type UnitEdit = { lotId: string; unitId: string; value: string } | null;

const currency = (value: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));

const normalise = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const unitCode = (unit: ProductUnit) => unit.serialNumber || unit.internalLabel || unit.id;

const unitStatusLabel: Record<string, string> = {
  AVAILABLE: 'Disponível',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  RETURNED: 'Devolvido',
  DEFECTIVE: 'Defeituoso',
  IN_TRANSIT: 'Em trânsito',
};

const unitStatusClass: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  RESERVED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SOLD: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  RETURNED: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  DEFECTIVE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  IN_TRANSIT: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

const Metric = ({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) => {
  const toneClasses = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${toneClasses[tone]}`}>
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  );
};

const InventoryTab: React.FC<InventoryTabProps> = ({
  products,
  catalogProducts = [],
  reservations,
  stats,
  onlineUsersCount,
  stockAlerts,
  onEdit,
  onEditProduct,
  onCreateVariant,
  onDeleteGroup,
  onSale,
  onDelete,
  onSyncStock,
  isSyncingStock,
  onOpenScanner,
  onOpenCalculator,
  onAddNew,
  onOpenInvestedModal,
  onOpenRevenueModal,
  onOpenProfitModal,
  onOpenCashbackManager,
  onOpenOnlineDetails,
  onOpenStockAlerts,
  copyToClipboard,
  searchTerm,
  onSearchChange,
}) => {
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [unitEdit, setUnitEdit] = useState<UnitEdit>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [showOnlyAlerts, setShowOnlyAlerts] = useState(false);
  const now = Date.now();

  const suppliers = useMemo(
    () => Array.from(new Set(products.map(product => product.supplierName?.trim()).filter(Boolean) as string[])).sort(),
    [products],
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, InventoryProduct[]>();
    for (const product of products) {
      const key = product.publicProductId !== undefined && product.publicProductId !== null
        ? `public-${product.publicProductId}`
        : `private-${product.id}`;
      const current = grouped.get(key) || [];
      current.push(product);
      grouped.set(key, current);
    }

    const term = normalise(searchTerm);
    return Array.from(grouped.entries())
      .map(([key, lots]) => {
        const metrics = getProductStockMetrics(lots, reservations, now);
        const catalog = catalogProducts.find(item => String(item.id) === String(lots[0].publicProductId));
        const productAlertCount = lots[0].publicProductId
          ? stockAlerts.filter(alert => String(alert.productId) === String(lots[0].publicProductId)).length
          : 0;

        const matchesSearch = !term || lots.some(lot =>
          [lot.name, lot.category, lot.supplierName, lot.supplierOrderId, lot.variant]
            .some(value => normalise(value).includes(term))
          || (lot.units || []).some(unit => unitMatchesSearch(unit, term)),
        );

        const matchesStock =
          stockFilter === 'ALL'
          || (stockFilter === 'AVAILABLE' && metrics.available > 0)
          || (stockFilter === 'LOW' && metrics.available > 0 && metrics.available <= 3)
          || (stockFilter === 'OUT' && metrics.available === 0)
          || (stockFilter === 'TRACKED' && lots.some(lot => (lot.units || []).length > 0));

        const matchesSupplier =
          supplierFilter === 'ALL' || lots.some(lot => lot.supplierName === supplierFilter);

        const matchesUnit = unitFilter === 'ALL' || lots.some(lot => {
          const units = lot.units || [];
          if (unitFilter === 'UNIDENTIFIED') return units.length === 0 || lotUnidentifiedUnitCount(lot) > 0;
          return units.some(unit => unit.status === unitFilter);
        });

        const matchesAlerts = !showOnlyAlerts || productAlertCount > 0;

        return { key, lots, metrics, catalog, productAlertCount, matchesSearch, matchesStock, matchesSupplier, matchesUnit, matchesAlerts };
      })
      .filter(group => group.matchesSearch && group.matchesStock && group.matchesSupplier && group.matchesUnit && group.matchesAlerts)
      .sort((a, b) => a.lots[0].name.localeCompare(b.lots[0].name, 'pt-PT'));
  }, [products, reservations, catalogProducts, searchTerm, stockFilter, unitFilter, supplierFilter, stockAlerts, showOnlyAlerts, now]);

  const totals = useMemo(() => groups.reduce(
    (sum, group) => ({
      physical: sum.physical + group.metrics.physical,
      reserved: sum.reserved + group.metrics.reserved,
      available: sum.available + group.metrics.available,
      sold: sum.sold + group.metrics.sold,
      defective: sum.defective + group.metrics.defective,
      inTransit: sum.inTransit + group.metrics.inTransit,
    }),
    { physical: 0, reserved: 0, available: 0, sold: 0, defective: 0, inTransit: 0 },
  ), [groups]);

  const toggleGroup = (key: string) => {
    setExpanded(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  };

  const expandAll = () => setExpanded(groups.map(group => group.key));
  const collapseAll = () => setExpanded([]);

  useEffect(() => {
    const term = normalise(searchTerm);
    if (!term) return;
    const matching = groups.filter(group => group.matchesSearch).map(group => group.key);
    if (matching.length) setExpanded(current => Array.from(new Set([...current, ...matching])));
  }, [searchTerm, groups]);

  const saveUnitCode = async () => {
    if (!unitEdit) return;
    const value = unitEdit.value.trim();
    if (!value) return;

    setSavingUnit(true);
    try {
      const ref = doc(modularDb, 'products_inventory', unitEdit.lotId);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) throw new Error('Lote não encontrado.');

      const lot = snapshot.data() as InventoryProduct;
      const units = Array.isArray(lot.units) ? lot.units : [];
      const duplicate = units.some(unit => unit.id !== unitEdit.unitId && [unit.id, unit.serialNumber, unit.internalLabel, unit.barcode]
        .some(code => normalise(code) === normalise(value)));
      if (duplicate) throw new Error('Já existe uma unidade com este código neste lote.');

      const updatedUnits = units.map(unit => unit.id === unitEdit.unitId
        ? { ...unit, serialNumber: value, id: unit.id || value }
        : unit);

      await updateDoc(ref, { units: updatedUnits });
      setUnitEdit(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar a unidade.');
    } finally {
      setSavingUnit(false);
    }
  };

  const activeReservationCount = reservations.filter(reservation => isReservationActive(reservation, now)).length;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KpiCard title="Investido" value={stats.totalInvested} icon={<Package size={18} />} color="blue" onClick={onOpenInvestedModal} />
        <KpiCard title="Vendas reais" value={stats.realizedRevenue} icon={<Wallet size={18} />} color="indigo" onClick={onOpenRevenueModal} />
        <KpiCard title="Lucro líquido" value={stats.realizedProfit} icon={<TrendingUp size={18} />} color={stats.realizedProfit >= 0 ? 'green' : 'red'} onClick={onOpenProfitModal} />
        <KpiCard title="Cashback pendente" value={stats.pendingCashback} icon={<AlertTriangle size={18} />} color="yellow" onClick={onOpenCashbackManager} />
        <button onClick={onOpenOnlineDetails} className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Online agora</div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">{onlineUsersCount}</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">visitantes ativos</div>
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-gray-900 dark:text-white">
                <Layers size={20} className="text-blue-600" /> Stock & Rastreabilidade
              </h2>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Lotes/unidades são a fonte de verdade. A loja mostra apenas o stock disponível calculado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Metric label="Físico" value={totals.physical} tone="blue" />
              <Metric label="Reservado" value={totals.reserved} tone="amber" />
              <Metric label="Disponível" value={totals.available} tone="green" />
              <Metric label="Vendido" value={totals.sold} />
              {totals.defective > 0 && <Metric label="Defeituoso" value={totals.defective} tone="red" />}
              {totals.inTransit > 0 && <Metric label="Em trânsito" value={totals.inTransit} tone="blue" />}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-gray-200 p-4 dark:border-slate-700 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={event => onSearchChange(event.target.value)}
                placeholder="Pesquisar produto, S/N, EAN, etiqueta, encomenda, cliente ou fornecedor…"
                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-950"
              />
            </div>
            <button onClick={() => onOpenScanner('search')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-950 dark:bg-slate-600 dark:hover:bg-slate-500" title="Ler código de barras/SN">
              <Camera size={16} /> Scanner
            </button>
            <button onClick={onOpenCalculator} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-700" title="Calculadora de margem">
              <BrainCircuit size={16} /> Margens
            </button>
            <button onClick={onAddNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700">
              <Plus size={16} /> Novo lote
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <select value={stockFilter} onChange={event => setStockFilter(event.target.value as StockFilter)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200">
              <option value="ALL">Todo o stock</option>
              <option value="AVAILABLE">Disponível</option>
              <option value="LOW">Baixo (1–3)</option>
              <option value="OUT">Esgotado</option>
              <option value="TRACKED">Com unidades/SN</option>
            </select>
            <select value={unitFilter} onChange={event => setUnitFilter(event.target.value as UnitFilter)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200" title="Filtrar por estado da unidade">
              <option value="ALL">Todas unidades</option>
              <option value="AVAILABLE">Unidades disponíveis</option>
              <option value="RESERVED">Unidades reservadas</option>
              <option value="SOLD">Unidades vendidas</option>
              <option value="RETURNED">Unidades devolvidas</option>
              <option value="DEFECTIVE">Unidades defeituosas</option>
              <option value="IN_TRANSIT">Unidades em trânsito</option>
              <option value="UNIDENTIFIED">Sem identificação</option>
            </select>
            <select value={supplierFilter} onChange={event => setSupplierFilter(event.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200">
              <option value="ALL">Todos fornecedores</option>
              {suppliers.map(supplier => <option key={supplier} value={supplier}>{supplier}</option>)}
            </select>
            <button onClick={expandAll} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200" title="Abrir todos os produtos">Abrir</button>
            <button onClick={collapseAll} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200" title="Fechar todos os produtos">Fechar</button>
            <button onClick={() => setShowOnlyAlerts(value => !value)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${showOnlyAlerts ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'border-gray-300 text-gray-600 dark:border-slate-600 dark:text-gray-300'}`}>
              <BellRing size={14} className="mr-1 inline" /> Alertas
            </button>
            <button onClick={onSyncStock} disabled={isSyncingStock} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/60 dark:bg-blue-900/20 dark:text-blue-300" title="Atualizar apenas o stock disponível do catálogo a partir dos lotes">
              {isSyncingStock ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : <RefreshCw size={14} className="mr-1 inline" />}
              Atualizar loja
            </button>
          </div>
        </div>

        <div className="border-b border-gray-200 px-5 py-2 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
          {groups.length} produto(s) · {activeReservationCount} reserva(s) ativa(s) · preço/promoção/imagens ficam no Catálogo
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3">Produto / catálogo</th>
                <th className="px-3 py-3 text-center">Físico</th>
                <th className="px-3 py-3 text-center">Reservado</th>
                <th className="px-3 py-3 text-center">Disponível</th>
                <th className="px-3 py-3 text-center">Vendido</th>
                <th className="px-3 py-3 text-right">Preço loja</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {groups.map(group => {
                const mainLot = group.lots[0];
                const isOpen = expanded.includes(group.key);
                const image = group.catalog?.image || group.catalog?.images?.[0] || mainLot.images?.[0];
                const publicStock = Number(group.catalog?.stock ?? 0);
                const discrepancy = group.catalog && publicStock !== group.metrics.available;

                return (
                  <React.Fragment key={group.key}>
                    <tr className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70 ${isOpen ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`} onClick={() => toggleGroup(group.key)}>
                      <td className="px-4 py-4 text-slate-500">{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {image ? <img src={image} alt="" className="h-11 w-11 rounded-lg border border-slate-200 object-cover dark:border-slate-700" /> : <div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-700"><Package size={18} /></div>}
                          <div className="min-w-0">
                            <div className="truncate font-black text-slate-900 dark:text-white">{mainLot.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{group.catalog ? 'Produto público' : 'Lote privado'}</span>
                              <span>•</span>
                              <span>{group.metrics.lots} lote(s)</span>
                              {group.lots.some(lot => (lot.units || []).length > 0) && <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"><Barcode size={10} /> Unidades</span>}
                              {group.productAlertCount > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{group.productAlertCount} alerta(s)</span>}
                              {discrepancy && <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300"><AlertTriangle size={10} /> Loja por atualizar</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center font-black text-slate-800 dark:text-slate-100">{group.metrics.physical}</td>
                      <td className="px-3 py-4 text-center"><Metric label="" value={group.metrics.reserved} tone={group.metrics.reserved ? 'amber' : 'slate'} /></td>
                      <td className="px-3 py-4 text-center"><Metric label="" value={group.metrics.available} tone={group.metrics.available ? 'green' : 'red'} /></td>
                      <td className="px-3 py-4 text-center text-slate-600 dark:text-slate-300">{group.metrics.sold}</td>
                      <td className="px-3 py-4 text-right font-black text-slate-900 dark:text-white">{group.catalog ? currency(group.catalog.price) : '—'}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-1" onClick={event => event.stopPropagation()}>
                          {group.productAlertCount > 0 && <button onClick={() => onOpenStockAlerts(mainLot)} className="rounded-lg bg-amber-100 p-2 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300" title="Gerir alertas"><BellRing size={15} /></button>}
                          {group.catalog && onEditProduct && <button onClick={() => onEditProduct(mainLot)} className="rounded-lg bg-blue-50 p-2 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300" title="Abrir catálogo"><Globe size={15} /></button>}
                          <button onClick={() => onEdit(mainLot)} className="rounded-lg bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200" title="Editar lote"><Edit2 size={15} /></button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-slate-50/70 dark:bg-slate-950/20">
                        <td colSpan={8} className="p-4">
                          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="font-black text-slate-900 dark:text-white">Lotes e unidades</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Fornecedor, custo, rastreabilidade e histórico pertencem ao lote — não ao catálogo.</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {group.catalog && <button onClick={() => onCreateVariant(mainLot)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-300"><Tag size={13} className="mr-1 inline" /> Variante</button>}
                                <button onClick={() => onAddNew()} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300"><Plus size={13} className="mr-1 inline" /> Novo lote</button>
                                {group.lots.length > 1 && <button onClick={() => onDeleteGroup(group.key, group.lots)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"><Trash2 size={13} className="mr-1 inline" /> Apagar grupo</button>}
                              </div>
                            </div>

                            <div className="divide-y divide-slate-100 dark:divide-slate-700">
                              {group.lots.map(lot => {
                                const metrics = getLotStockMetrics(lot, reservations, now);
                                const unitCount = (lot.units || []).length;
                                const catalogPrice = group.catalog?.price ?? 0;
                                const netUnitCost = Math.max(0, Number(lot.purchasePrice || 0) - (Number(lot.cashbackValue || 0) / Math.max(1, Number(lot.quantityBought || unitCount || 1))));
                                const estimatedMargin = catalogPrice ? catalogPrice - netUnitCost : 0;

                                return (
                                  <div key={lot.id} className="p-4">
                                    <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_auto_auto] xl:items-start">
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-black text-slate-900 dark:text-white">{lot.variant ? `${lot.name} · ${lot.variant}` : lot.name}</span>
                                          {lot.supplierName && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{lot.supplierName}</span>}
                                          {lot.cashbackStatus === 'PENDING' && lot.cashbackValue > 0 && <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Cashback pendente {currency(lot.cashbackValue)}</span>}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          <Metric label="Físico" value={metrics.physical} tone="blue" />
                                          <Metric label="Reservado" value={metrics.reserved} tone={metrics.reserved ? 'amber' : 'slate'} />
                                          <Metric label="Disponível" value={metrics.available} tone={metrics.available ? 'green' : 'red'} />
                                          <Metric label="Vendido" value={metrics.sold} />
                                          {metrics.returned > 0 && <Metric label="Devolvido" value={metrics.returned} tone="blue" />}
                                          {metrics.defective > 0 && <Metric label="Defeituoso" value={metrics.defective} tone="red" />}
                                          {metrics.inTransit > 0 && <Metric label="Em trânsito" value={metrics.inTransit} tone="blue" />}
                                          {unitCount === 0 && <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">Sem unidades identificadas</span>}
                                        </div>
                                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                          Compra: <strong>{currency(lot.purchasePrice)}</strong> · Custo líquido: <strong>{currency(netUnitCost)}</strong> · Margem estimada: <strong className={estimatedMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{currency(estimatedMargin)}</strong>
                                        </div>
                                      </div>

                                      <div className="min-w-[230px] rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                                        <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Unidades / etiquetas</div>
                                        {unitCount === 0 ? (
                                          <div className="text-xs text-slate-500 dark:text-slate-400">Este lote é controlado por quantidade. Adiciona S/N ou etiquetas no editor do lote.</div>
                                        ) : (
                                          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                                            {(lot.units || []).map(unit => {
                                              const editing = unitEdit?.lotId === lot.id && unitEdit.unitId === unit.id;
                                              return (
                                                <div key={unit.id} className={`group flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px] shadow-sm dark:bg-slate-800 ${normalise(searchTerm) && unitMatchesSearch(unit, searchTerm) ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700' : 'bg-white'}`}>
                                                  {editing ? (
                                                    <input value={unitEdit.value} onChange={event => setUnitEdit(current => current ? { ...current, value: event.target.value } : current)} onKeyDown={event => { if (event.key === 'Enter') saveUnitCode(); if (event.key === 'Escape') setUnitEdit(null); }} className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 font-mono outline-none dark:bg-slate-900" autoFocus />
                                                  ) : (
                                                    <div className="min-w-0">
                                                      <div className="truncate font-mono text-slate-700 dark:text-slate-200" title={unitCode(unit)}>{unitCode(unit)}</div>
                                                      {unit.barcode && <div className="truncate text-[10px] text-slate-400">EAN: {unit.barcode}</div>}
                                                      {unit.soldToOrder && <div className="truncate text-[10px] font-semibold text-violet-600 dark:text-violet-300" title={`Encomenda ${unit.soldToOrder}`}>Encomenda: {unit.soldToOrder}</div>}
                                                      {unit.soldToCustomerName && <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">Cliente: {unit.soldToCustomerName}</div>}
                                                    </div>
                                                  )}
                                                  <div className="flex shrink-0 items-center gap-1">
                                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${unitStatusClass[unit.status] || unitStatusClass.AVAILABLE}`}>{unitStatusLabel[unit.status] || unit.status}</span>
                                                    {editing ? (
                                                      <button onClick={saveUnitCode} disabled={savingUnit} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" title="Guardar">{savingUnit ? <Loader2 size={12} className="animate-spin" /> : '✓'}</button>
                                                    ) : (
                                                      <>
                                                        <button onClick={() => setUnitEdit({ lotId: lot.id, unitId: unit.id, value: unit.serialNumber || unit.id })} className="rounded p-1 text-blue-600 opacity-0 transition group-hover:opacity-100 hover:bg-blue-50" title="Editar S/N"><Edit2 size={12} /></button>
                                                        <button onClick={() => copyToClipboard(unitCode(unit))} className="rounded p-1 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700" title="Copiar"><Copy size={12} /></button>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex gap-1 xl:flex-col">
                                        <button onClick={() => onSale(lot)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700" title="Registar venda / associar S/N"><ClipboardList size={14} className="mr-1 inline" /> Venda</button>
                                        <button onClick={() => onEdit(lot)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"><Edit2 size={14} className="mr-1 inline" /> Editar</button>
                                        <button onClick={() => onDelete(lot.id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"><Trash2 size={14} className="mr-1 inline" /> Lote</button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {groups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center">
                    <Search className="mx-auto mb-3 text-slate-300" size={28} />
                    <div className="font-bold text-slate-700 dark:text-slate-200">Não encontrámos stock com estes filtros.</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pesquisa por produto, fornecedor, S/N, EAN, etiqueta interna, encomenda ou cliente.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {reservations.some(reservation => isReservationActive(reservation, now)) && (
          <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>As reservas ativas são descontadas uma única vez do stock disponível. Encomendas já finalizadas não são descontadas novamente nesta tabela.</span>
          </div>
        )}
      </section>
    </div>
  );
};

export default InventoryTab;

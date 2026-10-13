import { Barcode, CheckCircle2, PackageCheck, Trash2, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminOrder, AdminOrderItem, InventoryLot } from './adminTypes';
import { adminMutationsAvailable, fulfillOrder } from './adminMutations';
import { displayUnitCode, normalizeUnitCode, stableUnitId, unitMatchesCode } from './unitIdentity';

type ScannedUnit = { serial: string; itemIndex: number; lotId: string; unitId: string };
type SelectableUnit = { serial: string; lotId: string; unitId: string; assignedToOrder: boolean };
const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt');
const orderKey = (value: unknown) => String(value ?? '').replace(/^#+/, '').trim();
const orderItems = (order: AdminOrder): AdminOrderItem[] => order.packages?.length
  ? order.packages.flatMap((pkg) => pkg.items ?? [])
  : order.items ?? [];

const matchingLotsForItem = (lots: InventoryLot[], item: AdminOrderItem) => {
  const productLots = lots.filter((lot) => Number(lot.publicProductId) === Number(item.productId));
  const generic = productLots.filter((lot) => !normalize(lot.variant));
  const variant = normalize(item.selectedVariant);
  if (!variant) return generic.length ? generic : productLots;
  const exact = productLots.filter((lot) => normalize(lot.variant) === variant);
  return exact.length ? exact : generic;
};

export function OrderFulfillmentPanel({ order, lots, onChanged }: { order: AdminOrder; lots: InventoryLot[]; onChanged: () => Promise<void> }) {
  const completed = order.fulfillmentStatus === 'COMPLETED' || ['Enviado', 'Entregue'].includes(order.status);
  const items = useMemo(() => orderItems(order), [order]);
  const packages = order.packages ?? [];
  const [scanned, setScanned] = useState<ScannedUnit[]>([]);
  const [current, setCurrent] = useState('');
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [packageTrackings, setPackageTrackings] = useState<string[]>(() => packages.map((pkg) => pkg.trackingNumber ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const totalNeeded = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)), 0), [items]);
  const isPickup = order.shippingInfo?.deliveryMethod === 'Pickup' || order.status === 'Levantamento em Loja';

  useEffect(() => {
    setScanned([]); setCurrent(''); setTracking(order.trackingNumber ?? ''); setPackageTrackings((order.packages ?? []).map((pkg) => pkg.trackingNumber ?? '')); setError(null); setMessage(null);
  }, [order.id, order.trackingNumber, order.packages]);

  const addSerial = (raw: string, preferredItemIndex?: number) => {
    const serial = normalizeUnitCode(raw);
    setError(null); setMessage(null);
    if (!serial) return;
    const matches = lots.flatMap((lot) => (lot.units ?? []).filter((unit) => unitMatchesCode(unit, serial)).map((unit) => ({ lot, unit })));
    if (!matches.length) { setError(`O S/N ${serial} não existe no inventário.`); return; }
    if (matches.length > 1) { setError(`O S/N ${serial} aparece em mais do que um lote.`); return; }
    const { lot, unit } = matches[0];
    const unitId = stableUnitId(unit);
    const displayedSerial = displayUnitCode(unit);
    if (scanned.some((entry) => entry.lotId === lot.id && entry.unitId === unitId)) { setError(`O S/N ${displayedSerial || serial} já foi lido.`); return; }
    const belongsToOrder = unit.status === 'SOLD' && orderKey(unit.soldToOrder) === orderKey(order.id);
    if (unit.status !== 'AVAILABLE' && !belongsToOrder) { setError(`O S/N ${serial} não está disponível para esta encomenda.`); return; }
    const canAssignToItem = (item: AdminOrderItem, index: number) => matchingLotsForItem(lots, item).some((candidate) => candidate.id === lot.id)
      && scanned.filter((entry) => entry.itemIndex === index).length < Number(item.quantity ?? 0);
    let itemIndex = -1;
    if (preferredItemIndex !== undefined) {
      const preferredItem = items[preferredItemIndex];
      if (preferredItem && canAssignToItem(preferredItem, preferredItemIndex)) itemIndex = preferredItemIndex;
    }
    if (itemIndex < 0) itemIndex = items.findIndex(canAssignToItem);
    if (itemIndex < 0) { setError(`O S/N ${serial} não corresponde a nenhum artigo que falta validar.`); return; }
    setScanned((previous) => [...previous, { serial: displayedSerial || serial, itemIndex, lotId: lot.id, unitId }]);
    setCurrent('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const selectableUnitsForItem = (item: AdminOrderItem): SelectableUnit[] => {
    const selectedUnits = new Set(scanned.map((entry) => `${entry.lotId}:${entry.unitId}`));
    return matchingLotsForItem(lots, item).flatMap((lot) => {
      return (lot.units ?? []).flatMap((unit) => {
        const serial = displayUnitCode(unit);
        const unitId = stableUnitId(unit);
        const assignedToOrder = unit.status === 'SOLD' && orderKey(unit.soldToOrder) === orderKey(order.id);
        if (!serial || !unitId || selectedUnits.has(`${lot.id}:${unitId}`) || (unit.status !== 'AVAILABLE' && !assignedToOrder)) return [];
        return [{ serial, lotId: lot.id, unitId, assignedToOrder }];
      });
    }).sort((left, right) => Number(right.assignedToOrder) - Number(left.assignedToOrder) || left.serial.localeCompare(right.serial, 'pt'));
  };

  const submit = async () => {
    if (scanned.length !== totalNeeded) { setError(`Ainda falta validar ${totalNeeded - scanned.length} unidade(s).`); return; }
    if (!window.confirm(isPickup ? 'Confirmar a entrega destas unidades ao cliente?' : 'Expedir estas unidades e marcar a encomenda como enviada?')) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await fulfillOrder(order.id, scanned.map((entry) => ({ serialNumber: entry.serial, itemIndex: entry.itemIndex })), tracking, packages.length ? packageTrackings : undefined);
      setMessage(isPickup ? 'Levantamento concluído e S/N registados.' : 'Encomenda expedida, S/N e rastreio registados.');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a expedição.');
    } finally { setBusy(false); }
  };

  const registeredSerials = Math.max((order.serialNumbersUsed ?? []).length, items.reduce((sum, item) => sum + (item.serialNumbers?.length ?? 0), 0));
  if (completed) return <section className="fulfillment-complete"><CheckCircle2 /><div><strong>{isPickup ? 'Entrega validada' : 'Expedição concluída'}</strong><p>{registeredSerials} S/N registado(s){order.trackingNumber ? ` · Rastreio ${order.trackingNumber}` : ''}</p></div></section>;

  return <div className="fulfillment-panel">
    <header><span><PackageCheck /></span><div><strong>{isPickup ? 'Validar levantamento' : 'Preparar e expedir'}</strong><p>Leia o S/N de cada unidade. O sistema confirma produto, variante e lote.</p></div><b>{scanned.length}/{totalNeeded}</b></header>
    <div className="fulfillment-progress"><i style={{ width: `${totalNeeded ? Math.min(100, scanned.length / totalNeeded * 100) : 0}%` }} /></div>
    <form className="serial-entry" onSubmit={(event) => { event.preventDefault(); addSerial(current); }}>
      <label><Barcode /> S/N da unidade<input ref={inputRef} value={current} onChange={(event) => setCurrent(event.target.value)} disabled={busy || !adminMutationsAvailable} placeholder="Leia ou escreva o S/N e carregue Enter" autoComplete="off" /></label>
      <button type="submit" disabled={busy || !adminMutationsAvailable || !current.trim()}>Adicionar</button>
    </form>
    <div className="fulfillment-items">{items.map((item, index) => {
      const entries = scanned.filter((entry) => entry.itemIndex === index);
      const selectableUnits = selectableUnitsForItem(item);
      const itemComplete = entries.length >= Number(item.quantity ?? 0);
      const packageIndex = packages.length ? packages.findIndex((pkg) => (pkg.items ?? []).includes(item)) : -1;
      return <article key={`${item.productId}:${item.selectedVariant}:${index}`}>
        <div className="fulfillment-item-heading"><strong>{item.quantity ?? 0}× {item.name ?? `Produto ${item.productId}`}</strong><small>{packageIndex >= 0 ? `Volume ${packageIndex + 1} · ` : ''}{item.selectedVariant || 'Sem variante'} · {entries.length}/{item.quantity ?? 0} validados</small></div>
        <label className="fulfillment-unit-picker">
          <span>Selecionar S/N disponível</span>
          <select value="" disabled={busy || !adminMutationsAvailable || itemComplete || !selectableUnits.length} onChange={(event) => addSerial(event.target.value, index)}>
            <option value="">{itemComplete ? 'Todas as unidades validadas' : selectableUnits.length ? 'Escolher uma unidade…' : 'Sem S/N disponíveis'}</option>
            {selectableUnits.map((unit) => <option key={`${unit.lotId}:${unit.unitId}`} value={unit.serial}>{unit.serial}{unit.assignedToOrder ? ' · reservado para esta encomenda' : ''}</option>)}
          </select>
        </label>
        <div className="fulfillment-serials">{entries.map((entry) => <span key={`${entry.lotId}:${entry.unitId}`}>{entry.serial}<button type="button" onClick={() => setScanned((previous) => previous.filter((unit) => unit.lotId !== entry.lotId || unit.unitId !== entry.unitId))} aria-label={`Remover ${entry.serial}`}><Trash2 /></button></span>)}</div>
      </article>;
    })}</div>
    {!isPickup && (packages.length ? packages.map((pkg, index) => <label className="fulfillment-tracking" key={pkg.id || index}><Truck /> Rastreio do volume {index + 1}<input value={packageTrackings[index] ?? ''} onChange={(event) => setPackageTrackings((previous) => previous.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} disabled={busy} placeholder="Opcional — pode adicionar agora" /></label>) : <label className="fulfillment-tracking"><Truck /> Número de rastreio <input value={tracking} onChange={(event) => setTracking(event.target.value)} disabled={busy} placeholder="Opcional — pode adicionar agora" /></label>)}
    {error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
    <button className="fulfillment-submit" onClick={() => void submit()} disabled={busy || !adminMutationsAvailable || scanned.length !== totalNeeded}><PackageCheck /> {busy ? 'A processar…' : isPickup ? 'Confirmar entrega' : 'Expedir e marcar como enviado'}</button>
  </div>;
}

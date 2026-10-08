import { normalizeVariant } from './checkoutCore.js';

export type FulfillmentUnit = {
  id?: string;
  serialNumber?: string;
  internalLabel?: string;
  barcode?: string;
  status?: string;
  soldAt?: string;
  soldToOrder?: string;
  soldToCustomerName?: string;
  soldToCustomerEmail?: string;
  [key: string]: unknown;
};

export type FulfillmentLot = {
  id: string;
  publicProductId?: number;
  name?: string;
  variant?: string;
  quantityBought?: number;
  quantitySold?: number;
  purchasePrice?: number;
  units?: FulfillmentUnit[];
  [key: string]: unknown;
};

export type FulfillmentItem = {
  productId?: number;
  name?: string;
  quantity?: number;
  selectedVariant?: string;
  [key: string]: unknown;
};

export type FulfillmentPackage = {
  id?: string;
  trackingNumber?: string | null;
  items?: FulfillmentItem[];
  [key: string]: unknown;
};

export class FulfillmentError extends Error {}

const cleanOrderId = (value: unknown) => String(value ?? '').replace(/^#+/, '').trim();
const cleanSerial = (value: unknown) => String(value ?? '').trim().toUpperCase();

const rawUnitIdentity = (value: unknown) => String(value ?? '').trim();

export const fulfillmentUnitAliases = (unit: FulfillmentUnit) => [...new Set([
  unit.id,
  unit.serialNumber,
  unit.internalLabel,
  unit.barcode,
].map(cleanSerial).filter(Boolean))];

export const fulfillmentUnitSerial = (unit: FulfillmentUnit) => [
  unit.serialNumber,
  unit.internalLabel,
  unit.id,
  unit.barcode,
].map(rawUnitIdentity).find(Boolean) ?? '';

export const isOrderFulfillmentComplete = (order: { fulfillmentStatus?: unknown; status?: unknown }) =>
  order.fulfillmentStatus === 'COMPLETED' || ['Enviado', 'Entregue'].includes(String(order.status ?? ''));

export const matchingFulfillmentLots = (lots: FulfillmentLot[], productId: number, variant: unknown) => {
  const productLots = lots.filter((lot) => Number(lot.publicProductId) === productId);
  const generic = productLots.filter((lot) => !normalizeVariant(lot.variant));
  const variantKey = normalizeVariant(variant);
  if (!variantKey) return generic.length ? generic : productLots;
  const exact = productLots.filter((lot) => normalizeVariant(lot.variant) === variantKey);
  return exact.length ? exact : generic;
};

export const fulfillmentItemsFromPackages = (packages: FulfillmentPackage[]) => packages.flatMap((pkg) =>
  Array.isArray(pkg.items) ? pkg.items.filter((item): item is FulfillmentItem => Boolean(item && typeof item === 'object')) : [],
);

export function applyFulfillmentToPackages(input: {
  packages: FulfillmentPackage[];
  itemUnitIds: string[][];
  itemSerials: string[][];
  packageTrackingNumbers?: string[];
  fallbackTrackingNumber?: string;
}) {
  let planIndex = 0;
  return input.packages.map((pkg, packageIndex) => {
    const items = Array.isArray(pkg.items) ? pkg.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const updated = {
        ...item,
        unitIds: input.itemUnitIds[planIndex] ?? [],
        serialNumbers: input.itemSerials[planIndex] ?? [],
      };
      planIndex += 1;
      return updated;
    }) : [];
    const hasTrackingOverride = Array.isArray(input.packageTrackingNumbers);
    const requestedTracking = hasTrackingOverride ? String(input.packageTrackingNumbers?.[packageIndex] ?? '').trim() : '';
    const existingTracking = String(pkg.trackingNumber ?? '').trim();
    const fallbackTracking = String(input.fallbackTrackingNumber ?? '').trim();
    const trackingNumber = hasTrackingOverride ? requestedTracking : existingTracking || fallbackTracking;
    return { ...pkg, items, trackingNumber: trackingNumber || null };
  });
}

export function planOrderFulfillment(input: {
  orderId: string;
  orderItems: FulfillmentItem[];
  lots: FulfillmentLot[];
  serialNumbers: string[];
  serialItemIndexes?: number[];
  stockAlreadyDeducted: boolean;
  customerName?: string;
  customerEmail?: string;
  fulfilledAt: string;
}) {
  const orderId = cleanOrderId(input.orderId);
  const lots = input.lots.map((lot) => ({ ...lot, units: (lot.units ?? []).map((unit) => ({ ...unit })) }));
  const expected = input.orderItems.map((item, index) => ({
    index,
    productId: Number(item.productId),
    variant: String(item.selectedVariant ?? ''),
    quantity: Math.max(0, Math.trunc(Number(item.quantity ?? 0))),
    assignedUnitIds: [] as string[],
    assignedSerials: [] as string[],
    existingAssigned: 0,
    matchingLotIds: new Set(matchingFulfillmentLots(lots, Number(item.productId), item.selectedVariant).map((lot) => lot.id)),
  })).filter((item) => Number.isInteger(item.productId) && item.productId > 0 && item.quantity > 0);
  const totalExpected = expected.reduce((sum, item) => sum + item.quantity, 0);
  const serialNumbers = input.serialNumbers.map(cleanSerial).filter(Boolean);
  if (!totalExpected) throw new FulfillmentError('A encomenda não contém artigos válidos para expedir.');
  if (serialNumbers.length !== totalExpected) throw new FulfillmentError(`Valide ${totalExpected} S/N antes de concluir a expedição.`);
  if (new Set(serialNumbers).size !== serialNumbers.length) throw new FulfillmentError('O mesmo S/N foi indicado mais do que uma vez.');

  const existingAssigned = new Map<string, number>();
  for (const lot of lots) {
    const assignedUnits = (lot.units ?? []).filter((unit) => unit.status === 'SOLD' && cleanOrderId(unit.soldToOrder) === orderId);
    existingAssigned.set(lot.id, assignedUnits.length);
    for (const _unit of assignedUnits) {
      const target = expected.find((item) => item.matchingLotIds.has(lot.id) && item.existingAssigned < item.quantity);
      if (!target) throw new FulfillmentError('As unidades já associadas à encomenda não correspondem aos artigos atuais.');
      target.existingAssigned += 1;
    }
  }
  const existingAssignedTotal = [...existingAssigned.values()].reduce((sum, value) => sum + value, 0);
  if (existingAssignedTotal > totalExpected) throw new FulfillmentError('Existem mais unidades associadas à encomenda do que artigos por expedir.');

  const baselineByLot = new Map(existingAssigned);
  if (input.stockAlreadyDeducted) {
    const unattributedSold = new Map(lots.map((lot) => {
      const soldUnits = (lot.units ?? []).filter((unit) => unit.status === 'SOLD').length;
      return [lot.id, Math.max(0, Number(lot.quantitySold ?? 0) - soldUnits)] as const;
    }));
    for (const item of expected) {
      let remaining = item.quantity - item.existingAssigned;
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (!item.matchingLotIds.has(lot.id)) continue;
        const available = unattributedSold.get(lot.id) ?? 0;
        const take = Math.min(remaining, available);
        if (!take) continue;
        baselineByLot.set(lot.id, (baselineByLot.get(lot.id) ?? 0) + take);
        unattributedSold.set(lot.id, available - take);
        remaining -= take;
      }
      if (remaining > 0) throw new FulfillmentError('O stock previamente abatido não pode ser reconciliado com os lotes desta encomenda.');
    }
  }
  const chosen = new Map<string, { lotId: string; unitId: string; serialNumber: string }>();

  for (let serialIndex = 0; serialIndex < serialNumbers.length; serialIndex += 1) {
    const serial = serialNumbers[serialIndex];
    const matches = lots.flatMap((lot) => (lot.units ?? [])
      .map((unit, unitIndex) => ({ lot, unit, unitIndex }))
      .filter(({ unit }) => fulfillmentUnitAliases(unit).includes(serial)));
    if (!matches.length) throw new FulfillmentError(`O S/N ${serial} não existe no inventário.`);
    if (matches.length > 1) throw new FulfillmentError(`O S/N ${serial} aparece em mais do que um lote.`);
    const { lot, unit, unitIndex } = matches[0];
    const unitId = rawUnitIdentity(unit.id);
    if (!unitId) throw new FulfillmentError(`A unidade correspondente ao S/N ${serial} não tem um identificador interno válido.`);
    const unitKey = `${lot.id}:${unitIndex}`;
    if (chosen.has(unitKey)) throw new FulfillmentError(`A mesma unidade foi indicada mais do que uma vez (${serial}).`);
    const soldToThisOrder = unit.status === 'SOLD' && cleanOrderId(unit.soldToOrder) === orderId;
    if (unit.status !== 'AVAILABLE' && !soldToThisOrder) throw new FulfillmentError(`O S/N ${serial} não está disponível para esta encomenda.`);
    const preferredItemIndex = input.serialItemIndexes?.[serialIndex];
    const preferredTarget = Number.isInteger(preferredItemIndex)
      ? expected.find((item) => item.index === preferredItemIndex)
      : undefined;
    const target = preferredTarget
      ? preferredTarget.matchingLotIds.has(lot.id) && preferredTarget.assignedUnitIds.length < preferredTarget.quantity ? preferredTarget : undefined
      : expected.find((item) => item.matchingLotIds.has(lot.id) && item.assignedUnitIds.length < item.quantity);
    if (!target) throw new FulfillmentError(`O S/N ${serial} não corresponde a nenhum artigo pendente da encomenda.`);
    const serialNumber = fulfillmentUnitSerial(unit) || serial;
    target.assignedUnitIds.push(unitId);
    target.assignedSerials.push(serialNumber);
    chosen.set(unitKey, { lotId: lot.id, unitId, serialNumber });
  }

  const selectedByLot = new Map<string, number>();
  for (const selected of chosen.values()) selectedByLot.set(selected.lotId, (selectedByLot.get(selected.lotId) ?? 0) + 1);
  let totalProductCost = 0;
  const updatedLots = lots.map((lot) => {
    const selected = selectedByLot.get(lot.id) ?? 0;
    totalProductCost += selected * Math.max(0, Number(lot.purchasePrice ?? 0));
    const units = (lot.units ?? []).map((unit, unitIndex) => {
      const key = `${lot.id}:${unitIndex}`;
      if (chosen.has(key)) return {
        ...unit,
        status: 'SOLD',
        soldAt: input.fulfilledAt,
        soldToOrder: orderId,
        soldToCustomerName: input.customerName ?? '',
        soldToCustomerEmail: input.customerEmail ?? '',
      };
      if (unit.status === 'SOLD' && cleanOrderId(unit.soldToOrder) === orderId) {
        const { soldAt: _soldAt, soldToOrder: _soldToOrder, soldToCustomerName: _name, soldToCustomerEmail: _email, ...rest } = unit;
        return { ...rest, status: 'AVAILABLE' };
      }
      return unit;
    });
    const delta = selected - (baselineByLot.get(lot.id) ?? 0);
    const quantitySold = Math.max(0, Number(lot.quantitySold ?? 0) + delta);
    const soldUnitCount = units.filter((unit) => unit.status === 'SOLD').length;
    const quantityBought = Math.max(0, Number(lot.quantityBought ?? 0));
    if (quantitySold < soldUnitCount || quantitySold > quantityBought) {
      throw new FulfillmentError(`O lote ${lot.id} não tem quantidade física suficiente para estas unidades.`);
    }
    return { ...lot, units, quantitySold, status: quantitySold >= Number(lot.quantityBought ?? 0) ? 'SOLD' : quantitySold > 0 ? 'PARTIAL' : 'AVAILABLE' };
  });

  const itemUnitIds = input.orderItems.map((_item, index) => expected.find((item) => item.index === index)?.assignedUnitIds ?? []);
  const itemSerials = input.orderItems.map((_item, index) => expected.find((item) => item.index === index)?.assignedSerials ?? []);
  return {
    updatedLots,
    itemUnitIds,
    itemSerials,
    unitIds: itemUnitIds.flat(),
    serialNumbers: itemSerials.flat(),
    totalProductCost: Math.round(totalProductCost * 100) / 100,
  };
}

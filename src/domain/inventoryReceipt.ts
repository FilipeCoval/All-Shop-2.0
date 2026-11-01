export type InventoryReceiptStatus = 'IN_TRANSIT' | 'RECEIVED';

type ReceiptAwareLot = {
  receiptStatus?: unknown;
  quantityBought?: unknown;
  quantitySold?: unknown;
};

export const normalizeInventoryReceiptStatus = (lot: Pick<ReceiptAwareLot, 'receiptStatus'>): InventoryReceiptStatus =>
  String(lot.receiptStatus ?? '').trim().toUpperCase() === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'RECEIVED';

export const isInventoryLotInTransit = (lot: Pick<ReceiptAwareLot, 'receiptStatus'>) =>
  normalizeInventoryReceiptStatus(lot) === 'IN_TRANSIT';

export const inventoryLotPhysicalQuantity = (lot: ReceiptAwareLot) => {
  if (isInventoryLotInTransit(lot)) return 0;
  return Math.max(0, Number(lot.quantityBought ?? 0) - Number(lot.quantitySold ?? 0));
};

export const inventoryLotIncomingQuantity = (lot: ReceiptAwareLot) =>
  isInventoryLotInTransit(lot)
    ? Math.max(0, Number(lot.quantityBought ?? 0) - Number(lot.quantitySold ?? 0))
    : 0;

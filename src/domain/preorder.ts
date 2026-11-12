type PreorderShape = {
  enabled?: unknown;
  capacity?: unknown;
  reservedQuantity?: unknown;
  estimatedDispatchDate?: unknown;
  depositPercent?: unknown;
  paymentDeadlineHours?: unknown;
  note?: unknown;
};

export type PreorderOffer = {
  enabled: boolean;
  capacity: number;
  reservedQuantity: number;
  remaining: number;
  estimatedDispatchDate: string;
  depositPercent: 50;
  paymentDeadlineHours: number;
  note: string;
};

const asWholeNumber = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/**
 * Normalizes the public offer. Inventory stays completely separate: this is
 * only a promise of a future allocation and must never increase product stock.
 */
export const getPreorderOffer = (product: { preorder?: PreorderShape } | null | undefined): PreorderOffer | null => {
  const source = product?.preorder;
  if (!source || source.enabled !== true) return null;
  const capacity = asWholeNumber(source.capacity);
  const reservedQuantity = Math.min(capacity, asWholeNumber(source.reservedQuantity));
  const estimatedDispatchDate = String(source.estimatedDispatchDate ?? '').trim();
  if (!capacity || !estimatedDispatchDate) return null;
  return {
    enabled: true,
    capacity,
    reservedQuantity,
    remaining: Math.max(0, capacity - reservedQuantity),
    estimatedDispatchDate,
    depositPercent: 50,
    paymentDeadlineHours: Math.min(72, Math.max(2, asWholeNumber(source.paymentDeadlineHours) || 48)),
    note: String(source.note ?? '').trim().slice(0, 500),
  };
};

export const hasPreorderAvailability = (product: { preorder?: PreorderShape } | null | undefined) => {
  const offer = getPreorderOffer(product);
  return Boolean(offer && offer.remaining > 0);
};

export const formatPreorderDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : value;
};

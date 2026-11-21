type PreorderShape = {
  enabled?: unknown;
  capacity?: unknown;
  reservedQuantity?: unknown;
  variantCapacities?: unknown;
  reservedByVariant?: unknown;
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
  /**
   * When the product has options, capacity is held independently for each
   * option. Keys are normalised option names so renaming whitespace or case
   * does not create a second bucket.
   */
  variantCapacities: Record<string, number>;
  reservedByVariant: Record<string, number>;
  hasVariantCapacities: boolean;
  estimatedDispatchDate: string;
  depositPercent: 50;
  paymentDeadlineHours: number;
  note: string;
};

const asWholeNumber = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

export const normalizePreorderVariant = (value: unknown) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('pt');

const numberMap = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, quantity]) => [normalizePreorderVariant(key), asWholeNumber(quantity)] as const)
    .filter(([key, quantity]) => Boolean(key) && quantity > 0));
};

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);

/**
 * Normalizes the public offer. Inventory stays completely separate: this is
 * only a promise of a future allocation and must never increase product stock.
 */
export const getPreorderOffer = (product: { preorder?: PreorderShape } | null | undefined): PreorderOffer | null => {
  const source = product?.preorder;
  if (!source || source.enabled !== true) return null;
  const variantCapacities = numberMap(source.variantCapacities);
  const reservedByVariant = numberMap(source.reservedByVariant);
  const hasVariantCapacities = Object.keys(variantCapacities).length > 0;
  const capacity = hasVariantCapacities ? sum(variantCapacities) : asWholeNumber(source.capacity);
  // Keep the highest trustworthy number. This protects existing reservations
  // while older data is being migrated to the per-variant representation.
  const reservedQuantity = Math.min(capacity, Math.max(asWholeNumber(source.reservedQuantity), sum(reservedByVariant)));
  const estimatedDispatchDate = String(source.estimatedDispatchDate ?? '').trim();
  if (!capacity || !estimatedDispatchDate) return null;
  return {
    enabled: true,
    capacity,
    reservedQuantity,
    remaining: Math.max(0, capacity - reservedQuantity),
    variantCapacities,
    reservedByVariant,
    hasVariantCapacities,
    estimatedDispatchDate,
    depositPercent: 50,
    paymentDeadlineHours: Math.min(72, Math.max(2, asWholeNumber(source.paymentDeadlineHours) || 48)),
    note: String(source.note ?? '').trim().slice(0, 500),
  };
};

export const getPreorderRemainingForVariant = (offer: PreorderOffer | null | undefined, variantName?: string | null) => {
  if (!offer) return 0;
  if (!offer.hasVariantCapacities) return offer.remaining;
  const key = normalizePreorderVariant(variantName);
  if (!key) return 0;
  return Math.max(0, Number(offer.variantCapacities[key] ?? 0) - Number(offer.reservedByVariant[key] ?? 0));
};

export const hasPreorderAvailability = (product: { preorder?: PreorderShape } | null | undefined) => {
  const offer = getPreorderOffer(product);
  return Boolean(offer && offer.remaining > 0);
};

export const formatPreorderDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : value;
};

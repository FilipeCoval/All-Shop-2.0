import crypto from 'node:crypto';
import type { DocumentData, QueryDocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type ReservationRecord = {
  id: string;
  productId: number;
  variantKey: string;
  quantity: number;
  ownerKey?: string;
  expiresAtMs: number;
};

export type BatchSnapshot = QueryDocumentSnapshot<DocumentData>;

export const normaliseVariant = (value: unknown): string =>
  String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-PT');

export const normaliseEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

export const asPositiveInt = (value: unknown, max = 20): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return null;
  return parsed;
};

export const timestampToMillis = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  if (value && typeof (value as any).toDate === 'function') return (value as any).toDate().getTime();
  if (value && typeof (value as any).seconds === 'number') return (value as any).seconds * 1000;
  return 0;
};

export const getBatchPhysical = (data: DocumentData): { bought: number; sold: number; available: number } => {
  if (Array.isArray(data.units) && data.units.length > 0) {
    const bought = data.units.length;
    const sold = data.units.filter((unit: any) => unit?.status === 'SOLD').length;
    return { bought, sold, available: Math.max(0, bought - sold) };
  }

  const bought = Math.max(0, Number(data.quantityBought || 0));
  const sold = Math.max(0, Number(data.quantitySold || 0));
  return { bought, sold, available: Math.max(0, bought - sold) };
};

export const getMatchingBatches = (batches: BatchSnapshot[], variantKey: string): BatchSnapshot[] => {
  const generic = batches.filter((batch) => !normaliseVariant(batch.data().variant));
  if (!variantKey) return generic.length > 0 ? generic : batches;

  const exact = batches.filter((batch) => normaliseVariant(batch.data().variant) === variantKey);
  return exact.length > 0 ? exact : generic;
};

export const toReservationRecord = (doc: QueryDocumentSnapshot<DocumentData>): ReservationRecord | null => {
  const data = doc.data();
  const productId = Number(data.productId);
  const quantity = Number(data.quantity || 0);
  if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    id: doc.id,
    productId,
    variantKey: normaliseVariant(data.variantKey ?? data.variantName),
    quantity,
    ownerKey: typeof data.ownerKey === 'string' ? data.ownerKey : undefined,
    expiresAtMs: timestampToMillis(data.expiresAt),
  };
};

export const makeOwnerKey = (userId: string | null, guestToken: string | null): string => {
  if (userId) return `user:${userId}`;
  if (!guestToken) throw new Error('Identificador de sessão inválido. Atualize a página e tente novamente.');
  const hash = crypto.createHash('sha256').update(guestToken).digest('hex');
  return `guest:${hash}`;
};

export const makeReservationId = (ownerKey: string, productId: number, variantKey: string): string => {
  const hash = crypto.createHash('sha256').update(`${ownerKey}|${productId}|${variantKey}`).digest('hex').slice(0, 40);
  return `v2_${hash}`;
};

/**
 * Allocates active reservations over batches so the dashboard's reserved column is
 * a derived summary, never the source of truth. The reservation documents remain
 * the source of truth for checkout decisions.
 */
export const allocateReservationSummaries = (
  batches: BatchSnapshot[],
  reservations: ReservationRecord[],
  saleAdjustments: Map<string, number> = new Map(),
): Map<string, number> => {
  const assigned = new Map<string, number>(batches.map((batch) => [batch.id, 0]));

  const allocate = (requested: number, matching: BatchSnapshot[]) => {
    let remaining = Math.max(0, requested);
    for (const batch of matching) {
      if (remaining <= 0) break;
      const physical = Math.max(0, getBatchPhysical(batch.data()).available - (saleAdjustments.get(batch.id) || 0));
      const already = assigned.get(batch.id) || 0;
      const put = Math.min(remaining, Math.max(0, physical - already));
      assigned.set(batch.id, already + put);
      remaining -= put;
    }
  };

  const variantKeys = [...new Set(reservations.map((reservation) => reservation.variantKey).filter(Boolean))];
  for (const variantKey of variantKeys) {
    const qty = reservations
      .filter((reservation) => reservation.variantKey === variantKey)
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
    allocate(qty, getMatchingBatches(batches, variantKey));
  }

  const genericQty = reservations
    .filter((reservation) => !reservation.variantKey)
    .reduce((sum, reservation) => sum + reservation.quantity, 0);
  if (genericQty > 0) allocate(genericQty, getMatchingBatches(batches, ''));

  return assigned;
};

export const syncInventoryReservedSummary = (
  transaction: Transaction,
  batches: BatchSnapshot[],
  reservations: ReservationRecord[],
  saleAdjustments: Map<string, number> = new Map(),
) => {
  const assigned = allocateReservationSummaries(batches, reservations, saleAdjustments);
  for (const batch of batches) {
    const reserved = assigned.get(batch.id) || 0;
    if (Number(batch.data().reserved || 0) !== reserved) {
      transaction.update(batch.ref, { reserved });
    }
  }
};

export const availableForVariant = (
  batches: BatchSnapshot[],
  reservations: ReservationRecord[],
  variantKey: string,
  saleAdjustments: Map<string, number> = new Map(),
): number => {
  const matching = getMatchingBatches(batches, variantKey);
  const physical = matching.reduce((sum, batch) => sum + Math.max(0, getBatchPhysical(batch.data()).available - (saleAdjustments.get(batch.id) || 0)), 0);
  const reserved = reservations
    .filter((reservation) => reservation.variantKey === variantKey || (!reservation.variantKey && !!variantKey))
    .reduce((sum, reservation) => sum + reservation.quantity, 0);
  return Math.max(0, physical - reserved);
};

export const syncPublicProductStock = (
  transaction: Transaction,
  publicDoc: QueryDocumentSnapshot<DocumentData> | DocumentData,
  publicRef: any,
  batches: BatchSnapshot[],
  reservations: ReservationRecord[],
  saleAdjustments: Map<string, number> = new Map(),
) => {
  const publicData = typeof (publicDoc as any).data === 'function' ? (publicDoc as any).data() : publicDoc as DocumentData;
  const totalPhysical = batches.reduce((sum, batch) => sum + Math.max(0, getBatchPhysical(batch.data()).available - (saleAdjustments.get(batch.id) || 0)), 0);
  const totalReserved = reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
  const update: Record<string, unknown> = { stock: Math.max(0, totalPhysical - totalReserved) };

  if (Array.isArray(publicData.variants)) {
    update.variants = publicData.variants.map((variant: any) => ({
      ...variant,
      stock: availableForVariant(batches, reservations, normaliseVariant(variant?.name), saleAdjustments),
    }));
  }

  transaction.update(publicRef, update as any);
};

export const reservationExpiry = () => Timestamp.fromMillis(Date.now() + RESERVATION_TTL_MS);
export const serverTimestamp = () => FieldValue.serverTimestamp();

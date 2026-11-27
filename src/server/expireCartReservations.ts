import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { timestampToMillis, toReservationRecord, syncInventoryReservedSummary } from '../../services/server/stock-utils.js';
import { projectPublicStock } from './stockProjection.js';
import { adminAuditEntry } from './adminAudit.js';

// Order/preorder reservations are never released by the cart timer.
export const isExpiredCartReservation = (id: string, data: Record<string, any>, now: number) => {
  const kind = String(data.kind ?? data.type ?? '').toUpperCase();
  if (data.orderId || String(data.ownerKey ?? '').startsWith('preorder:') || (kind && kind !== 'CART')) return false;
  const expiresAt = timestampToMillis(data.expiresAt);
  return (id.startsWith('v2_') || kind === 'CART') && expiresAt > 0 && expiresAt <= now;
};

export async function expireProductCartReservations(database: Firestore, productId: number) {
  return database.runTransaction(async (tx) => {
    const productRef = database.collection('products_public').doc(String(productId));
    const reservations = await tx.get(database.collection('stock_reservations').where('productId', '==', productId));
    // Re-evaluate inside the transaction, including on retries after renewal or sale.
    const now = Date.now();
    const expired = reservations.docs.filter(d => isExpiredCartReservation(d.id, d.data(), now));
    if (!expired.length) return { expired: 0, updated: false };
    const [product, inventory, legacyInventory] = await Promise.all([
      tx.get(productRef),
      tx.get(database.collection('products_inventory').where('publicProductId', '==', productId)),
      tx.get(database.collection('products_inventory').where('publicProductId', '==', String(productId))),
    ]);
    if (!product.exists) return { expired: 0, updated: false };
    const expiredIds = new Set(expired.map(d => d.id));
    const remaining = reservations.docs.filter(d => !expiredIds.has(d.id));
    const batches = [...new Map([...inventory.docs, ...legacyInventory.docs].map(d => [d.id, d])).values()];
    const before = product.data()!;
    const projection = projectPublicStock(productId, before, batches.map(d => ({ ...d.data(), id: d.id })), remaining.map(d => d.data()));
    const active = remaining.map(toReservationRecord).filter((r): r is NonNullable<typeof r> => !!r && r.expiresAtMs > now);
    expired.forEach(d => tx.delete(d.ref));
    syncInventoryReservedSummary(tx, batches, active);
    tx.update(productRef, { ...projection, stockUpdatedAt: FieldValue.serverTimestamp() });
    tx.set(database.collection('admin_audit_log').doc(), adminAuditEntry({
      action: 'expire_cart_reservations', actor: { kind: 'SYSTEM' },
      target: { type: 'Produto', id: productId, label: String(before.name ?? productId) },
      before: { stock: before.stock ?? 0 }, after: { stock: projection.stock },
      summary: `${expired.length} reserva(s) de carrinho expirada(s). Stock da loja recalculado automaticamente.`,
      details: { reservationsExpired: expired.length, quantityReleased: expired.reduce((n, d) => n + Number(d.data().quantity || 0), 0) },
    }));
    return { expired: expired.length, updated: true };
  });
}

export async function expireCartReservations(database: Firestore, productIds?: number[]) {
  let targets = productIds;
  if (!targets) {
    // Both historical numeric expiries and Firestore Timestamps are supported.
    const now = Date.now();
    const snapshots = await Promise.all([
      database.collection('stock_reservations').where('expiresAt', '<=', Timestamp.fromMillis(now)).get(),
      database.collection('stock_reservations').where('expiresAt', '<=', now).get(),
    ]);
    targets = snapshots.flatMap(s => s.docs).filter(d => isExpiredCartReservation(d.id, d.data(), now)).map(d => Number(d.data().productId));
  }
  const unique = [...new Set(targets)].filter(id => Number.isSafeInteger(id) && id > 0);
  let expired = 0, updatedProducts = 0;
  for (const id of unique) {
    const result = await expireProductCartReservations(database, id);
    expired += result.expired;
    updatedProducts += Number(result.updated);
  }
  return { expired, updatedProducts };
}

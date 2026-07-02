import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../services/firebase-admin.js';
import { getRequestIdentity } from '../services/server/request-identity.js';
import {
  asPositiveInt,
  makeReservationId,
  normaliseVariant,
  reservationExpiry,
  syncInventoryReservedSummary,
  syncPublicProductStock,
  toReservationRecord,
  getMatchingBatches,
  getBatchPhysical,
  type ReservationRecord,
} from '../services/server/stock-utils.js';

const MAX_QUANTITY_PER_ITEM = 20;

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const firestore = db;
  if (!firestore) return res.status(503).json({ error: 'O serviço de stock está temporariamente indisponível. Tente novamente dentro de momentos.' });

  try {
    const productId = Number(req.body?.productId);
    const quantity = asPositiveInt(req.body?.quantity, MAX_QUANTITY_PER_ITEM);
    const variantKey = normaliseVariant(req.body?.variantName);

    if (!Number.isInteger(productId) || productId <= 0 || quantity === null) {
      return res.status(400).json({ error: 'Dados de reserva inválidos.' });
    }

    const identity = await getRequestIdentity(req, req.body?.guestToken);
    const reservationId = makeReservationId(identity.ownerKey, productId, variantKey);
    const expiresAt = reservationExpiry();

    const result = await firestore.runTransaction(async (transaction) => {
      const inventoryQuery = firestore.collection('products_inventory').where('publicProductId', '==', productId);
      const reservationsQuery = firestore.collection('stock_reservations').where('productId', '==', productId);
      const productRef = firestore.collection('products_public').doc(String(productId));
      const reservationRef = firestore.collection('stock_reservations').doc(reservationId);

      const [inventorySnapshot, reservationsSnapshot, productSnapshot] = await Promise.all([
        transaction.get(inventoryQuery),
        transaction.get(reservationsQuery),
        transaction.get(productRef),
      ]);

      if (inventorySnapshot.empty || !productSnapshot.exists) {
        throw new Error('Este produto deixou de estar disponível. Atualize a página.');
      }

      const now = Date.now();
      const activeReservations = reservationsSnapshot.docs
        .map(toReservationRecord)
        .filter((record): record is ReservationRecord => !!record && record.expiresAtMs > now);
      const ownExisting = activeReservations.find((record) => record.id === reservationId);
      const otherReservations = activeReservations.filter((record) => record.id !== reservationId);

      const requestedBatches = getMatchingBatches(inventorySnapshot.docs, variantKey);
      if (requestedBatches.length === 0) {
        throw new Error('A variação selecionada já não está disponível.');
      }

      const physicalAvailable = requestedBatches.reduce((sum, batch) => sum + getBatchPhysical(batch.data()).available, 0);
      const reservedByOthers = otherReservations
        .filter((record) => record.variantKey === variantKey || (!record.variantKey && !!variantKey))
        .reduce((sum, record) => sum + record.quantity, 0);

      if (quantity > 0 && physicalAvailable - reservedByOthers < quantity) {
        throw new Error('Não existe stock suficiente para a quantidade selecionada.');
      }

      if (quantity === 0) {
        if (ownExisting) transaction.delete(reservationRef);
      } else {
        const reservationData: Record<string, unknown> = {
          productId,
          variantName: req.body?.variantName ? String(req.body.variantName).trim().slice(0, 120) : null,
          variantKey,
          quantity,
          ownerKey: identity.ownerKey,
          userId: identity.userId,
          updatedAt: Timestamp.now(),
          expiresAt,
          schemaVersion: 2,
        };
        if (!ownExisting) reservationData.createdAt = Timestamp.now();
        transaction.set(reservationRef, reservationData, { merge: true });
      }

      const nextReservations = [...otherReservations];
      if (quantity > 0) {
        nextReservations.push({
          id: reservationId,
          productId,
          variantKey,
          quantity,
          ownerKey: identity.ownerKey,
          expiresAtMs: expiresAt.toMillis(),
        });
      }

      syncInventoryReservedSummary(transaction, inventorySnapshot.docs, nextReservations);
      syncPublicProductStock(transaction, productSnapshot, productRef, inventorySnapshot.docs, nextReservations);

      return { expiresAt: quantity > 0 ? expiresAt.toMillis() : null };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível reservar o stock.');
    console.error('[reserve-stock]', error);
    return res.status(message.includes('stock suficiente') || message.includes('disponível') ? 409 : 400).json({ error: message });
  }
}

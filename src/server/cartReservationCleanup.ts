import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../services/firebase-admin.js';
import { expireCartReservations } from './expireCartReservations.js';

export async function handleCartReservationCleanup(req: Request, res: Response, database = db) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ success: false });
  let productIds: number[] | undefined;
  if (req.method === 'GET') {
    const expected = Buffer.from(`Bearer ${process.env.STOCK_RESERVATION_CRON_SECRET || ''}`);
    const actual = Buffer.from(String(req.headers.authorization ?? ''));
    if (!process.env.STOCK_RESERVATION_CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).json({ success: false });
  } else {
    // A browser may ask to release expired CART holds only, never active holds.
    const ids = req.body?.productIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({ success: false });
    productIds = ids;
  }
  if (!database) return res.status(503).json({ success: false });
  try {
    return res.status(200).json({ success: true, ...await expireCartReservations(database, productIds) });
  } catch (error) {
    console.error('[expire-cart-reservations]', error);
    return res.status(500).json({ success: false, error: 'Não foi possível atualizar o stock. Tente novamente.' });
  }
}

export default handleCartReservationCleanup;

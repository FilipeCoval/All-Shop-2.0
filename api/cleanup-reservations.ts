import type { Request, Response } from 'express';

/**
 * Expired reservations are ignored by the atomic checkout paths and reconciled
 * whenever the product is reserved/finalized. The former public cleanup route
 * was unsafe, so it is disabled until a protected scheduled job is added.
 */
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ error: 'Endpoint antigo desativado.' });
}

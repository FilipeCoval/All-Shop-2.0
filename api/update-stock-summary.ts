import type { Request, Response } from 'express';

/** Stock is now recalculated atomically by reserve-stock and finalize-order. */
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ error: 'Endpoint antigo desativado.' });
}

import type { Request, Response } from 'express';

/**
 * Deprecated insecure endpoint. Checkout now uses /api/finalize-order only.
 * Keeping this file intentionally returns 410 so an old browser tab or an
 * external caller cannot alter products or orders through the legacy route.
 */
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ error: 'Endpoint desativado. Atualize a página e tente novamente.' });
}

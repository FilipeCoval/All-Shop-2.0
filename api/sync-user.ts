import type { Request, Response } from 'express';

/** Legacy public synchronisation route disabled pending a protected user-sync API. */
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ error: 'Endpoint antigo desativado.' });
}

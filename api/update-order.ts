import type { Request, Response } from 'express';

/** Legacy public order mutator disabled. Admin order management will move to a protected route in the next phase. */
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ error: 'Endpoint antigo desativado.' });
}

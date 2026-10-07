import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApiError } from '../../src/server/adminAuth.js';

const handlers = {
  catalog: () => import('../../src/server/adminRoutes/catalog.js'),
  inventory: () => import('../../src/server/adminRoutes/inventory.js'),
  marketing: () => import('../../src/server/adminRoutes/marketing.js'),
  misc: () => import('../../src/server/adminRoutes/misc.js'),
  orders: () => import('../../src/server/adminRoutes/orders.js'),
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const rawResource = request.query.resource ?? (request as VercelRequest & { params?: { resource?: string } }).params?.resource;
  const resource = String(Array.isArray(rawResource) ? rawResource[0] : rawResource ?? '').toLowerCase();
  if (resource === 'legacy') {
    return response.status(410).json({ success: false, error: 'Endpoint antigo desativado.' });
  }
  const load = handlers[resource as keyof typeof handlers];
  if (!load) return response.status(404).json({ success: false, error: 'Área administrativa não encontrada.' });
  try {
    const selected = await load();
    return selected.default(request, response);
  } catch (error) {
    if (response.headersSent) return;
    return handleApiError(response, error);
  }
}

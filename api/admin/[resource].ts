import type { VercelRequest, VercelResponse } from '@vercel/node';
import catalogHandler from '../../src/server/adminRoutes/catalog.js';
import inventoryHandler from '../../src/server/adminRoutes/inventory.js';
import marketingHandler from '../../src/server/adminRoutes/marketing.js';
import miscHandler from '../../src/server/adminRoutes/misc.js';
import ordersHandler from '../../src/server/adminRoutes/orders.js';

const handlers = {
  catalog: catalogHandler,
  inventory: inventoryHandler,
  marketing: marketingHandler,
  misc: miscHandler,
  orders: ordersHandler,
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const rawResource = request.query.resource ?? (request as VercelRequest & { params?: { resource?: string } }).params?.resource;
  const resource = String(Array.isArray(rawResource) ? rawResource[0] : rawResource ?? '').toLowerCase();
  if (resource === 'legacy') {
    return response.status(410).json({ success: false, error: 'Endpoint antigo desativado.' });
  }
  const selected = handlers[resource as keyof typeof handlers];
  if (!selected) return response.status(404).json({ success: false, error: 'Área administrativa não encontrada.' });
  return selected(request, response);
}

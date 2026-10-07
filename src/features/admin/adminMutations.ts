import { auth } from '../../lib/firebase';
import type { OrderStatus } from './adminTypes';
import { adminApiErrorMessage, isRetryableAdminResponse, parseAdminApiPayload } from './adminRequestPolicy';

const pause = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function callAdminApi(path: string, body: Record<string, unknown>, options: { retryTransient?: boolean } = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error('A sessão terminou. Entre novamente.');
  const requestId = globalThis.crypto?.randomUUID?.() ?? `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let token = await user.getIdToken();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-AllShop-Request': requestId },
        body: JSON.stringify(body),
      });
    } catch {
      if (options.retryTransient && attempt === 0) { await pause(700); continue; }
      throw new Error(`Não foi possível contactar o servidor. O rascunho foi mantido. (referência ${requestId})`);
    }

    const raw = await response.text().catch(() => '');
    const result = parseAdminApiPayload(raw);
    if (response.ok && result?.success === true) return result;

    const sessionCanRefresh = response.status === 401 && attempt === 0;
    const transientCanRetry = Boolean(options.retryTransient && attempt === 0 && isRetryableAdminResponse(response.status, result));
    if (sessionCanRefresh || transientCanRetry) {
      if (sessionCanRefresh) token = await user.getIdToken(true);
      await pause(response.status === 429 ? 1200 : 700);
      continue;
    }
    throw new Error(adminApiErrorMessage(response.status, result, response.headers.get('x-vercel-id') ?? requestId));
  }
  throw new Error(`Não foi possível concluir a operação após nova tentativa. O rascunho foi mantido. (referência ${requestId})`);
}

export const adminMutationsAvailable = import.meta.env.PROD || import.meta.env.VITE_ADMIN_API_ENABLED === 'true';

export const setOrderStatus = (orderId: string, status: OrderStatus) => callAdminApi('/api/admin/orders', { action: 'set_status', orderId, status }, { retryTransient: true });
export const recoverTelegramOrder = (payload: Record<string, unknown>) => callAdminApi('/api/admin/orders', { action: 'recover_telegram_order', ...payload });
export const updateOrderTracking = (orderId: string, trackingNumber: string, packageTrackingNumbers?: string[]) => callAdminApi('/api/admin/orders', { action: 'update_tracking', orderId, trackingNumber, ...(packageTrackingNumbers ? { packageTrackingNumbers } : {}) }, { retryTransient: true });
export const fulfillOrder = (orderId: string, selections: Array<{ serialNumber: string; itemIndex: number }>, trackingNumber: string, packageTrackingNumbers?: string[]) => callAdminApi('/api/admin/orders', { action: 'fulfill_order', orderId, selections, trackingNumber, ...(packageTrackingNumbers ? { packageTrackingNumbers } : {}) });
export const reviewOrderRequest = (orderId: string, requestKind: 'cancellation' | 'return', decision: 'approve' | 'reject', reviewNote = '') => callAdminApi('/api/admin/orders', { action: 'review_request', orderId, requestKind, decision, reviewNote });
export const saveCatalogProduct = (product: Record<string, unknown>) => callAdminApi('/api/admin/catalog', { action: 'save_product', product });
export const saveInventoryLot = (lot: Record<string, unknown>, lotId: string) => callAdminApi('/api/admin/inventory', { action: 'save_lot', lotId, lot }, { retryTransient: true });
export const deleteInventoryLot = (publicProductId: number, lotId: string) => callAdminApi('/api/admin/inventory', { action: 'delete_lot', publicProductId, lotId });
export const syncProductStock = (publicProductId: number) => callAdminApi('/api/admin/inventory', { action: 'sync_product', publicProductId });
export const saveCoupon = (coupon: Record<string, unknown>) => callAdminApi('/api/admin/misc', { action: 'save_coupon', coupon });
export const updateSupportTicket = (ticketId: string, status: string, priority: string, message = '') => callAdminApi('/api/admin/misc', { action: 'update_ticket', ticketId, status, priority, message });
export const updateProductRequest = (requestId: string, status: string, adminComment = '') => callAdminApi('/api/admin/misc', { action: 'update_request', requestId, status, adminComment });
export const updateImportStatus = (shipmentId: string, status: string) => callAdminApi('/api/admin/misc', { action: 'update_import_status', shipmentId, status });
export const saveImportShipment = (shipment: Record<string, unknown>) => callAdminApi('/api/admin/misc', { action: 'save_import', shipment });
export const deleteImportShipment = (shipmentId: string) => callAdminApi('/api/admin/misc', { action: 'delete_import', shipmentId });
export const adjustClientPoints = (userId: string, amount: number, reason: string) => callAdminApi('/api/admin/misc', { action: 'adjust_points', userId, amount, reason });
export const saveCategory = (category: Record<string, unknown>) => callAdminApi('/api/admin/misc', { action: 'save_category', category });
export const deleteCategory = (categoryId: string) => callAdminApi('/api/admin/misc', { action: 'delete_category', categoryId });
export const sendMarketingPush = (message: Record<string, unknown>) => callAdminApi('/api/admin/marketing', message);

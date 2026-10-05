import { auth } from '../../lib/firebase';
import type { OrderStatus } from './adminTypes';

async function callAdminApi(path: string, body: Record<string, unknown>) {
  const user = auth?.currentUser;
  if (!user) throw new Error('A sessão terminou. Entre novamente.');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) throw new Error(result?.error || 'O servidor não conseguiu concluir a operação.');
  return result;
}

export const adminMutationsAvailable = import.meta.env.PROD || import.meta.env.VITE_ADMIN_API_ENABLED === 'true';

export const setOrderStatus = (orderId: string, status: OrderStatus) => callAdminApi('/api/admin-orders', { action: 'set_status', orderId, status });
export const recoverTelegramOrder = (payload: Record<string, unknown>) => callAdminApi('/api/admin-orders', { action: 'recover_telegram_order', ...payload });
export const updateOrderTracking = (orderId: string, trackingNumber: string, packageTrackingNumbers?: string[]) => callAdminApi('/api/admin-orders', { action: 'update_tracking', orderId, trackingNumber, ...(packageTrackingNumbers ? { packageTrackingNumbers } : {}) });
export const fulfillOrder = (orderId: string, selections: Array<{ serialNumber: string; itemIndex: number }>, trackingNumber: string, packageTrackingNumbers?: string[]) => callAdminApi('/api/admin-orders', { action: 'fulfill_order', orderId, selections, trackingNumber, ...(packageTrackingNumbers ? { packageTrackingNumbers } : {}) });
export const reviewOrderRequest = (orderId: string, requestKind: 'cancellation' | 'return', decision: 'approve' | 'reject', reviewNote = '') => callAdminApi('/api/admin-orders', { action: 'review_request', orderId, requestKind, decision, reviewNote });
export const saveCatalogProduct = (product: Record<string, unknown>) => callAdminApi('/api/admin-catalog', { action: 'save_product', product });
export const saveInventoryLot = (lot: Record<string, unknown>, lotId?: string) => callAdminApi('/api/admin-inventory', { action: 'save_lot', lotId, lot });
export const deleteInventoryLot = (publicProductId: number, lotId: string) => callAdminApi('/api/admin-inventory', { action: 'delete_lot', publicProductId, lotId });
export const syncProductStock = (publicProductId: number) => callAdminApi('/api/admin-inventory', { action: 'sync_product', publicProductId });
export const saveCoupon = (coupon: Record<string, unknown>) => callAdminApi('/api/admin-misc', { action: 'save_coupon', coupon });
export const updateSupportTicket = (ticketId: string, status: string, priority: string, message = '') => callAdminApi('/api/admin-misc', { action: 'update_ticket', ticketId, status, priority, message });
export const updateProductRequest = (requestId: string, status: string, adminComment = '') => callAdminApi('/api/admin-misc', { action: 'update_request', requestId, status, adminComment });
export const updateImportStatus = (shipmentId: string, status: string) => callAdminApi('/api/admin-misc', { action: 'update_import_status', shipmentId, status });
export const saveImportShipment = (shipment: Record<string, unknown>) => callAdminApi('/api/admin-misc', { action: 'save_import', shipment });
export const deleteImportShipment = (shipmentId: string) => callAdminApi('/api/admin-misc', { action: 'delete_import', shipmentId });
export const adjustClientPoints = (userId: string, amount: number, reason: string) => callAdminApi('/api/admin-misc', { action: 'adjust_points', userId, amount, reason });
export const saveCategory = (category: Record<string, unknown>) => callAdminApi('/api/admin-misc', { action: 'save_category', category });
export const deleteCategory = (categoryId: string) => callAdminApi('/api/admin-misc', { action: 'delete_category', categoryId });
export const sendMarketingPush = (message: Record<string, unknown>) => callAdminApi('/api/admin-marketing', message);

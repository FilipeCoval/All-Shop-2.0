import { auth } from './firebaseConfig';

const requestHeaders = async () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = auth.currentUser;
  if (user) {
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch {
      throw new Error('Não foi possível validar a sessão. Volte a iniciar sessão antes de enviar o pedido.');
    }
  }
  return headers;
};

const parseResponse = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || 'O servidor não conseguiu concluir o pedido.');
  }
  return body;
};

export async function reserveStock(
  productId: string,
  variantName: string | undefined | null,
  quantity: number,
  guestToken?: string,
) {
  const response = await fetch('/api/reserve-stock', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ productId, variantName: variantName || '', quantity, guestToken }),
  });
  return parseResponse(response);
}

export async function refreshExpiredCartStock(productIds: number[]) {
  const unique = [...new Set(productIds)];
  for (let offset = 0; offset < unique.length; offset += 10) {
    const response = await fetch('/api/cleanup-reservations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ productIds: unique.slice(offset, offset + 10) }),
    });
    await parseResponse(response);
  }
}

export async function finalizeOrder(order: any, guestToken?: string) {
  const response = await fetch('/api/finalize-order', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({
      idempotencyKey: order?.id,
      items: order?.items,
      shippingInfo: order?.shippingInfo,
      guestToken,
      order,
    }),
  });
  return parseResponse(response);
}

export async function saveOrderDraft(order: any, guestToken?: string) {
  const response = await fetch('/api/create-order-draft', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({
      idempotencyKey: order?.id,
      items: order?.items,
      shippingInfo: order?.shippingInfo,
      guestToken,
      order,
    }),
  });
  return parseResponse(response);
}

export async function createPreorder(input: {
  idempotencyKey: string;
  productId: number;
  selectedVariant?: string;
  quantity: number;
  shippingInfo: unknown;
  termsAccepted: true;
  items?: Array<{ productId: number; selectedVariant?: string; quantity: number }>;
  /** Confirmed only after the client has gone through the message step. */
  messagePlatform?: 'WHATSAPP' | 'TELEGRAM';
  messageConfirmedAt?: string;
}, guestToken?: string) {
  const response = await fetch('/api/create-order-draft', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ action: 'create_preorder', ...input, guestToken }),
  });
  return parseResponse(response);
}

export async function editPreorder(orderId: string, items: Array<{ productId: number; selectedVariant?: string; quantity: number }>, guestToken?: string) {
  const response = await fetch('/api/create-order-draft', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ action: 'edit_preorder', orderId, items, guestToken }),
  });
  return parseResponse(response);
}

export async function cancelCustomerPreorder(orderId: string, guestToken?: string) {
  const response = await fetch('/api/create-order-draft', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ action: 'cancel_preorder_customer', orderId, guestToken }),
  });
  return parseResponse(response);
}

export async function syncCurrentUser() {
  const response = await fetch('/api/sync-user', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({}),
  });
  return parseResponse(response);
}

export async function confirmPreorderMessage(orderId: string, messagePlatform: 'WHATSAPP' | 'TELEGRAM', guestToken?: string) {
  const response = await fetch('/api/create-order-draft', {
    method: 'POST', headers: await requestHeaders(),
    body: JSON.stringify({ action: 'confirm_preorder_message', orderId, messagePlatform, guestToken }),
  });
  return parseResponse(response);
}

export async function redeemLoyaltyReward(rewardId: string) {
  const response = await fetch('/api/redeem-loyalty-reward', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ rewardId }),
  });
  return parseResponse(response);
}

export async function trackOrder(orderId: string, email: string) {
  const response = await fetch('/api/track-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, email }),
  });
  return parseResponse(response);
}
export async function requestOrderAction(input: {
  action: 'cancel_order' | 'cancel_item' | 'request_return';
  orderId: string;
  reason: string;
  productId?: number;
  quantity?: number;
}) {
  const response = await fetch('/api/update-order', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify(input),
  });
  return parseResponse(response);
}

export async function reviewOrderRequest(input: {
  orderId: string;
  requestKind: 'cancellation' | 'return';
  decision: 'approve' | 'reject';
  reviewNote?: string;
}) {
  const response = await fetch('/api/update-order', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ action: 'review_request', ...input }),
  });
  return parseResponse(response);
}

export async function setOrderStatus(orderId: string, status: string) {
  const response = await fetch('/api/update-order', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({ action: 'set_status', orderId, status }),
  });
  return parseResponse(response);
}

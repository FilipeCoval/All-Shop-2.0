import { auth } from './firebaseConfig';

const requestHeaders = async () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = auth.currentUser;
  if (user) {
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch {
      // The server will treat the request as a guest request only when a valid guest token is sent.
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

export async function syncCurrentUser() {
  const response = await fetch('/api/sync-user', {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify({}),
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

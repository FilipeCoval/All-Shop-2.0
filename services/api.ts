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

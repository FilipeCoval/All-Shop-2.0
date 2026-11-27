type Env = { CLEANUP_URL: string; STOCK_RESERVATION_CRON_SECRET: string };

export async function runStockExpiry(env: Env, request = fetch) {
  if (!env.STOCK_RESERVATION_CRON_SECRET) throw new Error('Stock expiry secret is not configured.');
  const response = await request(env.CLEANUP_URL, {
    method: 'GET',
    // Workers support manual/follow only. Reject 3xx below instead of forwarding
    // the Authorization header to any redirect destination.
    redirect: 'manual',
    headers: { Authorization: `Bearer ${env.STOCK_RESERVATION_CRON_SECRET}` },
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(`Stock expiry failed: HTTP ${response.status}`);
  const result = await response.json() as { success?: boolean; expired?: number; updatedProducts?: number };
  if (!result.success) throw new Error('Stock expiry returned an invalid result.');
  // Never log request headers, customer information or credentials.
  console.log(JSON.stringify({ task: 'cart-reservation-expiry', expired: result.expired, updatedProducts: result.updatedProducts }));
}

export default {
  async scheduled(_event: unknown, env: Env) { await runStockExpiry(env); },
  async fetch() { return new Response('Not found', { status: 404 }); },
};

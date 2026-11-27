# Cart reservation expiry

This Cloudflare Worker invokes All-Shop's protected cleanup endpoint every minute,
even with every storefront tab closed. No public Worker URL is enabled. The
15-minute deadline is checked by the shop server, not by the scheduler.

## Configuration

- Vercel production secret: `STOCK_RESERVATION_CRON_SECRET`.
- Cloudflare Worker secret: the same `STOCK_RESERVATION_CRON_SECRET`.
- Non-secret endpoint and minute schedule: `wrangler.jsonc`.
- Deployment: `npx wrangler deploy --config workers/cart-reservation-expiry/wrangler.jsonc`.
- Logs: `npx wrangler tail --config workers/cart-reservation-expiry/wrangler.jsonc`.

Keep the secret out of source control and client-side variables. Use stdin with
`vercel env add` / `wrangler secret put`. Changing a Vercel environment variable
requires a new production deployment. Cron changes can take up to 15 minutes to
propagate on Cloudflare.

## Behaviour and safeguards

- Expired CART reservations only. Order and preorder records are not deleted.
- Re-read inventory, reservations and catalogue inside a Firestore transaction;
  concurrent renewal, sale or receipt forces retry against the current data.
- Recalculate public total/variant stock and derived reserved summaries. Never
  change purchased/sold quantities or serial numbers.
- Audit actual expirations as System with before/after stock. Repeated calls are
  no-ops, including overlaps between cron and storefront cleanup requests.
- Storefront expiry/focus is an additional trigger, not a required visitor.
- Cart items persist locally after expiry, appear gray and require an explicit
  renewal (subject to current stock and price) before checkout can continue.
- Tests: `npm run test:cart-reservations` (in-memory, no production writes).

Normal closed-tab release latency is the next minute tick after expiry, plus
request processing. Network/provider failures are retried on the next tick.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { expireCartReservations, expireProductCartReservations, isExpiredCartReservation } from '../src/server/expireCartReservations.js';
import { handleCartReservationCleanup } from '../src/server/cartReservationCleanup.js';
import { isCartReservationExpired, restoreCart } from '../src/domain/cartReservation.js';
import { runStockExpiry } from '../workers/cart-reservation-expiry/index.js';

// All writes and scheduled requests are in memory; no customer stock is used.
const docs = new Map<string, any>();
let sequence = 0;
let retry: (() => void) | undefined;
const snap = (ref: any) => ({ id: ref.id, ref, exists: docs.has(ref.path), data: () => docs.get(ref.path) });
const querySnapshot = (q: any) => ({ docs: [...docs].filter(([path, data]) => {
  if (!path.startsWith(`${q.name}/`)) return false;
  if (q.op === '==') return data[q.field] === q.value;
  const actual = data[q.field];
  if (typeof actual === 'number') return typeof q.value === 'number' && actual <= q.value;
  return actual instanceof Timestamp && q.value instanceof Timestamp && actual.toMillis() <= q.value.toMillis();
}).map(([path]) => snap({ path, id: path.split('/')[1] })) });
const database: any = {
  collection: (name: string) => ({
    doc: (id = `audit-${++sequence}`) => ({ path: `${name}/${id}`, id }),
    where: (field: string, op: string, value: any) => {
      const q = { name, field, op, value };
      return { ...q, get: async () => querySnapshot(q) };
    },
  }),
  runTransaction: async (body: (tx: any) => Promise<any>) => {
    const attempt = async () => {
      const writes: Array<() => void> = [];
      const result = await body({
        get: async (ref: any) => {
          assert.equal(writes.length, 0, 'All reads must precede writes.');
          return ref.path ? snap(ref) : querySnapshot(ref);
        },
        update: (ref: any, value: any) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...value })),
        set: (ref: any, value: any) => writes.push(() => docs.set(ref.path, value)),
        delete: (ref: any) => writes.push(() => { docs.delete(ref.path); }),
      });
      return { writes, result };
    };
    let transaction = await attempt();
    if (retry) { const concurrentChange = retry; retry = undefined; concurrentChange(); transaction = await attempt(); }
    transaction.writes.forEach(write => write());
    return transaction.result;
  },
};
const past = Date.now() - 60_000;
const future = Date.now() + 900_000;
const seed = () => {
  docs.clear();
  docs.set('products_public/6', { name: 'Xiaomi G3', stock: 1, price: 59.49 });
  docs.set('products_inventory/g3', { publicProductId: 6, quantityBought: 6, quantitySold: 3, reserved: 2, units: [{ id: 'SN-sold', status: 'SOLD', soldToOrder: 'AS-123456' }] });
  docs.set('stock_reservations/v2_cart', { productId: 6, quantity: 2, ownerKey: 'guest:test', expiresAt: Timestamp.fromMillis(past) });
};
seed();
const originalLot = { ...docs.get('products_inventory/g3'), reserved: 0 };
assert.deepEqual(await expireCartReservations(database), { expired: 1, updatedProducts: 1 });
assert.equal(docs.get('products_public/6').stock, 3, 'Positive stale stock (1) must return to 3, not only zero-stock products.');
assert.deepEqual(docs.get('products_inventory/g3'), originalLot, 'Purchases, sales and serials must not change.');
assert.equal(docs.has('stock_reservations/v2_cart'), false);
assert.equal([...docs.values()].find(d => d.action === 'expire_cart_reservations')?.actorType, 'SYSTEM');
const size = docs.size;
assert.deepEqual(await expireCartReservations(database), { expired: 0, updatedProducts: 0 });
assert.equal(docs.size, size, 'Repeated cleanup does not add audits or restore stock twice.');

seed();
docs.set('stock_reservations/v2_active', { productId: 6, quantity: 1, expiresAt: future });
docs.set('stock_reservations/preorder_old', { productId: 6, quantity: 1, kind: 'PREORDER', orderId: 'AS-111111', expiresAt: past });
docs.set('orders/AS-111111', { status: 'Pago', items: ['unchanged'] });
await expireCartReservations(database, [6]);
assert.equal(docs.get('products_public/6').stock, 2, 'The remaining active hold still reduces availability.');
assert.equal(docs.get('products_inventory/g3').reserved, 1);
assert.ok(docs.has('stock_reservations/v2_active'));
assert.ok(docs.has('stock_reservations/preorder_old'));
assert.deepEqual(docs.get('orders/AS-111111'), { status: 'Pago', items: ['unchanged'] });
for (const data of [{ kind: 'PREORDER' }, { orderId: 'AS-123456' }, { ownerKey: 'preorder:AS-123456' }, { type: 'ORDER' }]) {
  assert.equal(isExpiredCartReservation('v2_old', { ...data, expiresAt: past }, Date.now()), false);
}
assert.equal(isExpiredCartReservation('unknown-legacy', { expiresAt: past }, Date.now()), false);
assert.equal(isExpiredCartReservation('v2_old', { expiresAt: past }, past), true);
assert.equal(isExpiredCartReservation('v2_old', {}, Date.now()), false);

seed();
retry = () => docs.set('stock_reservations/v2_cart', { ...docs.get('stock_reservations/v2_cart'), expiresAt: future });
assert.deepEqual(await expireProductCartReservations(database, 6), { expired: 0, updated: false });
assert.equal(docs.get('products_public/6').stock, 1, 'Concurrent renewal survives transaction retry.');
assert.ok(docs.has('stock_reservations/v2_cart'));
seed();
retry = () => docs.set('products_inventory/g3', { ...docs.get('products_inventory/g3'), quantitySold: 4 });
await expireProductCartReservations(database, 6);
assert.equal(docs.get('products_public/6').stock, 2, 'Retry must use the latest physical count after a concurrent sale.');

docs.clear();
docs.set('products_public/2', { name: 'Variants', stock: 0, variants: [{ name: 'Preto', stock: 0, price: 40 }, { name: 'Branco', stock: 0, price: 41 }] });
docs.set('products_inventory/black', { publicProductId: 2, variant: 'Preto', quantityBought: 5, quantitySold: 3, reserved: 1 });
docs.set('products_inventory/white', { publicProductId: '2', variant: 'Branco', quantityBought: 1, quantitySold: 0 });
docs.set('products_inventory/incoming', { publicProductId: 2, variant: 'Preto', quantityBought: 100, receiptStatus: 'IN_TRANSIT' });
docs.set('stock_reservations/numeric-legacy-cart', { productId: 2, kind: 'CART', variantName: 'Preto', quantity: 1, expiresAt: past });
await expireCartReservations(database);
assert.equal(docs.get('products_public/2').stock, 3, 'Incoming lots are excluded; legacy string lot IDs are included.');
assert.deepEqual(docs.get('products_public/2').variants, [{ name: 'Preto', stock: 2, price: 40 }, { name: 'Branco', stock: 1, price: 41 }]);

const response = () => ({ code: 0, body: null as any, setHeader() {}, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } });
const call = async (method: string, body?: unknown, authorization?: string) => {
  const res = response();
  await handleCartReservationCleanup({ method, body, headers: { authorization } } as any, res as any, database);
  return res;
};
process.env.STOCK_RESERVATION_CRON_SECRET = 'test-secret-not-production';
assert.equal((await call('GET')).code, 401);
assert.equal((await call('GET', undefined, 'Bearer incorrect')).code, 401);
assert.equal((await call('GET', undefined, 'Bearer test-secret-not-production')).code, 200);
for (const body of [undefined, { productIds: [] }, { productIds: ['6'] }, { productIds: [-1] }, { productIds: Array(11).fill(6) }]) assert.equal((await call('POST', body)).code, 400);
assert.equal((await call('DELETE')).code, 405);
seed();
docs.set('stock_reservations/v2_cart', { ...docs.get('stock_reservations/v2_cart'), expiresAt: future });
assert.deepEqual((await call('POST', { productIds: [6], force: true })).body, { success: true, expired: 0, updatedProducts: 0 });

const cart = { id: 6, cartItemId: '6-default', name: 'Xiaomi G3', image: '', quantity: 2, price: 59.49, reservedUntil: new Date(future).toISOString() };
const restored = restoreCart(JSON.stringify([cart]));
assert.equal(restored.length, 1);
assert.equal(isCartReservationExpired(restored[0], future - 1), false);
assert.equal(isCartReservationExpired(restored[0], future), true);
assert.equal(restoreCart(JSON.stringify([{ ...cart, reservedUntil: new Date(past).toISOString() }])).length, 1, 'Expired items are retained on reload.');
assert.equal(isCartReservationExpired({}), true);
assert.deepEqual(restoreCart('not-json'), []);
assert.deepEqual(restoreCart(JSON.stringify([{ ...cart, quantity: -1 }])), []);

let scheduledCalls = 0;
const env = { CLEANUP_URL: 'https://test.invalid/cleanup', STOCK_RESERVATION_CRON_SECRET: 'test-secret' };
await runStockExpiry(env, (async (url, options) => {
  scheduledCalls++;
  assert.equal(url, env.CLEANUP_URL);
  assert.equal((options?.headers as any).Authorization, 'Bearer test-secret');
  assert.equal(options?.redirect, 'error');
  return Response.json({ success: true, expired: 0, updatedProducts: 0 });
}) as typeof fetch);
assert.equal(scheduledCalls, 1);
await assert.rejects(runStockExpiry(env, (async () => new Response('', { status: 500 })) as typeof fetch), /HTTP 500/);
await assert.rejects(runStockExpiry({ ...env, STOCK_RESERVATION_CRON_SECRET: '' }), /not configured/);
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.ok(config.rewrites.some((r: any) => r.source === '/api/cleanup-reservations' && r.destination === '/api/admin?resource=cart-expiry'));
assert.ok(readdirSync(new URL('../api/', import.meta.url)).filter(n => n.endsWith('.ts')).length <= 12);
console.log('Cart expiry: stock, variants, scheduler, auth, races, persistence and protected sales OK.');

import assert from 'node:assert/strict';
import { clientOrderInsights, clientTopProducts, orderBelongsToClient, tierForTotal } from '../src/features/admin/clientInsights.js';
import type { AdminOrder, AdminUser } from '../src/features/admin/adminTypes.js';

const client: AdminUser = { id: 'user-1', email: 'Cliente@Example.com' };
const orders: AdminOrder[] = [
  { id: 'one', userId: 'user-1', status: 'Entregue', total: 160, shippingInfo: { email: 'outro@example.com' }, items: [{ productId: 10, name: 'Box', quantity: 2, price: 30 }] },
  { id: 'two', status: 'Enviado', total: 110, shippingInfo: { email: 'cliente@example.com' }, items: [{ productId: 10, name: 'Box', quantity: 1, price: 30 }, { productId: 11, name: 'Cabo', quantity: 3, price: 5 }] },
  { id: 'cancelled', userId: 'user-1', status: 'Cancelado', total: 999, items: [{ productId: 12, name: 'Não contar', quantity: 9, price: 99 }] },
  { id: 'other', userId: 'user-2', status: 'Entregue', total: 500 },
];

assert.equal(orderBelongsToClient(orders[0], client), true);
assert.equal(orderBelongsToClient(orders[1], client), true);
assert.equal(orderBelongsToClient(orders[3], client), false);

const insights = clientOrderInsights(orders, client);
assert.equal(insights.allOrders.length, 3);
assert.equal(insights.commercialOrders.length, 2);
assert.equal(insights.totalSpent, 270);
assert.equal(insights.averageOrderValue, 135);
assert.equal(insights.tier, 'Prata');

assert.equal(tierForTotal(249.99), 'Bronze');
assert.equal(tierForTotal(250), 'Prata');
assert.equal(tierForTotal(600), 'Ouro');

const top = clientTopProducts(insights.allOrders);
assert.deepEqual(top.map((product) => [product.name, product.quantity]), [['Box', 3], ['Cabo', 3]]);

console.log('client insights regressions: OK');

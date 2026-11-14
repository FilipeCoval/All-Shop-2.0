import assert from 'node:assert/strict';
import { buildShippingLabelDocument } from '../src/features/admin/shippingLabel.js';
import type { AdminOrder } from '../src/features/admin/adminTypes.js';

const order: AdminOrder = {
  id: 'AS-123456',
  status: 'Pago',
  shippingInfo: {
    name: 'Ana <Cliente>',
    phone: '912345678',
    street: 'Rua do Portal',
    doorNumber: '18',
    zip: '4000-000',
    city: 'Porto',
    deliveryMethod: 'Shipping',
  },
  items: [{ name: 'TV Box', quantity: 1 }],
  packages: [
    { id: 'one', weight: 0.45, trackingNumber: 'CTT-001', items: [{ name: 'TV Box', quantity: 1 }] },
    { id: 'two', weight: 0.1, items: [{ name: 'Cabo HDMI', quantity: 1 }] },
  ],
};

const document = buildShippingLabelDocument(order, {
  storeName: 'All-Shop', senderName: 'All-Shop', street: 'Rua Central 82', zip: '2430-017', city: 'Marinha Grande', country: 'Portugal',
}, 0.45, new Date('2026-11-14T10:00:00Z'));

assert.match(document, /VOLUME 1 \/ 2/);
assert.match(document, /VOLUME 2 \/ 2/);
assert.match(document, /CTT-001/);
assert.match(document, /Por atribuir/);
assert.match(document, /Ana &lt;Cliente&gt;/, 'dados do cliente são protegidos no documento de impressão');
assert.doesNotMatch(document, /Ana <Cliente>/);
assert.match(document, /@page \{ size: A6 landscape;/);

console.log('shipping label regressions: OK');

import assert from 'node:assert/strict';
import { createPreorder, confirmPreorderMessage } from '../api/create-order-draft.js';
import { preorderMessageConfirmation } from '../src/server/preorderConfirmation.js';

// In-memory Firestore transaction double: no production writes or notifications.
const documents = new Map<string, any>();
let auditId = 0;
const get = (value: any, field: string) => field.split('.').reduce((v, key) => v?.[key], value);
const collection = (name: string) => ({
  name,
  doc: (id = `audit-${++auditId}`) => ({ path: `${name}/${id}`, id }),
  where: (field: string, _operator: string, value: unknown) => ({ name, field, value }),
});
const snapshot = (ref: any) => ({ id: ref.id, ref, exists: documents.has(ref.path), data: () => documents.get(ref.path) });
const fakeDb = {
  collection,
  runTransaction: async (body: (tx: any) => Promise<unknown>) => {
    const writes: Array<() => void> = [];
    const result = await body({
      get: async (ref: any) => ref.path ? snapshot(ref) : { docs: [...documents].filter(([path, data]) => path.startsWith(`${ref.name}/`) && get(data, ref.field) === ref.value).map(([path]) => snapshot({ path, id: path.split('/')[1] })) },
      set: (ref: any, value: any) => writes.push(() => documents.set(ref.path, value)),
      update: (ref: any, value: any) => writes.push(() => documents.set(ref.path, { ...documents.get(ref.path), ...value })),
      delete: (ref: any) => writes.push(() => { documents.delete(ref.path); }),
    });
    writes.forEach((write) => write());
    return result;
  },
} as any;
let alerts = 0;
const notify = async () => { alerts++; };
const guestToken = 'guest_preorder_flow_test_12345';
const input = { idempotencyKey: 'AS-123456789012', productId: 2, selectedVariant: 'Preto', quantity: 2, termsAccepted: true, guestToken, shippingInfo: { name: 'Teste', email: 'test@example.invalid', phone: '000000000', deliveryMethod: 'Pickup', paymentMethod: 'MB Way' } };
const req = (body: any) => ({ headers: {}, body } as any);
documents.set('products_public/2', { name: 'Produto teste', price: 40, variants: [{ name: 'Preto', price: 40 }], preorder: { enabled: true, variantCapacities: { preto: 3 }, capacity: 3, estimatedDispatchDate: '2099-12-10' } });

const first = await createPreorder(fakeDb, req(input), notify);
assert.ok('preorder' in first.order);
assert.equal(first.order.status, 'A confirmar');
assert.equal(first.order.preorder.messagePending, true);
assert.equal(first.order.preorder.messageConfirmedAt, null);
assert.equal(first.order.stockDeducted, false);
assert.equal(first.order.preorder.depositDue, 40);
assert.equal(alerts, 1, 'The admin is notified even if the customer never returns from the messaging app.');
assert.ok(documents.has(`orders/${input.idempotencyKey}`), 'The order exists before opening WhatsApp.');
assert.equal([...documents.keys()].filter((key) => key.startsWith('products_inventory/')).length, 0, 'No physical stock writes.');
await createPreorder(fakeDb, req(input), notify);
assert.equal(alerts, 1, 'Retry does not send a duplicate new-order alert.');
assert.equal(documents.get('products_public/2').preorder.reservedQuantity, 2, 'Retry does not consume capacity twice.');
await assert.rejects(createPreorder(fakeDb, req({ ...input, idempotencyKey: 'AS-123456789013' }), notify), /vagas suficientes/);
await assert.rejects(confirmPreorderMessage(fakeDb, req({ orderId: input.idempotencyKey, messagePlatform: 'WHATSAPP', guestToken: 'another_guest_test_12345' }), notify), /não encontrada/);
const confirmed = await confirmPreorderMessage(fakeDb, req({ orderId: input.idempotencyKey, messagePlatform: 'WHATSAPP', guestToken }), notify);
assert.ok('preorder' in confirmed.order);
assert.equal(confirmed.order.status, 'Pendente');
assert.equal(confirmed.order.preorder.messagePending, false);
assert.equal(alerts, 2);
assert.equal(documents.get('products_public/2').preorder.reservedQuantity, 2);
assert.equal(documents.get(`orders/${input.idempotencyKey}`).total, 80);
await confirmPreorderMessage(fakeDb, req({ orderId: input.idempotencyKey, messagePlatform: 'WHATSAPP', guestToken }), notify);
assert.equal(alerts, 2, 'Double confirmation does not repeat side effects.');
assert.throws(() => preorderMessageConfirmation({ status: 'Cancelado', preorder: { kind: 'PREORDER', status: 'CANCELLED' } }, 'WHATSAPP', new Date()), /cancelada/);
assert.throws(() => preorderMessageConfirmation({ status: 'A confirmar', preorder: { kind: 'PREORDER', status: 'DEPOSIT_PENDING', depositDeadlineAt: '2020-01-01' } }, 'WHATSAPP', new Date()), /prazo/);
assert.equal(preorderMessageConfirmation({ status: 'Processamento', preorder: { kind: 'PREORDER', status: 'DEPOSIT_RECEIVED', depositReceivedAt: '2026-11-18' } }, 'TELEGRAM', new Date())?.status, 'Processamento', 'Late message confirmation never undoes an admin payment.');
console.log('Preorder persistence / message confirmation: OK');

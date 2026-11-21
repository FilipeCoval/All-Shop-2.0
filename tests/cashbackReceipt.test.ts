import assert from 'node:assert/strict';
import {
  cashbackReceiptUpdate,
  CashbackReceiptValidationError,
  prepareCashbackForLotSave,
  prepareCashbackReceipt,
} from '../src/server/cashbackReceipt.ts';

const costInput = {
  grossPurchaseTotal: 100,
  supplierShippingCost: 10,
  customsCost: 5,
};

assert.deepEqual(prepareCashbackForLotSave({
  ...costInput,
  cashbackStatus: 'NONE',
  cashbackValue: 42,
  cashbackPlatform: 'valor antigo',
  cashbackExpectedDate: '2026-11-01',
  cashbackPaidDate: '2026-10-01',
}), {
  cashbackStatus: 'NONE',
  cashbackValue: 0,
  cashbackPlatform: '',
  cashbackExpectedDate: '',
  cashbackPaidDate: '',
});

assert.deepEqual(prepareCashbackForLotSave({
  ...costInput,
  cashbackStatus: 'PENDING',
  cashbackValue: 25,
  cashbackPlatform: '  iGraal  ',
  cashbackExpectedDate: '2026-11-01',
  cashbackPaidDate: '2026-09-01',
}), {
  cashbackStatus: 'PENDING',
  cashbackValue: 25,
  cashbackPlatform: 'iGraal',
  cashbackExpectedDate: '2026-11-01',
  cashbackPaidDate: '',
});

assert.deepEqual(prepareCashbackForLotSave({
  ...costInput,
  cashbackStatus: 'RECEIVED',
  cashbackValue: 25,
  cashbackPaidDate: '2026-10-10',
}, '2026-10-10'), {
  cashbackStatus: 'RECEIVED',
  cashbackValue: 25,
  cashbackPlatform: '',
  cashbackExpectedDate: '',
  cashbackPaidDate: '2026-10-10',
});

for (const invalidInput of [
  { ...costInput, cashbackStatus: 'PENDING', cashbackValue: 0 },
  { ...costInput, cashbackStatus: 'RECEIVED', cashbackValue: 25 },
  { ...costInput, cashbackStatus: 'RECEIVED', cashbackValue: 25, cashbackPaidDate: '2026-10-11' },
  { ...costInput, cashbackStatus: 'PENDING', cashbackValue: 115.01 },
  { ...costInput, cashbackStatus: 'UNKNOWN', cashbackValue: 25 },
  { ...costInput, cashbackStatus: 'PENDING', cashbackValue: 25, cashbackExpectedDate: '2026-02-30' },
]) {
  assert.throws(
    () => prepareCashbackForLotSave(invalidInput, '2026-10-10'),
    (error) => error instanceof CashbackReceiptValidationError && error.status === 400,
  );
}

const pending = prepareCashbackReceipt({ cashbackStatus: 'PENDING', cashbackValue: 23.6 }, '2026-10-10');
assert.deepEqual(pending, { alreadyReceived: false, paidDate: '2026-10-10', value: 23.6 });

const legacyPending = prepareCashbackReceipt({ cashbackValue: 12.5 }, '2026-10-10');
assert.deepEqual(legacyPending, { alreadyReceived: false, paidDate: '2026-10-10', value: 12.5 });

const repeated = prepareCashbackReceipt({ cashbackStatus: 'RECEIVED', cashbackValue: 23.6, cashbackPaidDate: '2026-10-09' }, '2026-10-10');
assert.deepEqual(repeated, { alreadyReceived: true, paidDate: '2026-10-09', value: 23.6 });

assert.throws(
  () => prepareCashbackReceipt({ cashbackStatus: 'NONE', cashbackValue: 23.6 }, '2026-10-10'),
  (error) => error instanceof CashbackReceiptValidationError && error.status === 409,
);
assert.throws(
  () => prepareCashbackReceipt({ cashbackStatus: 'PENDING', cashbackValue: 0 }, '2026-10-10'),
  (error) => error instanceof CashbackReceiptValidationError && error.status === 409,
);
assert.throws(
  () => prepareCashbackReceipt({ cashbackStatus: 'RECEIVED', cashbackValue: 0 }, '2026-10-10'),
  (error) => error instanceof CashbackReceiptValidationError && error.status === 409,
);
assert.throws(
  () => prepareCashbackReceipt({ cashbackStatus: 'PENDING', cashbackValue: 23.6 }, '2026-02-30'),
  (error) => error instanceof CashbackReceiptValidationError && error.status === 400,
);
assert.throws(
  () => prepareCashbackReceipt({ cashbackStatus: 'PENDING', cashbackValue: 23.6 }, '2026-10-11', '2026-10-10'),
  (error) => error instanceof CashbackReceiptValidationError && error.status === 400,
);

const update = cashbackReceiptUpdate('2026-10-10', 'server-timestamp', 'admin-1');
assert.deepEqual(update, {
  cashbackStatus: 'RECEIVED',
  cashbackPaidDate: '2026-10-10',
  updatedAt: 'server-timestamp',
  updatedBy: 'admin-1',
});
assert.deepEqual(Object.keys(update).sort(), ['cashbackPaidDate', 'cashbackStatus', 'updatedAt', 'updatedBy']);

console.log('cashback receipt regression tests passed');

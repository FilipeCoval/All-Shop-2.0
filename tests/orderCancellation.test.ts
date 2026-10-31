import assert from 'node:assert/strict';
import {
  applyPartialCancellation,
  calculateCancellationRefund,
  cancellationSourceItems,
  validateCancellationItems,
} from '../src/server/orderCancellation.js';

const orderWithDuplicatePackageItems = {
  total: 32,
  subtotal: 40,
  discountValue: 8,
  // Legacy orders can retain this top-level mirror after being packaged. Its
  // prices are deliberately stale so the test proves packages are canonical.
  items: [
    {
      lineId: 'mirror-1',
      productId: 10,
      quantity: 1,
      price: 999,
      selectedVariant: 'Azul',
      unitIds: ['M-U1'],
      serialNumbers: ['M-SN1'],
    },
    {
      lineId: 'mirror-2',
      productId: 10,
      quantity: 2,
      price: 999,
      selectedVariant: 'azul',
      unitIds: ['M-U2', 'M-U3'],
      serialNumbers: ['M-SN2', 'M-SN3'],
    },
    {
      lineId: 'mirror-3',
      productId: 20,
      quantity: 1,
      price: 999,
      selectedVariant: 'Unico',
      unitIds: ['M-U4'],
      serialNumbers: ['M-SN4'],
    },
  ],
  packages: [
    {
      id: 'P1',
      trackingNumber: 'TRACK-1',
      items: [
        {
          lineId: 'package-1',
          productId: 10,
          quantity: 1,
          price: 10,
          selectedVariant: ' Azul ',
          unitIds: ['U1'],
          serialNumbers: ['SN1'],
        },
      ],
    },
    {
      id: 'P2',
      trackingNumber: 'TRACK-2',
      items: [
        {
          lineId: 'package-2',
          productId: 10,
          quantity: 2,
          price: 10,
          selectedVariant: 'azul',
          unitIds: ['U2', 'U3'],
          serialNumbers: ['SN2', 'SN3'],
        },
        {
          lineId: 'package-3',
          productId: 20,
          quantity: 1,
          price: 20,
          selectedVariant: 'Unico',
          unitIds: ['U4'],
          serialNumbers: ['SN4'],
        },
      ],
    },
  ],
};

const duplicateCancellationLines = [
  { productId: 10, quantity: 1, variant: 'AZUL' },
  { productId: 10, quantity: 1, variant: '  azul  ' },
];

assert.equal(cancellationSourceItems(orderWithDuplicatePackageItems).length, 3);
assert.equal(cancellationSourceItems(orderWithDuplicatePackageItems)[0].lineId, 'package-1');
assert.equal(validateCancellationItems(orderWithDuplicatePackageItems, duplicateCancellationLines), true);

const excessiveDuplicateCancellation = [
  { productId: 10, quantity: 2, variant: 'azul' },
  { productId: 10, quantity: 2, variant: ' AZUL ' },
];
assert.equal(validateCancellationItems(orderWithDuplicatePackageItems, excessiveDuplicateCancellation), false);
assert.throws(
  () => applyPartialCancellation(orderWithDuplicatePackageItems, excessiveDuplicateCancellation),
  { message: 'O pedido de cancelamento contém quantidades inválidas.' },
);

const remaining = applyPartialCancellation(orderWithDuplicatePackageItems, duplicateCancellationLines);
type TrackedItem = {
  lineId: string;
  quantity?: number;
  unitIds?: string[];
  serialNumbers?: string[];
};
type TrackedPackage = {
  id: string;
  trackingNumber: string;
  items?: TrackedItem[];
};
const remainingPackages = remaining.packages as TrackedPackage[];
const remainingItems = remaining.items as TrackedItem[] | undefined;

assert.equal(remainingPackages.length, 1);
assert.equal(remainingPackages[0].id, 'P2');
assert.equal(remainingPackages[0].trackingNumber, 'TRACK-2');
assert.deepEqual(
  remainingPackages[0].items?.map((item) => ({
    lineId: item.lineId,
    quantity: item.quantity,
    unitIds: item.unitIds,
    serialNumbers: item.serialNumbers,
  })),
  [
    { lineId: 'package-2', quantity: 1, unitIds: ['U2'], serialNumbers: ['SN2'] },
    { lineId: 'package-3', quantity: 1, unitIds: ['U4'], serialNumbers: ['SN4'] },
  ],
);
assert.deepEqual(
  remainingItems?.map((item) => ({
    lineId: item.lineId,
    quantity: item.quantity,
    unitIds: item.unitIds,
    serialNumbers: item.serialNumbers,
  })),
  [
    { lineId: 'mirror-2', quantity: 1, unitIds: ['M-U2'], serialNumbers: ['M-SN2'] },
    { lineId: 'mirror-3', quantity: 1, unitIds: ['M-U4'], serialNumbers: ['M-SN4'] },
  ],
);
assert.equal(remaining.remainingQuantity, 2);

assert.equal(
  calculateCancellationRefund(orderWithDuplicatePackageItems, duplicateCancellationLines, true),
  16,
);

console.log('order cancellation duplicates and packages: OK');

import assert from 'node:assert/strict';
import {
  applyFulfillmentToPackages,
  FulfillmentError,
  fulfillmentAvailableUnitCapacity,
  fulfillmentItemsFromPackages,
  isOrderFulfillmentComplete,
  matchingFulfillmentLots,
  planOrderFulfillment,
  planStoredOrderFulfillment,
} from '../src/server/orderFulfillment.js';
import { isGeneratedInternalUnit } from '../src/domain/fulfillmentCapacity.js';

assert.equal(isOrderFulfillmentComplete({ status: 'Enviado' }), true);
assert.equal(isOrderFulfillmentComplete({ status: 'Entregue' }), true);
assert.equal(isOrderFulfillmentComplete({ status: 'Processamento' }), false);
assert.equal(isOrderFulfillmentComplete({ status: 'Processamento', fulfillmentStatus: 'COMPLETED' }), true);

const base = {
  orderId: 'AS-1',
  orderItems: [{ productId: 3, quantity: 2, selectedVariant: 'Preto' }],
  lots: [{
    id: 'L1',
    publicProductId: 3,
    variant: 'Preto',
    quantityBought: 2,
    quantitySold: 0,
    purchasePrice: 10,
    units: [
      { id: 'SN-LEGACY', status: 'AVAILABLE' },
      { id: 'unit-uuid', serialNumber: 'SN-NEW', barcode: 'EAN-NEW', status: 'AVAILABLE' },
    ],
  }],
  serialNumbers: ['SN-LEGACY', 'EAN-NEW'],
  stockAlreadyDeducted: false,
  fulfilledAt: '2026-10-04T00:00:00Z',
};

const result = planOrderFulfillment(base);
assert.deepEqual(result.itemUnitIds, [['SN-LEGACY', 'unit-uuid']]);
assert.deepEqual(result.itemSerials, [['SN-LEGACY', 'SN-NEW']]);
assert.deepEqual(result.serialNumbers, ['SN-LEGACY', 'SN-NEW']);
assert.equal(result.updatedLots[0].quantitySold, 2);

assert.throws(
  () => planOrderFulfillment({ ...base, serialNumbers: ['SN-NEW', 'EAN-NEW'] }),
  (error) => error instanceof FulfillmentError && error.message.includes('mesma unidade'),
);

const legacyOrderWithoutStockFlag = planStoredOrderFulfillment({
  orderId: 'AS-772844',
  orderItems: [{ productId: 2, quantity: 1 }],
  lots: [{
    id: 'Eumw9cqGBw0BIJnZ90dL',
    publicProductId: 2,
    quantityBought: 5,
    quantitySold: 5,
    units: [
      { id: 'INT-OLD-1', status: 'SOLD', soldToOrder: 'AS-OLD-1' },
      { id: 'INT-OLD-2', status: 'SOLD', soldToOrder: 'AS-OLD-2' },
      { id: 'INT-4C52E5CF', status: 'AVAILABLE' },
      { id: 'INT-74278CEB', status: 'AVAILABLE' },
    ],
  }],
  serialNumbers: ['INT-4C52E5CF'],
  fulfilledAt: '2026-11-02T16:40:00Z',
});
assert.equal(legacyOrderWithoutStockFlag.updatedLots[0].quantitySold, 5, 'uma encomenda antiga já abatida não pode descontar novamente');
assert.equal(legacyOrderWithoutStockFlag.updatedLots[0].units?.find((unit) => unit.id === 'INT-4C52E5CF')?.soldToOrder, 'AS-772844');

const legacyOrderNotYetDeducted = planStoredOrderFulfillment({
  orderId: 'AS-LEGACY-NOT-DEDUCTED',
  orderItems: [{ productId: 3, quantity: 1 }],
  lots: [{ id: 'L-FREE', publicProductId: 3, quantityBought: 1, quantitySold: 0, units: [{ id: 'SN-FREE', status: 'AVAILABLE' }] }],
  serialNumbers: ['SN-FREE'],
  fulfilledAt: '2026-11-02T16:41:00Z',
});
assert.equal(legacyOrderNotYetDeducted.updatedLots[0].quantitySold, 1, 'uma encomenda antiga sem abatimento deve consumir stock normalmente');

const incorrectlyFlaggedLegacyOrder = planStoredOrderFulfillment({
  orderId: 'AS-772844',
  orderItems: [{ productId: 2, quantity: 1 }],
  lots: [{
    id: 'Eumw9cqGBw0BIJnZ90dL',
    publicProductId: 2,
    quantityBought: 5,
    quantitySold: 5,
    units: [
      { id: 'INT-OLD-1', status: 'SOLD', soldToOrder: 'AS-OLD-1' },
      { id: 'INT-OLD-2', status: 'SOLD', soldToOrder: 'AS-OLD-2' },
      { id: 'INT-4C52E5CF', status: 'AVAILABLE' },
      { id: 'INT-74278CEB', status: 'AVAILABLE' },
    ],
  }],
  serialNumbers: ['INT-4C52E5CF'],
  stockDeducted: false,
  fulfilledAt: '2026-11-02T16:50:00Z',
});
assert.equal(incorrectlyFlaggedLegacyOrder.updatedLots[0].quantitySold, 5, 'uma flag antiga incorreta não pode provocar uma segunda baixa');
assert.equal(incorrectlyFlaggedLegacyOrder.updatedLots[0].units?.find((unit) => unit.id === 'INT-4C52E5CF')?.soldToOrder, 'AS-772844');

assert.throws(
  () => planStoredOrderFulfillment({
    orderId: 'AS-MANUAL-RECONCILIATION',
    orderItems: [{ productId: 2, quantity: 1 }],
    lots: [{ id: 'L-EMPTY', publicProductId: 2, quantityBought: 1, quantitySold: 1, units: [{ id: 'INT-OLD', status: 'SOLD', soldToOrder: 'AS-OLD' }, { id: 'INT-EXTRA', status: 'AVAILABLE' }] }],
    serialNumbers: ['INT-EXTRA'],
    stockDeducted: false,
    stockReconciliationRequired: true,
    fulfilledAt: '2026-11-02T16:51:00Z',
  }),
  (error) => error instanceof FulfillmentError && error.message.includes('quantidade física suficiente'),
  'uma encomenda explicitamente marcada para acerto manual deve continuar bloqueada',
);

const genericLot = {
  id: 'L-GENERIC',
  publicProductId: 4,
  variant: '',
  quantityBought: 1,
  quantitySold: 0,
  purchasePrice: 12,
  units: [{ id: 'generic-unit', serialNumber: 'SN-GENERIC', status: 'AVAILABLE' }],
};
const incompatibleVariantLot = {
  id: 'L-BLUE',
  publicProductId: 4,
  variant: 'Azul',
  quantityBought: 1,
  quantitySold: 0,
  units: [{ id: 'blue-unit', serialNumber: 'SN-BLUE', status: 'AVAILABLE' }],
};
assert.deepEqual(
  matchingFulfillmentLots([genericLot, incompatibleVariantLot], 4, 'Preto').map((lot) => lot.id),
  ['L-GENERIC'],
);
const genericFallback = planOrderFulfillment({
  orderId: 'AS-GENERIC',
  orderItems: [{ productId: 4, quantity: 1, selectedVariant: 'Preto' }],
  lots: [genericLot, incompatibleVariantLot],
  serialNumbers: ['sn-generic'],
  stockAlreadyDeducted: false,
  fulfilledAt: '2026-10-04T01:00:00Z',
});
assert.deepEqual(genericFallback.itemUnitIds, [['generic-unit']]);
assert.equal(genericFallback.updatedLots.find((lot) => lot.id === 'L-GENERIC')?.quantitySold, 1);
assert.equal(genericFallback.updatedLots.find((lot) => lot.id === 'L-BLUE')?.quantitySold, 0);

const relocationLots = [
  {
    id: 'L-DEBITED',
    publicProductId: 7,
    variant: 'Preto',
    quantityBought: 2,
    quantitySold: 1,
    purchasePrice: 8,
    units: [{ id: 'old-unit', serialNumber: 'SN-OLD', status: 'AVAILABLE' }],
  },
  {
    id: 'L-CHOSEN',
    publicProductId: 7,
    variant: 'Preto',
    quantityBought: 2,
    quantitySold: 0,
    purchasePrice: 9,
    units: [{ id: 'chosen-unit', serialNumber: 'SN-CHOSEN', status: 'AVAILABLE' }],
  },
];
const soldBeforeRelocation = relocationLots.reduce((sum, lot) => sum + lot.quantitySold, 0);
const relocation = planOrderFulfillment({
  orderId: '#AS-REALLOC',
  orderItems: [{ productId: 7, quantity: 1, selectedVariant: 'Preto' }],
  lots: relocationLots,
  serialNumbers: ['SN-CHOSEN'],
  stockAlreadyDeducted: true,
  fulfilledAt: '2026-10-04T02:00:00Z',
});
assert.equal(relocation.updatedLots.find((lot) => lot.id === 'L-DEBITED')?.quantitySold, 0);
assert.equal(relocation.updatedLots.find((lot) => lot.id === 'L-CHOSEN')?.quantitySold, 1);
assert.equal(relocation.updatedLots.reduce((sum, lot) => sum + Number(lot.quantitySold), 0), soldBeforeRelocation);
assert.equal(relocation.updatedLots[1].units?.[0].soldToOrder, 'AS-REALLOC');

const fullLotsWithUnassignedSales = [
  {
    id: 'L-OLDER-DEBIT',
    publicProductId: 2,
    variant: '',
    quantityBought: 1,
    quantitySold: 1,
    units: [{ id: 'INT-OLDER', status: 'AVAILABLE' }],
  },
  {
    id: 'L-CHOSEN-FULL',
    publicProductId: 2,
    variant: '',
    quantityBought: 1,
    quantitySold: 1,
    units: [
      { id: 'INT-REAL', status: 'AVAILABLE' },
      { id: 'INT-EXTRA', status: 'AVAILABLE' },
    ],
  },
];
assert.equal(fulfillmentAvailableUnitCapacity(fullLotsWithUnassignedSales[1]), 1, 'identificadores excedentes não podem aparecer como stock físico');
assert.equal(isGeneratedInternalUnit({ id: 'INT-4C52E5CF', internalLabel: 'INT-4C52E5CF', status: 'AVAILABLE' }), true);
assert.equal(isGeneratedInternalUnit({ id: 'unit-1', serialNumber: '63598/70000221', internalLabel: 'INT-4C52E5CF', status: 'AVAILABLE' }), false, 'um S/N real não deve ser escondido por ter também etiqueta interna');
const lastUnitFulfillment = planOrderFulfillment({
  orderId: 'AS-772844',
  orderItems: [{ productId: 2, quantity: 1 }],
  lots: fullLotsWithUnassignedSales,
  serialNumbers: ['INT-REAL'],
  stockAlreadyDeducted: true,
  fulfilledAt: '2026-11-02T16:00:00Z',
});
assert.equal(lastUnitFulfillment.updatedLots.find((lot) => lot.id === 'L-CHOSEN-FULL')?.quantitySold, 1);
assert.equal(lastUnitFulfillment.updatedLots.find((lot) => lot.id === 'L-CHOSEN-FULL')?.units?.filter((unit) => unit.status === 'SOLD').length, 1);
assert.equal(lastUnitFulfillment.updatedLots.find((lot) => lot.id === 'L-OLDER-DEBIT')?.quantitySold, 1, 'outras vendas antigas não devem ser deslocadas');

const legacyOverflowFulfillment = planOrderFulfillment({
  orderId: 'AS-LEGACY-OVERFLOW',
  orderItems: [{ productId: 2, quantity: 1 }],
  lots: [{
    id: 'L-LEGACY-OVERFLOW',
    publicProductId: 2,
    quantityBought: 1,
    quantitySold: 2,
    units: [
      { id: 'INT-OLD-SALE', status: 'SOLD', soldToOrder: 'AS-OLDER' },
      { id: 'INT-LAST-SALE', status: 'AVAILABLE' },
    ],
  }],
  serialNumbers: ['INT-LAST-SALE'],
  stockAlreadyDeducted: true,
  fulfilledAt: '2026-11-02T16:30:00Z',
});
assert.equal(legacyOverflowFulfillment.updatedLots[0].quantitySold, 2, 'ligar uma etiqueta não pode repetir a venda');
assert.equal(legacyOverflowFulfillment.updatedLots[0].units?.filter((unit) => unit.status === 'SOLD').length, 2);
assert.equal(legacyOverflowFulfillment.updatedLots[0].units?.[1].soldToOrder, 'AS-LEGACY-OVERFLOW');

assert.throws(
  () => planOrderFulfillment({
    orderId: 'AS-NEW-OVERFLOW',
    orderItems: [{ productId: 2, quantity: 1 }],
    lots: [{ id: 'L-NORMAL', publicProductId: 2, quantityBought: 1, quantitySold: 1, units: [{ id: 'INT-ALREADY-SOLD', status: 'SOLD', soldToOrder: 'AS-OLDER' }, { id: 'INT-EXTRA', status: 'AVAILABLE' }] }],
    serialNumbers: ['INT-EXTRA'],
    stockAlreadyDeducted: false,
    fulfilledAt: '2026-11-02T16:31:00Z',
  }),
  (error) => error instanceof FulfillmentError && error.message.includes('quantidade física suficiente'),
  'uma nova venda impossível deve continuar bloqueada',
);

const packages = [
  {
    id: 'VOLUME-1',
    trackingNumber: 'TRACK-OLD',
    carrier: 'CTT',
    items: [{ productId: 11, quantity: 1, selectedVariant: 'A' }],
  },
  {
    id: 'VOLUME-2',
    trackingNumber: null,
    carrier: 'DHL',
    items: [
      { productId: 12, quantity: 1, selectedVariant: 'B' },
      { productId: 13, quantity: 1, selectedVariant: 'C' },
    ],
  },
];
assert.deepEqual(
  fulfillmentItemsFromPackages(packages).map((item) => item.productId),
  [11, 12, 13],
);
const fulfilledPackages = applyFulfillmentToPackages({
  packages,
  itemUnitIds: [['U-11'], ['U-12'], ['U-13']],
  itemSerials: [['S-11'], ['S-12'], ['S-13']],
  packageTrackingNumbers: ['TRACK-1', 'TRACK-2'],
  fallbackTrackingNumber: 'TRACK-COMMON',
});
assert.deepEqual(fulfilledPackages.map((pkg) => pkg.trackingNumber), ['TRACK-1', 'TRACK-2']);
assert.equal((fulfilledPackages[0] as Record<string, unknown>).carrier, 'CTT');
assert.equal((fulfilledPackages[1] as Record<string, unknown>).carrier, 'DHL');
assert.deepEqual(fulfilledPackages[0].items?.[0].unitIds, ['U-11']);
assert.deepEqual(fulfilledPackages[1].items?.map((item) => item.serialNumbers), [['S-12'], ['S-13']]);
assert.equal((packages[0].items?.[0] as Record<string, unknown>).unitIds, undefined);
const fulfilledWithFallbackTracking = applyFulfillmentToPackages({
  packages,
  itemUnitIds: [[], [], []],
  itemSerials: [[], [], []],
  fallbackTrackingNumber: 'TRACK-COMMON',
});
assert.deepEqual(fulfilledWithFallbackTracking.map((pkg) => pkg.trackingNumber), ['TRACK-OLD', 'TRACK-COMMON']);

console.log('order fulfillment regressions: OK');

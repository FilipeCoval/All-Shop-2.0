import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { cashbackReceiptUpdate, CashbackReceiptValidationError, prepareCashbackForLotSave, prepareCashbackReceipt } from '../cashbackReceipt.js';
import { inventoryLotSoldQuantity, normalizeInventoryReceiptStatus } from '../../domain/inventoryReceipt.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { inventoryUnitCodeDocumentId } from '../inventoryIdentity.js';
import { projectPublicStock, type LotData, type ReservationData } from '../stockProjection.js';

const text = (value: unknown, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const serial = (value: unknown) => text(value, 160).toUpperCase();
const withoutUndefined = <T extends Record<string, unknown>>(input: T) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
type UnitRecord = Record<string, unknown>;

const isUnitRecord = (value: unknown): value is UnitRecord => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value);

const unitCodes = (unit: UnitRecord) => [...new Set([
  unit.serialNumber,
  unit.internalLabel,
  unit.barcode,
  unit.id,
].map(serial).filter(Boolean))];

const stableUnitKey = (unit: UnitRecord) => serial(unit.id);
const identitySignature = (unit: UnitRecord) => unitCodes(unit).sort().join('|');
const isProtectedUnit = (unit: UnitRecord) => Boolean(unit.status && !['AVAILABLE', 'IN_TRANSIT'].includes(text(unit.status, 30).toUpperCase()));

const sanitizeUnit = (incoming: UnitRecord, receiptStatus: 'IN_TRANSIT' | 'RECEIVED', current?: UnitRecord): UnitRecord | null => {
  const id = text(incoming.id, 160)
    || text(incoming.serialNumber, 160)
    || text(incoming.internalLabel, 160)
    || text(incoming.barcode, 160);
  if (!id) return null;
  const source = current ?? {};
  const {
    id: _id,
    serialNumber: _serialNumber,
    internalLabel: _internalLabel,
    barcode: _barcode,
    status: _status,
    addedAt: _addedAt,
    ...metadata
  } = source;
  return withoutUndefined({
    ...metadata,
    id,
    ...(serial(incoming.serialNumber) ? { serialNumber: serial(incoming.serialNumber) } : {}),
    ...(serial(incoming.internalLabel) ? { internalLabel: serial(incoming.internalLabel) } : {}),
    ...(serial(incoming.barcode) ? { barcode: serial(incoming.barcode) } : {}),
    status: current && isProtectedUnit(current)
      ? text(current.status, 30)
      : receiptStatus === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'AVAILABLE',
    addedAt: text(current?.addedAt ?? incoming.addedAt, 50) || new Date().toISOString(),
  });
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    const database = getAdminDb();
    const action = text(request.body?.action, 40);
    const lotId = text(request.body?.lotId, 100);

    if (action === 'confirm_cashback_received') {
      if (!lotId || lotId.includes('/')) throw new ApiError(400, 'O lote não foi indicado corretamente.');
      const paidDate = text(request.body?.paidDate, 30);
      const lotRef = database.collection('products_inventory').doc(lotId);
      const result = await database.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lotRef);
        if (!snapshot.exists) throw new ApiError(404, 'O lote já não existe.');

        let receipt;
        try {
          receipt = prepareCashbackReceipt(snapshot.data() ?? {}, paidDate);
        } catch (error) {
          if (error instanceof CashbackReceiptValidationError) throw new ApiError(error.status, error.message);
          throw error;
        }
        if (receipt.alreadyReceived) {
          return { lotId, alreadyReceived: true, paidDate: receipt.paidDate };
        }

        transaction.update(lotRef, cashbackReceiptUpdate(receipt.paidDate, FieldValue.serverTimestamp(), admin.uid));
        const auditRef = database.collection('admin_audit_log').doc();
        transaction.set(auditRef, {
          action: 'confirm_cashback_received',
          targetId: lotId,
          lotId,
          publicProductId: Number(snapshot.data()?.publicProductId) || null,
          cashbackValue: receipt.value,
          cashbackPaidDate: receipt.paidDate,
          adminId: admin.uid,
          adminEmail: admin.email,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { lotId, alreadyReceived: false, paidDate: receipt.paidDate };
      });
      return response.status(200).json({ success: true, ...result });
    }

    const publicProductId = Number(request.body?.lot?.publicProductId ?? request.body?.publicProductId);
    if (!Number.isInteger(publicProductId) || publicProductId <= 0) throw new ApiError(400, 'Escolha um produto válido do catálogo.');

    if (!['save_lot', 'delete_lot', 'sync_product', 'confirm_lot_received', 'classify_legacy_lots'].includes(action)) throw new ApiError(400, 'Ação de inventário inválida.');
    if (action === 'save_lot' && !lotId) throw new ApiError(400, 'A página precisa de ser atualizada antes de criar este lote. O rascunho fica guardado neste dispositivo.');
    if (['delete_lot', 'confirm_lot_received'].includes(action) && !lotId) throw new ApiError(400, 'O lote não foi indicado.');
    if (lotId.includes('/')) throw new ApiError(400, 'O identificador do lote é inválido. Atualize a dashboard e tente novamente.');

    const inventoryCollection = database.collection('products_inventory');
    const codeIndexCollection = database.collection('inventory_unit_codes');
    const lotRef = lotId ? inventoryCollection.doc(lotId) : null;

    // Keep compatibility with inventory created before the unique-code index.
    // This scan stays outside the transaction, so unrelated products no longer
    // make every stock write contend with the complete inventory.
    const legacyInventorySnapshot = action === 'save_lot'
      ? await inventoryCollection.select('publicProductId', 'units').get()
      : null;
    const legacyLots: LotData[] = legacyInventorySnapshot?.docs
      .map((document) => ({ id: document.id, ...document.data() })) ?? [];

    const result = await database.runTransaction(async (transaction) => {
      const productRef = database.collection('products_public').doc(String(publicProductId));
      const inventoryQuery = inventoryCollection.where('publicProductId', '==', publicProductId);
      const legacyProductInventoryQuery = inventoryCollection.where('publicProductId', '==', String(publicProductId));
      const reservationsQuery = database.collection('stock_reservations').where('productId', '==', publicProductId);
      const [productSnapshot, inventorySnapshot, legacyProductInventorySnapshot, reservationSnapshot, currentLotSnapshot] = await Promise.all([
        transaction.get(productRef),
        transaction.get(inventoryQuery),
        transaction.get(legacyProductInventoryQuery),
        transaction.get(reservationsQuery),
        lotRef ? transaction.get(lotRef) : Promise.resolve(null),
      ]);
      if (!productSnapshot.exists) throw new ApiError(404, 'O produto já não existe no catálogo.');

      const productLotDocuments = new Map([
        ...inventorySnapshot.docs,
        ...legacyProductInventorySnapshot.docs,
      ].map((document) => [document.id, document]));
      let lots: LotData[] = [...productLotDocuments.values()]
        .map((document) => ({ id: document.id, ...document.data() }));
      let classifiedLotCount = 0;
      let classifiedVariant = '';
      let reconciledLotCount = 0;
      if (action === 'sync_product') {
        lots = lots.map((lot) => {
          const recordedSold = Math.max(0, number(lot.quantitySold));
          const effectiveSold = inventoryLotSoldQuantity(lot);
          const quantityBought = Math.max(0, number(lot.quantityBought));
          const document = lot.id ? productLotDocuments.get(lot.id) : undefined;
          if (document && effectiveSold > recordedSold && effectiveSold <= quantityBought) {
            reconciledLotCount += 1;
            transaction.update(document.ref, {
              quantitySold: effectiveSold,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: admin.uid,
            });
            return { ...lot, quantitySold: effectiveSold };
          }
          return lot;
        });
      }
      if (action === 'classify_legacy_lots') {
        const requestedVariant = text(request.body?.variant, 120);
        const productVariants = Array.isArray(productSnapshot.data()?.variants) ? productSnapshot.data()!.variants : [];
        const canonicalVariant = productVariants
          .map((variant: Record<string, unknown>) => text(variant?.name, 120))
          .find((variant: string) => variant.toLocaleLowerCase('pt') === requestedVariant.toLocaleLowerCase('pt'));
        if (!canonicalVariant) throw new ApiError(409, 'A opção escolhida já não existe neste produto. Atualize a dashboard.');

        const legacyDocuments = [...productLotDocuments.values()].filter((document) => !text(document.data()?.variant, 120));
        if (legacyDocuments.length > 400) throw new ApiError(409, 'Existem demasiados lotes antigos para classificar de uma só vez. Contacte o suporte antes de continuar.');
        classifiedLotCount = legacyDocuments.length;
        classifiedVariant = canonicalVariant;
        for (const document of legacyDocuments) {
          transaction.update(document.ref, {
            variant: canonicalVariant,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: admin.uid,
          });
        }
        lots = lots.map((lot) => text(lot.variant, 120) ? lot : { ...lot, variant: canonicalVariant });
      } else if (action === 'confirm_lot_received' && lotRef) {
        if (!currentLotSnapshot?.exists) throw new ApiError(404, 'O lote já não existe.');
        const current = currentLotSnapshot.data() ?? {};
        if (Number(current.publicProductId) !== publicProductId) throw new ApiError(400, 'O lote não pertence a este produto.');
        const rawUnits: unknown[] = Array.isArray(current.units) ? current.units : [];
        if (!rawUnits.every(isUnitRecord)) throw new ApiError(409, 'Este lote contém uma unidade inválida. Corrija o lote antes de confirmar a receção.');
        const alreadyReceived = normalizeInventoryReceiptStatus(current) === 'RECEIVED';
        if (!alreadyReceived) {
          const receivedUnits = rawUnits.map((unit) => ({
            ...unit,
            status: text(unit.status, 30).toUpperCase() === 'IN_TRANSIT' ? 'AVAILABLE' : text(unit.status, 30) || 'AVAILABLE',
          }));
          const received = {
            ...current,
            receiptStatus: 'RECEIVED' as const,
            units: receivedUnits,
            receivedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: admin.uid,
          };
          lots = [...lots.filter((lot) => lot.id !== lotRef.id), { id: lotRef.id, ...received } as LotData];
          transaction.update(lotRef, received);
        }
      } else if (action === 'save_lot' && lotRef) {
        const input = request.body?.lot ?? {};
        const quantityBought = number(input.quantityBought);
        const quantitySold = number(input.quantitySold);
        if (!text(input.name)) throw new ApiError(400, 'Indique o nome do lote.');
        if (!Number.isInteger(quantityBought) || quantityBought < 0 || !Number.isInteger(quantitySold) || quantitySold < 0 || quantitySold > quantityBought) {
          throw new ApiError(400, 'As quantidades do lote são inválidas.');
        }
        const existing = currentLotSnapshot?.exists ? (currentLotSnapshot.data() ?? {}) : {};
        if (currentLotSnapshot?.exists && Number(existing?.publicProductId) !== publicProductId) {
          throw new ApiError(409, 'Um lote existente não pode ser mudado para outro produto. Crie um novo lote no produto correto.');
        }
        const rawExistingUnits: unknown[] = Array.isArray(existing?.units) ? existing.units : [];
        if (!rawExistingUnits.every(isUnitRecord)) {
          throw new ApiError(409, 'Este lote contém uma unidade inválida. Atualize a página e corrija o lote antes de continuar.');
        }
        const existingUnits: UnitRecord[] = rawExistingUnits;
        const incomingVariant = text(input.variant);
        const productVariants = Array.isArray(productSnapshot.data()?.variants) ? productSnapshot.data()!.variants : [];
        const validVariantNames = new Set(productVariants.map((variant: Record<string, unknown>) => text(variant?.name).toLocaleLowerCase('pt')).filter(Boolean));
        if (incomingVariant && !validVariantNames.has(incomingVariant.toLocaleLowerCase('pt'))) throw new ApiError(409, 'A opção escolhida já não existe neste produto. Atualize a dashboard.');
        if (validVariantNames.size > 0 && !incomingVariant) throw new ApiError(400, 'Escolha a opção/variante deste lote para evitar stock ambíguo.');
        const lockedVariant = Number(existing?.quantitySold ?? 0) > 0 || existingUnits.some(isProtectedUnit);
        const existingVariant = text(existing?.variant);
        const isOneTimeLegacyClassification = currentLotSnapshot?.exists && lockedVariant && !existingVariant && Boolean(incomingVariant);
        if (currentLotSnapshot?.exists && lockedVariant && !isOneTimeLegacyClassification && existingVariant.toLocaleLowerCase('pt') !== incomingVariant.toLocaleLowerCase('pt')) {
          throw new ApiError(409, 'A opção de um lote com vendas ou unidades bloqueadas não pode ser alterada.');
        }
        const rawIncomingUnits: unknown[] = Array.isArray(input.units) ? input.units : existingUnits;
        if (!rawIncomingUnits.every(isUnitRecord)) throw new ApiError(400, 'Existe uma unidade inválida neste lote.');
        const incomingUnits: UnitRecord[] = rawIncomingUnits;
        if (incomingUnits.length > quantityBought) throw new ApiError(400, 'Existem mais unidades identificadas do que unidades compradas neste lote.');

        const existingById = new Map<string, UnitRecord>();
        for (const unit of existingUnits) {
          const key = stableUnitKey(unit);
          if (key) existingById.set(key, unit);
        }
        const receiptStatus = normalizeInventoryReceiptStatus({ receiptStatus: input.receiptStatus });
        const existingReceiptStatus = normalizeInventoryReceiptStatus(existing);
        if (currentLotSnapshot?.exists && existingReceiptStatus === 'RECEIVED' && receiptStatus === 'IN_TRANSIT') {
          throw new ApiError(409, 'Um lote já recebido não pode voltar a “A caminho”. Crie um novo lote para uma nova compra.');
        }
        const units = incomingUnits.map((incoming) => {
          const current = existingById.get(stableUnitKey(incoming));
          const sanitized = sanitizeUnit(incoming, receiptStatus, current);
          if (!sanitized) throw new ApiError(400, 'Existe uma unidade sem identificador válido.');
          return sanitized;
        });

        const unitByStableId = new Map<string, UnitRecord>();
        const ownerByCode = new Map<string, UnitRecord>();
        for (const unit of units) {
          const stableId = stableUnitKey(unit);
          if (!stableId || unitByStableId.has(stableId)) throw new ApiError(400, 'Existem identificadores internos repetidos neste lote.');
          unitByStableId.set(stableId, unit);
          for (const code of unitCodes(unit)) {
            const owner = ownerByCode.get(code);
            if (owner && owner !== unit) throw new ApiError(400, `O código ${code} está repetido neste lote.`);
            ownerByCode.set(code, unit);
          }
        }

        const lockedUnits = existingUnits.filter(isProtectedUnit);
        for (const locked of lockedUnits) {
          const lockedCodes = new Set(unitCodes(locked));
          const requested = units.find((unit) => stableUnitKey(unit) === stableUnitKey(locked)
            || unitCodes(unit).some((code) => lockedCodes.has(code)));
          if (!requested || identitySignature(requested) !== identitySignature(locked)) {
            throw new ApiError(409, 'Não pode remover ou alterar a identificação de uma unidade reservada ou vendida.');
          }
        }

        const requestedCodes = new Set(units.flatMap(unitCodes));
        const duplicateElsewhere = legacyLots.some((candidate) => candidate.id !== lotRef.id
          && (Array.isArray(candidate.units) ? candidate.units : [])
            .filter(isUnitRecord)
            .some((unit) => unitCodes(unit).some((code) => requestedCodes.has(code))));
        if (duplicateElsewhere) throw new ApiError(409, 'Um dos S/N, códigos internos ou códigos de barras já está registado noutro lote.');

        // A deterministic document per code makes uniqueness safe when two saves
        // race. Firestore will retry the transaction and only one lot can own it.
        const existingCodes = new Set(existingUnits.flatMap(unitCodes));
        const indexedCodes = [...new Set([...existingCodes, ...requestedCodes])];
        if (indexedCodes.length > 450) {
          throw new ApiError(400, 'Este lote tem demasiados identificadores para ser guardado de uma só vez. Divida-o em dois lotes.');
        }
        const codeIndexRefs = indexedCodes.map((code) => codeIndexCollection.doc(inventoryUnitCodeDocumentId(code)));
        const codeIndexSnapshots = codeIndexRefs.length > 0
          ? await transaction.getAll(...codeIndexRefs)
          : [];
        const codeIndexByCode = new Map(indexedCodes.map((code, index) => [code, codeIndexSnapshots[index]]));
        for (const code of requestedCodes) {
          const indexedOwner = text(codeIndexByCode.get(code)?.data()?.lotId, 100);
          if (indexedOwner && indexedOwner !== lotRef.id) {
            throw new ApiError(409, `O código ${code} já está registado noutro lote.`);
          }
        }
        const effectiveQuantitySold = inventoryLotSoldQuantity({ quantitySold, units });
        let cashback;
        try {
          cashback = prepareCashbackForLotSave(input);
        } catch (error) {
          if (error instanceof CashbackReceiptValidationError) throw new ApiError(error.status, error.message);
          throw error;
        }
        const saved = withoutUndefined({
          ...existing,
          publicProductId,
          name: text(input.name),
          variant: incomingVariant || '',
          supplierName: text(input.supplierName) || '',
          supplierOrderId: text(input.supplierOrderId) || '',
          purchaseDate: text(input.purchaseDate, 30) || new Date().toISOString(),
          receiptStatus,
          expectedArrivalDate: receiptStatus === 'IN_TRANSIT' ? text(input.expectedArrivalDate, 30) : '',
          ...(receiptStatus === 'RECEIVED' && (!currentLotSnapshot?.exists || existingReceiptStatus === 'IN_TRANSIT') ? { receivedAt: FieldValue.serverTimestamp() } : {}),
          quantityBought,
          quantitySold: effectiveQuantitySold,
          purchasePrice: Math.max(0, number(input.purchasePrice)),
          salePrice: Math.max(0, number(input.salePrice)),
          ...cashback,
          grossPurchaseTotal: Math.max(0, number(input.grossPurchaseTotal)),
          supplierShippingCost: Math.max(0, number(input.supplierShippingCost)),
          customsCost: Math.max(0, number(input.customsCost)),
          units,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: admin.uid,
        });
        lots = [...lots.filter((lot) => lot.id !== lotRef.id), { id: lotRef.id, ...saved } as LotData];
        transaction.set(lotRef, saved, { merge: true });
        for (const code of requestedCodes) {
          transaction.set(codeIndexCollection.doc(inventoryUnitCodeDocumentId(code)), {
            code,
            lotId: lotRef.id,
            publicProductId,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: admin.uid,
          });
        }
        for (const code of existingCodes) {
          if (requestedCodes.has(code)) continue;
          const indexSnapshot = codeIndexByCode.get(code);
          if (indexSnapshot?.exists && text(indexSnapshot.data()?.lotId, 100) === lotRef.id) {
            transaction.delete(indexSnapshot.ref);
          }
        }
      } else if (action === 'delete_lot' && lotRef) {
        if (!currentLotSnapshot?.exists) throw new ApiError(404, 'O lote já não existe.');
        if (Number(currentLotSnapshot.data()?.publicProductId) !== publicProductId) throw new ApiError(400, 'O lote não pertence a este produto.');
        const current = currentLotSnapshot.data() ?? {};
        const rawCurrentUnits: unknown[] = Array.isArray(current.units) ? current.units : [];
        if (!rawCurrentUnits.every(isUnitRecord)) throw new ApiError(409, 'Este lote contém uma unidade inválida e não pode ser apagado automaticamente.');
        if (Number(current.quantitySold ?? 0) > 0 || rawCurrentUnits.some(isProtectedUnit)) {
          throw new ApiError(409, 'Este lote já tem unidades reservadas ou vendidas e não pode ser apagado.');
        }
        const currentCodes = [...new Set(rawCurrentUnits.flatMap(unitCodes))];
        const currentCodeRefs = currentCodes.map((code) => codeIndexCollection.doc(inventoryUnitCodeDocumentId(code)));
        const currentCodeSnapshots = currentCodeRefs.length > 0
          ? await transaction.getAll(...currentCodeRefs)
          : [];
        lots = lots.filter((lot) => lot.id !== lotRef.id);
        transaction.delete(lotRef);
        for (const indexSnapshot of currentCodeSnapshots) {
          if (indexSnapshot.exists && text(indexSnapshot.data()?.lotId, 100) === lotRef.id) transaction.delete(indexSnapshot.ref);
        }
      }

      const reservations = reservationSnapshot.docs.map((document) => document.data() as ReservationData);
      const projection = projectPublicStock(publicProductId, productSnapshot.data() ?? {}, lots, reservations);
      transaction.update(productRef, { ...projection, stockUpdatedAt: FieldValue.serverTimestamp() });
      const auditRef = database.collection('admin_audit_log').doc();
      transaction.set(auditRef, {
        action,
        adminId: admin.uid,
        adminEmail: admin.email,
        publicProductId,
        lotId: lotRef?.id ?? null,
        ...(action === 'classify_legacy_lots' ? { variant: classifiedVariant, updatedLots: classifiedLotCount } : {}),
        ...(action === 'sync_product' ? { reconciledLots: reconciledLotCount } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        lotId: lotRef?.id,
        projection,
        ...(action === 'classify_legacy_lots' ? { variant: classifiedVariant, updatedLots: classifiedLotCount } : {}),
        ...(action === 'sync_product' ? { reconciledLots: reconciledLotCount } : {}),
      };
    });

    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleApiError(response, error);
  }
}

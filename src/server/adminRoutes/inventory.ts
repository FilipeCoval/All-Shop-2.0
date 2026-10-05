import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { projectPublicStock, type LotData, type ReservationData } from '../stockProjection.js';

const text = (value: unknown, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const serial = (value: unknown) => text(value, 160).toUpperCase();
const withoutUndefined = <T extends Record<string, unknown>>(input: T) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
type UnitRecord = Record<string, unknown>;

const unitCodes = (unit: UnitRecord) => [...new Set([
  unit.serialNumber,
  unit.internalLabel,
  unit.barcode,
  unit.id,
].map(serial).filter(Boolean))];

const stableUnitKey = (unit: UnitRecord) => serial(unit.id);
const identitySignature = (unit: UnitRecord) => unitCodes(unit).sort().join('|');
const isLockedUnit = (unit: UnitRecord) => Boolean(unit.status && unit.status !== 'AVAILABLE');

const sanitizeUnit = (incoming: UnitRecord, current?: UnitRecord): UnitRecord | null => {
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
    status: text(current?.status ?? incoming.status, 30) || 'AVAILABLE',
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
    const publicProductId = Number(request.body?.lot?.publicProductId ?? request.body?.publicProductId);
    if (!Number.isInteger(publicProductId) || publicProductId <= 0) throw new ApiError(400, 'Escolha um produto válido do catálogo.');

    if (!['save_lot', 'delete_lot', 'sync_product'].includes(action)) throw new ApiError(400, 'Ação de inventário inválida.');
    if (action === 'delete_lot' && !lotId) throw new ApiError(400, 'O lote não foi indicado.');

    const lotRef = action === 'save_lot' ? (lotId ? database.collection('products_inventory').doc(lotId) : database.collection('products_inventory').doc()) : lotId ? database.collection('products_inventory').doc(lotId) : null;
    const result = await database.runTransaction(async (transaction) => {
      const productRef = database.collection('products_public').doc(String(publicProductId));
      const inventoryQuery = database.collection('products_inventory');
      const reservationsQuery = database.collection('stock_reservations').where('productId', '==', publicProductId);
      const [productSnapshot, inventorySnapshot, reservationSnapshot, currentLotSnapshot] = await Promise.all([
        transaction.get(productRef), transaction.get(inventoryQuery), transaction.get(reservationsQuery), lotRef ? transaction.get(lotRef) : Promise.resolve(null),
      ]);
      if (!productSnapshot.exists) throw new ApiError(404, 'O produto já não existe no catálogo.');

      const allLots: LotData[] = inventorySnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
      let lots = allLots.filter((lot) => Number(lot.publicProductId) === publicProductId);
      if (action === 'save_lot' && lotRef) {
        const input = request.body?.lot ?? {};
        const quantityBought = number(input.quantityBought);
        const quantitySold = number(input.quantitySold);
        if (!text(input.name)) throw new ApiError(400, 'Indique o nome do lote.');
        if (!Number.isInteger(quantityBought) || quantityBought < 0 || !Number.isInteger(quantitySold) || quantitySold < 0 || quantitySold > quantityBought) {
          throw new ApiError(400, 'As quantidades do lote são inválidas.');
        }
        const existing = currentLotSnapshot?.exists ? currentLotSnapshot.data() : {};
        if (currentLotSnapshot?.exists && Number(existing?.publicProductId) !== publicProductId) {
          throw new ApiError(409, 'Um lote existente não pode ser mudado para outro produto. Crie um novo lote no produto correto.');
        }
        const existingUnits: UnitRecord[] = Array.isArray(existing?.units) ? existing.units : [];
        const incomingVariant = text(input.variant);
        const productVariants = Array.isArray(productSnapshot.data()?.variants) ? productSnapshot.data()!.variants : [];
        const validVariantNames = new Set(productVariants.map((variant: Record<string, unknown>) => text(variant?.name).toLocaleLowerCase('pt')).filter(Boolean));
        if (incomingVariant && !validVariantNames.has(incomingVariant.toLocaleLowerCase('pt'))) throw new ApiError(409, 'A opção escolhida já não existe neste produto. Atualize a dashboard.');
        if (!currentLotSnapshot?.exists && validVariantNames.size > 0 && !incomingVariant) throw new ApiError(400, 'Escolha a opção/variante deste lote para evitar stock ambíguo.');
        const lockedVariant = Number(existing?.quantitySold ?? 0) > 0 || existingUnits.some(isLockedUnit);
        if (currentLotSnapshot?.exists && lockedVariant && text(existing?.variant).toLocaleLowerCase('pt') !== incomingVariant.toLocaleLowerCase('pt')) {
          throw new ApiError(409, 'A opção de um lote com vendas ou unidades bloqueadas não pode ser alterada.');
        }
        const incomingUnits: UnitRecord[] = Array.isArray(input.units) ? input.units : existingUnits;
        if (incomingUnits.length > quantityBought) throw new ApiError(400, 'Existem mais unidades identificadas do que unidades compradas neste lote.');

        const existingById = new Map<string, UnitRecord>();
        for (const unit of existingUnits) {
          const key = stableUnitKey(unit);
          if (key) existingById.set(key, unit);
        }
        const units = incomingUnits.map((incoming) => {
          const current = existingById.get(stableUnitKey(incoming));
          const sanitized = sanitizeUnit(incoming, current);
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

        const lockedUnits = existingUnits.filter(isLockedUnit);
        for (const locked of lockedUnits) {
          const lockedCodes = new Set(unitCodes(locked));
          const requested = units.find((unit) => stableUnitKey(unit) === stableUnitKey(locked)
            || unitCodes(unit).some((code) => lockedCodes.has(code)));
          if (!requested || identitySignature(requested) !== identitySignature(locked)) {
            throw new ApiError(409, 'Não pode remover ou alterar a identificação de uma unidade reservada ou vendida.');
          }
        }

        const requestedCodes = new Set(units.flatMap(unitCodes));
        const duplicateElsewhere = allLots.some((candidate) => candidate.id !== lotRef.id
          && (candidate.units ?? []).some((unit) => unitCodes(unit as UnitRecord).some((code) => requestedCodes.has(code))));
        if (duplicateElsewhere) throw new ApiError(409, 'Um dos S/N, códigos internos ou códigos de barras já está registado noutro lote.');
        const soldUnitCount = units.filter((unit) => unit.status === 'SOLD').length;
        if (quantitySold < soldUnitCount) throw new ApiError(409, 'A quantidade vendida não pode ser inferior ao número de unidades já vendidas.');
        const cashbackStatus = ['NONE', 'PENDING', 'RECEIVED', 'REJECTED'].includes(text(input.cashbackStatus, 20)) ? text(input.cashbackStatus, 20) : 'NONE';
        const saved = withoutUndefined({
          ...existing,
          publicProductId,
          name: text(input.name),
          variant: incomingVariant || '',
          supplierName: text(input.supplierName) || '',
          supplierOrderId: text(input.supplierOrderId) || '',
          purchaseDate: text(input.purchaseDate, 30) || new Date().toISOString(),
          quantityBought,
          quantitySold,
          purchasePrice: Math.max(0, number(input.purchasePrice)),
          salePrice: Math.max(0, number(input.salePrice)),
          cashbackValue: Math.max(0, number(input.cashbackValue)),
          cashbackStatus,
          cashbackPlatform: text(input.cashbackPlatform, 120) || '',
          cashbackExpectedDate: text(input.cashbackExpectedDate, 30) || '',
          cashbackPaidDate: text(input.cashbackPaidDate, 30) || '',
          grossPurchaseTotal: Math.max(0, number(input.grossPurchaseTotal)),
          supplierShippingCost: Math.max(0, number(input.supplierShippingCost)),
          customsCost: Math.max(0, number(input.customsCost)),
          units,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: admin.uid,
        });
        lots = [...lots.filter((lot) => lot.id !== lotRef.id), { id: lotRef.id, ...saved } as LotData];
        transaction.set(lotRef, saved, { merge: true });
      } else if (action === 'delete_lot' && lotRef) {
        if (!currentLotSnapshot?.exists) throw new ApiError(404, 'O lote já não existe.');
        if (Number(currentLotSnapshot.data()?.publicProductId) !== publicProductId) throw new ApiError(400, 'O lote não pertence a este produto.');
        const current = currentLotSnapshot.data() ?? {};
        if (Number(current.quantitySold ?? 0) > 0 || (Array.isArray(current.units) && current.units.some((unit: UnitRecord) => isLockedUnit(unit)))) {
          throw new ApiError(409, 'Este lote já tem unidades reservadas ou vendidas e não pode ser apagado.');
        }
        lots = lots.filter((lot) => lot.id !== lotRef.id);
        transaction.delete(lotRef);
      }

      const reservations = reservationSnapshot.docs.map((document) => document.data() as ReservationData);
      const projection = projectPublicStock(publicProductId, productSnapshot.data() ?? {}, lots, reservations);
      transaction.update(productRef, { ...projection, stockUpdatedAt: FieldValue.serverTimestamp() });
      const auditRef = database.collection('admin_audit_log').doc();
      transaction.set(auditRef, { action, adminId: admin.uid, adminEmail: admin.email, publicProductId, lotId: lotRef?.id ?? null, createdAt: FieldValue.serverTimestamp() });
      return { lotId: lotRef?.id, projection };
    });

    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleApiError(response, error);
  }
}

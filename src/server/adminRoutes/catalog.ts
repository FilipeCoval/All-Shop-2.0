import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { normalizeProductAvailabilityMode } from '../../domain/productAvailability.js';
import { CATALOG_COPY_REVIEW, CATALOG_COPY_REVIEW_VERSION } from '../catalogCopyReview.js';

const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const strings = (value: unknown, maxItems = 30) => Array.isArray(value) ? value.map((item) => text(item, 500)).filter(Boolean).slice(0, maxItems) : [];
const specs = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, 40)
    .map(([key, specValue]) => [text(key, 100), typeof specValue === 'boolean' ? specValue : text(specValue, 300)] as const)
    .filter(([key, specValue]) => Boolean(key) && (typeof specValue === 'boolean' || Boolean(specValue))));
};
const normalize = (value: unknown) => text(value, 120).replace(/\s+/g, ' ').toLocaleLowerCase('pt');
const dateOnly = (value: unknown) => {
  const candidate = text(value, 20).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
};

const preorderNumberMap = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, quantity]) => [normalize(key), Math.max(0, Math.min(10_000, Math.floor(number(quantity))))] as const)
    .filter(([key]) => Boolean(key)));
};

const mapTotal = (value: Record<string, number>) => Object.values(value).reduce((total, quantity) => total + quantity, 0);

/** A preorder is demand planning, never a substitute for physical inventory. */
const preorderConfig = (value: unknown, current: Record<string, unknown>, variantNames: string[]) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const currentConfig = current.preorder && typeof current.preorder === 'object' && !Array.isArray(current.preorder)
    ? current.preorder as Record<string, unknown>
    : {};
  const enabled = Boolean(input.enabled);
  const variantKeys = [...new Set(variantNames.map(normalize).filter(Boolean))];
  const inputVariantCapacities = preorderNumberMap(input.variantCapacities);
  const hasVariantCapacities = variantKeys.length > 0 && Object.prototype.hasOwnProperty.call(input, 'variantCapacities');
  const variantCapacities = Object.fromEntries(variantKeys.map((key) => [key, inputVariantCapacities[key] ?? 0]));
  const capacity = hasVariantCapacities
    ? mapTotal(variantCapacities)
    : Math.max(0, Math.min(10_000, Math.floor(number(input.capacity))));
  const reservedQuantity = Math.max(0, Math.floor(number(currentConfig.reservedQuantity)));
  const reservedByVariant = preorderNumberMap(currentConfig.reservedByVariant);
  const estimatedDispatchDate = dateOnly(input.estimatedDispatchDate);
  const paymentDeadlineHours = Math.min(72, Math.max(2, Math.floor(number(input.paymentDeadlineHours)) || 48));

  if (enabled && capacity < 1) throw new ApiError(400, 'Indique pelo menos uma vaga para a pré-reserva.');
  if (enabled && !estimatedDispatchDate) throw new ApiError(400, 'Indique a previsão de expedição da pré-reserva.');
  if (capacity < reservedQuantity) throw new ApiError(409, `Existem ${reservedQuantity} pré-reserva(s) ativa(s). Não pode reduzir a capacidade abaixo desse número.`);
  if (hasVariantCapacities) {
    const mappedReservations = mapTotal(reservedByVariant);
    if (reservedQuantity > mappedReservations && !Object.keys(preorderNumberMap(currentConfig.variantCapacities)).length) {
      throw new ApiError(409, 'Este produto tem pré-reservas antigas sem versão identificada. Termine ou cancele-as antes de dividir as vagas por versão.');
    }
    for (const [variantKey, reserved] of Object.entries(reservedByVariant)) {
      if ((variantCapacities[variantKey] ?? 0) < reserved) {
        throw new ApiError(409, `A opção “${variantKey}” já tem ${reserved} pré-reserva(s) ativa(s). Não pode reduzir as vagas abaixo desse número.`);
      }
    }
  }

  return {
    enabled,
    capacity,
    reservedQuantity,
    ...(hasVariantCapacities ? { variantCapacities, reservedByVariant } : {}),
    estimatedDispatchDate,
    depositPercent: 50,
    paymentDeadlineHours,
    note: text(input.note, 500),
  };
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    const action = text(request.body?.action, 40);
    const database = getAdminDb();
    if (action === 'delete_review') {
      const reviewId = text(request.body?.reviewId, 200);
      const productId = Number(request.body?.productId);
      if (!reviewId) throw new ApiError(400, 'Avaliação inválida.');
      const reviewRef = database.collection('reviews').doc(reviewId);
      await database.runTransaction(async (transaction) => {
        const reviewSnapshot = await transaction.get(reviewRef);
        if (!reviewSnapshot.exists) throw new ApiError(404, 'A avaliação já não existe.');
        const savedProductId = Number(reviewSnapshot.data()?.productId);
        if (Number.isFinite(productId) && productId > 0 && savedProductId !== productId) throw new ApiError(409, 'A avaliação não pertence a este produto.');
        transaction.delete(reviewRef);
        transaction.set(database.collection('admin_audit_log').doc(), { action: 'delete_review', adminId: admin.uid, adminEmail: admin.email, reviewId, productId: savedProductId, createdAt: FieldValue.serverTimestamp() });
      });
      return response.status(200).json({ success: true, reviewId });
    }
    if (action === 'review_catalog_content') {
      const entries = Object.entries(CATALOG_COPY_REVIEW);
      const references = entries.map(([productId]) => database.collection('products_public').doc(productId));
      const snapshots = await Promise.all(references.map((reference) => reference.get()));
      const batch = database.batch();
      let updated = 0;
      let skipped = 0;
      let missing = 0;

      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) { missing += 1; return; }
        const current = snapshot.data() ?? {};
        if (current.contentReviewVersion === CATALOG_COPY_REVIEW_VERSION) { skipped += 1; return; }
        const review = entries[index][1];
        const reviewedVariants = Array.isArray(current.variants) ? current.variants.map((variant: Record<string, unknown>) => {
          const proposal = review.variants?.[text(variant.name, 120)];
          return proposal ? { ...variant, description: proposal.description, features: proposal.features } : variant;
        }) : current.variants;
        const reviewedProduct = {
          ...(review.name ? { name: review.name } : {}),
          ...(review.category ? { category: review.category } : {}),
          description: review.description,
          features: review.features,
          specs: review.specs,
          ...(reviewedVariants ? { variants: reviewedVariants } : {}),
          contentReviewVersion: CATALOG_COPY_REVIEW_VERSION,
          contentReviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: admin.uid,
        };
        batch.set(snapshot.ref, reviewedProduct, { merge: true });
        updated += 1;
      });

      batch.set(database.collection('admin_audit_log').doc(), {
        action: 'review_catalog_content',
        adminId: admin.uid,
        adminEmail: admin.email,
        reviewVersion: CATALOG_COPY_REVIEW_VERSION,
        updated,
        skipped,
        missing,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return response.status(200).json({ success: true, updated, skipped, missing, reviewVersion: CATALOG_COPY_REVIEW_VERSION });
    }
    if (action !== 'save_product') throw new ApiError(400, 'Ação de catálogo inválida.');
    const input = request.body?.product ?? {};
    const requestedId = Number(input.id);
    const id = Number.isInteger(requestedId) && requestedId > 0 ? requestedId : Date.now();
    if (!text(input.name, 250)) throw new ApiError(400, 'Indique o nome do produto.');
    if (!text(input.category, 100)) throw new ApiError(400, 'Escolha uma categoria.');
    if (number(input.price) < 0) throw new ApiError(400, 'O preço não pode ser negativo.');

    const productRef = database.collection('products_public').doc(String(id));
    const saved = await database.runTransaction(async (transaction) => {
      const inventoryQuery = database.collection('products_inventory').where('publicProductId', '==', id);
      const legacyInventoryQuery = database.collection('products_inventory').where('publicProductId', '==', String(id));
      const [currentSnapshot, inventorySnapshot, legacyInventorySnapshot] = await Promise.all([
        transaction.get(productRef),
        transaction.get(inventoryQuery),
        transaction.get(legacyInventoryQuery),
      ]);
      const current = currentSnapshot.data() ?? {};
      const hasGalleryImages = Object.prototype.hasOwnProperty.call(input, 'images');
      const hasPromoEndsAt = Object.prototype.hasOwnProperty.call(input, 'promoEndsAt');
      const hasWeight = Object.prototype.hasOwnProperty.call(input, 'weight');
      const hasSpecs = Object.prototype.hasOwnProperty.call(input, 'specs');
      const hasFreebie = Object.prototype.hasOwnProperty.call(input, 'isFreebie');
      const hasPreorder = Object.prototype.hasOwnProperty.call(input, 'preorder');
      const currentVariants = Array.isArray(current.variants) ? current.variants : [];
      const variants = Array.isArray(input.variants) ? input.variants.map((variant: Record<string, unknown>) => {
        const name = text(variant.name, 120);
        const existing = currentVariants.find((item: Record<string, unknown>) => text(item.name, 120).toLowerCase() === name.toLowerCase());
        return {
          name,
          price: Math.max(0, number(variant.price)),
          originalPrice: variant.originalPrice === '' || variant.originalPrice == null ? null : Math.max(0, number(variant.originalPrice)),
          image: text(variant.image, 1000),
          description: text(variant.description, 500),
          features: strings(variant.features),
          stock: Math.max(0, number(existing?.stock ?? 0)),
        };
      }).filter((variant: { name: string }) => variant.name) : currentVariants;
      const variantKeys = variants.map((variant: Record<string, unknown>) => normalize(variant.name));
      if (new Set(variantKeys).size !== variantKeys.length) throw new ApiError(400, 'Existem opções do produto com o mesmo nome.');
      const removedVariantKeys = new Set(currentVariants
        .map((variant: Record<string, unknown>) => normalize(variant.name))
        .filter((name: string) => name && !variantKeys.includes(name)));
      const removedVariantWithInventory = [...inventorySnapshot.docs, ...legacyInventorySnapshot.docs]
        .some((document) => removedVariantKeys.has(normalize(document.data().variant)));
      if (removedVariantWithInventory) {
        throw new ApiError(409, 'Não é possível apagar ou mudar o nome de uma opção que já tem lotes. Edite apenas o preço ou crie uma nova opção.');
      }
      const availabilityMode = normalizeProductAvailabilityMode(input);
      const product = {
        ...current,
        id,
        name: text(input.name, 250),
        category: text(input.category, 100),
        price: Math.max(0, number(input.price)),
        originalPrice: input.originalPrice === '' || input.originalPrice == null ? null : Math.max(0, number(input.originalPrice)),
        promoEndsAt: hasPromoEndsAt ? (text(input.promoEndsAt, 40) || null) : (current.promoEndsAt ?? null),
        image: text(input.image, 1000),
        images: hasGalleryImages ? strings(input.images) : strings(current.images),
        description: text(input.description, 5000),
        features: strings(input.features),
        badges: strings(input.badges),
        variantLabel: text(input.variantLabel, 100),
        variants,
        availabilityMode,
        // Compatibility for the 2.0 storefront while all cached clients update.
        comingSoon: availabilityMode === 'COMING_SOON',
        isPrivate: Boolean(input.isPrivate),
        isFreebie: hasFreebie ? Boolean(input.isFreebie) : Boolean(current.isFreebie),
        weight: hasWeight ? (input.weight === '' || input.weight == null ? null : Math.max(0, number(input.weight))) : (current.weight ?? null),
        specs: hasSpecs ? specs(input.specs) : specs(current.specs),
        preorder: hasPreorder ? preorderConfig(input.preorder, current, variants.map((variant: Record<string, unknown>) => text(variant.name, 120))) : (current.preorder ?? null),
        maxQuantityPerOrder: input.maxQuantityPerOrder ? Math.max(1, Math.floor(number(input.maxQuantityPerOrder))) : null,
        stock: currentSnapshot.exists ? Math.max(0, number(current.stock)) : 0,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      };
      transaction.set(productRef, product, { merge: true });
      transaction.set(database.collection('admin_audit_log').doc(), { action: 'save_product', adminId: admin.uid, adminEmail: admin.email, productId: id, createdAt: FieldValue.serverTimestamp() });
      return product;
    });
    return response.status(200).json({ success: true, product: saved });
  } catch (error) {
    return handleApiError(response, error);
  }
}

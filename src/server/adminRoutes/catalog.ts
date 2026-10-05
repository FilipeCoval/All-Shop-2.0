import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, handleApiError, requireAdmin, requirePost } from '../adminAuth.js';
import { getAdminDb } from '../firebaseAdmin.js';

const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const strings = (value: unknown, maxItems = 30) => Array.isArray(value) ? value.map((item) => text(item, 500)).filter(Boolean).slice(0, maxItems) : [];
const normalize = (value: unknown) => text(value, 120).replace(/\s+/g, ' ').toLocaleLowerCase('pt');

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requirePost(request, response)) return;
  try {
    const admin = await requireAdmin(request);
    if (request.body?.action !== 'save_product') throw new ApiError(400, 'Ação de catálogo inválida.');
    const database = getAdminDb();
    const input = request.body?.product ?? {};
    const requestedId = Number(input.id);
    const id = Number.isInteger(requestedId) && requestedId > 0 ? requestedId : Date.now();
    if (!text(input.name, 250)) throw new ApiError(400, 'Indique o nome do produto.');
    if (!text(input.category, 100)) throw new ApiError(400, 'Escolha uma categoria.');
    if (number(input.price) < 0) throw new ApiError(400, 'O preço não pode ser negativo.');

    const productRef = database.collection('products_public').doc(String(id));
    const saved = await database.runTransaction(async (transaction) => {
      const inventoryQuery = database.collection('products_inventory').where('publicProductId', '==', id);
      const [currentSnapshot, inventorySnapshot] = await Promise.all([
        transaction.get(productRef),
        transaction.get(inventoryQuery),
      ]);
      const current = currentSnapshot.data() ?? {};
      const hasGalleryImages = Object.prototype.hasOwnProperty.call(input, 'images');
      const hasPromoEndsAt = Object.prototype.hasOwnProperty.call(input, 'promoEndsAt');
      const currentVariants = Array.isArray(current.variants) ? current.variants : [];
      const variants = Array.isArray(input.variants) ? input.variants.map((variant: Record<string, unknown>) => {
        const name = text(variant.name, 120);
        const existing = currentVariants.find((item: Record<string, unknown>) => text(item.name, 120).toLowerCase() === name.toLowerCase());
        return { name, price: Math.max(0, number(variant.price)), image: text(variant.image, 1000), stock: Math.max(0, number(existing?.stock ?? 0)) };
      }).filter((variant: { name: string }) => variant.name) : currentVariants;
      const variantKeys = variants.map((variant: Record<string, unknown>) => normalize(variant.name));
      if (new Set(variantKeys).size !== variantKeys.length) throw new ApiError(400, 'Existem opções do produto com o mesmo nome.');
      const removedVariantKeys = new Set(currentVariants
        .map((variant: Record<string, unknown>) => normalize(variant.name))
        .filter((name: string) => name && !variantKeys.includes(name)));
      const removedVariantWithInventory = inventorySnapshot.docs.some((document) => removedVariantKeys.has(normalize(document.data().variant)));
      if (removedVariantWithInventory) {
        throw new ApiError(409, 'Não é possível apagar ou mudar o nome de uma opção que já tem lotes. Edite apenas o preço ou crie uma nova opção.');
      }
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
        comingSoon: Boolean(input.comingSoon),
        isPrivate: Boolean(input.isPrivate),
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

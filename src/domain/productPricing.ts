type PriceableVariant = {
  price?: number | null;
};

type PriceableProduct = {
  price?: number | null;
  originalPrice?: number | null;
  promoEndsAt?: string | null;
  variants?: PriceableVariant[] | null;
};

export const isPromotionExpired = (product: PriceableProduct, now = Date.now()) => {
  if (!product.promoEndsAt) return false;
  const endTime = new Date(product.promoEndsAt).getTime();
  return Number.isFinite(endTime) && endTime <= now;
};

export const effectiveProductPrice = (product: PriceableProduct, now = Date.now()) => {
  const variantPrices = (product.variants ?? [])
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  if (variantPrices.length > 0) return Math.min(...variantPrices);

  const currentPrice = Math.max(0, Number(product.price) || 0);
  const originalPrice = Math.max(0, Number(product.originalPrice) || 0);
  return isPromotionExpired(product, now) && originalPrice > 0 ? originalPrice : currentPrice;
};

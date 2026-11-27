type PresentableVariant = { name?: string; price?: number };
type PresentableProduct = { name?: string; price?: number; description?: string; variants?: PresentableVariant[] };

export const productHasVariants = (product: PresentableProduct) => Boolean(product.variants?.length);

export const productStartingPrice = (product: PresentableProduct) => {
  const prices = (product.variants ?? [])
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price >= 0);
  return prices.length > 0 ? Math.min(...prices) : Math.max(0, Number(product.price) || 0);
};

export const publicProductSummary = (product: PresentableProduct) => {
  if (!product.variants?.length) return String(product.description ?? '');
  const names = product.variants.map((variant) => String(variant.name ?? '').trim()).filter(Boolean);
  return names.length > 0
    ? `Disponível em ${names.length} ${names.length === 1 ? 'versão' : 'versões'}: ${names.join(' e ')}.`
    : `Disponível em ${product.variants.length} versões. Escolha uma opção para ver os detalhes.`;
};

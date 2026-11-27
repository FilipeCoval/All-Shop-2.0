type ContentVariant = {
  name?: string;
  description?: string;
  features?: string[];
};

type ContentProduct = {
  name?: string;
  category?: string;
  description?: string;
  image?: string;
  images?: string[];
  features?: string[];
  specs?: Record<string, string | boolean>;
  variants?: ContentVariant[];
};

export type CatalogContentIssue = {
  code: 'short-description' | 'few-highlights' | 'few-images' | 'missing-specs' | 'variant-description' | 'variant-highlights' | 'version-specific-general-copy' | 'suspicious-specs';
  label: string;
};

const normalized = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt').replace(/\s+/g, ' ');
const uniqueImages = (product: ContentProduct) => new Set([product.image, ...(product.images ?? [])].map(normalized).filter(Boolean));
const capacityTokens = (value: string) => (normalized(value).match(/\b\d+(?:[.,]\d+)?\s*(?:gb|tb|mah|w|metros?|m)\b/g) ?? [])
  .map((token) => token.replace(/\s+/g, '').replace(',', '.'));

export const catalogContentIssues = (product: ContentProduct): CatalogContentIssue[] => {
  const issues: CatalogContentIssue[] = [];
  const description = String(product.description ?? '').trim();
  const features = (product.features ?? []).map(normalized).filter(Boolean);
  const specs = Object.entries(product.specs ?? {}).filter(([key, value]) => normalized(key) && (typeof value === 'boolean' || normalized(value)));
  const variants = (product.variants ?? []).filter((variant) => normalized(variant.name));

  if (description.length < 140) issues.push({ code: 'short-description', label: 'Descrição geral demasiado curta' });
  if (features.length < 3) issues.push({ code: 'few-highlights', label: 'Faltam destaques do produto' });
  if (uniqueImages(product).size < 2) issues.push({ code: 'few-images', label: 'Só existe uma fotografia' });
  if (specs.length < 2) issues.push({ code: 'missing-specs', label: 'Faltam especificações confirmadas' });

  if (variants.length > 0) {
    if (variants.some((variant) => normalized(variant.description).length < 45)) issues.push({ code: 'variant-description', label: 'Há opções sem explicação própria' });
    if (variants.some((variant) => (variant.features ?? []).map(normalized).filter(Boolean).length < 2)) issues.push({ code: 'variant-highlights', label: 'Há opções sem características próprias' });

    const tokensByVariant = variants.map((variant) => new Set(capacityTokens(String(variant.name ?? ''))));
    const allVariantTokens = new Set(tokensByVariant.flatMap((tokens) => [...tokens]));
    const descriptionTokens = new Set(capacityTokens(description));
    const mentionedTokens = [...allVariantTokens].filter((token) => descriptionTokens.has(token));
    if (allVariantTokens.size > 1 && mentionedTokens.length > 0 && mentionedTokens.length < allVariantTokens.size) {
      issues.push({ code: 'version-specific-general-copy', label: 'A descrição geral parece falar apenas de uma opção' });
    }
  }

  const specText = normalized(specs.map(([key, value]) => `${key} ${value}`).join(' '));
  const productText = normalized(`${product.name} ${product.category}`);
  if (!productText.includes('cabo') && !productText.includes('cables') && /nylon trançado|2 metros|mfi/.test(specText)) {
    issues.push({ code: 'suspicious-specs', label: 'As especificações parecem pertencer a outro produto' });
  }

  return issues;
};

export const catalogContentScore = (product: ContentProduct) => Math.max(0, 100 - catalogContentIssues(product).length * 15);

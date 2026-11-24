type FilamentProduct = {
  id: number;
  name: string;
  category?: string;
};

type FilamentRequestInput = {
  product: FilamentProduct;
  user?: { uid?: string; name?: string; email?: string; phone?: string } | null;
  email: string;
  material: string;
  color: string;
  quantity: number;
  notes?: string;
  createdAt?: string;
  referenceLink?: string;
};

const searchable = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt');

export const isFilamentProduct = (product: Pick<FilamentProduct, 'name' | 'category'>) => {
  const name = searchable(product.name);
  const category = searchable(product.category);
  return name.includes('filament') && (category.includes('impressao 3d') || category.includes('3d'));
};

export const buildFilamentRequest = ({ product, user, email, material, color, quantity, notes = '', createdAt = new Date().toISOString(), referenceLink }: FilamentRequestInput) => {
  const cleanEmail = email.trim().slice(0, 180);
  const cleanMaterial = material.trim().slice(0, 60);
  const cleanColor = color.trim().slice(0, 80);
  const cleanNotes = notes.trim().slice(0, 800);
  const cleanQuantity = Math.min(20, Math.max(1, Math.floor(Number(quantity) || 1)));

  return {
    userId: user?.uid ?? '',
    userEmail: cleanEmail,
    email: cleanEmail,
    customerName: String(user?.name ?? '').trim().slice(0, 120),
    customerPhone: String(user?.phone ?? '').trim().slice(0, 40),
    productName: `Filamento pedido — ${cleanMaterial}, ${cleanColor}`,
    category: 'Impressão 3D',
    state: 'Novo',
    urgency: 'Não tenho pressa',
    specifications: `Material/tipo: ${cleanMaterial}\nCor: ${cleanColor}\nQuantidade pretendida: ${cleanQuantity} rolo${cleanQuantity === 1 ? '' : 's'}`,
    details: cleanNotes || `Pedido feito a partir da ficha “${product.name}”.`,
    budgetRange: 'A combinar',
    referenceLink: referenceLink || `https://www.all-shop.net/#product/${product.id}`,
    notificationsEnabled: false,
    status: 'Análise',
    photos: [],
    createdAt,
    source: 'FILAMENT_REQUEST',
    sourceProductId: product.id,
    sourceProductName: product.name,
    requestedMaterial: cleanMaterial,
    requestedColor: cleanColor,
    requestedQuantity: cleanQuantity,
    unreadAdmin: true,
  };
};

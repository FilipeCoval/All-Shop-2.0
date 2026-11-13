import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { InventoryProduct, Product } from '../types';
import { modularDb } from '../services/firebaseConfig';

/**
 * Catálogo e inventário têm responsabilidades diferentes:
 * - catálogo: conteúdo, preço, imagens, promoções e variantes;
 * - inventário: lotes, custos, unidades e rastreabilidade.
 *
 * Este hook nunca volta a copiar campos de um lote para um produto existente do catálogo.
 */
const buildInitialCatalogProduct = (
  lot: Omit<InventoryProduct, 'id'>,
  publicId: number,
): Product => {
  const images = Array.isArray(lot.images) ? lot.images.filter(Boolean) : [];
  const image = images[0] || '';
  return {
    id: publicId,
    name: lot.name?.trim() || 'Novo produto',
    category: lot.category?.trim() || 'Outros',
    price: Number(lot.salePrice || lot.targetSalePrice || 0),
    originalPrice: lot.originalPrice,
    promoEndsAt: lot.promoEndsAt,
    image,
    images,
    description: lot.description || '',
    stock: 0,
    features: lot.features || [],
    badges: lot.badges || [],
    comingSoon: Boolean(lot.comingSoon),
    weight: Number(lot.weight || 0),
    specs: lot.specs || {},
    isPrivate: Boolean(lot.isPrivate),
  };
};

export const useInventory = (isAdmin = false) => {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(modularDb, 'products_inventory'),
      snapshot => {
        const next = snapshot.docs
          .map(item => ({ id: item.id, ...item.data() } as InventoryProduct))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-PT'));
        setProducts(next);
        setLoading(false);
        setError(null);
      },
      err => {
        console.warn('Inventário indisponível:', err.message);
        setError(err.code === 'permission-denied' ? 'permission-denied' : err.message);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [isAdmin]);

  const addProduct = async (lot: Omit<InventoryProduct, 'id'>) => {
    const payload = {
      ...lot,
      quantityBought: Math.max(0, Number(lot.quantityBought || 0)),
      quantitySold: Math.max(0, Number(lot.quantitySold || 0)),
      units: Array.isArray(lot.units) ? lot.units : [],
    } as Omit<InventoryProduct, 'id'>;

    // Lote ligado a catálogo: só cria o lote. O catálogo não é alterado.
    if (payload.publicProductId !== undefined && payload.publicProductId !== null) {
      await addDoc(collection(modularDb, 'products_inventory'), payload as any);
      return;
    }

    // Fluxo de compatibilidade para criar um produto/lote novo de uma vez.
    // Depois da criação, o catálogo passa a ser editado apenas na aba Catálogo.
    const publicId = Date.now();
    const catalogProduct = buildInitialCatalogProduct(payload, publicId);
    const lotRef = await addDoc(collection(modularDb, 'products_inventory'), {
      ...payload,
      publicProductId: publicId,
    } as any);

    try {
      await setDoc(doc(modularDb, 'products_public', String(publicId)), catalogProduct);
    } catch (error) {
      // Evita ficar com um lote órfão se a criação do catálogo falhar.
      await deleteDoc(lotRef);
      throw error;
    }
  };

  const updateProduct = async (id: string, updates: Partial<InventoryProduct>) => {
    // Nunca sincroniza dados de catálogo a partir de um lote.
    await updateDoc(doc(modularDb, 'products_inventory', id), updates as any);
  };

  const deleteProduct = async (id: string) => {
    // Apagar um lote não apaga o produto do catálogo. O catálogo mantém histórico,
    // SEO e páginas estáveis mesmo que o stock fique temporariamente a zero.
    await deleteDoc(doc(modularDb, 'products_inventory', id));
  };

  return {
    products,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
  };
};

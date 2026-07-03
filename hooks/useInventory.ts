import { useState, useEffect } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { modularDb } from '../services/firebaseConfig';
import { InventoryProduct, Product } from '../types';
import { supabaseSync } from '../services/supabaseSync';
import { getLotMetrics, reservationExpiryMs } from '../services/inventoryMetrics';

const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"%3E%3Crect width="300" height="300" fill="%23e2e8f0"/%3E%3C/svg%3E';

const createCatalogProductFromFirstLot = (
  lot: Omit<InventoryProduct, 'id'> | InventoryProduct,
  publicId: number,
): Product => ({
  id: publicId,
  name: lot.name,
  category: lot.category,
  price: Number(lot.salePrice || lot.targetSalePrice || 0),
  originalPrice: lot.originalPrice,
  promoEndsAt: lot.promoEndsAt,
  image: lot.images?.[0] || placeholderImage,
  images: lot.images?.length ? lot.images : undefined,
  description: lot.description || `Produto ${lot.name}`,
  stock: 0,
  features: lot.features || [],
  comingSoon: Boolean(lot.comingSoon),
  badges: lot.badges || [],
  variantLabel: 'Opção',
  weight: Number(lot.weight || 0),
  specs: lot.specs || {},
  isPrivate: Boolean(lot.isPrivate),
});

const normaliseVariant = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export const useInventory = (isAdmin: boolean = false) => {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setProducts([]);
      setLoading(false);
      return;
    }

    return onSnapshot(
      collection(modularDb, 'products_inventory'),
      (snapshot) => {
        setProducts(snapshot.docs.map(snapshotDoc => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        } as InventoryProduct)));
        setLoading(false);
        setError(null);
      },
      (snapshotError) => {
        console.warn('Firestore inventory listener:', snapshotError.message);
        setError(snapshotError.code === 'permission-denied' ? 'permission-denied' : snapshotError.message);
        setLoading(false);
      },
    );
  }, [isAdmin]);

  /**
   * Lotes são a fonte de verdade. Esta função só atualiza o stock exibido
   * no catálogo; nunca altera preço, texto, fotos, peso ou promoções.
   */
  const refreshPublicProductStock = async (publicIdRaw: number | string) => {
    const publicId = Number(publicIdRaw);
    if (!Number.isFinite(publicId)) return;

    const publicRef = doc(modularDb, 'products_public', String(publicId));
    const publicSnap = await getDoc(publicRef);
    if (!publicSnap.exists()) return;

    const publicProduct = publicSnap.data() as Product;
    const lotsSnap = await getDocs(
      query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', publicId)),
    );
    const lots = lotsSnap.docs.map(snapshotDoc => ({
      id: snapshotDoc.id,
      ...snapshotDoc.data(),
    } as InventoryProduct));

    const reservationsSnap = await getDocs(collection(modularDb, 'stock_reservations'));
    const activeReservations = reservationsSnap.docs
      .map(snapshotDoc => snapshotDoc.data() as any)
      .filter(reservation => (
        String(reservation.productId) === String(publicId)
        && reservationExpiryMs(reservation.expiresAt) > Date.now()
      ));

    let physical = 0;
    let cartReserved = 0;
    const stockByVariant: Record<string, number> = {};

    lots.forEach(lot => {
      const lotMetrics = getLotMetrics(lot);
      physical += lotMetrics.available;

      const variantKey = normaliseVariant(lot.variant);
      if (variantKey) {
        stockByVariant[variantKey] = (stockByVariant[variantKey] || 0) + lotMetrics.available;
      }
    });

    activeReservations.forEach(reservation => {
      const quantity = Math.max(0, Number(reservation.quantity) || 0);
      cartReserved += quantity;
      const variantKey = normaliseVariant(reservation.variantName);
      if (variantKey && stockByVariant[variantKey] !== undefined) {
        stockByVariant[variantKey] = Math.max(0, stockByVariant[variantKey] - quantity);
      }
    });

    const updatePayload: Partial<Product> = {
      stock: Math.max(0, physical - cartReserved),
    };

    if (Array.isArray(publicProduct.variants)) {
      updatePayload.variants = publicProduct.variants.map(variant => ({
        ...variant,
        stock: stockByVariant[normaliseVariant(variant.name)] ?? 0,
      }));
    }

    await updateDoc(publicRef, updatePayload as Record<string, unknown>);

    if (typeof supabaseSync?.saveProduct === 'function') {
      void supabaseSync.saveProduct({ ...publicProduct, ...updatePayload });
    }
  };

  const addProduct = async (lot: Omit<InventoryProduct, 'id'>) => {
    const newLotRef = await addDoc(collection(modularDb, 'products_inventory'), lot as Record<string, unknown>);

    const hasLinkedCatalogProduct = lot.publicProductId !== undefined && lot.publicProductId !== null;
    if (hasLinkedCatalogProduct) {
      await refreshPublicProductStock(Number(lot.publicProductId));
      return;
    }

    // Só a criação do primeiro lote pode criar um produto público novo.
    // Editar/adicionar lotes ligados nunca pode sobrescrever o catálogo.
    if (!lot.isPrivate) {
      const publicId = Date.now();
      const catalogProduct = createCatalogProductFromFirstLot(lot, publicId);
      await setDoc(doc(modularDb, 'products_public', String(publicId)), catalogProduct);
      await updateDoc(newLotRef, { publicProductId: publicId });
      await refreshPublicProductStock(publicId);
    }
  };

  const updateProduct = async (id: string, updates: Partial<InventoryProduct>) => {
    const lotRef = doc(modularDb, 'products_inventory', id);
    const beforeSnap = await getDoc(lotRef);
    if (!beforeSnap.exists()) throw new Error('Lote não encontrado.');

    const before = beforeSnap.data() as InventoryProduct;
    await updateDoc(lotRef, updates as Record<string, unknown>);

    const linkedIds = new Set<number>();
    if (before.publicProductId !== undefined && before.publicProductId !== null) linkedIds.add(Number(before.publicProductId));
    if (updates.publicProductId !== undefined && updates.publicProductId !== null) linkedIds.add(Number(updates.publicProductId));

    await Promise.all([...linkedIds]
      .filter(Number.isFinite)
      .map(publicId => refreshPublicProductStock(publicId)));
  };

  const deleteProduct = async (id: string) => {
    const lotRef = doc(modularDb, 'products_inventory', id);
    const lotSnap = await getDoc(lotRef);
    if (!lotSnap.exists()) return;

    const lot = lotSnap.data() as InventoryProduct;
    await deleteDoc(lotRef);

    // Nunca apagar o produto do catálogo ao apagar um lote. Apenas atualizar stock.
    if (lot.publicProductId !== undefined && lot.publicProductId !== null) {
      await refreshPublicProductStock(Number(lot.publicProductId));
    }
  };

  return {
    products,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    refreshPublicProductStock,
  };
};

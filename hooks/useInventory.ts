
import { useState, useEffect } from 'react';
import { modularDb } from '../services/firebaseConfig';
import { collection, doc, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { InventoryProduct, Product, ProductVariant, Order, CashbackStatus } from '../types';
import { calculateAvailableStock } from '../services/stockService';
import { supabaseSync } from '../services/supabaseSync';

// Função auxiliar para mapear Produto de Inventário -> Produto Público (Base)
const mapToPublicProduct = (inv: Omit<InventoryProduct, 'id'> | InventoryProduct, publicIdRaw: number | string): Product => {
  const publicId = Number(publicIdRaw);
  
  const product: Product = {
      id: publicId,
      name: inv.name,
      category: inv.category,
      price: inv.salePrice || 0, 
      originalPrice: inv.originalPrice, // Mapeado
      promoEndsAt: inv.promoEndsAt,     // Mapeado
      image: '', 
      description: inv.description || `Produto ${inv.name}`,
      stock: 0, // Será calculado pelo refreshPublicProductStock
      features: inv.features || [],
      comingSoon: inv.comingSoon || false,
      badges: inv.badges || [],
      images: [],
      variantLabel: 'Opção',
      weight: inv.weight || 0,
      specs: inv.specs || {},
      isPrivate: inv.isPrivate || false
  };

  if (inv.images && inv.images.length > 0) {
      product.images = inv.images;
      product.image = inv.images[0];
  } else {
      product.image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"%3E%3Crect width="300" height="300" fill="%23e2e8f0"/%3E%3C/svg%3E';
      delete (product as any).images;
      delete (product as any).image;
  }

  return product;
};

export const useInventory = (isAdmin: boolean = false) => {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(modularDb, 'products_inventory'),
      (snapshot) => {
        const items: InventoryProduct[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() } as InventoryProduct);
        });
        setProducts(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("Firestore Access Restricted:", err.message);
        if (err.code === 'permission-denied') {
            setError('permission-denied');
        } else {
            setError(err.message);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  // --- SINCRONIZAÇÃO DE STOCK (Lotes -> Catálogo) ---
  // IMPORTANTE: o lote nunca altera nome, preço, descrição, imagens ou promoções do catálogo.
  // O catálogo público é a fonte única desses dados; daqui sincronizamos apenas stock/variantes.
  const refreshPublicProductStock = async (publicIdRaw: number | string) => {
      try {
          const publicId = Number(publicIdRaw);
          if (isNaN(publicId)) return;

          const publicRef = doc(modularDb, 'products_public', publicId.toString());
          const publicSnap = await getDoc(publicRef);
          if (!publicSnap.exists()) {
              console.log("No public product found during automatic stock refresh:", publicId);
              return;
          }
          const pub = publicSnap.data() as Product;

          // Align public product stock & variants to match inventory batches (Forward Sync)
          const inventoryQuery = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', publicId));
          const inventorySnap = await getDocs(inventoryQuery);
          const lots = inventorySnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() as InventoryProduct }));
          
          let totalPhysical = 0;
          const variantStocks: Record<string, number> = {};
          
          const normalizeVName = (n: string) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();

          lots.forEach(l => {
              let qty = Math.max(0, (l.data.quantityBought || 0) - (l.data.quantitySold || 0));
              if (l.data.units && Array.isArray(l.data.units) && l.data.units.length > 0) {
                  const b = l.data.units.length;
                  const s = l.data.units.filter((u: any) => u.status === 'SOLD').length;
                  qty = Math.max(0, b - s);
              }
              totalPhysical += qty;
              
              const vNameRaw = l.data.variant || '';
              if (vNameRaw) {
                  const vKey = normalizeVName(vNameRaw);
                  variantStocks[vKey] = (variantStocks[vKey] || 0) + qty;
              }
          });

          let variantsUpdated = false;
          const updatedVariants = pub.variants ? [...pub.variants] : [];
          
          for (let i = 0; i < updatedVariants.length; i++) {
              const v = updatedVariants[i];
              const vKey = normalizeVName(v.name);
              const realVariantStock = variantStocks[vKey] || 0;
              if (v.stock !== realVariantStock) {
                  updatedVariants[i] = { ...v, stock: realVariantStock };
                  variantsUpdated = true;
              }
          }

          if (pub.stock !== totalPhysical || variantsUpdated) {
              const updatePayload: any = { stock: totalPhysical };
              if (variantsUpdated) {
                  updatePayload.variants = updatedVariants;
              }
              await updateDoc(publicRef, updatePayload);
              console.log(`[Sync] Produto ${pub.id} atualizado: Stock mudou para ${totalPhysical}, Variantes atualizadas: ${variantsUpdated}`);
              
              // Ensure we optionally update supabase if a sync function is defined
              if (typeof supabaseSync !== 'undefined' && supabaseSync.saveProduct) {
                  supabaseSync.saveProduct({ ...pub, ...updatePayload });
              }
          }
      } catch (err) {
          console.error("Erro na sincronização auto-sync de inventário:", err);
      }
  };

  const addProduct = async (product: Omit<InventoryProduct, 'id'>) => {
    try {
      // O lote guarda apenas dados de compra/rastreabilidade. Mantemos campos antigos por
      // compatibilidade com lotes existentes, mas não os usamos para substituir o catálogo.
      const docRef = await addDoc(collection(modularDb, 'products_inventory'), product as any);

      const hasPublicProduct = product.publicProductId !== undefined && product.publicProductId !== null;
      const publicId = hasPublicProduct ? Number(product.publicProductId) : Date.now();

      if (product.isPrivate) {
        // Lotes privados não criam nem alteram produtos públicos.
        if (!hasPublicProduct) {
          await updateDoc(docRef, { publicProductId: null });
        }
        return;
      }

      const publicRef = doc(modularDb, 'products_public', publicId.toString());
      const publicSnap = await getDoc(publicRef);

      if (!publicSnap.exists()) {
        // Compatibilidade: se ainda criares o primeiro lote sem criar catálogo antes,
        // criamos um catálogo-base uma única vez. Depois o catálogo passa a ser editado
        // exclusivamente pela aba Catálogo.
        const publicProduct = mapToPublicProduct(product, publicId);
        publicProduct.id = publicId;
        const cleanPublicProduct = JSON.parse(JSON.stringify(publicProduct));
        await setDoc(publicRef, cleanPublicProduct);
      }

      if (!hasPublicProduct) {
        await updateDoc(docRef, { publicProductId: publicId });
      }

      await refreshPublicProductStock(publicId);
    } catch (error) {
      console.error("Erro ao adicionar produto:", error);
      throw error;
    }
  };

  const updateProduct = async (id: string, updates: Partial<InventoryProduct>) => {
    try {
      await updateDoc(doc(modularDb, 'products_inventory', id), updates as any);

      // O lote só pode provocar recálculo de stock. Nunca pode sobrescrever layout,
      // preço, imagens, descrição, promoção ou privacidade do produto público.
      const docSnap = await getDoc(doc(modularDb, 'products_inventory', id));
      const currentData = docSnap.data() as InventoryProduct | undefined;
      if (currentData && currentData.publicProductId !== undefined && currentData.publicProductId !== null) {
        await refreshPublicProductStock(currentData.publicProductId);
      }
    } catch (error) {
      console.error("Erro ao atualizar produto:", error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const docSnap = await getDoc(doc(modularDb, 'products_inventory', id));
      const data = docSnap.exists() ? docSnap.data() as InventoryProduct : null;

      await deleteDoc(doc(modularDb, 'products_inventory', id));

      // Apagar um lote não apaga o produto público. O produto mantém-se no catálogo,
      // apenas passa a stock 0 quando já não houver lotes.
      if (data && data.publicProductId !== undefined && data.publicProductId !== null) {
        await refreshPublicProductStock(data.publicProductId);
      }
    } catch (error) {
      console.error("Erro ao apagar produto:", error);
      throw error;
    }
  };

  return { products, loading, error, addProduct, updateProduct, deleteProduct };
};

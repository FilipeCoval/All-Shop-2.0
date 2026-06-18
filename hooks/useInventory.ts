
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

  // --- FUNÇÃO DE SINCRONIZAÇÃO AUTOMÁTICA (Forward Sync: Inventory Lotes -> Public Catalog) ---
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
              const qty = Math.max(0, (l.data.quantityBought || 0) - (l.data.quantitySold || 0));
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
      // 1. Adicionar ao Inventário (Privado)
      const docRef = await addDoc(collection(modularDb, 'products_inventory'), product as any);
      
      const publicId = product.publicProductId !== undefined && product.publicProductId !== null 
        ? Number(product.publicProductId) 
        : Date.now();
      
      // 2. Atualizar ou Criar Produto Público
      if (!product.isPrivate) {
          const publicProduct = mapToPublicProduct(product, publicId);
          // Ensure the id field is explicitly present
          publicProduct.id = publicId;
          const cleanPublicProduct = JSON.parse(JSON.stringify(publicProduct));

          if (product.publicProductId !== undefined && product.publicProductId !== null) {
              // If publicProductId exists, ensure the document exists and has the 'id' field
              await setDoc(doc(modularDb, 'products_public', publicId.toString()), cleanPublicProduct, { merge: true });
          } else {
              // If it's a new product, create it
              await setDoc(doc(modularDb, 'products_public', publicId.toString()), cleanPublicProduct);
              await updateDoc(docRef, { publicProductId: publicId });
          }

          // 3. SINCRONIZAÇÃO AUTOMÁTICA DE STOCK
          await refreshPublicProductStock(publicId);
      } else {
          // If it is private, ensure it is NOT in products_public
          try {
              await deleteDoc(doc(modularDb, 'products_public', publicId.toString()));
          } catch (e) {
              // Ignore if it didn't exist
          }
      }

    } catch (error) {
      console.error("Erro ao adicionar produto:", error);
      throw error;
    }
  };

  const updateProduct = async (id: string, updates: Partial<InventoryProduct>) => {
    try {
      // 1. Atualizar Inventário
      await updateDoc(doc(modularDb, 'products_inventory', id), updates as any);

      // 2. Obter dados atualizados para sincronizar info pública
      const docSnap = await getDoc(doc(modularDb, 'products_inventory', id));
      const currentData = docSnap.data() as InventoryProduct;
      
      if (currentData && currentData.publicProductId !== undefined && currentData.publicProductId !== null) {
          const publicId = Number(currentData.publicProductId);
          
          if (currentData.isPrivate) {
              // Ensure removed
              try {
                  await deleteDoc(doc(modularDb, 'products_public', publicId.toString()));
              } catch (e) {
                  // Ignore
              }
          } else {
              // Ensure added/updated
              const publicProduct = mapToPublicProduct(currentData, publicId);
              publicProduct.id = publicId;
              const cleanPublicProduct = JSON.parse(JSON.stringify(publicProduct));

              await setDoc(doc(modularDb, 'products_public', publicId.toString()), cleanPublicProduct, { merge: true });

              // 3. SINCRONIZAÇÃO AUTOMÁTICA DE STOCK
              // Recalcula a soma de todos os lotes
              await refreshPublicProductStock(publicId);
          }
      }

    } catch (error) {
      console.error("Erro ao atualizar produto:", error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const docSnap = await getDoc(doc(modularDb, 'products_inventory', id));
      const data = docSnap.data() as InventoryProduct;

      // 1. Apagar do Inventário
      await deleteDoc(doc(modularDb, 'products_inventory', id));

      // 2. Se tinha ID público, recalcular stock (ou apagar se for o último)
      if (data && data.publicProductId !== undefined && data.publicProductId !== null) {
          const publicId = Number(data.publicProductId);
          
          const remQ = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', publicId));
          const remainingInventory = await getDocs(remQ);
              
          if (remainingInventory.empty) {
              await deleteDoc(doc(modularDb, 'products_public', publicId.toString()));
          } else {
              // Ainda existem outros lotes, recalcula o total
              await refreshPublicProductStock(publicId);
          }
      }
    } catch (error) {
      console.error("Erro ao apagar produto:", error);
      throw error;
    }
  };

  return { products, loading, error, addProduct, updateProduct, deleteProduct };
};

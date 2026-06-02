
import { useState, useEffect } from 'react';
import { modularDb } from '../services/firebaseConfig';
import { collection, doc, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { InventoryProduct, Product, ProductVariant, Order } from '../types';
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
      specs: inv.specs || {}
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

  // --- FUNÇÃO DE SINCRONIZAÇÃO AUTOMÁTICA ---
  const refreshPublicProductStock = async (publicIdRaw: number | string) => {
      try {
          const publicId = Number(publicIdRaw);
          if (isNaN(publicId)) return;

          // 1. Fetch public product 
          const publicRef = doc(modularDb, 'products_public', publicId.toString());
          const publicSnap = await getDoc(publicRef);
          
          let publicData = publicSnap.exists() ? publicSnap.data() as Product : null;
          
          if (!publicData) {
              console.log("No public product found, attempting to recreate from inventory...", publicId);
              // Fallback to recreate skeleton from inventory if it somehow got deleted
              const fallbackInvQ = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', publicId));
              const fallbackInvSnap = await getDocs(fallbackInvQ);
              if (fallbackInvSnap.empty) return;
              
              const baseInv = fallbackInvSnap.docs[0].data() as InventoryProduct;
              publicData = mapToPublicProduct(baseInv, publicId);
              publicData.id = publicId;
          }

          // 2. Calculate physical stock & variants from inventory
          const invQ = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', publicId));
          const inventorySnap = await getDocs(invQ);
          let physicalStock = 0;
          let variantStock: Record<string, number> = {};

          inventorySnap.forEach(d => {
              const data = d.data() as InventoryProduct;
              const qty = Math.max(0, (data.quantityBought || 0) - (data.quantitySold || 0));
              physicalStock += qty;
              
              const variant = (data.variant || '').trim();
              if (!variantStock[variant]) variantStock[variant] = 0;
              variantStock[variant] += qty;
          });

          // 3. Subtract pending orders
          const ordQ = query(collection(modularDb, 'orders'), where('status', 'in', ['Pendente', 'Processamento', 'Pago', 'Enviado', 'Entregue']));
          const ordersSnap = await getDocs(ordQ);
          let pending = 0;
          let variantPending: Record<string, number> = {};
          
          const now = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          ordersSnap.forEach(d => {
              const order = d.data() as Order;
              const orderDate = new Date(order.date || new Date());
              const isExplicitlyPending = order.stockDeducted === false;
              const isOldButStuck = order.stockDeducted === undefined && 
                                   ['Pendente', 'Processamento', 'Pago'].includes(order.status) && 
                                   orderDate > thirtyDaysAgo;

              if (isExplicitlyPending || isOldButStuck) {
                  order.items.forEach((item: any) => {
                      if (typeof item === 'object' && item.productId === publicId) {
                          const qty = item.quantity || 1;
                          pending += qty;
                          const variant = (item.selectedVariant || '').trim();
                          if (!variantPending[variant]) variantPending[variant] = 0;
                          variantPending[variant] += qty;
                      }
                  });
              }
          });

          const available = Math.max(0, physicalStock - pending);

          // 4. Update Document
          const updatedVariants: any[] = [];
          const allVariantNames = new Set<string>();
          Object.keys(variantStock).forEach(v => { if (v) allVariantNames.add(v); });
          (publicData.variants || []).forEach(v => { if (v && v.name) allVariantNames.add(v.name.trim()); });

          const currentVariantsMap = new Map();
          (publicData.variants || []).forEach(v => { if (v && v.name) currentVariantsMap.set(v.name.trim(), v); });

          allVariantNames.forEach(vName => {
              const physical = variantStock[vName] || 0;
              const pend = variantPending[vName] || 0;
              const variantAvailable = Math.max(0, physical - pend);
              
              const existing = currentVariantsMap.get(vName) || {};
              let cleanImage = existing.image;
              if (cleanImage === null || cleanImage === undefined) cleanImage = undefined;
              
              const varData: any = {
                  name: vName,
                  price: Number(existing.price) || 0,
                  stock: variantAvailable
              };
              if (cleanImage) varData.image = cleanImage;
              
              updatedVariants.push(varData);
          });
          
          const updateData: any = { stock: available };
          if (updatedVariants.length > 0) {
              updateData.variants = updatedVariants;
          }

          await setDoc(publicRef, updateData, { merge: true });
          console.log(`Stock sincronizado para Produto ${publicId}.`);

          // Supabase Backup Sync
          const finalPublicSnap = await getDoc(publicRef);
          if (finalPublicSnap.exists()) {
            supabaseSync.saveProduct({ id: publicId, ...finalPublicSnap.data() } as Product);
          }

      } catch (err) {
          console.error("Erro ao sincronizar stock público automaticamente:", err);
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
          
          // NÃO atualizamos metadados públicos (Nome, Preço, Imagens) aqui
          // para não sobrescrever as edições feitas na Gestão da Loja Online.

          // 3. SINCRONIZAÇÃO AUTOMÁTICA DE STOCK
          // Recalcula a soma de todos os lotes
          await refreshPublicProductStock(publicId);
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

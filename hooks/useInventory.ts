
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

          const publicRef = doc(modularDb, 'products_public', publicId.toString());
          const publicSnap = await getDoc(publicRef);
          if (!publicSnap.exists()) {
              console.log("No public product found during automatic stock refresh:", publicId);
              return;
          }
          const pub = publicSnap.data() as Product;

          // Align public product stock to match inventory batches (Forward Sync)
          const inventoryQuery = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', publicId));
          const inventorySnap = await getDocs(inventoryQuery);
          const lots = inventorySnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() as InventoryProduct }));
          
          const totalPhysical = lots.reduce((acc, l) => acc + (Math.max(0, (l.data.quantityBought || 0) - (l.data.quantitySold || 0))), 0);
          if (pub.stock !== totalPhysical) {
              await updateDoc(publicRef, { stock: totalPhysical });
              console.log(`[Sync] Produto ${pub.id} atualizado: Stock mudou de ${pub.stock} para ${totalPhysical}`);
          }
          return;
          /*
                      const sold = Number(firstLot.data.quantitySold) || 0;
                      const newBought = targetStock + sold;
                      if (firstLot.data.quantityBought !== newBought) {
                          batch.update(firstLot.ref, { quantityBought: newBought });
                          totalUpdated++;
                      }
                      for (let i = 1; i < matchingLots.length; i++) {
                          const otherLot = matchingLots[i];
                          const otherSold = Number(otherLot.data.quantitySold) || 0;
                          if (otherLot.data.quantityBought !== otherSold) {
                              batch.update(otherLot.ref, { quantityBought: otherSold });
                              totalUpdated++;
                          }
                      }
                  } else {
                      const newDocRef = doc(collection(modularDb, 'products_inventory'));
                      const newLot: Omit<InventoryProduct, 'id'> = {
                          publicProductId: pub.id,
                          variant: vName,
                          quantityBought: targetStock,
                          quantitySold: 0,
                          name: pub.name,
                          category: pub.category || '',
                          purchasePrice: 0,
                          salePrice: variant.price || pub.price || 0,
                          purchaseDate: new Date().toISOString().split('T')[0],
                          description: `Lote automático sincronizado para variante ${vName}`,
                          status: targetStock > 0 ? 'IN_STOCK' : 'SOLD',
                          cashbackValue: 0,
                          cashbackStatus: 'NONE' as CashbackStatus,
                      };
                      batch.set(newDocRef, newLot);
                      totalUpdated++;
                  }
              }
              const publicVariantNames = pub.variants.map((v: any) => normalizeVName(v.name));
              const obsoleteLots = lots.filter(l => l.data.variant && !publicVariantNames.includes(normalizeVName(l.data.variant)));
              for (const obs of obsoleteLots) {
                  const sold = Number(obs.data.quantitySold) || 0;
                  if (obs.data.quantityBought !== sold) {
                      batch.update(obs.ref, { quantityBought: sold });
                      totalUpdated++;
                  }
              }
          } else {
              const targetStock = Number(pub.stock) || 0;
              if (lots.length > 0) {
                  const firstLot = lots[0];
                  const sold = Number(firstLot.data.quantitySold) || 0;
                  const newBought = targetStock + sold;
                  if (firstLot.data.quantityBought !== newBought) {
                      batch.update(firstLot.ref, { quantityBought: newBought });
                      totalUpdated++;
                  }
                  for (let i = 1; i < lots.length; i++) {
                      const otherLot = lots[i];
                      const otherSold = Number(otherLot.data.quantitySold) || 0;
                      if (otherLot.data.quantityBought !== otherSold) {
                          batch.update(otherLot.ref, { quantityBought: otherSold });
                          totalUpdated++;
                      }
                  }
              } else {
                  const newDocRef = doc(collection(modularDb, 'products_inventory'));
                  const newLot: Omit<InventoryProduct, 'id'> = {
                      publicProductId: pub.id,
                      variant: '',
                      quantityBought: targetStock,
                      quantitySold: 0,
                      name: pub.name,
                      category: pub.category || '',
                      purchasePrice: 0,
                      salePrice: pub.price || 0,
                      purchaseDate: new Date().toISOString().split('T')[0],
                      description: `Lote automático sincronizado para ${pub.name}`,
                      status: targetStock > 0 ? 'IN_STOCK' : 'SOLD',
                      cashbackValue: 0,
                      cashbackStatus: 'NONE' as CashbackStatus,
                  };
                  batch.set(newDocRef, newLot);
                  totalUpdated++;
              }
          }
          if (totalUpdated > 0) {
              await batch.commit();
              console.log(`[useInventory - AutoSync] Sincronizados ${totalUpdated} lotes no inventário.`);
          }
          
          // Sync with Supabase
          supabaseSync.saveProduct(pub);
          */
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

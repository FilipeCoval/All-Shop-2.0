import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';

async function main() {
    const rawConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
    const firebaseConfig = {
      apiKey: rawConfig.apiKey,
      authDomain: rawConfig.authDomain,
      projectId: rawConfig.projectId,
      storageBucket: rawConfig.storageBucket,
      messagingSenderId: rawConfig.messagingSenderId,
      appId: rawConfig.appId,
    };

    const app = initializeApp(firebaseConfig);
    const dbId = "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9";
    const db = getFirestore(app, dbId);

    console.log("Calculando stock real e atualizando produtos públicos...");

    const publicSnap = await getDocs(collection(db, 'products_public'));
    const inventorySnap = await getDocs(collection(db, 'products_inventory'));

    const inventoryByPublicId: any = {};
    inventorySnap.forEach(doc => {
        const item = doc.data();
        if (!item.publicProductId) return;
        const pid = String(item.publicProductId);
        if (!inventoryByPublicId[pid]) inventoryByPublicId[pid] = [];
        inventoryByPublicId[pid].push(item);
    });

    const batch = writeBatch(db);
    let updates = 0;

    for (const publicDoc of publicSnap.docs) {
        const product = publicDoc.data();
        const pid = String(publicDoc.id);
        const inventoryItems = inventoryByPublicId[pid] || [];
        
        let totalAvailable = 0;
        
        // Calcular stock disponível real baseado nas unidades no inventário
        inventoryItems.forEach((item: any) => {
            const units = Array.isArray(item.units) ? item.units : [];
            const available = units.filter((u: any) => u.status === 'AVAILABLE').length;
            totalAvailable += available;
        });

        // Atualizar variants se existirem
        if (product.variants && Array.isArray(product.variants)) {
            let variantUpdates = 0;
            const newVariants = product.variants.map((v: any) => {
                const invItemForVariant = inventoryItems.find((inv: any) => inv.variant === v.name);
                if (invItemForVariant) {
                    const units = Array.isArray(invItemForVariant.units) ? invItemForVariant.units : [];
                    const availableForVariant = units.filter((u: any) => u.status === 'AVAILABLE').length;
                    
                    if (v.stock !== availableForVariant) {
                        variantUpdates++;
                        return { ...v, stock: availableForVariant };
                    }
                }
                return v;
            });
            
            if (variantUpdates > 0) {
                updates++;
                batch.update(publicDoc.ref, { variants: newVariants, stock: totalAvailable });
                console.log(`Atualizando variants para ${product.name} (ID: ${pid}): ${variantUpdates} variantes ajustadas, stock total ajustado para ${totalAvailable}`);
            }
        } else {
            // Produto sem variants, usa o totalAvailable calculado
            if (product.stock !== totalAvailable) {
                updates++;
                batch.update(publicDoc.ref, { stock: totalAvailable });
                console.log(`Atualizando ${product.name} (ID: ${pid}): stock ajustado de ${product.stock} para ${totalAvailable}`);
            }
        }
    }

    if (updates > 0) {
        await batch.commit();
        console.log(`Sincronização concluída. ${updates} documentos atualizados no products_public.`);
    } else {
        console.log("Nenhuma atualização necessária.");
    }
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

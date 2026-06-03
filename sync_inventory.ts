import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
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

    console.log("Iniciando sincronização e correção de stock...");

    const publicSnap = await getDocs(collection(db, 'products_public'));
    const inventorySnap = await getDocs(collection(db, 'products_inventory'));

    const publicProducts: any = {};
    publicSnap.forEach(doc => { publicProducts[doc.id] = doc.data() });

    for (const inventoryDoc of inventorySnap.docs) {
        const item = inventoryDoc.data();
        const publicProductId = String(item.publicProductId);
        const publicProduct = publicProducts[publicProductId];
        
        if (!publicProduct) continue;

        // Determinar o stock correto para este item/variante
        let expectedForVariant = 0;
        if (publicProduct.variants && Array.isArray(publicProduct.variants)) {
            const variant = publicProduct.variants.find((v: any) => v.name === item.variant);
            if (variant) expectedForVariant = variant.stock || 0;
        } else {
            expectedForVariant = publicProduct.stock || 0;
        }

        const units = (item.units || []);
        const soldUnits = units.filter((u: any) => u.status === 'SOLD');
        const availableUnits = units.filter((u: any) => u.status === 'AVAILABLE');

        // Se precisarmos de reduzir o stock disponível
        if (availableUnits.length > expectedForVariant) {
            console.log(`Corrigindo ${inventoryDoc.id}: esperado ${expectedForVariant}, disponível ${availableUnits.length}`);
            
            // Manter todas as vendidas + o número correto de disponíveis
            const newUnits = [
                ...soldUnits,
                ...availableUnits.slice(0, expectedForVariant)
            ];

            await updateDoc(doc(db, 'products_inventory', inventoryDoc.id), {
                units: newUnits
            });
        }
    }

    console.log("Sincronização concluída com sucesso.");
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

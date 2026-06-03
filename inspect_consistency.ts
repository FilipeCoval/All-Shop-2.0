import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

    console.log("Comparação de consistência no products_inventory...");
    const inventorySnap = await getDocs(collection(db, 'products_inventory'));

    inventorySnap.forEach(docSnap => {
        const item = docSnap.data();
        const units = Array.isArray(item.units) ? item.units : [];
        const availableInUnits = units.filter((u: any) => u.status === 'AVAILABLE').length;
        
        const qBought = Number(item.quantityBought) || 0;
        const qSold = Number(item.quantitySold) || 0;
        const calcFromFields = Math.max(0, qBought - qSold);
        
        if (availableInUnits !== calcFromFields) {
            console.log(`DISCREPÂNCIA: Lote ${docSnap.id} | Público: ${item.publicProductId}`);
            console.log(`  -> Available in units[]: ${availableInUnits}`);
            console.log(`  -> Calc from (quantityBought - quantitySold): ${calcFromFields} (${qBought} - ${qSold})`);
            console.log('---');
        }
    });
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

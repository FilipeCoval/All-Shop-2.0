import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
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

    const invSnap = await getDocs(collection(db, 'products_inventory'));
    invSnap.forEach(docSnap => {
        const item = docSnap.data();
        const pid = String(item.publicProductId);
        
        // Let's only analyze a few IDs that user asked about
        if (['1', '2', '3', '4', '8'].includes(pid)) {
             console.log(`Inventory Doc: ${docSnap.id} | Público: ${pid}`);
             console.log(` Fields: quantityBought=${item.quantityBought}, quantitySold=${item.quantitySold}`);
             const units = Array.isArray(item.units) ? item.units : [];
             console.log(` Units count: ${units.length}`);
             const available = units.filter((u: any) => u.status === 'AVAILABLE').length;
             console.log(` Units AVAILABLE: ${available}`);
             console.log('---');
        }
    });

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

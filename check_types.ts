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

    const invSnap = await getDocs(collection(db, 'products_inventory'));
    invSnap.forEach(docSnap => {
        const item = docSnap.data();
        if (String(item.publicProductId) === '2') {
             console.log(`Lote: ${docSnap.id} | publicProductId: ${item.publicProductId} (Type: ${typeof item.publicProductId})`);
             const units = Array.isArray(item.units) ? item.units : [];
             console.log(`  -> Available: ${units.filter((u: any) => u.status === 'AVAILABLE').length}`);
        }
    });
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

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

    const snap = await getDocs(collection(db, 'products_inventory'));
    const inventoryData: any[] = [];
    snap.forEach(docSnap => {
        inventoryData.push({ id: docSnap.id, ...docSnap.data() });
    });

    fs.writeFileSync('inventory_dump.json', JSON.stringify(inventoryData, null, 2));
    console.log(`Dumped ${inventoryData.length} inventory documents to inventory_dump.json`);
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

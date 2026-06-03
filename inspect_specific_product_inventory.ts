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
    console.log(`Checking products_inventory...`);
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.name && d.name.toLowerCase().includes('stick')) {
            console.log(`\nDoc ID: ${docSnap.id}`);
            console.log(`Name: ${d.name}`);
            console.log(`Variant: ${d.variant}`);
            console.log(`publicProductId: ${d.publicProductId}`);
            console.log(`quantityBought: ${d.quantityBought}`);
            console.log(`quantitySold: ${d.quantitySold}`);
            console.log(`Purchase Price: ${d.purchasePrice}`);
            console.log(`Sale Price: ${d.salePrice}`);
            console.log(`Units Count: ${d.units ? d.units.length : 'none'}`);
            if (d.units) {
                console.log(`Units Statuses:`, d.units.map((u: any) => `${u.id}: ${u.status}`).join(', '));
            }
        }
    });
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

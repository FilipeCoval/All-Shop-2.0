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

    const snap = await getDocs(collection(db, 'products_public'));
    console.log(`Found ${snap.size} documents in products_public:`);
    snap.forEach(docSnap => {
        const d = docSnap.data();
        console.log(`- ID: ${docSnap.id} | Name: "${d.name}" | Stock: ${d.stock} | Variants:`, d.variants ? d.variants.map((v: any) => `${v.name} ($${v.price}, Stock: ${v.stock})`).join(', ') : 'no variants');
    });
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

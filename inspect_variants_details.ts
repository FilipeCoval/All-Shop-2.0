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
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.variants && d.variants.length > 0) {
            console.log(`\n========================================`);
            console.log(`Product "${d.name}" (ID: ${docSnap.id})`);
            console.log(`Variants:`, JSON.stringify(d.variants, null, 2));
        }
    });
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

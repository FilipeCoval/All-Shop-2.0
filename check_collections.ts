import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import rawConfig from './firebase-applet-config.json' with { type: 'json' };

const firebaseConfig = {
  apiKey: rawConfig.apiKey,
  authDomain: rawConfig.authDomain,
  projectId: rawConfig.projectId,
  storageBucket: rawConfig.storageBucket,
  messagingSenderId: rawConfig.messagingSenderId,
  appId: rawConfig.appId,
};

const app = initializeApp(firebaseConfig);

async function check(dbId: string) {
    console.log(`--- CHECKING ${dbId} ---`);
    const db = getFirestore(app, dbId);
    const collections = ['products_public', 'products', 'products_inventory', 'store_categories'];
    for (const col of collections) {
        try {
            const snap = await getDocs(query(collection(db, col), limit(1)));
            console.log(`  ${col}: ${snap.size} docs`);
        } catch (e: any) {
            console.log(`  ${col} ERROR: ${e.message}`);
        }
    }
}

async function run() {
    await check("ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9");
    process.exit(0);
}

run();

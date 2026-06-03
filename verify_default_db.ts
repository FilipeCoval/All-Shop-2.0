import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

async function testDbs() {
    console.log("Reading from (default) database:");
    try {
        const dbDefault = getFirestore(app);
        const snap = await getDocs(collection(dbDefault, "products_public"));
        console.log(`(default) database has ${snap.size} documents in products_public.`);
        snap.docs.forEach(d => console.log(` - ${d.id}: ${d.data()?.name}`));
    } catch(e: any) {
        console.error("Failed to read from (default):", e.message);
    }

    console.log("\nReading from ai-studio database:");
    try {
        const dbStudio = getFirestore(app, "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9");
        const snap = await getDocs(collection(dbStudio, "products_public"));
        console.log(`ai-studio database has ${snap.size} documents in products_public.`);
        snap.docs.forEach(d => console.log(` - ${d.id}: ${d.data()?.name}`));
    } catch(e: any) {
        console.error("Failed to read from ai-studio:", e.message);
    }
}

testDbs().then(() => process.exit(0));

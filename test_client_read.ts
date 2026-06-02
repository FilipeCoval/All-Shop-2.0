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
const db = getFirestore(app, "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9");

async function checkCollection() {
    try {
        const snap = await getDocs(collection(db, "products_public"));
        console.log(`Found ${snap.size} documents in products_public:`);
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            console.log(`- ID: ${docSnap.id} | Name: "${data.name}" | Price: ${data.price} | Image: "${data.image}"`);
        });
    } catch (e: any) {
        console.error("Failed:", e.message);
    }
}

checkCollection().then(() => process.exit(0));

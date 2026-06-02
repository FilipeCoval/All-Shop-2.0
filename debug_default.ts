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

async function run() {
    console.log("START_CHECK_DEFAULT");
    const dbId = "(default)";
    const db = getFirestore(app, dbId);
    try {
        const snap = await getDocs(query(collection(db, 'products_public'), limit(5)));
        console.log(`COUNT:${snap.size}`);
        snap.docs.forEach(d => console.log(`DOC:${d.id}:${d.data()?.name || 'no-name'}`));
        
        const catSnap = await getDocs(query(collection(db, 'store_categories'), limit(5)));
        console.log(`CATS:${catSnap.size}`);

    } catch (e: any) {
        console.log(`ERROR:${e.message}`);
    }
    console.log("END_CHECK");
    process.exit(0);
}

run();

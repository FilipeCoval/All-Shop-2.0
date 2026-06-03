import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
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
    const db = rawConfig.firestoreDatabaseId && rawConfig.firestoreDatabaseId !== "(default)" ? getFirestore(app, rawConfig.firestoreDatabaseId) : getFirestore(app);

    const docSnap = await getDoc(doc(db, 'products_public', '1'));
    if (docSnap.exists()) {
        console.log("Success: Data for ID 1:", JSON.stringify(docSnap.data(), null, 2));
    } else {
        console.log("Document not found");
    }
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

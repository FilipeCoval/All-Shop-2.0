import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc } from 'firebase/firestore';
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

    const collections = ['products_public', 'products_inventory', 'orders', 'stock_movements', 'stock_reservations', 'stock_alerts'];
    const backup: any = {};
    
    for (const colName of collections) {
      console.log(`Backing up ${colName}...`);
      const snap = await getDocs(collection(db, colName));
      backup[colName] = [];
      snap.forEach(docSnap => {
        backup[colName].push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    fs.writeFileSync(`firestore_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(backup, null, 2));
    console.log("Backup completed.");
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

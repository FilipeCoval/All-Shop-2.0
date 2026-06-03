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
    const counts: Record<number, { count: number, names: string[], ids: string[], totalBought: number, totalSold: number }> = {};
    
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const pid = d.publicProductId;
        if (!pid) return;
        if (!counts[pid]) {
            counts[pid] = { count: 0, names: [], ids: [], totalBought: 0, totalSold: 0 };
        }
        counts[pid].count++;
        counts[pid].names.push(d.name);
        counts[pid].ids.push(docSnap.id);
        counts[pid].totalBought += (d.quantityBought || 0);
        counts[pid].totalSold += (d.quantitySold || 0);
    });

    console.log(`Inventory counts by publicProductId:`);
    Object.entries(counts).forEach(([pid, info]) => {
        console.log(`- PID: ${pid} | Lots: ${info.count} | Names: [${[...new Set(info.names)].join(', ')}] | IDs: [${info.ids.join(', ')}] | Bought: ${info.totalBought} | Sold: ${info.totalSold}`);
    });
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

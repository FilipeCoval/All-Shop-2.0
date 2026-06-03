import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
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

    const pid = "2";
    
    // 1. Inventory for ID 2
    const invSnap = await getDocs(query(collection(db, 'products_inventory'), where('publicProductId', '==', pid)));
    let totalPhysical = 0;
    invSnap.forEach(doc => {
        const units = Array.isArray(doc.data().units) ? doc.data().units : [];
        totalPhysical += units.filter((u: any) => u.status === 'AVAILABLE').length;
    });

    // 2. Orders for ID 2
    const ordersSnap = await getDocs(collection(db, 'orders'));
    let pendingDeductions = 0;
    ordersSnap.forEach(doc => {
        const order = doc.data();
        if (order.stockDeducted) return; // Already deducted
        if (order.items) {
           order.items.forEach((item: any) => {
               if (String(item.productId) === pid) {
                   pendingDeductions += (item.quantity || 1);
               }
           });
        }
    });

    // 3. Reservations
    const resSnap = await getDocs(query(collection(db, 'stock_reservations'), where('productId', '==', pid)));
    let reserved = 0;
    resSnap.forEach(doc => {
       reserved += doc.data().quantity || 0;
    });

    console.log(`Produto ID: ${pid}`);
    console.log(`Total Physical Available (from units): ${totalPhysical}`);
    console.log(`Pending Deductions (order not deducted): ${pendingDeductions}`);
    console.log(`Reserved in Cart: ${reserved}`);
    console.log(`Resulting Stock: ${Math.max(0, totalPhysical - pendingDeductions - reserved)}`);
    
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

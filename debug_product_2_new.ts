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

    const pid = "2";
    
    // Inventory
    const invSnap = await getDocs(collection(db, 'products_inventory'));
    let totalPhysical = 0;
    invSnap.forEach(docSnap => {
        const item = docSnap.data();
        if (String(item.publicProductId) === pid) {
             const units = Array.isArray(item.units) ? item.units : [];
             totalPhysical += units.filter((u: any) => u.status === 'AVAILABLE').length;
        }
    });

    // Orders
    const ordersSnap = await getDocs(collection(db, 'orders'));
    let pendingDeductions = 0;
    ordersSnap.forEach(doc => {
        const order = doc.data();
        if (order.fulfillmentStatus === 'COMPLETED') return; // Assume COMPLETED means delivered/done
        if (order.items) {
           order.items.forEach((item: any) => {
               if (String(item.productId) === pid) {
                   pendingDeductions += (item.quantity || 1);
               }
           });
        }
    });

    // Reservations
    const resSnap = await getDocs(collection(db, 'stock_reservations'));
    let reserved = 0;
    resSnap.forEach(doc => {
       if (String(doc.data().productId) === pid) {
          reserved += doc.data().quantity || 0;
       }
    });

    console.log(`Produto ID: ${pid}`);
    console.log(`Total Physical Available (from units): ${totalPhysical}`);
    console.log(`Pending Deductions: ${pendingDeductions}`);
    console.log(`Reserved in Cart: ${reserved}`);
    console.log(`FINAL Resulting Stock: ${Math.max(0, totalPhysical - pendingDeductions - reserved)}`);
    
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

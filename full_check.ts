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

    console.log("Calculando stock para comparar...");

    const publicSnap = await getDocs(collection(db, 'products_public'));
    const inventorySnap = await getDocs(collection(db, 'products_inventory'));
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const reservationsSnap = await getDocs(collection(db, 'stock_reservations'));

    const inventoryItems: any[] = [];
    inventorySnap.forEach(doc => { inventoryItems.push({ id: doc.id, ...doc.data() }) });
    
    const orders: any[] = [];
    ordersSnap.forEach(doc => { orders.push(doc.data()) });
    
    const reservations: any[] = [];
    reservationsSnap.forEach(doc => { reservations.push(doc.data()) });

    for (const publicDoc of publicSnap.docs) {
        const product = publicDoc.data();
        const pid = String(publicDoc.id);
        
        // 1. Physical Stock
        const relevantInventory = inventoryItems.filter(i => String(i.publicProductId) === pid);
        let totalPhysical = 0;
        relevantInventory.forEach(i => {
           const units = Array.isArray(i.units) ? i.units : [];
           totalPhysical += units.filter((u: any) => u.status === 'AVAILABLE').length;
        });

        // 2. Pending Orders
        let pendingInOrders = 0;
        orders.forEach(order => {
           if (order.fulfillmentStatus === 'COMPLETED') return; 
           if (order.items) {
               order.items.forEach((item: any) => {
                   if (String(item.productId) === pid) {
                       pendingInOrders += (item.quantity || 1);
                   }
               });
           }
        });

        // 3. Reservations
        let reservedInCart = 0;
        reservations.forEach(r => {
            if (String(r.productId) === pid) {
                reservedInCart += (r.quantity || 0);
            }
        });

        // Resulting Stock
        const availableStock = Math.max(0, totalPhysical - pendingInOrders - reservedInCart);
        
        console.log(`Lote ${pid} (${product.name}): Firestore Stock=${product.stock}, Calculado=${availableStock}`);
    }
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

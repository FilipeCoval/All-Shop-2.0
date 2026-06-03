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

    const ordersSnap = await getDocs(collection(db, 'orders'));
    console.log("Analyzing orders for productId '1'...");
    
    ordersSnap.forEach(docSnap => {
        const order = docSnap.data();
        if (order.items) {
           order.items.forEach((item: any) => {
               if (String(item.productId) === '1') {
                   console.log(`Order ${order.id} | Status: ${order.status} | Fulfillment: ${order.fulfillmentStatus} | Quantity: ${item.quantity}`);
               }
           });
        }
    });

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

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

    const collections = [
        'products_public',
        'products_inventory',
        'orders',
        'import_shipments',
        'users',
        'support_tickets',
        'newsletter_subscriptions',
        'stock_alerts',
        'store_categories',
        'leads',
        'coupons'
    ];

    for (const name of collections) {
        try {
            const snap = await getDocs(collection(db, name));
            console.log(`Collection "${name}": ${snap.size} documents.`);
            if (name === 'import_shipments' && snap.size > 0) {
                console.log("--- Sample of import_shipments ---");
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    console.log(`- ID: ${docSnap.id} | Status: ${data.status} | Carrier: ${data.shippingDetails?.carrier} | Items count: ${data.items?.length}`);
                    if (data.items) {
                        data.items.forEach((it: any) => {
                            console.log(`  * Item: ${it.name} | UnitPrice: ${it.unitPrice} | Cashback: ${it.cashbackValue} | CashbackStatus: ${it.cashbackStatus || 'N/A'}`);
                        });
                    }
                });
            }
        } catch (e: any) {
            console.log(`Collection "${name}": Error reading (${e.message})`);
        }
    }
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import rawConfig from './firebase-applet-config.json';

const app = initializeApp(rawConfig);
const db = getFirestore(app);

async function check() {
    console.log("Checking (default) database content for multiple collections...");
    
    const collectionsToCheck = ['products', 'orders', 'users', 'product_requests', 'products_public', 'products_inventory', 'reviews'];
    
    for (const collName of collectionsToCheck) {
        try {
            const snap = await getDocs(collection(db, collName));
            console.log(`Collection '${collName}' count:`, snap.size);
        } catch(e) {
            console.log(`Error fetching '${collName}':`, e);
        }
    }
}
check();

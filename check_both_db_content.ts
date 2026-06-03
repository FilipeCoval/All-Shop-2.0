import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import rawConfig from './firebase-applet-config.json';

const app = initializeApp(rawConfig);
const dbDefault = getFirestore(app);
const dbOld = getFirestore(app, 'ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9');

async function check() {
    console.log("Checking both databases...");
    
    // Check Products
    try {
        const prodSnap = await getDocs(collection(dbDefault, 'products'));
        console.log("(default) products count:", prodSnap.size);
    } catch(e) {
        console.log("Error fetching products from default:", e);
    }
    
    // Check Products from old
    try {
        const prodSnap = await getDocs(collection(dbOld, 'products'));
        console.log("(old) products count:", prodSnap.size);
    } catch(e) {
        console.log("Error fetching products from old:", e);
    }
}
check();

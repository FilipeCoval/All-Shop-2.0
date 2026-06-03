import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import rawConfig from './firebase-applet-config.json';

const app = initializeApp(rawConfig);
// Test 1: Using "(default)" as explicit name
try {
    console.log("Trying getFirestore(app, '(default)')");
    const db1 = getFirestore(app, '(default)');
    const snap1 = await getDocs(collection(db1, 'products_public'));
    console.log("Success with '(default)'");
} catch (e) {
    console.log("Failed with '(default)':", e);
}

// Test 2: Using null/undefined or no argument
try {
    console.log("Trying getFirestore(app)");
    // @ts-ignore
    const db2 = getFirestore(app);
    const snap2 = await getDocs(collection(db2, 'products_public'));
    console.log("Success with getFirestore(app)");
} catch (e) {
    console.log("Failed with getFirestore(app):", e);
}

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import rawConfig from '../firebase-applet-config.json';

const app = initializeApp(rawConfig);
const db = getFirestore(app, rawConfig.firestoreDatabaseId || "(default)");

async function check() {
  const refProd = doc(db, 'products', '6');
  const snapProd = await getDoc(refProd);
  console.log('Exists 6 in products:', snapProd.exists());
  
  const refInv = doc(db, 'products_inventory', '6');
  const snapInv = await getDoc(refInv);
  console.log('Exists 6 in products_inventory:', snapInv.exists());
}
check();

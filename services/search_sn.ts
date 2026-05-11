import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import rawConfig from '../firebase-applet-config.json';

const app = initializeApp(rawConfig);
const db = getFirestore(app, rawConfig.firestoreDatabaseId || "(default)");

async function findSN(sn: string) {
  const coll = collection(db, 'products_inventory');
  const snap = await getDocs(coll);
  
  snap.forEach(doc => {
    const data = doc.data();
    if (data.units && Array.isArray(data.units)) {
      const found = data.units.find((u: any) => String(u.id).trim() === sn.trim());
      if (found) {
        console.log(`Found SN ${sn} in product ID: ${doc.id}, publicProductId: ${data.publicProductId}, name: ${data.name}`);
      }
    }
  });
}
findSN('63598/700000801971');

import { db } from './firebaseConfig';

async function listProductIds() {
  try {
    const productsSnap = await db.collection('products').get();
    console.log("Found products:");
    productsSnap.forEach(doc => {
      console.log(`ID: ${doc.id}`);
    });
  } catch (error) {
    console.error("Error listing products:", error);
  }
}

listProductIds();

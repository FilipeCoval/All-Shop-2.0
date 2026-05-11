import { db } from './firebaseConfig';

async function checkProduct() {
  try {
    const p6_inv = await db.collection('products_inventory').doc('6').get();
    console.log("products_inventory/6 exists:", p6_inv.exists);
    const p6_prod = await db.collection('products').doc('6').get();
    console.log("products/6 exists:", p6_prod.exists);
  } catch (error) {
    console.error("Error:", error);
  }
}

checkProduct();

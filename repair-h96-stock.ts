import { db } from './services/firebase-admin.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    if (!db) {
        console.error("Firebase admin database not initialized!");
        return;
    }

    console.log("Repairing reservations and inventory for Product ID 2...");
    
    // 1. Delete all reservations for product 2 (checking both number and string)
    const resSnapNumber = await db.collection('stock_reservations').where('productId', '==', 2).get();
    const resSnapString = await db.collection('stock_reservations').where('productId', '==', "2").get();
    
    console.log(`Deleting ${resSnapNumber.size + resSnapString.size} reservations.`);
    for (const doc of resSnapNumber.docs) {
        await doc.ref.delete();
    }
    for (const doc of resSnapString.docs) {
        await doc.ref.delete();
    }

    // 2. Set 'reserved' to 0 for inventory docs of product 2
    const invSnap = await db.collection('products_inventory').where('publicProductId', '==', 2).get();
    console.log(`Updating ${invSnap.size} inventory docs.`);
    for (const doc of invSnap.docs) {
        await doc.ref.update({ reserved: 0 });
        console.log(`Updated inventory doc ${doc.id}`);
    }

    // 3. Set public product stock to 2 (10 - 8 sold = 2 remaining physical stock)
    const publicRef = db.collection('products_public').doc("2");
    await publicRef.update({ stock: 2 });
    console.log("Updated products_public stock to 2.");

    console.log("Repair completed successfully.");
}
run();

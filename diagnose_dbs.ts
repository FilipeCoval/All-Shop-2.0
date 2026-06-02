import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: "allshop-store-70851"
    });
}

async function scanDb(dbId: string) {
    console.log(`=== SCANNING DB ${dbId} ===`);
    try {
        const db = getFirestore(admin.app(), dbId);
        
        const pubSnap = await db.collection('products_public').limit(10).get();
        console.log(`products_public size for ${dbId}:`, pubSnap.size);
        pubSnap.forEach(d => {
            console.log(` - Product found: ID=${d.id}, name="${d.data()?.name}", price=${d.data()?.price}`);
        });

        const invSnap = await db.collection('products_inventory').limit(10).get();
        console.log(`products_inventory size for ${dbId}:`, invSnap.size);

        const revSnap = await db.collection('reviews').limit(10).get();
        console.log(`reviews size for ${dbId}:`, revSnap.size);

        const catSnap = await db.collection('store_categories').limit(10).get();
        console.log(`store_categories size for ${dbId}:`, catSnap.size);
    } catch (e: any) {
        console.error(`Error scanning ${dbId}:`, e.message);
    }
}

async function run() {
    await scanDb("(default)");
    await scanDb("ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9");
}

run();

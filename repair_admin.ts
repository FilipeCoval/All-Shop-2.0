import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
    initializeApp({
        projectId: "allshop-store-70851"
    });
}

async function run() {
    const db = getFirestore(getApp()); // Should use (default)
    console.log("LISTING COLLECTIONS IN (default)...");
    try {
        const collections = await db.listCollections();
        console.log(`Found ${collections.length} collections`);
        for (const col of collections) {
            const snap = await col.limit(1).get();
            console.log(` - ${col.id}: ${snap.size} docs`);
        }
    } catch (e: any) {
        console.log(`ERROR LISTING: ${e.message}`);
    }

    try {
        const dbNamed = getFirestore(getApp(), "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9");
        console.log("\nLISTING COLLECTIONS IN ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9...");
        const collectionsNamed = await dbNamed.listCollections();
        console.log(`Found ${collectionsNamed.length} collections`);
        for (const col of collectionsNamed) {
            const snap = await col.limit(1).get();
            console.log(` - ${col.id}: ${snap.size} docs`);
        }
    } catch (e: any) {
        console.log(`ERROR LISTING NAMED: ${e.message}`);
    }
}

run();

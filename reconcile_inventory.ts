import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import fs from 'fs';

async function main() {
    const rawConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
    const firebaseConfig = {
      apiKey: rawConfig.apiKey,
      authDomain: rawConfig.authDomain,
      projectId: rawConfig.projectId,
      storageBucket: rawConfig.storageBucket,
      messagingSenderId: rawConfig.messagingSenderId,
      appId: rawConfig.appId,
    };

    const app = initializeApp(firebaseConfig);
    const dbId = "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9";
    const db = getFirestore(app, dbId);

    console.log("Fetching data for reconciliation...");

    const publicSnap = await getDocs(collection(db, 'products_public'));
    const inventorySnap = await getDocs(collection(db, 'products_inventory'));

    const publicProducts: any = {};
    publicSnap.forEach(doc => { publicProducts[doc.id] = doc.data() });

    const inventoryItems: any[] = [];
    inventorySnap.forEach(doc => { inventoryItems.push({ id: doc.id, ...doc.data() }) });

    console.log(`Found ${publicSnap.size} public products and ${inventorySnap.size} inventory batches.`);

    const discrepancies: any[] = [];

    // Reconciliation Logic
    for (const item of inventoryItems) {
        const publicProductId = String(item.publicProductId);
        const publicProduct = publicProducts[publicProductId];
        
        if (!publicProduct) {
            discrepancies.push({ type: 'orphan_inventory', itemId: item.id });
            continue;
        }

        // Get expected stock for this variant
        let expectedForVariant = 0;
        if (publicProduct.variants && Array.isArray(publicProduct.variants)) {
            const variant = publicProduct.variants.find((v: any) => v.name === item.variant);
            if (variant) expectedForVariant = variant.stock || 0;
        } else {
            expectedForVariant = publicProduct.stock || 0;
        }

        const availableUnits = (item.units || []).filter((u: any) => u.status === 'AVAILABLE');
        const soldUnits = (item.units || []).filter((u: any) => u.status === 'SOLD');

        if (availableUnits.length !== expectedForVariant) {
            discrepancies.push({
                type: 'stock_mismatch',
                itemId: item.id,
                expected: expectedForVariant,
                actualAvailable: availableUnits.length,
                sold: soldUnits.length
            });
        }
    }

    fs.writeFileSync('reconciliation_report.json', JSON.stringify(discrepancies, null, 2));
    console.log(`Reconciliation finished. Report saved to reconciliation_report.json. Found ${discrepancies.length} issues.`);
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

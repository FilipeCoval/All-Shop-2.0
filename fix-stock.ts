import { App, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

// Try to initialize using the downloaded dev config
let serviceAccount: any;
try {
  serviceAccount = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
} catch (e) {
  // Try normal service account if in standard environment
  serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) : null;
}

if (!serviceAccount) {
  console.log("No Firebase config found. Exiting sync script.");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);

async function syncAllStock() {
    console.log("Fetching products_public...");
    const publicSnap = await db.collection('products_public').get();
    console.log(`Found ${publicSnap.size} public products.`);

    const inventorySnap = await db.collection('products_inventory').get();
    const lots = inventorySnap.docs.map(d => ({ id: d.id, data: d.data() }));

    const batch = db.batch();
    let updates = 0;

    for (const pDoc of publicSnap.docs) {
        const pId = Number(pDoc.id);
        if (isNaN(pId)) continue;
        
        const pData = pDoc.data();
        
        // Find all lots
        const myLots = lots.filter(l => Number(l.data.publicProductId) === pId);
        
        let totalPhysical = 0;
        const normalizeVName = (n: string) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
        let variantStocks: Record<string, number> = {};

        myLots.forEach(l => {
            const data = l.data;
            const b = Number(data.quantityBought) || 0;
            const s = Number(data.quantitySold) || 0;
            const qty = Math.max(0, b - s);
            totalPhysical += qty;

            if (data.variant) {
                const vKey = normalizeVName(data.variant);
                variantStocks[vKey] = (variantStocks[vKey] || 0) + qty;
            }
        });

        let updatedVariants = pData.variants ? [...pData.variants] : [];
        let variantsUpdated = false;
        
        for (let i = 0; i < updatedVariants.length; i++) {
            const v = updatedVariants[i];
            const vKey = normalizeVName(v.name);
            const realStock = variantStocks[vKey] || 0;
            if (v.stock !== realStock) {
                updatedVariants[i] = { ...v, stock: realStock };
                variantsUpdated = true;
            }
        }

        if (pData.stock !== totalPhysical || variantsUpdated) {
            const updatePayload: any = { stock: totalPhysical };
            if (variantsUpdated) {
                updatePayload.variants = updatedVariants;
            }
            batch.update(pDoc.ref, updatePayload);
            updates++;
            console.log(`Mismatch on product ${pId}: was ${pData.stock}, correcting to ${totalPhysical}`);
        }
    }

    if (updates > 0) {
        await batch.commit();
        console.log(`Committed ${updates} updates to public stock.`);
    } else {
        console.log("All stock is already in sync!");
    }
}

syncAllStock().then(() => {
    console.log("Done.");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});

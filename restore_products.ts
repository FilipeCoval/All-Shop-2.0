import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import rawConfig from './firebase-applet-config.json' with { type: 'json' };

const firebaseConfig = {
  apiKey: rawConfig.apiKey,
  authDomain: rawConfig.authDomain,
  projectId: rawConfig.projectId,
  storageBucket: rawConfig.storageBucket,
  messagingSenderId: rawConfig.messagingSenderId,
  appId: rawConfig.appId,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9");

interface SupabaseProduct {
    id: number;
    name: string;
    price: number;
    stock: number;
    variants: any;
    is_freebie: boolean;
    raw_data: any;
}

async function restore() {
    console.log("Reading supabase_products.json...");
    const rawData = fs.readFileSync('supabase_products.json', 'utf8');
    const products: SupabaseProduct[] = JSON.parse(rawData);
    
    console.log(`Found ${products.length} products to restore.`);
    
    // 1. Clear old collections products_public and products_inventory
    console.log("Cleaning current products_public...");
    const publicSnap = await getDocs(collection(db, "products_public"));
    for (const d of publicSnap.docs) {
        await deleteDoc(doc(db, "products_public", d.id));
    }
    console.log("Cleaned products_public.");

    console.log("Cleaning current products_inventory...");
    const inventorySnap = await getDocs(collection(db, "products_inventory"));
    for (const d of inventorySnap.docs) {
        await deleteDoc(doc(db, "products_inventory", d.id));
    }
    console.log("Cleaned products_inventory.");

    // 2. Insert real products
    for (const p of products) {
        const pData = p.raw_data;
        if (!pData) {
            console.warn(`Product ID ${p.id} has no raw_data! Skipping.`);
            continue;
        }

        const docId = pData.id.toString();
        
        // Write to products_public
        console.log(`Restoring Product: "${pData.name}" (ID: ${docId}) to products_public...`);
        await setDoc(doc(db, "products_public", docId), pData);

        // Generate matching record inside products_inventory to support checkout transactions cleanly
        const stockNum = Number(pData.stock || p.stock || 0);
        console.log(`Generating Inventory for Product ID: ${docId} (Stock: ${stockNum})...`);
        
        // Create synthetic SN IDs for checkout validation
        const units = [];
        for (let i = 0; i < Math.max(stockNum * 2, 50); i++) {
            units.push({
                id: `SN-${docId}-${1000 + i}`,
                status: "AVAILABLE"
            });
        }

        const inventoryData = {
            id: docId,
            publicProductId: Number(docId),
            name: pData.name,
            quantityBought: stockNum,
            quantitySold: 0,
            reserved: 0,
            units: units
        };

        await setDoc(doc(db, "products_inventory", docId), inventoryData);
    }

    console.log("\n--- RESTORE COMPLETED SUCCESSFULY! ---");
}

restore().then(() => process.exit(0)).catch(e => {
    console.error("Migration failed:", e);
    process.exit(1);
});

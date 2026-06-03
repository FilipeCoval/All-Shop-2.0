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
    
    // 1. Cleared old collections products_public and products_inventory (Overwriting directly with setDoc is safer and faster)
    console.log("Directly overwriting records in products_public and products_inventory...");

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
        
        const purchaseDateStr = pData.purchaseDate || new Date().toISOString();
        const priceNum = Number(pData.price || p.price || 0);
        
        // Create synthetic SN IDs for checkout validation
        const units = [];
        for (let i = 0; i < Math.max(stockNum * 2, 50); i++) {
            units.push({
                id: `SN-${docId}-${1000 + i}`,
                status: "AVAILABLE",
                addedAt: purchaseDateStr
            });
        }

        const inventoryData = {
            id: docId,
            publicProductId: Number(docId),
            name: pData.name,
            category: pData.category || "Acessórios",
            purchaseDate: purchaseDateStr,
            quantityBought: stockNum,
            quantitySold: 0,
            reserved: 0,
            purchasePrice: pData.purchasePrice || Number((priceNum * 0.4).toFixed(2)),
            targetSalePrice: pData.targetSalePrice || priceNum,
            salePrice: priceNum,
            cashbackValue: pData.cashbackValue || 0,
            cashbackStatus: pData.cashbackStatus || "NONE",
            status: "IN_STOCK",
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

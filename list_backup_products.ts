import fs from 'fs';

function main() {
    if (!fs.existsSync('supabase_products.json')) {
        console.error("supabase_products.json does not exist!");
        return;
    }
    const products = JSON.parse(fs.readFileSync('supabase_products.json', 'utf8'));
    console.log(`Loaded ${products.length} products from backup.`);
    products.forEach((p: any) => {
        let raw = p.raw_data;
        if (raw && typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch {}
        }
        if (!raw) raw = p;
        
        console.log(`- ID: ${p.id} | Name: "${p.name}" | Stock: ${p.stock || raw.stock} | Price: ${p.price || raw.price}`);
        if (p.variants || raw.variants) {
            console.log(`  Variants:`, JSON.stringify(p.variants || raw.variants));
        }
    });
}

main();

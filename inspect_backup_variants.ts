import fs from 'fs';

function main() {
    const rawData = fs.readFileSync('supabase_products.json', 'utf8');
    const products = JSON.parse(rawData);
    
    const targetIds = [1769876342618, 1776451648679, 1777119702513, 1777141219448, 17, 16];
    
    for (const p of products) {
        if (targetIds.includes(p.id)) {
            console.log(`\n========================================`);
            console.log(`ID: ${p.id} | Name: "${p.name}"`);
            let pData = p.raw_data;
            if (pData && typeof pData === 'string') {
                try { pData = JSON.parse(pData); } catch {}
            }
            if (!pData) pData = p;
            console.log(`Top-level variants:`, p.variants ? JSON.stringify(p.variants, null, 2) : 'null');
            console.log(`raw_data variants:`, pData.variants ? JSON.stringify(pData.variants, null, 2) : 'null');
            console.log(`raw_data image:`, pData.image);
            console.log(`raw_data images:`, pData.images);
        }
    }
}

main();

import fs from 'fs';

function inspect() {
    const data = JSON.parse(fs.readFileSync('supabase_products.json', 'utf8'));
    console.log(`Loaded ${data.length} products`);
    for (const item of data) {
         console.log(`- Supabase Product Item: ${item.id} | Name: ${item.name} | has variants in raw_data: ${!!(item.raw_data && (typeof item.raw_data === 'string' ? JSON.parse(item.raw_data) : item.raw_data).variants)}`);
    }
}

inspect();

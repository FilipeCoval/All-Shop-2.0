import fs from 'fs';

function inspect() {
    const orders = JSON.parse(fs.readFileSync('supabase_orders.json', 'utf8'));
    console.log(`Loaded ${orders.length} orders`);
    
    const productVariants = new Map<number, Set<string>>();
    
    for (const o of orders) {
        let rawDataObj: any = {};
        if (o.raw_data) {
            if (typeof o.raw_data === 'string') {
                try { rawDataObj = JSON.parse(o.raw_data); } catch { rawDataObj = {}; }
            } else { rawDataObj = o.raw_data; }
        }
        
        let itemsList: any[] = [];
        if (o.items) {
            if (typeof o.items === 'string') {
                try { itemsList = JSON.parse(o.items); } catch { itemsList = []; }
            } else if (Array.isArray(o.items)) {
                itemsList = o.items;
            }
        } else if (rawDataObj.items) {
            itemsList = Array.isArray(rawDataObj.items) ? rawDataObj.items : [];
        }
        
        for (const item of itemsList) {
            if (item && typeof item === 'object') {
                const pId = Number(item.productId);
                if (pId) {
                    const variant = item.selectedVariant || item.variant || item.variantName;
                    if (variant) {
                        if (!productVariants.has(pId)) productVariants.set(pId, new Set());
                        productVariants.get(pId)!.add(variant);
                    }
                }
            }
        }
    }
    
    console.log("\nVariants found in orders:");
    productVariants.forEach((variants, pId) => {
        console.log(`- Product ID ${pId}:`, Array.from(variants));
    });
}

inspect();

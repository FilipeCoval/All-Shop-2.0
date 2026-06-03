import fs from 'fs';

function main() {
    if (fs.existsSync('diagnose_results.json')) {
        const data = JSON.parse(fs.readFileSync('diagnose_results.json', 'utf8'));
        console.log("diagnose_results keys:", Object.keys(data));
        if (data.supabaseProducts) {
            console.log("supabaseProducts size:", data.supabaseProducts.length);
        }
        if (data.supabaseOrders) {
            console.log("supabaseOrders size:", data.supabaseOrders.length);
        }
    } else {
        console.log("diagnose_results.json does not exist");
    }
}

main();

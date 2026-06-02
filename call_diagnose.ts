import fs from 'fs';

async function fetchDiag() {
    console.log("Calling local diagnostic API...");
    try {
        const res = await fetch("http://localhost:3000/api/diagnose");
        const json = await res.json();
        fs.writeFileSync("diagnose_results.json", JSON.stringify(json, null, 2), "utf8");
        console.log("Successfully wrote diagnosis results to: diagnose_results.json");
    } catch (e: any) {
        console.error("Failed to query local diagnostic API:", e.message);
    }
}

fetchDiag().then(() => process.exit(0));

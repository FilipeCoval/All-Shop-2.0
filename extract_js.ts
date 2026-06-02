import fs from 'fs';

const jsContent = fs.readFileSync('dist/assets/index-DcUxKrb-.js', 'utf8');

// We know that names or categories like "Xiaomi" or "buds" or image paths like "products_public/" are in the JS. Let's do some search
console.log("Analyzing JS Bundle...");

// Let's find some keywords
const keywords = ["buds", "xiaomi", "redmi", "products_public", "Usba", "com_id"];
for (const kw of keywords) {
    const idx = jsContent.indexOf(kw);
    if (idx !== -1) {
        console.log(`Keyword "${kw}" found around index ${idx}`);
        const segment = jsContent.substring(Math.max(0, idx - 1000), Math.min(jsContent.length, idx + 2000));
        fs.writeFileSync(`extracted_${kw}.txt`, segment, 'utf8');
        console.log(`  Saved segment of 3000 chars around "${kw}" to extracted_${kw}.txt`);
    } else {
        console.log(`Keyword "${kw}" NOT found`);
    }
}

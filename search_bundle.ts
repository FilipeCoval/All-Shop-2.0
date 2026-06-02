import fs from 'fs';

const jsContent = fs.readFileSync('dist/assets/index-DcUxKrb-.js', 'utf8');

console.log("Searching JS bundle for 'products_public/' (with slash)...");

let pos = 0;
let matchCount = 0;
while (true) {
    const idx = jsContent.indexOf('products_public/', pos);
    if (idx === -1) break;
    matchCount++;
    console.log(`Match ${matchCount} at index ${idx}`);
    const segment = jsContent.substring(Math.max(0, idx - 300), Math.min(jsContent.length, idx + 500));
    console.log(`---\nSEGMENT:\n${segment}\n---`);
    pos = idx + 1;
}

process.exit(0);

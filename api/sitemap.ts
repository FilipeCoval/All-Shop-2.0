import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIREBASE_PROJECT_ID = "allshop-store-70851";
const PUBLIC_URL = "https://www.all-shop.net";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/products_public`;
        const response = await fetch(firestoreUrl);
        let products = [];
        
        if (response.ok) {
            const data = await response.json();
            if (data.documents) {
                products = data.documents.map((doc: any) => {
                    const id = doc.name.split('/').pop();
                    const updatedTime = doc.updateTime || new Date().toISOString();
                    return { id, updatedTime };
                });
            }
        }

        // XML Template
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <!-- Home / Main Pages -->
    <url>
        <loc>${PUBLIC_URL}/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    
    <!-- Dynamic Products -->
`;

        products.forEach((p: any) => {
            xml += `    <url>
        <loc>${PUBLIC_URL}/p/${p.id}</loc>
        <lastmod>${p.updatedTime.split('T')[0]}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>\n`;
        });

        xml += `</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400'); // Cache 1 hour
        return res.status(200).send(xml);

    } catch (error) {
        console.error("Erro Sitemap Fetch:", error);
        return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.all-shop.net/</loc></url></urlset>');
    }
}

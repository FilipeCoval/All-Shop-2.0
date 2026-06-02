import { Request, Response } from 'express';
import { db } from '../services/firebase-admin';
import * as admin from 'firebase-admin';

export default async function handler(req: Request, res: Response) {
    console.log("[Diag API] Triggering robust diagnostics...");
    
    try {
        if (!db) {
            console.error("[Diag API] Imported db is undefined!");
            return res.status(500).json({ error: "Imported db is undefined" });
        }

        const results: Record<string, any> = {
            databaseId: db.databaseId || 'unknown',
            collections: {}
        };

        const targetCollections = ['products_public', 'products_inventory', 'reviews', 'store_categories', 'orders', 'users'];
        
        for (const colId of targetCollections) {
            try {
                const snap = await db.collection(colId).get();
                results.collections[colId] = {
                    size: snap.size,
                    docs: snap.docs.slice(0, 5).map(doc => ({
                        id: doc.id,
                        data: doc.data()
                    }))
                };
            } catch (colErr: any) {
                results.collections[colId] = {
                    error: colErr.message || "Failed to load collection"
                };
            }
        }

        return res.status(200).json(results);
    } catch (e: any) {
        console.error("[Diag API] Global error:", e);
        return res.status(500).json({ error: e.message || "Global diagnosis error" });
    }
}

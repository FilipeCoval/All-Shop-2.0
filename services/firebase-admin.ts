import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import rawConfig from '../firebase-applet-config.json' with { type: 'json' };

let db: Firestore | null = null;

try {
    if (!getApps().length) {
        initializeApp({
            projectId: rawConfig.projectId
        });
    }
    const dbId = process.env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId;
    console.log("Firebase admin initialized for project:", rawConfig.projectId, "with database ID:", dbId || "(default)");
    if (dbId && dbId !== "(default)") {
        db = getFirestore(getApp(), dbId);
    } else {
        db = getFirestore(getApp());
    }
} catch (error: any) {
    console.warn("Firebase admin failed to initialize. Server functions will use client fallbacks. Error:", error.message || error);
}

export { db };

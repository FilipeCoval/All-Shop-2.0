import { getApps, initializeApp, getApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import rawConfig from '../firebase-applet-config.json' with { type: 'json' };

let db: Firestore | null = null;

try {
    if (!getApps().length) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const projectId = process.env.FIREBASE_PROJECT_ID || rawConfig.projectId;

        if (privateKey && clientEmail && projectId) {
            console.log("Initializing Firebase Admin with service account credentials for project:", projectId);
            initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
        } else {
            console.log("Initializing Firebase Admin with default credentials. Missing keys?", { hasKey: !!privateKey, hasEmail: !!clientEmail, hasProject: !!projectId });
            initializeApp({
                projectId: rawConfig.projectId
            });
        }
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

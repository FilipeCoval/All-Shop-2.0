import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import rawConfig from '../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
    initializeApp({
        projectId: rawConfig.projectId
    });
}

const dbId = process.env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId || "(default)";
console.log("Firebase admin initialized for project:", rawConfig.projectId, "with database ID:", dbId);

export const db = getFirestore(getApp(), dbId);

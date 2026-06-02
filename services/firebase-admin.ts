import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import rawConfig from '../firebase-applet-config.json';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
    });
}
const dbId = process.env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId || "(default)";
console.log("Firebase admin initialized with database ID:", dbId);

export const db = getFirestore(admin.app(), dbId);


import { getApps, initializeApp, getApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import rawConfig from '../firebase-applet-config.json' with { type: 'json' };

let db: Firestore | null = null;
let initializationError: unknown = null;

try {
    let firestoreConfigured = true;
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
        } else if (process.env.VERCEL) {
            const configurationError = new Error('Firebase Admin service-account credentials are missing in this Vercel environment.') as Error & { code: string };
            configurationError.code = 'firebase-admin/configuration-missing';
            initializationError = configurationError;
            firestoreConfigured = false;
            // A validação do ID token só precisa do projectId; as escritas continuam
            // bloqueadas até existirem credenciais de serviço válidas.
            initializeApp({ projectId });
        } else {
            console.log("Initializing Firebase Admin with default credentials. Missing keys?", { hasKey: !!privateKey, hasEmail: !!clientEmail, hasProject: !!projectId });
            initializeApp({
                projectId: rawConfig.projectId
            });
        }
    }
    if (firestoreConfigured) {
        const dbId = process.env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId;
        console.log("Firebase admin initialized for project:", rawConfig.projectId, "with database ID:", dbId || "(default)");
        if (dbId && dbId !== "(default)") {
            db = getFirestore(getApp(), dbId);
        } else {
            db = getFirestore(getApp());
        }
    }
} catch (error: any) {
    initializationError = error;
    // Mantemos uma app apenas com projectId para que a API consiga distinguir
    // sessão inválida de configuração de Firestore inválida.
    if (!getApps().length && rawConfig.projectId) {
        try { initializeApp({ projectId: rawConfig.projectId }); } catch { /* O erro original é o diagnóstico relevante. */ }
    }
    console.warn("Firebase admin failed to initialize. Administrative writes are disabled. Error:", error.message || error);
}

export { db, initializationError };

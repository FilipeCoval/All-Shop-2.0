import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { auth as legacyAuth, modularDb } from '../../services/firebaseConfig';

// The admin client must share the exact Firebase app and Firestore database used
// by the existing 2.0 storefront. Initialising a second app here could silently
// select the default database and split authentication state from the shop.
export const auth: Auth | null = legacyAuth;
export const firestore: Firestore | null = modularDb;
export const isFirebaseConfigured = Boolean(auth && firestore);

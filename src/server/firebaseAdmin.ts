import { db, initializationError } from '../../services/firebase-admin.js';

export function getAdminDb() {
  if (!db) {
    if (initializationError) throw initializationError;
    const error = new Error('Firebase Admin não está configurado no servidor.') as Error & { code: string };
    error.code = 'firebase-admin/configuration-missing';
    throw error;
  }
  return db;
}

import { db } from '../../services/firebase-admin.js';

export function getAdminDb() {
  if (!db) throw new Error('Firebase Admin não está configurado no servidor.');
  return db;
}

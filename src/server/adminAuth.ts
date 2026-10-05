import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const FALLBACK_ADMIN_EMAILS = new Set([
  'filipe_coval_90@hotmail.com',
  'filipecoval90@gmail.com',
  'mcpoleca@gmail.com',
]);

// Stable IDs of the already-created Firebase accounts that belong to the
// store. Requiring both UID and email prevents a deleted allow-listed email
// from being registered again by somebody else.
const FALLBACK_ADMIN_UIDS = new Set([
  'l0mJV5eevUSuF7NQ6TnllQA3KFd2',
  'cCreF8NjIHXhcFhQkTHLfEBuNS42',
  'TR5zcBdlvBWamXT12MDjSjsGVOV2',
]);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const allowedAdminEmails = () => {
  const configured = String(process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return configured.length ? new Set(configured) : FALLBACK_ADMIN_EMAILS;
};

const allowedAdminUids = () => {
  const configured = String(process.env.ADMIN_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean);
  return configured.length ? new Set(configured) : FALLBACK_ADMIN_UIDS;
};

export async function requireAdmin(request: VercelRequest) {
  const token = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, 'Inicie sessão como administrador.');

  try {
    const decoded = await getAuth(getApp()).verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email || !allowedAdminEmails().has(email) || !allowedAdminUids().has(decoded.uid)) {
      throw new ApiError(403, 'Esta conta não tem acesso à administração.');
    }
    return { uid: decoded.uid, email };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'A sessão expirou. Entre novamente.');
  }
}

export function handleApiError(response: VercelResponse, error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : 'O servidor não conseguiu concluir a operação. Tente novamente.';
  if (!(error instanceof ApiError)) console.error('[admin-api]', error);
  return response.status(status).json({ success: false, error: message });
}

export function requirePost(request: VercelRequest, response: VercelResponse) {
  if (request.method === 'POST') return true;
  response.setHeader('Allow', 'POST');
  response.status(405).json({ success: false, error: 'Método não permitido.' });
  return false;
}

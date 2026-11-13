import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID } from 'node:crypto';
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

type ErrorDetails = { status: number; message: string; retryable: boolean; code: string };
const errorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').trim().toLowerCase();
};

export function classifyAdminError(error: unknown): ErrorDetails {
  if (error instanceof ApiError) return { status: error.status, message: error.message, retryable: false, code: 'api-error' };
  const code = errorCode(error);
  if (['8', 'resource-exhausted'].includes(code)) {
    return { status: 429, message: 'O Firebase está temporariamente ocupado. Tente novamente dentro de momentos.', retryable: true, code };
  }
  if (['4', '10', '13', '14', 'aborted', 'deadline-exceeded', 'internal', 'unavailable'].includes(code)) {
    return { status: 503, message: 'O Firebase não conseguiu terminar a operação neste momento. Tente novamente dentro de momentos.', retryable: true, code };
  }
  if (['firebase-admin/configuration-missing', 'app/invalid-credential', 'app/invalid-app-options'].includes(code)) {
    return { status: 503, message: 'O servidor de testes não tem a ligação administrativa ao Firebase configurada.', retryable: false, code };
  }
  return { status: 500, message: 'O servidor não conseguiu concluir a operação. Tente novamente.', retryable: false, code: code || 'unknown' };
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
  const details = classifyAdminError(error);
  const requestId = randomUUID().slice(0, 12);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-AllShop-Error-Id', requestId);
  if (details.retryable) response.setHeader('Retry-After', '1');
  if (!(error instanceof ApiError)) console.error('[admin-api]', {
    requestId,
    code: details.code,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return response.status(details.status).json({ success: false, error: details.message, retryable: details.retryable, requestId });
}

export function requirePost(request: VercelRequest, response: VercelResponse) {
  if (request.method === 'POST') return true;
  response.setHeader('Allow', 'POST');
  response.status(405).json({ success: false, error: 'Método não permitido.' });
  return false;
}

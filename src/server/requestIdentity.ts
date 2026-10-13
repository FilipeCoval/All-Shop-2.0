import type { VercelRequest } from '@vercel/node';
import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { ApiError } from './adminAuth.js';

export async function getRequestIdentity(request: VercelRequest, guestToken: unknown) {
  const bearer = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    try {
      const decoded = await getAuth(getApp()).verifyIdToken(bearer);
      return { ownerKey: `user:${decoded.uid}`, userId: decoded.uid, guestToken: null };
    } catch { throw new ApiError(401, 'A sessão expirou. Entre novamente.'); }
  }
  const token = String(guestToken ?? '').trim();
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(token)) throw new ApiError(400, 'A identificação temporária do carrinho é inválida.');
  return { ownerKey: `guest:${token}`, userId: null, guestToken: token };
}

import type { Request } from 'express';
import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { makeOwnerKey } from './stock-utils.js';

export type RequestIdentity = {
  userId: string | null;
  email: string | null;
  guestToken: string | null;
  ownerKey: string;
};

const validGuestToken = (value: unknown): value is string => {
  return typeof value === 'string' && value.length >= 16 && value.length <= 250;
};

export const getRequestIdentity = async (req: Request, guestTokenInput?: unknown): Promise<RequestIdentity> => {
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (bearer) {
    try {
      const decoded = await getAuth(getApp()).verifyIdToken(bearer);
      return {
        userId: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email.toLowerCase() : null,
        guestToken: null,
        ownerKey: makeOwnerKey(decoded.uid, null),
      };
    } catch {
      throw new Error('Sessão inválida. Faça login novamente ou continue como convidado.');
    }
  }

  if (!validGuestToken(guestTokenInput)) {
    throw new Error('Sessão de convidado inválida. Atualize a página e tente novamente.');
  }

  return {
    userId: null,
    email: null,
    guestToken: guestTokenInput,
    ownerKey: makeOwnerKey(null, guestTokenInput),
  };
};

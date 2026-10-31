export type AdminApiPayload = Record<string, unknown> & {
  success?: boolean;
  error?: unknown;
  retryable?: boolean;
  requestId?: unknown;
};

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const parseAdminApiPayload = (raw: string): AdminApiPayload | null => {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AdminApiPayload : null;
  } catch {
    return null;
  }
};

export const isRetryableAdminResponse = (status: number, payload: AdminApiPayload | null) =>
  payload?.retryable === true || RETRYABLE_HTTP_STATUSES.has(status);

const payloadError = (payload: AdminApiPayload | null) => {
  if (typeof payload?.error === 'string') return payload.error.trim();
  if (payload?.error && typeof payload.error === 'object' && 'message' in payload.error) {
    const message = (payload.error as { message?: unknown }).message;
    if (typeof message === 'string') return message.trim();
  }
  return '';
};

export const adminApiErrorMessage = (status: number, payload: AdminApiPayload | null, vercelId = '') => {
  const message = payloadError(payload);
  const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
  const reference = requestId || vercelId;
  const suffix = `HTTP ${status}${reference ? ` · referência ${reference}` : ''}`;
  if (message) return `${message} (${suffix})`;
  if (status === 401) return `A sessão expirou. Atualize a página e entre novamente. (${suffix})`;
  if (status === 403) return `A sessão do link de testes não autorizou esta operação. Atualize a página. (${suffix})`;
  if (status === 408 || status === 504) return `O servidor demorou demasiado a responder. O rascunho foi mantido. (${suffix})`;
  if (status >= 500) return `A Vercel ou o Firebase teve uma falha temporária. O rascunho foi mantido. (${suffix})`;
  return `O servidor devolveu uma resposta inesperada. O rascunho foi mantido. (${suffix})`;
};

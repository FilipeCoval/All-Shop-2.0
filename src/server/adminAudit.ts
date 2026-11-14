import { FieldValue } from 'firebase-admin/firestore';

export type AuditChange = {
  field: string;
  before: string;
  after: string;
};

type AuditActor = {
  uid?: string | null;
  email?: string | null;
  kind?: 'ADMIN' | 'CLIENT' | 'SYSTEM';
};

type AuditTarget = {
  type: string;
  id?: string | number | null;
  label?: string | null;
};

type AuditEntryInput = {
  action: string;
  actor?: AuditActor;
  target: AuditTarget;
  before?: unknown;
  after?: unknown;
  summary?: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

const hiddenFields = new Set([
  'password', 'passwordhash', 'token', 'fcmtoken', 'devicetokens', 'authorization',
  'email', 'phone', 'street', 'doornumber', 'zip', 'city', 'shippinginfo', 'messages',
  'ownerkey', 'guesttoken',
]);
const technicalFields = new Set([
  'createdat', 'updatedat', 'updatedby', 'stockupdatedat', 'receivedat', 'addedat',
  'readbyadminat', 'adminpushupdatedat', 'fulfillmentnotification',
]);
const maxChanges = 80;
const maxValueLength = 900;

const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && !(value instanceof Date)
  && typeof (value as { toDate?: unknown }).toDate !== 'function';

const valueText = (value: unknown, depth = 0): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value.length > maxValueLength ? `${value.slice(0, maxValueLength - 1)}…` : value;
  if (Array.isArray(value)) {
    // Keep a compact preview of variants, photos and units useful in the audit
    // instead of collapsing every object inside an array into only its field count.
    const visible = value.slice(0, 20).map((item) => valueText(item, depth));
    return `${value.length} item(ns): ${visible.join(' · ')}${value.length > visible.length ? ' · …' : ''}`.slice(0, maxValueLength);
  }
  if (value instanceof Date) return value.toISOString();
  if (plainObject(value)) {
    if (depth >= 2) return `${Object.keys(value).length} campo(s)`;
    const pairs = Object.entries(value)
      .filter(([key]) => !hiddenFields.has(key.toLocaleLowerCase('pt')) && !technicalFields.has(key.toLocaleLowerCase('pt')))
      .slice(0, 20)
      .map(([key, item]) => `${key}: ${valueText(item, depth + 1)}`);
    return `{ ${pairs.join(' · ')}${Object.keys(value).length > pairs.length ? ' · …' : ''} }`.slice(0, maxValueLength);
  }
  return String(value).slice(0, maxValueLength);
};

const equal = (left: unknown, right: unknown) => valueText(left) === valueText(right);

const appendChanges = (before: unknown, after: unknown, prefix: string, changes: AuditChange[], depth = 0) => {
  if (changes.length >= maxChanges) return;
  if (plainObject(before) && plainObject(after) && depth < 3) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !hiddenFields.has(key.toLocaleLowerCase('pt')) && !technicalFields.has(key.toLocaleLowerCase('pt')))
      .sort((left, right) => left.localeCompare(right, 'pt'));
    for (const key of keys) appendChanges(before[key], after[key], prefix ? `${prefix}.${key}` : key, changes, depth + 1);
    return;
  }
  if (equal(before, after)) return;
  changes.push({ field: prefix || 'Registo', before: valueText(before), after: valueText(after) });
};

export const auditChanges = (before: unknown, after: unknown): AuditChange[] => {
  if (before == null && after == null) return [];
  const changes: AuditChange[] = [];
  if (before == null) appendChanges({}, after, '', changes);
  else if (after == null) appendChanges(before, {}, '', changes);
  else appendChanges(before, after, '', changes);
  return changes;
};

/** Produces a bounded, privacy-aware and immutable audit record. */
export const adminAuditEntry = ({ action, actor, target, before, after, summary, details, requestId }: AuditEntryInput) => {
  const changes = auditChanges(before, after);
  const operation = before == null && after != null ? 'CRIADO' : before != null && after == null ? 'APAGADO' : 'ALTERADO';
  return {
    schemaVersion: 2,
    action,
    operation,
    targetType: target.type,
    targetId: target.id == null ? null : String(target.id),
    targetLabel: target.label || null,
    summary: summary || null,
    changes,
    changedFields: changes.map((change) => change.field),
    ...(details ? { details: Object.fromEntries(Object.entries(details).filter(([key]) => !hiddenFields.has(key.toLocaleLowerCase('pt')))) } : {}),
    actorType: actor?.kind ?? 'ADMIN',
    adminId: actor?.uid ?? null,
    adminEmail: actor?.email ?? null,
    requestId: requestId || null,
    createdAt: FieldValue.serverTimestamp(),
  };
};

export const adminRequestId = (headers: { [key: string]: string | string[] | undefined }) => {
  const value = headers['x-allshop-request'];
  return Array.isArray(value) ? value[0]?.slice(0, 120) : value?.slice(0, 120);
};

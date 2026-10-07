import { createHash } from 'node:crypto';

export const inventoryUnitCodeDocumentId = (code: string) => createHash('sha256')
  .update(code.normalize('NFKC').trim().toUpperCase())
  .digest('hex');

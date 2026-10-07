import assert from 'node:assert/strict';
import { ApiError, classifyAdminError } from '../src/server/adminAuth.js';

assert.deepEqual(classifyAdminError(new ApiError(409, 'Conflito')), { status: 409, message: 'Conflito', retryable: false, code: 'api-error' });
assert.equal(classifyAdminError(Object.assign(new Error('aborted'), { code: 10 })).status, 503);
assert.equal(classifyAdminError(Object.assign(new Error('unavailable'), { code: 'unavailable' })).retryable, true);
assert.equal(classifyAdminError(Object.assign(new Error('quota'), { code: 8 })).status, 429);
assert.equal(classifyAdminError(Object.assign(new Error('config'), { code: 'firebase-admin/configuration-missing' })).retryable, false);
assert.equal(classifyAdminError(new Error('unknown')).status, 500);

console.log('admin error regressions: OK');

import assert from 'node:assert/strict';
import { adminApiErrorMessage, isRetryableAdminResponse, parseAdminApiPayload } from '../src/features/admin/adminRequestPolicy.js';

assert.deepEqual(parseAdminApiPayload('{"success":true}'), { success: true });
assert.equal(parseAdminApiPayload('<html>erro da plataforma</html>'), null);
assert.equal(isRetryableAdminResponse(503, null), true);
assert.equal(isRetryableAdminResponse(409, { success: false }), false);
assert.equal(isRetryableAdminResponse(409, { success: false, retryable: true }), true);
assert.match(adminApiErrorMessage(504, null, 'fra1::abc'), /HTTP 504/);
assert.match(adminApiErrorMessage(409, { error: 'S/N repetido' }), /S\/N repetido/);
assert.match(adminApiErrorMessage(500, { error: { message: 'temporário' }, requestId: 'req-1' }), /referência req-1/);

console.log('admin request policy regressions: OK');

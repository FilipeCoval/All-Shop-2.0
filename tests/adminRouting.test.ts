import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  functions?: Record<string, unknown>;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

assert.equal(existsSync(new URL('../api/admin.ts', import.meta.url)), true);
assert.equal(existsSync(new URL('../api/admin/[resource].ts', import.meta.url)), false);
assert.ok(config.functions?.['api/admin.ts']);
assert.ok(config.rewrites?.some((rewrite) => rewrite.source === '/api/admin/:resource'
  && rewrite.destination === '/api/admin?resource=:resource'));

const catchAllIndex = config.rewrites?.findIndex((rewrite) => rewrite.source === '/(.*)') ?? -1;
const compatibilityIndex = config.rewrites?.findIndex((rewrite) => rewrite.source === '/api/admin/:resource') ?? -1;
assert.ok(compatibilityIndex >= 0 && catchAllIndex > compatibilityIndex);

console.log('admin route regression tests passed');

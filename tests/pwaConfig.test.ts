import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const storeManifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown>;
const adminManifest = JSON.parse(read('public/admin.webmanifest')) as Record<string, unknown>;
const indexHtml = read('index.html');
const adminHtml = read('admin.html');
const appSource = read('App.tsx');
const installPromptSource = read('components/InstallPrompt.tsx');
const firebaseSource = read('services/firebaseConfig.ts');
const adminPwaSource = read('src/features/admin/AdminPwaControls.tsx');
const adminDashboardSource = read('src/features/admin/AdminDashboard.tsx');
const adminStyles = read('src/styles/admin3.css');
const viteSource = read('vite.config.ts');
const vercelConfig = JSON.parse(read('vercel.json')) as { headers?: Array<{ source?: string }> };

assert.equal(storeManifest.id, '/');
assert.equal(storeManifest.start_url, '/?source=pwa');
assert.equal(adminManifest.id, '/admin');
assert.equal(adminManifest.start_url, '/admin?source=pwa');
assert.match(indexHtml, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(adminHtml, /rel="manifest" href="\/admin\.webmanifest"/);
assert.doesNotMatch(indexHtml, /getRegistrations\(\).*unregister/s);
assert.doesNotMatch(appSource, /register\('\/firebase-messaging-sw\.js'\)/);
assert.match(firebaseSource, /scope:\s*'\/firebase-cloud-messaging-push-scope\/'/);
assert.match(firebaseSource, /serviceWorkerRegistration:\s*registration/);
assert.match(viteSource, /registerType:\s*'prompt'/);
assert.match(viteSource, /navigateFallbackDenylist/);
assert.match(installPromptSource, /Nova versão disponível/);
assert.match(adminPwaSource, /Instalar admin/);
assert.match(adminPwaSource, /Sem ligação/);
assert.match(adminHtml, /viewport-fit=cover/);
assert.match(adminStyles, /env\(safe-area-inset-bottom\)/);
assert.ok(
  adminDashboardSource.indexOf("setTab('reports')") < adminDashboardSource.indexOf("setTab('coupons')"),
  'Relatórios deve estar entre as áreas principais da navegação móvel.',
);
assert.ok(vercelConfig.headers?.some((entry) => entry.source === '/sw.js'));

console.log('PWA configuration regressions: OK');

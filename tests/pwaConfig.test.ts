import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const storeManifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown>;
const adminManifest = JSON.parse(read('public/admin.webmanifest')) as Record<string, unknown>;
const indexHtml = read('index.html');
const adminHtml = read('admin.html');
const indexSource = read('index.tsx');
const adminEntrySource = read('admin-entry.tsx');
const adminServiceWorkerSource = read('public/admin-sw.js');
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
assert.equal(storeManifest.scope, '/');
assert.equal(adminManifest.id, '/admin');
assert.equal(adminManifest.start_url, '/admin?source=admin-pwa');
assert.equal(adminManifest.scope, '/admin');
assert.deepEqual(adminManifest.launch_handler, { client_mode: 'navigate-existing' });
assert.match(indexHtml, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(adminHtml, /rel="manifest" href="\/admin\.webmanifest"/);
assert.doesNotMatch(indexHtml, /getRegistrations\(\).*unregister/s);
assert.doesNotMatch(appSource, /register\('\/firebase-messaging-sw\.js'\)/);
assert.match(firebaseSource, /scope:\s*'\/firebase-cloud-messaging-push-scope\/'/);
assert.match(firebaseSource, /serviceWorkerRegistration:\s*registration/);
assert.match(viteSource, /registerType:\s*'prompt'/);
assert.match(viteSource, /navigateFallbackDenylist/);
assert.match(viteSource, /globIgnores:[\s\S]*admin\.html[\s\S]*admin-sw\.js/);
assert.doesNotMatch(viteSource, /cacheName:\s*'allshop-admin-shell'/);
assert.match(installPromptSource, /Nova versão disponível/);
assert.match(adminPwaSource, /Instalar admin/);
assert.match(adminPwaSource, /Sem ligação/);
assert.match(adminEntrySource, /registerAdminPwa\(\)/);
assert.doesNotMatch(adminEntrySource, /registerAllShopPwa\(\)/);
assert.match(indexSource, /registerAllShopPwa/);
assert.match(adminServiceWorkerSource, /ADMIN_CACHE = 'allshop-admin-v1'/);
assert.match(adminServiceWorkerSource, /pathname\.startsWith\('\/admin'\)/);
assert.match(adminServiceWorkerSource, /SKIP_WAITING/);
assert.match(indexSource, /source.*admin-pwa/);
assert.match(indexSource, /location\.replace\('\/admin\?source=admin-pwa'\)/);
assert.doesNotMatch(adminHtml, /viewport-fit=cover/);
assert.match(adminHtml, /apple-mobile-web-app-status-bar-style" content="black"/);
assert.match(adminStyles, /\.admin-sidebar \{ width: 100%; height: 70px;/);
assert.ok(
  adminDashboardSource.indexOf("setTab('reports')") < adminDashboardSource.indexOf("setTab('coupons')"),
  'Relatórios deve estar entre as áreas principais da navegação móvel.',
);
assert.ok(vercelConfig.headers?.some((entry) => entry.source === '/sw.js'));
assert.ok(vercelConfig.headers?.some((entry) => entry.source === '/admin-sw.js'));

console.log('PWA configuration regressions: OK');

import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5179, strictPort: true }, plugins: [{ name: 'preorder-fixture', configureServer(server) { server.middlewares.use('/__preorder-test', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__preorder-test', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/preorderPreview.tsx"></script></body></html>')); }); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const captures = await mkdtemp(join(tmpdir(), 'allshop-preorder-test-'));
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => console.error('UI error:', error.message));
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:5179') ? route.continue() : route.abort());
  let order; let creates = 0; let edits = 0; let confirmations = 0; let failConfirmation = true;
  await page.route('**/api/create-order-draft', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'create_preorder') {
      creates++;
      assert.equal(body.messageConfirmedAt, undefined);
      assert.equal(body.items.length, 2, 'The complete multi-item preorder is submitted together.');
      order = { id: body.idempotencyKey, total: 60, status: 'A confirmar', shippingInfo: body.shippingInfo, items: [{ productId: 2, name: 'TV Box teste', quantity: 1 }, { productId: 3, name: 'Comando teste', quantity: 2 }], preorder: { kind: 'PREORDER', messagePending: true, status: 'DEPOSIT_PENDING', quantity: 3, productIds: [2, 3], depositDue: 30, balanceDue: 30, depositDeadlineAt: '2099-12-10' } };
    } else if (body.action === 'edit_preorder') {
      edits++;
      order = { ...order, total: 60, items: [{ productId: 2, name: 'TV Box teste', quantity: 1 }, { productId: 3, name: 'Comando teste', quantity: 2 }], preorder: { ...order.preorder, quantity: 3, productIds: [2, 3], depositDue: 30, balanceDue: 30, messagePending: true } };
    } else {
      if (failConfirmation) { failConfirmation = false; return route.fulfill({ status: 503, json: { error: 'Falha temporária de teste. Pode repetir.' } }); }
      confirmations++; order = { ...order, status: 'Pendente', preorder: { ...order.preorder, messagePending: false, messageConfirmedAt: new Date().toISOString() } };
    }
    await route.fulfill({ json: { success: true, order } });
  });
  await page.goto('http://127.0.0.1:5179/__preorder-test');
  await page.getByPlaceholder('Nome completo').fill('Cliente teste');
  await page.getByPlaceholder('Email', { exact: true }).fill('test@example.invalid');
  await page.getByPlaceholder('Telemóvel').fill('000000000');
  await page.getByLabel('Produto a adicionar').selectOption('3');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.locator('article').filter({ hasText: 'Comando teste' }).getByRole('combobox').selectOption('2');
  await page.getByRole('button', { name: 'Levantamento', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Guardar e continuar para a mensagem' }).click();
  await page.getByRole('heading', { name: 'Pré-reserva guardada' }).waitFor();
  assert.equal(creates, 1);
  assert.equal(edits, 0, 'Creation keeps all products under one reference without an extra client request.');
  await page.reload();
  await page.getByRole('heading', { name: 'Pré-reserva guardada' }).waitFor();
  assert.equal(creates, 1, 'Reload resumes the existing order, not a second reservation.');
  await page.getByRole('button', { name: '3. Já enviei a mensagem — confirmar' }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: '3. Já enviei a mensagem — confirmar' }).click();
  await page.getByRole('heading', { name: 'Obrigado pela encomenda!' }).waitFor();
  assert.equal(confirmations, 1);
  await page.screenshot({ path: join(captures, 'success-mobile.png') });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5179/__preorder-test?admin&dark');
    await page.getByRole('button', { name: 'Gerir pré-reserva' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow.');
    await page.screenshot({ path: join(captures, `admin-${width}.png`) });
    await page.getByRole('combobox').selectOption('closed');
    await page.getByText('Não existem pré-reservas com estes filtros.').waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5179/__preorder-test?edit');
  await page.getByRole('heading', { name: 'Editar pré-reserva' }).waitFor();
  await page.getByLabel('Produto a adicionar').selectOption('3');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.locator('article').filter({ hasText: 'Comando teste' }).getByRole('combobox').selectOption('2');
  await page.screenshot({ path: join(captures, 'edit-mobile.png') });
  await page.getByRole('button', { name: 'Guardar alterações' }).click();
  await page.waitForFunction(() => document.title === 'Edição guardada');
  assert.equal(edits, 1, 'The customer area can edit a preorder before the deposit.');
  console.log('Preorder mobile save / interrupted flow / retry / success / admin filters: OK', captures);
} finally { await browser.close(); await server.close(); }

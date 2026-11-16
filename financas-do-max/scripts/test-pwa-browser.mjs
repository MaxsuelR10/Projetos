import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {createApi} from '../http-api.mjs';
import {seedState} from '../dist/domain.mjs';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright-core');
let state = seedState(), revision = 1;
const env = {VERCEL_DEPLOYMENT_ID: 'primeira'};
const api = createApi(env, {
  auth: {
    user: async req => req.headers.cookie === 'sandbox=yes' && {id: 'sandbox', name: 'Conta de teste'},
    login: async () => 'sandbox=yes; Path=/; HttpOnly; SameSite=Lax',
    logout: async () => 'sandbox=; Path=/; Max-Age=0'
  },
  storeFactory: () => ({
    read: async () => ({state, revision}),
    write: async (next, expected) => {
      assert.equal(expected, revision);
      state = next;
      return {revision: ++revision};
    }
  })
});
const mime = {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) return api(req,res);
  try {
    const file = path === '/' ? '/index.html' : path;
    const data = await readFile(new URL('../dist' + file, import.meta.url));
    res.writeHead(200, {'Content-Type': mime[extname(file)], 'Cache-Control': 'no-cache'});
    res.end(data);
  } catch {res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser;
try {
  browser = await chromium.launch({executablePath,headless:true,timeout:10000});
  const context = await browser.newContext({viewport:{width:320,height:640},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror',error => failures.push(error.message));
  await page.goto(origin);
  await page.locator('[data-auth-view=signup]').click();
  await page.locator('input[name=name]').fill('Conta de teste');
  await page.locator('input[name=email]').fill('teste@example.invalid');
  await page.locator('input[name=password]').fill('senha-ficticia');
  await page.locator('form button[type=submit]').click();
  await page.locator('.mobile-bottom-nav').waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  assert.equal(manifest.errors.filter(error => error.critical).length,0);
  assert.equal(JSON.parse(manifest.data).display,'standalone');
  const installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors.filter(error => error.errorId !== 'in-incognito'), []);
  console.log('Chromium manifest/instalação:', JSON.stringify(installability));
  await page.goto(origin + '/#/transactions');
  await page.locator('#main').waitFor();
  await page.locator('main [data-action=transaction]').first().click();
  await page.locator('[role=dialog]').waitFor();
  assert.equal(await page.locator('[role=dialog] input[name=amount]').evaluate(input => getComputedStyle(input).fontSize),'16px');
  await page.locator('[role=dialog] [data-action=close-modal]').first().click();
  const routes = ['overview','accounts','transactions','cards','installments','subscriptions','investments','settings'];
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:780});
    for (const route of routes) {
      await page.evaluate(path => location.hash = '/' + path,route);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      const [scroll,client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(scroll<=client+1,route+' @ '+width+' '+scroll+'/'+client);
    }
  }
  await page.goto(origin+'/#/transactions');
  await page.goto(origin+'/#/cards');
  await page.goBack();
  await page.waitForURL('**/#/transactions');
  await page.goto(origin+'/#/settings');
  await page.locator('[data-action=logout]').first().click();
  await page.locator('input[name=email]').fill('teste@example.invalid');
  await page.locator('input[name=password]').fill('senha-ficticia');
  await page.locator('form button[type=submit]').click();
  await page.locator('#main').waitFor();
  env.VERCEL_DEPLOYMENT_ID = 'segunda';
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.locator('#release-status').waitFor();
  await Promise.all([page.waitForNavigation(),page.locator('#release-status button').click()]);
  await page.locator('#main').waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  assert.equal(await page.locator('#release-status').isHidden(),true);
  await context.setOffline(true);
  await page.locator('#connection-status').waitFor();
  await context.setOffline(false);
  // Disconnect the origin itself. Browser emulation may leave the worker's network active.
  await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
  await page.goto(origin+'/?sem-conexao=1');
  await page.getByRole('heading',{name:'Sem conexão'}).waitFor();
  assert.deepEqual(await page.evaluate(() => caches.keys()),[]);
  assert.deepEqual(failures,[]);
  console.log('Chrome: login e cadastro fictícios, sessão após recarga, modal, oito telas em quatro larguras, Voltar, atualização e abertura offline.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  server.close();
}

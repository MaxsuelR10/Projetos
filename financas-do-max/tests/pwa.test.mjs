import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const file = name => readFile(new URL('../dist/' + name, import.meta.url));

test('manifest standalone e ícones PNG correspondem aos tamanhos declarados', async () => {
  const manifest = JSON.parse(await file('manifest.webmanifest'));
  assert.equal(manifest.name, 'Finanças do Max');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.id, '/');
  for (const purpose of ['any', 'maskable']) {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(item => item.purpose === purpose && item.sizes === size + 'x' + size);
      await expectPng(icon.src.slice(1), size);
    }
  }
  const html = (await file('index.html')).toString();
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon.png"/);
  await expectPng('apple-touch-icon.png', 180);
});

async function expectPng(path, size) {
  const png = await file(path);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}

test('worker só intercepta navegação de entrada e oferece resposta offline sem cache', async () => {
  const listeners = new Map();
  let offline = false;
  const network = new Response('online');
  vm.runInNewContext((await file('sw.js')).toString(), {
    URL, Response, self: {location: {origin: 'https://app.test'}, addEventListener: (name, fn) => listeners.set(name, fn)},
    fetch: async (_, options) => {
      assert.equal(options.cache, 'no-store');
      if (offline) throw new Error('Sem rede');
      return network;
    }
  });
  const dispatch = (pathname, mode = 'navigate', method = 'GET') => {
    let response;
    listeners.get('fetch')({request: {url: 'https://app.test' + pathname, mode, method}, respondWith: value => {response = value;}});
    return response;
  };
  assert.equal(dispatch('/api/state'), undefined);
  assert.equal(dispatch('/api/state', 'cors', 'PUT'), undefined);
  assert.equal(dispatch('/app.mjs', 'cors'), undefined);
  assert.equal(await dispatch('/'), network);
  offline = true;
  const fallback = await dispatch('/');
  assert.equal(fallback.status, 503);
  assert.equal(fallback.headers.get('cache-control'), 'no-store');
  assert.match(await fallback.text(), /Sem conexão/);
});

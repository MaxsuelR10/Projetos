import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createApi} from '../http-api.mjs';
import {createPushRepository} from '../push-repository.mjs';

test('a sessão determina o proprietário de leituras e gravações, inclusive após trocar de conta', async t => {
  const rows = new Map([
    ['user:alice', {revision: 1, state: {accounts: [{id: 'a'}], messages: ['alice']}}],
    ['user:bob', {revision: 1, state: {accounts: [{id: 'b'}], messages: ['bob']}}]
  ]);
  const server = createServer(createApi({VERCEL_DEPLOYMENT_ID: 'versao-teste'}, {
    auth: {user: async req => /^session=(alice|bob)$/.exec(req.headers.cookie)?.[1]
      ? {id: req.headers.cookie.slice(8)} : null},
    storeFactory: (_, workspace) => ({
      read: async () => rows.get(workspace),
      write: async (state, revision) => {
        assert.equal(rows.get(workspace).revision, revision);
        rows.set(workspace, {revision: revision + 1, state});
        return {revision: revision + 1};
      }
    })
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  const get = (path, headers) => fetch(origin + path, {headers});
  const update = (cookie, user) => fetch(origin + '/api/state', {
    method: 'PUT',
    headers: {Cookie: cookie, Origin: origin, 'Content-Type': 'application/json',
      ...(user ? {'X-Financas-User': user} : {})},
    body: JSON.stringify({revision: 1, userId: 'bob', state: {accounts: []}})
  });
  for (const path of ['/api/session', '/api/state', '/api/assistant/conversations/latest',
    '/api/chat/status', '/api/notifications/status', '/api/notifications/cron']) {
    assert.equal((await get(path)).status, 401, path);
  }
  const own = await get('/api/state?userId=bob', {Cookie: 'session=alice', 'X-Financas-User': 'alice'});
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.equal((await own.json()).state.accounts[0].id, 'a');
  const messages = await get('/api/assistant/conversations/latest?userId=bob', {Cookie: 'session=alice'});
  assert.deepEqual((await messages.json()).messages, ['alice']);
  assert.equal((await get('/api/state', {Cookie: 'session=bob', 'X-Financas-User': 'alice'})).status, 409);
  assert.equal((await update('session=bob', 'alice')).status, 409);
  assert.equal((await update('session=bob')).status, 409);
  assert.equal((await update('session=alice', 'alice')).status, 200);
  assert.equal(rows.get('user:alice').revision, 2);
  assert.equal(rows.get('user:bob').state.accounts[0].id, 'b');
  assert.deepEqual(await (await get('/api/release')).json(), {release: 'versao-teste'});
});

test('upsert push altera apenas a inscrição do mesmo proprietário', async () => {
  const subscription = {endpoint: 'https://fcm.googleapis.com/push/test'};
  let owner;
  const sql = async (strings, id, user, payload) => {
    const statement = strings.join('?');
    assert.match(statement, /ON CONFLICT\(id\) DO UPDATE/);
    assert.match(statement, /WHERE financas_max_push_subscriptions.user_id=EXCLUDED.user_id RETURNING id/);
    assert.equal(JSON.parse(payload).endpoint, subscription.endpoint);
    if (owner && user !== owner) return [];
    owner = user;
    return [{id}];
  };
  const repo = createPushRepository(null, sql);
  await repo.subscribe('alice', subscription);
  await assert.rejects(repo.subscribe('bob', subscription), {status: 409});
  await repo.subscribe('alice', subscription);
  assert.equal(owner, 'alice');
});

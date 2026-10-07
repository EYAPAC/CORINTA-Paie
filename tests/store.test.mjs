import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_ADMIN_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost.invalid/db';

const { default: handler } = await import('../api/store.js');

function call({ method = 'GET', token, body } = {}) {
  const res = {
    headers: {},
    statusCode: 0,
    payload: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; },
  };
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  return handler(req, res).then(() => res);
}

const good = process.env.APP_ADMIN_TOKEN;

test('refuse les méthodes non prévues', async () => {
  const res = await call({ method: 'DELETE', token: good });
  assert.equal(res.statusCode, 405);
});

test('refuse sans clé ou avec une mauvaise clé', async () => {
  assert.equal((await call()).statusCode, 401);
  assert.equal((await call({ token: 'x' })).statusCode, 401);
  assert.equal((await call({ token: good + 'x' })).statusCode, 401);
});

test('POST : JSON invalide → 400', async () => {
  const res = await call({ method: 'POST', token: good, body: '{pas du json' });
  assert.equal(res.statusCode, 400);
});

test('POST : révision invalide ou négative → 400', async () => {
  for (const revision of ['abc', -1, 1.5]) {
    const res = await call({ method: 'POST', token: good, body: { payload: {}, revision } });
    assert.equal(res.statusCode, 400, `révision ${revision}`);
  }
});

test('POST : clés inconnues, valeurs non-chaîne ou JSON invalide → 400', async () => {
  const bad = [
    { evil: '{}' },
    { paieSettings: { a: 1 } },
    { paieHistory: '[pas du json' },
    [],
  ];
  for (const payload of bad) {
    const res = await call({ method: 'POST', token: good, body: { payload, revision: 0 } });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
});

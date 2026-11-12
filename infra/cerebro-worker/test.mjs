import assert from 'node:assert/strict';
import worker, { technicalPing } from './src/index.js';

const id = '3f1e2d4c-5b6a-4c7d-8e9f-0a1b2c3d4e5f';
assert.deepEqual(
  Object.keys(technicalPing({ install_id: id, event: 'sessao', email: 'x@y.z', member_id: id, install_credential: 'a'.repeat(43) })).filter((k) => /email|member|credential/.test(k)),
  [],
  'personal fields never reach storage',
);
assert.equal(technicalPing({ install_id: 'nope', event: 'sessao' }), null, 'install_id must be a uuid');

const inserted = [];
const env = { DB: { prepare: (sql) => ({ bind: (...values) => ({ run: async () => inserted.push({ sql, values }) }) }) } };
const post = (path, body) => worker.fetch(new Request(`https://x${path}`, { method: 'POST', body: JSON.stringify(body) }), env);

assert.equal((await post('/cerebro-ping', { install_id: id, event: 'sessao', os: 'darwin', email: 'x@y.z' })).status, 204);
assert.equal(inserted.length, 1);
assert.equal(inserted[0].values.includes('x@y.z'), false, 'email is dropped');
assert.equal((await post('/cerebro-ping', { event: 'sessao' })).status, 400);
const activation = await post('/cerebro-install-activation', { action: 'start' });
assert.deepEqual([activation.status, await activation.json()], [403, { ok: false, reason: 'activation_not_available' }]);
assert.equal((await post('/api/library-sync', {})).status, 403);
assert.equal((await post('/api/system-distribution', {})).status, 403);
assert.equal((await worker.fetch(new Request('https://x/cerebro-ping'), env)).status, 405);
console.log('✓ worker stores only technical ping fields and refuses activation and catalog');

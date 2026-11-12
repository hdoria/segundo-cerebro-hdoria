#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateJudgmentReceipt } from './lib/judgment-protocol.mjs';

const example = JSON.parse(readFileSync(new URL('../protocol/examples/judgment-receipt.v1.json', import.meta.url), 'utf8'));

assert.deepEqual(validateJudgmentReceipt(example), []);
const reviewed = { source_ref: '.cerebro/runtime/outputs/routines/example.md', sha256: 'a'.repeat(64), scope: 'delivery-quality' };
assert.deepEqual(validateJudgmentReceipt({ ...example, reviewed_version: reviewed }), []);
for (const invalid of [{ ...reviewed, sha256: 'bad' }, { ...reviewed, scope: 'execution' }, { ...reviewed, source_ref: '../private.md' }, { ...reviewed, content: 'private' }]) {
  assert(validateJudgmentReceipt({ ...example, reviewed_version: invalid }).length > 0);
}
const schema = JSON.parse(readFileSync(new URL('../protocol/judgment-receipt.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.required.includes('reviewed_version'), false, 'historical V1 remains compatible');
assert.deepEqual(schema.properties.reviewed_version.required, ['source_ref', 'sha256', 'scope']);
assert.equal(schema.properties.reviewed_version.properties.sha256.pattern, '^[a-f0-9]{64}$');
assert(validateJudgmentReceipt({ ...example, output: 'conteúdo proibido' }).some((error) => error.includes('não é permitido')));
assert(validateJudgmentReceipt({ ...example, prompt: 'conteúdo proibido' }).some((error) => error.includes('não é permitido')));
assert(validateJudgmentReceipt({ ...example, note: 'Bearer token-nao-pode-entrar-aqui' }).some((error) => error.includes('segredo')));
assert(validateJudgmentReceipt({
  ...example,
  verdict: 'rejected',
  action_intent: 'none',
  note: '',
}).some((error) => error.includes('note obrigatória')));
assert(validateJudgmentReceipt({
  ...example,
  verdict: 'rejected',
  action_intent: 'propose-action',
  note: 'Executar depois de revisar.',
}).some((error) => error.includes('propose-action exige')));
assert(validateJudgmentReceipt({
  ...example,
  privacy: { ...example.privacy, external_action_executed: true },
}).some((error) => error.includes('não executa ação externa')));

console.log('✓ Judgment Receipt fechado, privado e sem autorização externa implícita');

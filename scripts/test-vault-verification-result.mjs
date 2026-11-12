#!/usr/bin/env node
// A seção `## Verificação` de uma sessão importada decide `eval.passed`. Quando ela traz a
// saída de um gate, uma linha `✗` reprova a sessão em vez de contar como verificada.
import assert from 'node:assert/strict';
import { verificationResult } from './lib/vault-history.mjs';

const note = (verification) => `---
type: Note
---

# Sessão sintética

## O que foi feito

- trabalho da sessão
${verification === null ? '' : `\n## Verificação\n\n${verification}\n`}`;

assert.equal(verificationResult(note(null)), null, 'sem seção, eval fica neutro');
assert.equal(verificationResult(note('')), null, 'seção vazia não é evidência');
assert.equal(verificationResult(note('- conferido no Console')), true,
  'seção em prosa continua valendo como verificada');
assert.equal(verificationResult(note('```\n✓ g1_citacao_literal\n✓ g2_timestamp\n✓ g3_pii\n✓ g4_dono\n```')), true,
  'gate todo verde passa');
assert.equal(verificationResult(note('```\n✗ g1_citacao_literal\n    linha 9: citação não é literal\n✓ g2_timestamp\n```')), false,
  'uma linha ✗ reprova a sessão');
assert.equal(verificationResult(note('- antes havia um ✗ no meio da frase, já resolvido')), true,
  '✗ no meio do texto não é saída de gate');

console.log('vault-verification-result: ok');

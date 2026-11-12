#!/usr/bin/env node
// Projeção do motor sobre o vault: idempotência, bytes do dono, conflitos e recusa sem ponteiro.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, BEGIN, END } from './update.mjs';
import { planProjection } from './lib/projection.mjs';

const PRODUCT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'cerebro-projection-'));
const tag = 'v2.0.0';
const write = (root, ref, text) => { mkdirSync(dirname(join(root, ref)), { recursive: true }); writeFileSync(join(root, ref), text); };
const read = (root, ref) => readFileSync(join(root, ref), 'utf8');

function pack(name, skillBody = 'skill v1') {
  const source = join(temp, name);
  write(source, 'VERSION', '2.0.0\n');
  write(source, '.claude/skills/daily/SKILL.md', skillBody);
  write(source, '.claude/skills/daily/references/a.md', 'ref');
  write(source, '.agents/skills/daily/SKILL.md', skillBody);
  write(source, 'templates/vault/AGENTS.md', `${BEGIN}\nCONTRATO ${skillBody}\n${END}\n`);
  write(source, 'templates/vault/CLAUDE.md', 'aponta para AGENTS.md\n');
  write(source, 'templates/vault/GEMINI.md', 'aponta para AGENTS.md\n');
  write(source, 'templates/vault/.cerebro/bin/cerebro.mjs', '// launcher\n');
  write(source, 'templates/vault/.cerebro/manifest.json', '{"protocol":"company-brain"}\n');
  write(source, '.cerebro/layout.json', '{"version":3}\n');
  write(source, '.cerebro/vault-seed.manifest', 'meu-negocio\n.cerebro/layout.json\n.cerebro/manifest.json=templates/vault/.cerebro/manifest.json\n');
  write(source, 'meu-negocio/mapa.md', 'mapa semente');
  write(source, '.gitignore', 'privado/*\n');
  return source;
}
function vaultWithPointer(name) {
  const vault = join(temp, name);
  write(vault, '.cerebro/motor', `MOTOR_DIR=${join(temp, 'motor')}\nMOTOR_VERSION=1.0.0\n`);
  return vault;
}
const motorDir = join(temp, 'motor');
const plan = (vault, source, extra = {}) => planProjection(vault, source, { motorDir, tag, ...extra });
const apply = (vault, p) => applyPlan(vault, p, { approvePlan: p.digest });

try {
  // Recusa sem ponteiro (D5): um vault do dono não é tocado.
  const source = pack('pkg');
  const bare = join(temp, 'hugo-like'); write(bare, 'AGENTS.md', 'meu\n');
  assert.throws(() => plan(bare, source), /não é um vault do Cérebro/);
  assert.throws(() => plan(bare, source, { link: true }), /não é um vault do Cérebro/);
  assert.throws(() => plan(motorDir, source, { fresh: true }), /separate|motor/);

  // Vault clonado: o recibo é ignorado pelo Git e não vem junto. Aplicar exige o hash aprovado (M1).
  const cloned = vaultWithPointer('vault-clonado');
  write(cloned, 'AGENTS.md', 'meu\n');
  const clonedPlan = plan(cloned, source);
  assert.equal(clonedPlan.installed, true, 'sem recibo, o vault existente continua sendo existente');
  assert.throws(() => applyPlan(cloned, clonedPlan), /preview-approval-required/);
  assert.equal(existsSync(join(cloned, '.cerebro/projection-state.json')), false, 'nada gravado sem aprovação');
  assert.equal(plan(join(temp, 'novo-vault'), source, { fresh: true }).installed, false, 'instalação inicial não exige hash');

  // Lock que ficou para trás: mensagem legível, sem caminho absoluto, e o lock alheio não é apagado.
  const locked = vaultWithPointer('vault-lock');
  write(locked, '.cerebro/update.lock', '999999');
  const lockedPlan = plan(locked, source);
  let lockError;
  try { applyPlan(locked, lockedPlan, { approvePlan: lockedPlan.digest }); } catch (error) { lockError = error; }
  assert.match(lockError?.message || '', /update-in-progress/);
  assert.equal((lockError.message).includes(temp), false, 'sem caminho absoluto na mensagem');
  assert.equal(read(locked, '.cerebro/update.lock'), '999999');

  // CLAUDE.md do dono sem citar AGENTS.md: aviso na prévia, nunca conflito.
  const semCitar = vaultWithPointer('vault-claude-sem-agents');
  write(semCitar, 'CLAUDE.md', 'regras do dono\n');
  let warned = plan(semCitar, source);
  assert.deepEqual(warned.conflicts, []);
  assert.equal(warned.warnings.length, 1);
  assert.match(warned.warnings[0], /CLAUDE\.md.*AGENTS\.md/);
  write(semCitar, 'CLAUDE.md', 'regras do dono\nleia AGENTS.md\n');
  assert.deepEqual(plan(semCitar, source).warnings, []);

  // Primeira projeção; texto do dono fora do bloco e arquivos próprios preservados.
  const vault = vaultWithPointer('vault');
  write(vault, 'AGENTS.md', '# Meu vault\nregra minha\n');
  write(vault, 'CLAUDE.md', 'claude do dono\n');
  write(vault, '.claude/skills/minha/SKILL.md', 'skill do dono');
  let p = plan(vault, source);
  assert.deepEqual(p.conflicts, []);
  apply(vault, p);
  assert.equal(read(vault, '.claude/skills/daily/SKILL.md'), 'skill v1');
  assert.equal(read(vault, '.claude/skills/daily/references/a.md'), 'ref');
  assert.equal(read(vault, '.cerebro/bin/cerebro.mjs'), '// launcher\n');
  assert.equal(read(vault, '.cerebro/version'), '2.0.0\n');
  assert.match(read(vault, '.cerebro/motor'), /MOTOR_VERSION=2\.0\.0/);
  assert.equal(read(vault, 'CLAUDE.md'), 'claude do dono\n', 'CLAUDE.md existente nunca é sobrescrito');
  assert.equal(read(vault, 'GEMINI.md'), 'aponta para AGENTS.md\n');
  assert.equal(read(vault, '.claude/skills/minha/SKILL.md'), 'skill do dono');
  const agents = read(vault, 'AGENTS.md');
  assert(agents.startsWith('# Meu vault\nregra minha\n'), 'bytes fora do bloco preservados');
  assert(agents.includes(`${BEGIN}\nCONTRATO skill v1\n${END}`));
  assert.equal(read(vault, 'meu-negocio/mapa.md'), 'mapa semente');
  assert.equal(read(vault, '.cerebro/manifest.json'), '{"protocol":"company-brain"}\n');
  assert(read(vault, '.gitignore').includes('.cerebro/motor'));
  assert(!existsSync(join(vault, 'COMECE-AQUI.md')));

  // Idempotente: nada muda, nenhum backup novo.
  p = plan(vault, source);
  assert.ok(p.summary.every(e => e.action === 'unchanged'), JSON.stringify(p.summary.filter(e => e.action !== 'unchanged')));
  assert.equal(applyPlan(vault, p), null);

  // Seeds do dono não são sobrescritos.
  write(vault, 'meu-negocio/mapa.md', 'mapa do dono');
  write(vault, '.cerebro/layout.json', '{"custom":true}\n');

  // Versão nova: skill atualiza, bloco muda, texto do dono fica.
  const next = pack('pkg2', 'skill v2');
  p = plan(vault, next);
  assert.deepEqual(p.conflicts, []);
  apply(vault, p);
  assert.equal(read(vault, '.claude/skills/daily/SKILL.md'), 'skill v2');
  assert(read(vault, 'AGENTS.md').startsWith('# Meu vault\nregra minha\n'));
  assert(read(vault, 'AGENTS.md').includes('CONTRATO skill v2'));
  assert.equal(read(vault, 'meu-negocio/mapa.md'), 'mapa do dono');
  assert.equal(read(vault, '.cerebro/layout.json'), '{"custom":true}\n');

  // Skill editada no vault vira conflito e não é sobrescrita; aplicar recusa.
  write(vault, '.claude/skills/daily/SKILL.md', 'editada pelo dono');
  const third = pack('pkg3', 'skill v3');
  p = plan(vault, third);
  assert(p.conflicts.includes('.claude/skills/daily/SKILL.md'));
  assert.throws(() => apply(vault, p), /update-conflicts/);
  assert.equal(read(vault, '.claude/skills/daily/SKILL.md'), 'editada pelo dono');

  // Pasta de skill do dono com o mesmo nome também é conflito.
  const other = vaultWithPointer('vault-owner-skill');
  write(other, '.claude/skills/daily/NOTAS.md', 'minha pasta');
  p = plan(other, source);
  assert(p.conflicts.includes('.claude/skills/daily/SKILL.md'));
  assert.throws(() => apply(other, p), /update-conflicts/);
  assert.equal(existsSync(join(other, '.claude/skills/daily/SKILL.md')), false);

  // Instalação nova: sem ponteiro mas fresh.
  const fresh = join(temp, 'fresh');
  p = plan(fresh, source, { fresh: true });
  mkdirSync(fresh, { recursive: true });
  applyPlan(fresh, p);
  assert(existsSync(join(fresh, '.cerebro/projection-state.json')));

  // Pacote real do produto projeta sem conflito e traz o lançador e as skills oficiais.
  const real = vaultWithPointer('vault-real');
  const productTag = `v${readFileSync(join(PRODUCT, 'VERSION'), 'utf8').trim()}`;
  const rp = planProjection(real, PRODUCT, { motorDir, tag: productTag });
  assert.deepEqual(rp.conflicts, []);
  const paths = rp.summary.map(e => e.path);
  for (const f of ['.cerebro/bin/cerebro.mjs', '.claude/skills/comecar/SKILL.md', '.agents/skills/comecar/SKILL.md', 'AGENTS.md', 'meu-negocio/mapa.md']) assert(paths.includes(f), f);
  assert(!paths.some(f => f.startsWith('scripts/') || f === 'COMECE-AQUI.md' || f.startsWith('protocol/')));
  console.log('projection: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

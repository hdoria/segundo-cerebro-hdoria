#!/usr/bin/env node
// Guardas de instalação: seeds do dono vencem o motor, motor dividido não vira pasta única,
// instalação nova não cabe dentro de outra e rollback remove só o que a execução criou.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, planUpdate } from './update.mjs';
import { installPackage } from './install.mjs';

const PRODUCT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(join(PRODUCT, 'VERSION'), 'utf8').trim();
const tag = `v${version}`;
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'cerebro-install-guards-')));
const write = (root, ref, text) => { mkdirSync(dirname(join(root, ref)), { recursive: true }); writeFileSync(join(root, ref), text); };
const read = (root, ref) => readFileSync(join(root, ref), 'utf8');

function pack(name, { number, motorManifest, seedManifest, extra = {} }) {
  const source = join(temp, name);
  write(source, 'VERSION', `${number}\n`);
  write(source, '.cerebro/motor.manifest', motorManifest);
  write(source, '.cerebro/seed.manifest', seedManifest);
  write(source, 'README.md', `readme ${number}\n`);
  write(source, 'scripts/x.mjs', `// ${number}\n`);
  for (const [ref, text] of Object.entries(extra)) write(source, ref, text);
  return source;
}

try {
  // M3: README é seed (do dono depois da primeira cópia), mesmo quando o motor.manifest novo o lista.
  const oldPack = pack('old', { number: '1.0.0', motorManifest: 'VERSION\nscripts\n', seedManifest: 'README.md\n' });
  const newPack = pack('new', { number: '1.1.0', motorManifest: 'VERSION\nREADME.md\nscripts\n', seedManifest: 'README.md\n' });
  const single = join(temp, 'single');
  mkdirSync(single);
  applyPlan(single, planUpdate(single, oldPack, 'v1.0.0'));
  assert.equal(read(single, 'README.md'), 'readme 1.0.0\n');
  write(single, 'README.md', 'readme do dono\n');
  const plan = planUpdate(single, newPack, 'v1.1.0');
  assert.deepEqual(plan.conflicts, [], `conflitos inesperados: ${plan.conflicts}`);
  applyPlan(single, plan, { approvePlan: plan.digest });
  assert.equal(read(single, 'README.md'), 'readme do dono\n', 'README editado pelo dono é preservado');
  assert.equal(read(single, 'VERSION'), '1.1.0\n');

  // M3 com o pacote real de 9efdd31, quando o histórico está disponível.
  let archive = null;
  try {
    const out = join(temp, 'prev');
    mkdirSync(out);
    const tar = execFileSync('git', ['-C', PRODUCT, 'archive', '9efdd31'], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    execFileSync('tar', ['-x', '-C', out], { input: tar });
    archive = out;
  } catch { /* sem histórico: o teste sintético acima cobre a regra */ }
  if (archive) {
    const prevTag = `v${read(archive, 'VERSION').trim()}`;
    const root = join(temp, 'real-single');
    mkdirSync(root);
    applyPlan(root, planUpdate(root, archive, prevTag));
    write(root, 'README.md', 'readme editado\n');
    const real = planUpdate(root, PRODUCT, tag);
    assert.deepEqual(real.conflicts, [], `conflitos com o pacote real: ${real.conflicts}`);
    applyPlan(root, real, { approvePlan: real.digest });
    assert.equal(read(root, 'README.md'), 'readme editado\n');
  }

  // M2: o motor de instalação dividida e o vault com ponteiro nunca são tratados como pasta única.
  const motorFolder = join(temp, 'motor-folder');
  write(motorFolder, '.cerebro/motor-install.json', '{"role":"motor"}\n');
  assert.throws(() => planUpdate(motorFolder, newPack, 'v1.1.0'), /split-install/);
  const vaultFolder = join(temp, 'vault-folder');
  write(vaultFolder, '.cerebro/motor', `MOTOR_DIR=${motorFolder}\n`);
  assert.throws(() => planUpdate(vaultFolder, newPack, 'v1.1.0'), /split-install/);
  assert.equal(existsSync(join(motorFolder, 'README.md')), false);

  // M4: destino dentro de vault ou motor existente é recusado, com qualquer marcador.
  for (const marker of ['.cerebro/motor', '.cerebro/motor-install.json', '.cerebro/motor.manifest']) {
    const existing = join(temp, `existing-${marker.replace(/\W/g, '')}`);
    write(existing, marker, 'x\n');
    const other = join(temp, 'fora', 'motor');
    assert.throws(() => installPackage({ vault: join(existing, 'sub'), motor: other }, PRODUCT, tag, { apply: true }), /destination-inside-installation/);
    assert.throws(() => installPackage({ vault: join(temp, 'fora', 'notas'), motor: join(existing, 'deep', 'motor') }, PRODUCT, tag, { apply: true }), /destination-inside-installation/);
    assert.equal(existsSync(join(existing, 'sub')), false);
    assert.equal(existsSync(join(existing, 'deep')), false);
  }
  assert.equal(existsSync(join(temp, 'fora')), false, 'nada criado fora do destino recusado');

  // Rollback: pais criados com recursive somem; pai que já existia fica.
  const base = join(temp, 'base');
  mkdirSync(base);
  const failing = { vault: join(base, 'a', 'b', 'notas'), motor: join(base, 'c', 'motor') };
  assert.throws(() => installPackage(failing, PRODUCT, tag, { apply: true, write: () => { throw new Error('disco cheio'); } }), /installation-failed/);
  assert.equal(existsSync(base), true, 'pai preexistente preservado');
  assert.deepEqual([existsSync(join(base, 'a')), existsSync(join(base, 'c'))], [false, false], 'pais criados pela execução removidos');

  // Instalação normal continua funcionando nos mesmos caminhos.
  const ok = installPackage(failing, PRODUCT, tag, { apply: true });
  assert.equal(ok.status, 'installed');
  console.log('install-guards: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

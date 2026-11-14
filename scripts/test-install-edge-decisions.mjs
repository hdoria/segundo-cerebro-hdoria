#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foreignNotesAncestor } from './install.mjs';
import { isProjectedVault } from './lib/installation.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const base = realpathSync(mkdtempSync(join(tmpdir(), 'cerebro-edges-')));
const write = (path, content = '') => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
const BEGIN = '<!-- CEREBRO:MANAGED:BEGIN -->';
const END = '<!-- CEREBRO:MANAGED:END -->';

try {
  const cited = join(base, 'citado');
  write(join(cited, 'AGENTS.md'), `# Meu vault\nO Cérebro usa ${BEGIN} e ${END} para marcar o bloco dele.\n`);
  assert.equal(isProjectedVault(cited), false, 'AGENTS.md que só cita os marcadores não é vault projetado');
  const reversed = join(base, 'invertido');
  write(join(reversed, 'AGENTS.md'), `${END}\ntexto\n${BEGIN}\n`);
  assert.equal(isProjectedVault(reversed), false, 'marcadores fora de ordem não valem');
  const projected = join(base, 'projetado');
  write(join(projected, 'AGENTS.md'), `# Meu vault\n\n${BEGIN}\ncontrato\n${END}\n`);
  assert.equal(isProjectedVault(projected), true, 'bloco gerenciado de verdade continua valendo');

  write(join(base, 'obsidian', '.obsidian', 'app.json'), '{}');
  assert.equal(foreignNotesAncestor(join(base, 'obsidian', 'sub', 'notas')), join(base, 'obsidian'), 'vault Obsidian acima do destino gera aviso');
  write(join(base, 'tolaria', 'type', 'project.md'));
  write(join(base, 'tolaria', 'views', 'home.md'));
  assert.equal(foreignNotesAncestor(join(base, 'tolaria', 'notas')), join(base, 'tolaria'), 'vault Tolaria acima do destino gera aviso');
  assert.equal(foreignNotesAncestor(join(base, 'limpa', 'Cerebro', 'notas')), null, 'pasta comum não gera aviso');

  const seeds = readFileSync(join(ROOT, '.cerebro/seed.manifest'), 'utf8').split('\n');
  for (const license of ['LICENSE', 'LICENSE-CONTEUDO.md']) {
    assert.equal(seeds.includes(license), false, `${license} é termo do produto e acompanha a versão, não vira seed do dono`);
  }

  const vault = join(base, 'vault');
  const motorA = join(base, 'motor-a');
  const motorB = join(base, 'motor-b');
  copyFileSync(join(ROOT, 'templates/vault/.cerebro/bin/cerebro.mjs'), (mkdirSync(join(vault, '.cerebro/bin'), { recursive: true }), join(vault, '.cerebro/bin/cerebro.mjs')));
  write(join(vault, '.cerebro/motor'), `MOTOR_DIR=${motorA}\n`);
  for (const motor of [motorA, motorB]) {
    write(join(motor, '.cerebro/motor-install.json'), '{"role":"motor"}\n');
    write(join(motor, 'scripts/update.mjs'), `console.log('update de ${motor}');\n`);
    write(join(motor, 'scripts/vault-sync.mjs'), `console.log('sync de ${motor}');\n`);
  }
  const run = (command) => spawnSync(process.execPath, [join(vault, '.cerebro/bin/cerebro.mjs'), command], {
    cwd: vault, encoding: 'utf8', env: { ...process.env, CEREBRO_MOTOR_DIR: motorB },
  });
  const update = run('update');
  assert.equal(update.status, 1, 'update com CEREBRO_MOTOR_DIR diferente do ponteiro é recusado');
  assert.match(update.stderr, /CEREBRO_MOTOR_DIR aponta para/);
  assert.doesNotMatch(update.stdout, /update de/, 'nenhum código de motor roda');
  const sync = run('vault-sync');
  assert.equal(sync.status, 0, 'outros comandos seguem aceitando a variável');
  assert.match(sync.stdout, /sync de .*motor-b/);
  const same = spawnSync(process.execPath, [join(vault, '.cerebro/bin/cerebro.mjs'), 'update'], {
    cwd: vault, encoding: 'utf8', env: { ...process.env, CEREBRO_MOTOR_DIR: motorA },
  });
  assert.equal(same.status, 0, 'variável igual ao ponteiro segue valendo');
} finally {
  rmSync(base, { recursive: true, force: true });
}

console.log('✓ instalação em duas pastas: decisões dos pontos baixos travadas em teste');

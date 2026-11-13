#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(new URL('node_modules/esbuild/', `file://${root}`))) {
  console.log('- bundles do Console: sem esbuild instalado, verificação pulada');
  process.exit(0);
}
const result = spawnSync(process.execPath, ['scripts/build-console.mjs', '--check'], { cwd: root, encoding: 'utf8' });
assert.equal(result.status, 0, `${result.stdout}${result.stderr}`.trim());
console.log('✓ bundles do Console batem com a fonte e não carregam caminho da máquina');

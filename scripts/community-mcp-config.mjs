#!/usr/bin/env node
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSplitMotor } from './lib/installation.mjs';

// O servidor MCP mora no motor, ao lado deste script; o --root aponta para o vault, onde ficam a
// identidade e a credencial. Na instalação de pasta única as duas pastas são a mesma.
const MOTOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function communityMcpConfiguration({ root, node = process.execPath, motor = MOTOR }) {
  const target = realpathSync(resolve(root));
  if (!isAbsolute(node) || !lstatSync(node).isFile()) throw new Error('node-path-invalid');
  if (isSplitMotor(target)) throw new Error('root-is-motor');
  const script = join(realpathSync(motor), 'scripts', 'community-mcp.mjs');
  if (!lstatSync(script).isFile()) throw new Error('community-mcp-script-missing');
  return { mcpServers: { 'cerebro-comunidade': { command: node, args: [script, `--root=${target}`] } } };
}

// Aceita `--root=<vault>` ou nenhum argumento com CEREBRO_INSTALL_ROOT, que o lançador define.
export function configRootFromCli(args, env = process.env) {
  if (args.length === 1 && args[0].startsWith('--root=') && args[0].slice(7)) return args[0].slice(7);
  if (args.length === 0 && env.CEREBRO_INSTALL_ROOT) return env.CEREBRO_INSTALL_ROOT;
  throw new Error('root-required');
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = configRootFromCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(communityMcpConfiguration({ root }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(error.message === 'root-is-motor'
      ? 'A pasta informada é o motor. Informe o vault, onde ficam a identidade e a credencial. A configuração global não foi alterada.\n'
      : 'Rode node .cerebro/bin/cerebro.mjs community-mcp-config na raiz do vault, ou informe --root=/caminho/do/vault. A configuração global não foi alterada.\n');
    process.exitCode = 1;
  }
}

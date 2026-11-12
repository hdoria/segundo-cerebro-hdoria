#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';

export function parseConsoleArgs(args, env = process.env) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = { root: env.CEREBRO_INSTALL_ROOT || '', port: 4782, open: true, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--no-open' && !seen.has(arg)) { seen.add(arg); options.open = false; continue; }
    const match = arg.match(/^--(root|port)(?:=(.*))?$/);
    if (!match || seen.has(match[1])) throw Error('console-arguments-invalid');
    seen.add(match[1]);
    const value = match[2] ?? args[++index];
    if (!value || value.startsWith('--')) throw Error('console-arguments-invalid');
    if (match[1] === 'root') options.root = value;
    else {
      if (!/^\d+$/.test(value) || Number(value) > 65535) throw Error('console-arguments-invalid');
      options.port = Number(value);
    }
  }
  if (!options.root) throw Error('console-root-required');
  options.root = resolve(options.root);
  return options;
}

export async function openConsoleBrowser(url, { platform = process.platform, spawn: spawnImpl = spawn } = {}) {
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await new Promise((done, reject) => {
    const fail = () => reject(Error('console-browser-unavailable'));
    let child;
    try { child = spawnImpl(command, args, { stdio: 'ignore', shell: false, windowsHide: true, timeout: 5000 }); }
    catch { fail(); return; }
    child.once('error', fail);
    child.once('close', (code) => code === 0 ? done() : fail());
  });
}

export async function launchConsole({ root, port = 4782, open = true }, { opener = openConsoleBrowser } = {}) {
  if (!root) throw Error('console-root-required');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('console-arguments-invalid');
  const instance = createConsoleServer({ root: resolve(root) });
  await new Promise((done, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(port, '127.0.0.1', done);
  });
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  let open_error = null;
  if (open) {
    try { await opener(url); } catch { open_error = 'console-browser-unavailable'; }
  }
  return { ...instance, url, open_error };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseConsoleArgs(process.argv.slice(2));
    if (options.help) console.log('Uso: node scripts/console.mjs --root /caminho/do/cerebro [--port 4782] [--no-open]');
    else {
      const instance = await launchConsole(options);
      console.log(`Cérebro hdoria · ${instance.url}`);
      if (instance.open_error) console.log('Não foi possível abrir o navegador. Abra o endereço acima.');
    }
  } catch (error) {
    const reason = error?.code === 'EADDRINUSE' ? 'console-port-in-use'
      : /^[a-z]+(?:-[a-z]+)+$/.test(error?.message || '') ? error.message : 'console-start-failed';
    console.error(`console: ${reason}`);
    process.exitCode = 1;
  }
}

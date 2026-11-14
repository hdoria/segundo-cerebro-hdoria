// Agendador local do tick de rotinas. Quem roda rotina pelo motor precisa de algo que chame
// `routine-runtime tick` de tempos em tempos: launchd no macOS, Agendador de Tarefas no Windows,
// systemd user timer ou crontab no Linux. Gerar plano e arquivos é puro; executar launchctl,
// schtasks, systemctl e crontab passa por um executor injetável. Tudo o que criamos leva a label
// `me.hdoria.cerebro.tick.<hash do vault>`, e remover apaga só o que tem essa label.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const DEFAULT_INTERVAL_MINUTES = 15;
export const LABEL_PREFIX = 'me.hdoria.cerebro.tick.';
export const LAST_TICK_REF = '.cerebro/runtime/scheduler/last-tick.json';
const LOG_REF = '.cerebro/runtime/scheduler/tick.log';
const LAUNCHER_REF = '.cerebro/bin/cerebro.mjs';

function realOrResolved(path) {
  const abs = resolve(path);
  try { return realpathSync(abs); } catch { return abs; }
}

// A label sai do caminho real do vault: symlink para a mesma pasta não gera agendamento duplicado.
export function schedulerLabel(root) {
  return `${LABEL_PREFIX}${createHash('sha256').update(realOrResolved(root)).digest('hex').slice(0, 8)}`;
}

export function normalizeInterval(value = DEFAULT_INTERVAL_MINUTES) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
    throw new Error('intervalo inválido: use minutos inteiros entre 5 e 720');
  }
  if (minutes >= 60 && minutes % 60 !== 0) {
    throw new Error('intervalo inválido: a partir de 60 minutos use múltiplos de 60');
  }
  return minutes;
}

const xml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
const cronEsc = (v) => v.replace(/%/g, '\\%');
// `$` só é especial no ExecStart (expansão de variável); em Environment= vale literal.
const sdq = (v, { dollar = true } = {}) => {
  const quoted = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  return `"${dollar ? quoted.replace(/\$/g, '$$$$') : quoted}"`;
};

const hasLineBreak = (v) => /[\r\n]/.test(String(v));
const isAbsoluteEntry = (entry, platform) => (platform === 'win32'
  ? /^[A-Za-z]:[\\/]/.test(entry)
  : entry.startsWith('/'));

// PATH gravado sem entradas relativas: no agendador o diretório de trabalho não é o do terminal.
export function sanitizePath(envPath = '', platform = process.platform) {
  const sep = platform === 'win32' ? ';' : ':';
  return String(envPath).split(sep).filter((entry) => entry && isAbsoluteEntry(entry, platform)).join(sep);
}

const VERSIONED_NODE = /[\\/](\.nvm|\.volta|\.fnm|fnm_multishells|\.asdf|\.nodenv)[\\/]|[\\/]fnm[\\/]/;

function isNodeFile(path) {
  try { return statSync(path).isFile() && basename(realpathSync(path)).startsWith('node'); } catch { return false; }
}

// process.execPath aponta para o binário de uma versão e quebra quando ela é trocada ou removida.
// Prefere o link estável: `<prefix>/bin/node` no Homebrew, o primeiro `node` do PATH para nvm,
// volta e fnm. Sem alternativa válida, mantém o execPath.
export function stableNodePath({ execPath = process.execPath, envPath = '', platform = process.platform } = {}) {
  if (platform === 'win32') return execPath;
  // Homebrew: Cellar/<fórmula>/<versão>/bin/node vira opt/<fórmula>/bin/node, que acompanha
  // o upgrade da mesma fórmula (node@20 continua node@20).
  const cellar = /^(.*)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(execPath);
  if (cellar) {
    const link = join(cellar[1], 'opt', cellar[2], 'bin', 'node');
    return isNodeFile(link) ? link : execPath;
  }
  // nvm, fnm e volta: só troca por um caminho do PATH que aponte para este mesmo binário e não
  // seja efêmero (o fnm cria um link por terminal que some quando ele fecha). Outro node do PATH
  // seria outra versão; sem caminho melhor, fica o binário em uso.
  if (VERSIONED_NODE.test(execPath)) {
    const self = realOrResolved(execPath);
    for (const dir of sanitizePath(envPath, platform).split(':').filter(Boolean)) {
      const candidate = join(dir, 'node');
      if (candidate === execPath || /fnm_multishells/.test(candidate) || !isNodeFile(candidate)) continue;
      if (realOrResolved(candidate) === self) return candidate;
    }
  }
  return execPath;
}

// macOS pode barrar o launchd nessas pastas sem Acesso Total ao Disco.
function protectedFolderWarning(vault, home, platform) {
  if (platform !== 'darwin') return [];
  const folders = [join(home, 'Documents'), join(home, 'Desktop'), join(home, 'Library', 'Mobile Documents')];
  const inside = (path, folder) => path === folder || path.startsWith(`${folder}/`);
  const candidates = [vault, realOrResolved(vault)];
  const hit = folders.some((folder) => candidates.some((c) => inside(c, folder) || inside(c, realOrResolved(folder))));
  return hit ? ['o vault está em Documentos, Mesa ou iCloud Drive: o macOS pode barrar o acesso do agendador a essa pasta; se o tick não rodar, dê Acesso Total ao Disco ao node em Ajustes do Sistema > Privacidade e Segurança'] : [];
}

export function cronSchedule(minutes) {
  return minutes < 60 ? `*/${minutes} * * * *` : `0 */${minutes / 60} * * *`;
}

export function cronMarker(label) {
  return `# ${label}`;
}

// Plano sem efeito colateral. `kind`: launchd | schtasks | systemd | cron.
export function planScheduler({
  platform = process.platform, root, home = homedir(), nodePath = process.execPath,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES, linuxMode = 'systemd', envPath = '', uid = 0,
}) {
  const vault = resolve(root);
  for (const [name, value] of [['vault', vault], ['node', nodePath]]) {
    if (hasLineBreak(value)) throw new Error(`caminho do ${name} com quebra de linha não é suportado pelo agendador`);
  }
  envPath = sanitizePath(envPath, platform);
  const minutes = normalizeInterval(intervalMinutes);
  const label = schedulerLabel(vault);
  const launcher = join(vault, LAUNCHER_REF);
  const log = join(vault, LOG_REF);
  const argv = [nodePath, launcher, 'routine-runtime', 'tick'];
  const base = {
    label, root: vault, intervalMinutes: minutes, command: argv, nodePath, log,
    dirs: [dirname(log)], warnings: protectedFolderWarning(vault, home, platform),
  };

  if (platform === 'darwin') {
    const path = join(home, 'Library', 'LaunchAgents', `${label}.plist`);
    const env = envPath ? `  <key>EnvironmentVariables</key>\n  <dict><key>PATH</key><string>${xml(envPath)}</string></dict>\n` : '';
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argv.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${xml(vault)}</string>
${env}  <key>StartInterval</key><integer>${minutes * 60}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
    return { ...base, platform, kind: 'launchd', uid, domain: `gui/${uid}`, files: [{ path, content }] };
  }

  if (platform === 'win32') {
    const taskRun = argv.map((a) => `"${a}"`).join(' ');
    return { ...base, platform, kind: 'schtasks', taskName: label, taskRun, files: [] };
  }

  if (linuxMode === 'cron') {
    const prefix = envPath ? `PATH=${shq(envPath)} ` : '';
    const command = `${prefix}${argv.map(shq).join(' ')} >> ${shq(log)} 2>&1`;
    const line = `${cronSchedule(minutes)} ${cronEsc(command)} ${cronMarker(label)}`;
    return { ...base, platform, kind: 'cron', marker: cronMarker(label), cronLine: line, files: [] };
  }

  const dir = join(home, '.config', 'systemd', 'user');
  const header = `# ${label} (gerado pelo Cérebro, remover com scheduler-remove)`;
  const service = `${header}
[Unit]
Description=Tick das rotinas do Cérebro

[Service]
Type=oneshot
WorkingDirectory=${vault.replace(/%/g, '%%')}
${envPath ? `Environment=${sdq(`PATH=${envPath}`, { dollar: false })}\n` : ''}ExecStart=${argv.map(sdq).join(' ')}
`;
  const timer = `${header}
[Unit]
Description=Agenda do tick das rotinas do Cérebro

[Timer]
OnBootSec=2min
OnUnitActiveSec=${minutes}min

[Install]
WantedBy=timers.target
`;
  return {
    ...base, platform, kind: 'systemd', unit: `${label}.timer`,
    files: [
      { path: join(dir, `${label}.service`), content: service },
      { path: join(dir, `${label}.timer`), content: timer },
    ],
  };
}

// Edição pura do crontab: troca ou tira só as linhas com o nosso marcador.
function ownCronLine(line, marker) {
  return line.trimEnd().endsWith(` ${marker}`);
}
export function removeCronLine(text, marker) {
  return text.split('\n').filter((line) => !ownCronLine(line, marker)).join('\n');
}
export function applyCronLine(text, plan) {
  const kept = removeCronLine(text, plan.marker).split('\n').filter((l, i, all) => !(i === all.length - 1 && l === ''));
  return `${[...kept, plan.cronLine].join('\n')}\n`;
}

export function defaultExecutor(command, args, { input } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, timeout: 30_000 });
  if (result.error) return { status: 127, stdout: '', stderr: result.error.message };
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

const ok = (r) => r.status === 0;

export function detectLinuxMode(exec = defaultExecutor) {
  return ok(exec('systemctl', ['--user', 'show-environment'])) ? 'systemd' : 'cron';
}

export function resolvePlan(options = {}) {
  const platform = options.platform || process.platform;
  const linuxMode = options.linuxMode
    || (platform !== 'darwin' && platform !== 'win32' ? detectLinuxMode(options.exec || defaultExecutor) : 'systemd');
  const envPath = sanitizePath(options.envPath ?? process.env.PATH ?? '', platform);
  return planScheduler({
    ...options, platform, linuxMode, envPath,
    nodePath: options.nodePath || stableNodePath({ execPath: process.execPath, envPath, platform }),
    uid: options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : 0),
  });
}

// Só "no crontab for <user>" vale como crontab vazio. Qualquer outra falha (timeout, binário
// ausente, erro) aborta: gravar a partir de um "vazio" falso apagaria o crontab da pessoa.
function readCrontab(exec) {
  const r = exec('crontab', ['-l']);
  if (ok(r)) return r.stdout;
  if (r.status !== 127 && /no crontab for/i.test(r.stderr || '')) return '';
  fail('crontab -l', r);
}
function writeCrontab(exec, text) {
  const r = exec('crontab', ['-'], { input: text });
  if (!ok(r)) throw new Error(`crontab recusou a gravação: ${(r.stderr || '').trim().slice(0, 200)}`);
}

function assertLauncher(plan) {
  if (!existsSync(plan.command[1])) {
    throw new Error('o vault não tem o lançador .cerebro/bin/cerebro.mjs; rode /atualizar antes de ligar o agendador');
  }
}

function fail(step, r) {
  throw new Error(`${step} falhou: ${(r.stderr || r.stdout || `status ${r.status}`).trim().slice(0, 200)}`);
}

const BOOTOUT_ATTEMPTS = 20;
const BOOTOUT_WAIT_MS = 250;
export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function installScheduler(plan, { exec = defaultExecutor, sleep = sleepSync } = {}) {
  assertLauncher(plan);
  // Pastas que o plano referencia (o log do tick, por exemplo) precisam existir antes de registrar:
  // o redirecionamento do cron e o StandardOutPath do launchd falham sem elas.
  for (const dir of plan.dirs || []) mkdirSync(dir, { recursive: true });
  // Lê o crontab antes de qualquer escrita: se não der para ler com segurança, nada é gravado.
  const crontab = plan.kind === 'cron' ? readCrontab(exec) : null;
  for (const file of plan.files) writeAtomic(file.path, file.content);

  if (plan.kind === 'launchd') {
    const target = `${plan.domain}/${plan.label}`;
    if (ok(exec('launchctl', ['print', target]))) {
      exec('launchctl', ['bootout', target]);
      // bootout é assíncrono: bootstrap logo em seguida falha com "Bootstrap failed: 5".
      let gone = false;
      for (let i = 0; i < BOOTOUT_ATTEMPTS && !gone; i += 1) {
        gone = !ok(exec('launchctl', ['print', target]));
        if (!gone) sleep(BOOTOUT_WAIT_MS);
      }
      if (!gone) throw new Error('o serviço antigo do launchd não saiu a tempo; rode scheduler-install de novo em alguns segundos');
    }
    const r = exec('launchctl', ['bootstrap', plan.domain, plan.files[0].path]);
    if (!ok(r)) {
      throw new Error(`o launchd recusou o agendamento (launchctl bootstrap falhou: ${(r.stderr || r.stdout || `status ${r.status}`).trim().slice(0, 200)}); o agendador não está ativo`);
    }
  } else if (plan.kind === 'schtasks') {
    const r = exec('schtasks', ['/Create', '/TN', plan.taskName, '/TR', plan.taskRun,
      '/SC', 'MINUTE', '/MO', String(plan.intervalMinutes), '/F']);
    if (!ok(r)) fail('schtasks /Create', r);
  } else if (plan.kind === 'systemd') {
    const reload = exec('systemctl', ['--user', 'daemon-reload']);
    if (!ok(reload)) fail('systemctl daemon-reload', reload);
    const enable = exec('systemctl', ['--user', 'enable', '--now', plan.unit]);
    if (!ok(enable)) fail('systemctl enable', enable);
    exec('systemctl', ['--user', 'restart', plan.unit]);
  } else if (plan.kind === 'cron') {
    writeCrontab(exec, applyCronLine(crontab, plan));
  }
  return { ...detectScheduler(plan, { exec }), warnings: plan.warnings || [] };
}

export function detectScheduler(plan, { exec = defaultExecutor, now = () => new Date() } = {}) {
  let installed = false;
  let active = false;
  let error;
  if (plan.kind === 'launchd') {
    installed = existsSync(plan.files[0].path);
    active = ok(exec('launchctl', ['print', `${plan.domain}/${plan.label}`]));
  } else if (plan.kind === 'schtasks') {
    installed = ok(exec('schtasks', ['/Query', '/TN', plan.taskName]));
    active = installed;
  } else if (plan.kind === 'systemd') {
    installed = plan.files.every((f) => existsSync(f.path));
    active = installed && ok(exec('systemctl', ['--user', 'is-active', plan.unit]));
  } else if (plan.kind === 'cron') {
    try {
      installed = readCrontab(exec).split('\n').some((l) => ownCronLine(l, plan.marker));
    } catch (e) { error = e.message; }
    active = installed;
  }
  const lastTick = readLastTick(plan.root);
  return {
    platform: plan.platform, kind: plan.kind, label: plan.label, installed, active,
    interval_minutes: plan.intervalMinutes, node: plan.nodePath, last_tick: lastTick,
    stale: isStale(lastTick, plan.intervalMinutes, now()),
    ...(error ? { error } : {}),
  };
}

// Atrasado: o último tick terminou há mais de 3 intervalos.
function isStale(lastTick, intervalMinutes, now) {
  const at = Date.parse(lastTick?.finished_at || lastTick?.started_at || '');
  return Number.isFinite(at) && now.getTime() - at > 3 * intervalMinutes * 60_000;
}

function ownedFile(file, label) {
  try { return readFileSync(file.path, 'utf8').includes(label); } catch { return false; }
}

export function removeScheduler(plan, { exec = defaultExecutor } = {}) {
  if (plan.kind === 'launchd') {
    if (plan.files.some((f) => ownedFile(f, plan.label))) exec('launchctl', ['bootout', `${plan.domain}/${plan.label}`]);
  } else if (plan.kind === 'schtasks') {
    if (ok(exec('schtasks', ['/Query', '/TN', plan.taskName]))) {
      const r = exec('schtasks', ['/Delete', '/TN', plan.taskName, '/F']);
      if (!ok(r)) fail('schtasks /Delete', r);
    }
  } else if (plan.kind === 'systemd') {
    if (plan.files.some((f) => ownedFile(f, plan.label))) exec('systemctl', ['--user', 'disable', '--now', plan.unit]);
  } else if (plan.kind === 'cron') {
    const current = readCrontab(exec);
    const next = removeCronLine(current, plan.marker);
    if (next !== current) writeCrontab(exec, next);
  }
  for (const file of plan.files) if (ownedFile(file, plan.label)) rmSync(file.path, { force: true });
  if (plan.kind === 'systemd') exec('systemctl', ['--user', 'daemon-reload']);
  return detectScheduler(plan, { exec });
}

// Última execução do tick, para o Console mostrar depois.
export function readLastTick(root) {
  try { return JSON.parse(readFileSync(join(root, LAST_TICK_REF), 'utf8')); } catch { return null; }
}

export function recordTick(root, data) {
  writeAtomic(join(root, LAST_TICK_REF), `${JSON.stringify(data, null, 2)}\n`);
}

export async function runTickAndRecord(root, tick, { clock = () => new Date() } = {}) {
  const startedAt = clock().toISOString();
  try {
    const results = await tick(root);
    const failed = results.filter((r) => !['completed', 'no-change'].includes(r.status)).length;
    recordTick(root, { started_at: startedAt, finished_at: clock().toISOString(), ok: failed === 0, runs: results.length, failed });
    return results;
  } catch (error) {
    recordTick(root, {
      started_at: startedAt, finished_at: clock().toISOString(), ok: false, runs: 0, failed: 0,
      error: String(error instanceof Error ? error.message : error).slice(0, 200),
    });
    throw error;
  }
}

export function schedulerStatus(root, options = {}) {
  return detectScheduler(resolvePlan({ ...options, root }), { exec: options.exec, now: options.now });
}

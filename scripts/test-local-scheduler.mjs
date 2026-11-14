#!/usr/bin/env node
// Agendador local do tick: plano das três plataformas, instalar, detectar, idempotência, última
// execução do tick e remoção que não toca em agendamento de terceiros. Executor falso e pastas
// temporárias: nada chama launchctl, schtasks, systemctl ou crontab de verdade.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyCronLine,
  detectScheduler,
  installScheduler,
  planScheduler,
  readLastTick,
  recordTick,
  removeCronLine,
  removeScheduler,
  resolvePlan,
  runTickAndRecord,
  sanitizePath,
  schedulerLabel,
  schedulerStatus,
  stableNodePath,
} from './lib/local-scheduler.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'fictional-scheduler-'));
const vault = join(tmp, 'vault ficticio');
const home = join(tmp, 'home');
mkdirSync(join(vault, '.cerebro', 'bin'), { recursive: true });
mkdirSync(home, { recursive: true });
writeFileSync(join(vault, '.cerebro', 'bin', 'cerebro.mjs'), '// launcher ficticio\n');
const NODE = '/opt/fictional/bin/node';
const label = schedulerLabel(vault);
const common = { root: vault, home, nodePath: NODE, envPath: '/opt/fictional/bin:/usr/bin', uid: 501 };

// Executor falso: registra chamadas e simula launchd/schtasks/systemd/crontab em memória.
function fakeExecutor({ crontab = null, systemd = true, crontabError = null, bootoutLag = 0 } = {}) {
  const state = { loaded: new Set(), tasks: new Set(), enabled: new Set(), crontab, calls: [], draining: new Map() };
  const exec = (cmd, args, { input } = {}) => {
    state.calls.push([cmd, ...args].join(' '));
    const done = (status = 0, stdout = '') => ({ status, stdout, stderr: '' });
    if (cmd === 'launchctl') {
      const target = args[1];
      if (args[0] === 'print') {
        const left = state.draining.get(target) || 0;
        if (left > 0) { state.draining.set(target, left - 1); return done(0); }
        return done(state.loaded.has(target) ? 0 : 113);
      }
      if (args[0] === 'bootout') {
        state.loaded.delete(target);
        if (bootoutLag) state.draining.set(target, bootoutLag);
        return done();
      }
      if (args[0] === 'bootstrap') {
        const name = args[2].split('/').pop().replace(/\.plist$/, '');
        const key = `${args[1]}/${name}`;
        if ((state.draining.get(key) || 0) > 0 || state.loaded.has(key)) {
          return { status: 5, stdout: '', stderr: 'Bootstrap failed: 5: Input/output error' };
        }
        if (state.rejectBootstrap) return { status: 5, stdout: '', stderr: 'Bootstrap failed: 5' };
        state.loaded.add(key);
        return done();
      }
    }
    if (cmd === 'schtasks') {
      const name = args[args.indexOf('/TN') + 1];
      if (args[0] === '/Create') { state.tasks.add(name); return done(); }
      if (args[0] === '/Query') return done(state.tasks.has(name) ? 0 : 1);
      if (args[0] === '/Delete') { state.tasks.delete(name); return done(); }
    }
    if (cmd === 'systemctl') {
      if (!systemd) return done(127);
      const unit = args.at(-1);
      if (args.includes('enable')) state.enabled.add(unit);
      if (args.includes('disable')) state.enabled.delete(unit);
      if (args.includes('is-active')) return done(state.enabled.has(unit) ? 0 : 3);
      return done();
    }
    if (cmd === 'crontab') {
      if (args[0] === '-l') {
        if (crontabError) return crontabError;
        return state.crontab === null ? { status: 1, stdout: '', stderr: 'crontab: no crontab for fictional' } : done(0, state.crontab);
      }
      if (args[0] === '-') { state.crontab = input; return done(); }
    }
    return done(127);
  };
  return { exec, state };
}

try {
  // plano é puro: não cria nada
  const mac = planScheduler({ ...common, platform: 'darwin' });
  assert.equal(mac.kind, 'launchd');
  assert.match(mac.label, /^me\.hdoria\.cerebro\.tick\.[0-9a-f]{8}$/);
  assert.equal(mac.files[0].path, join(home, 'Library', 'LaunchAgents', `${label}.plist`));
  const plist = mac.files[0].content;
  assert.match(plist, /<key>StartInterval<\/key><integer>900<\/integer>/, 'padrão de 15 minutos');
  for (const part of [NODE, join(vault, '.cerebro', 'bin', 'cerebro.mjs'), 'routine-runtime', 'tick']) {
    assert.ok(plist.includes(`<string>${part}</string>`), `plist chama ${part}`);
  }
  assert.ok(plist.includes(`<key>WorkingDirectory</key><string>${vault}</string>`));
  assert.equal(existsSync(join(home, 'Library')), false, 'planejar não grava nada');
  assert.notEqual(schedulerLabel(join(tmp, 'outro')), label, 'cada vault tem a sua label');

  const win = planScheduler({ ...common, platform: 'win32', intervalMinutes: 30 });
  assert.equal(win.kind, 'schtasks');
  assert.equal(win.taskName, label);
  assert.equal(win.taskRun, `"${NODE}" "${join(vault, '.cerebro', 'bin', 'cerebro.mjs')}" "routine-runtime" "tick"`);

  const sd = planScheduler({ ...common, platform: 'linux', linuxMode: 'systemd' });
  assert.equal(sd.kind, 'systemd');
  assert.deepEqual(sd.files.map((f) => f.path.split('/').pop()), [`${label}.service`, `${label}.timer`]);
  assert.match(sd.files[1].content, /OnUnitActiveSec=15min/);
  assert.match(sd.files[0].content, /ExecStart="\/opt\/fictional\/bin\/node" ".*cerebro\.mjs" "routine-runtime" "tick"/);

  const cron = planScheduler({ ...common, platform: 'linux', linuxMode: 'cron' });
  assert.equal(cron.kind, 'cron');
  assert.match(cron.cronLine, /^\*\/15 \* \* \* \* PATH='.*' '\/opt\/fictional\/bin\/node' .* # me\.hdoria\.cerebro\.tick\.[0-9a-f]{8}$/);
  assert.match(planScheduler({ ...common, platform: 'linux', linuxMode: 'cron', intervalMinutes: 120 }).cronLine, /^0 \*\/2 \* \* \*/);
  assert.throws(() => planScheduler({ ...common, platform: 'linux', intervalMinutes: 2 }), /intervalo inválido/);
  assert.throws(() => planScheduler({ ...common, platform: 'linux', intervalMinutes: 90 }), /intervalo inválido/);

  // sem lançador no vault, recusa sem criar nada
  const empty = join(tmp, 'sem-launcher');
  mkdirSync(empty);
  const noLauncher = fakeExecutor();
  assert.throws(() => installScheduler(planScheduler({ ...common, root: empty, platform: 'darwin' }), { exec: noLauncher.exec }), /lançador/);
  assert.equal(noLauncher.state.calls.length, 0);

  // launchd: instalar, detectar, idempotência, remover sem tocar em plist de terceiros
  {
    const fake = fakeExecutor();
    const agents = join(home, 'Library', 'LaunchAgents');
    mkdirSync(agents, { recursive: true });
    const foreign = join(agents, 'com.terceiro.exemplo.plist');
    writeFileSync(foreign, '<plist>terceiro</plist>');
    assert.equal(detectScheduler(mac, { exec: fake.exec }).installed, false);
    const first = installScheduler(mac, { exec: fake.exec });
    assert.equal(first.installed, true);
    assert.equal(first.active, true);
    assert.equal(readFileSync(mac.files[0].path, 'utf8'), plist);
    installScheduler(mac, { exec: fake.exec });
    assert.equal(fake.state.loaded.size, 1, 'instalar duas vezes não duplica');
    assert.equal(readdirSync(agents).filter((n) => n.includes('cerebro.tick')).length, 1);
    const removed = removeScheduler(mac, { exec: fake.exec });
    assert.equal(removed.installed, false);
    assert.equal(removed.active, false);
    assert.equal(existsSync(mac.files[0].path), false);
    assert.equal(readFileSync(foreign, 'utf8'), '<plist>terceiro</plist>', 'plist de terceiros intacto');
    assert.ok(fake.state.calls.every((c) => !c.includes('com.terceiro')), 'nenhuma chamada ao agendamento de terceiros');
  }

  // Agendador de Tarefas
  {
    const fake = fakeExecutor();
    fake.state.tasks.add('TarefaDeTerceiro');
    assert.equal(installScheduler(win, { exec: fake.exec }).installed, true);
    installScheduler(win, { exec: fake.exec });
    assert.equal([...fake.state.tasks].filter((t) => t === label).length, 1);
    assert.equal(removeScheduler(win, { exec: fake.exec }).installed, false);
    assert.deepEqual([...fake.state.tasks], ['TarefaDeTerceiro']);
  }

  // systemd
  {
    const fake = fakeExecutor();
    assert.equal(installScheduler(sd, { exec: fake.exec }).active, true);
    installScheduler(sd, { exec: fake.exec });
    assert.equal(fake.state.enabled.size, 1);
    const userDir = join(home, '.config', 'systemd', 'user');
    const foreignUnit = join(userDir, 'terceiro.timer');
    writeFileSync(foreignUnit, '[Timer]\n');
    const removed = removeScheduler(sd, { exec: fake.exec });
    assert.equal(removed.installed, false);
    assert.deepEqual(readdirSync(userDir), ['terceiro.timer']);
  }

  // crontab: preserva as outras linhas, não duplica, remove só a nossa
  {
    const others = '# lembrete de terceiro\n0 3 * * * /usr/bin/backup --all\n30 8 * * 1 /usr/bin/relatorio # com comentario\n';
    const fake = fakeExecutor({ crontab: others });
    assert.equal(installScheduler(cron, { exec: fake.exec }).installed, true);
    installScheduler(cron, { exec: fake.exec });
    const lines = fake.state.crontab.split('\n');
    assert.equal(lines.filter((l) => l.endsWith(cron.marker)).length, 1, 'uma linha nossa só');
    assert.equal(fake.state.crontab.startsWith(others), true, 'linhas de terceiros preservadas, na ordem');
    assert.equal(removeScheduler(cron, { exec: fake.exec }).installed, false);
    assert.equal(fake.state.crontab, others, 'crontab volta exatamente ao que era');
    // sem crontab prévio
    const clean = fakeExecutor();
    installScheduler(cron, { exec: clean.exec });
    assert.equal(clean.state.crontab, `${cron.cronLine}\n`);
    // outra label (outro vault) não é tocada
    const otherPlan = planScheduler({ ...common, root: join(tmp, 'outro'), platform: 'linux', linuxMode: 'cron' });
    assert.equal(removeCronLine(applyCronLine(applyCronLine('', cron), otherPlan), cron.marker), `${otherPlan.cronLine}\n`);
  }

  // escolha de modo no Linux pelo executor
  assert.equal(resolvePlan({ ...common, platform: 'linux', exec: fakeExecutor({ systemd: true }).exec }).kind, 'systemd');
  assert.equal(resolvePlan({ ...common, platform: 'linux', exec: fakeExecutor({ systemd: false }).exec }).kind, 'cron');

  // achado 1: a pasta do log existe depois de instalar (cron e launchd falham sem ela)
  {
    const logDir = join(vault, '.cerebro', 'runtime', 'scheduler');
    rmSync(join(vault, '.cerebro', 'runtime'), { recursive: true, force: true });
    assert.equal(existsSync(logDir), false, 'pré-condição: nenhum tick rodou ainda');
    assert.ok(mac.dirs.includes(logDir));
    installScheduler(cron, { exec: fakeExecutor().exec });
    assert.equal(existsSync(logDir), true, 'cron: pasta do log criada antes de registrar');
    rmSync(logDir, { recursive: true });
    installScheduler(mac, { exec: fakeExecutor().exec });
    assert.equal(existsSync(logDir), true, 'launchd: pasta do StandardOutPath criada');
    rmSync(mac.files[0].path, { force: true });
  }

  // achado 2: só "no crontab for" vale como vazio; qualquer outra falha aborta sem gravar
  {
    for (const crontabError of [
      { status: 127, stdout: '', stderr: 'spawnSync crontab ENOENT' },
      { status: 1, stdout: '', stderr: 'crontab: cannot read /var/spool: permission denied' },
      { status: 1, stdout: '', stderr: 'spawnSync crontab ETIMEDOUT' },
    ]) {
      const bad = fakeExecutor({ crontab: '0 3 * * * /usr/bin/backup\n', crontabError });
      assert.throws(() => installScheduler(cron, { exec: bad.exec }), /crontab -l falhou/);
      assert.equal(bad.state.calls.some((c) => c === 'crontab -'), false, 'install não grava');
      assert.equal(bad.state.crontab, '0 3 * * * /usr/bin/backup\n');
      assert.throws(() => removeScheduler(cron, { exec: bad.exec }), /crontab -l falhou/);
      assert.equal(bad.state.calls.some((c) => c === 'crontab -'), false, 'remove não grava');
    }
  }

  // achado 3: depois do bootout espera o serviço sair antes do bootstrap
  {
    const fake = fakeExecutor({ bootoutLag: 3 });
    const sleeps = [];
    installScheduler(mac, { exec: fake.exec });
    const before = fake.state.calls.length;
    const reinstalled = installScheduler(mac, { exec: fake.exec, sleep: (ms) => sleeps.push(ms) });
    assert.equal(reinstalled.active, true);
    assert.equal(sleeps.length, 3, 'esperou o lag do bootout');
    assert.ok(fake.state.calls.slice(before).filter((c) => c.startsWith('launchctl print')).length >= 4);
    // serviço que nunca sai: erro claro, sem novo bootstrap
    const stuck = fakeExecutor({ bootoutLag: 1000 });
    installScheduler(mac, { exec: stuck.exec });
    assert.throws(() => installScheduler(mac, { exec: stuck.exec, sleep: () => {} }), /não saiu a tempo/);
    assert.equal(stuck.state.calls.filter((c) => c.startsWith('launchctl bootstrap')).length, 1, 'só o bootstrap da primeira instalação');
    // bootstrap recusado: erro claro em vez de status ok
    const refuse = fakeExecutor();
    refuse.state.rejectBootstrap = true;
    assert.throws(() => installScheduler(mac, { exec: refuse.exec }), /launchd recusou o agendamento.*Bootstrap failed: 5/);
    rmSync(mac.files[0].path, { force: true });
  }

  // achado 4: caminho estável do node e status atrasado
  {
    const cellarRoot = join(tmp, 'brew');
    const real = join(cellarRoot, 'Cellar', 'node', '22.1.0', 'bin', 'node');
    mkdirSync(join(cellarRoot, 'Cellar', 'node', '22.1.0', 'bin'), { recursive: true });
    mkdirSync(join(cellarRoot, 'bin'), { recursive: true });
    writeFileSync(real, '#!/bin/sh\n');
    mkdirSync(join(cellarRoot, 'opt', 'node', 'bin'), { recursive: true });
    symlinkSync(real, join(cellarRoot, 'opt', 'node', 'bin', 'node'));
    assert.equal(stableNodePath({ execPath: real, envPath: '', platform: 'darwin' }), join(cellarRoot, 'opt', 'node', 'bin', 'node'));
    const pinned = join(cellarRoot, 'Cellar', 'node@20', '20.18.0', 'bin', 'node');
    mkdirSync(dirname(pinned), { recursive: true });
    writeFileSync(pinned, '#!/bin/sh\n');
    mkdirSync(join(cellarRoot, 'opt', 'node@20', 'bin'), { recursive: true });
    symlinkSync(pinned, join(cellarRoot, 'opt', 'node@20', 'bin', 'node'));
    assert.equal(stableNodePath({ execPath: pinned, envPath: '', platform: 'darwin' }), join(cellarRoot, 'opt', 'node@20', 'bin', 'node'), 'node@20 continua node@20');
    const lone = join(tmp, 'brew2', 'Cellar', 'node', '22.1.0', 'bin', 'node');
    mkdirSync(join(tmp, 'brew2', 'Cellar', 'node', '22.1.0', 'bin'), { recursive: true });
    writeFileSync(lone, '#!/bin/sh\n');
    assert.equal(stableNodePath({ execPath: lone, envPath: '', platform: 'darwin' }), lone, 'sem link, mantém execPath');
    const nvmNode = join(tmp, '.nvm', 'versions', 'node', 'v22.1.0', 'bin', 'node');
    mkdirSync(join(tmp, '.nvm', 'versions', 'node', 'v22.1.0', 'bin'), { recursive: true });
    writeFileSync(nvmNode, '#!/bin/sh\n');
    const pathNode = join(tmp, 'pathbin', 'node');
    mkdirSync(join(tmp, 'pathbin'), { recursive: true });
    writeFileSync(pathNode, '#!/bin/sh\n');
    assert.equal(stableNodePath({ execPath: nvmNode, envPath: `rel/bin:${join(tmp, 'pathbin')}`, platform: 'linux' }), nvmNode, 'outro node do PATH é outra versão: fica o binário em uso');
    const shim = join(tmp, 'shimbin', 'node');
    mkdirSync(dirname(shim), { recursive: true });
    symlinkSync(nvmNode, shim);
    assert.equal(stableNodePath({ execPath: nvmNode, envPath: `${join(tmp, 'pathbin')}:${join(tmp, 'shimbin')}`, platform: 'linux' }), shim, 'caminho do PATH para o mesmo binário é aceito');
    const multishell = join(tmp, 'fnm_multishells', '123', 'bin', 'node');
    mkdirSync(dirname(multishell), { recursive: true });
    symlinkSync(nvmNode, multishell);
    assert.equal(stableNodePath({ execPath: nvmNode, envPath: dirname(multishell), platform: 'linux' }), nvmNode, 'link efêmero do fnm não serve');
    assert.equal(stableNodePath({ execPath: nvmNode, envPath: '/nada/aqui', platform: 'linux' }), nvmNode);
    const plan = resolvePlan({ root: vault, home, platform: 'darwin', envPath: '/usr/bin', uid: 501 });
    assert.equal(plan.nodePath, process.execPath, 'node comum fica como está');
    assert.equal(plan.command[0], plan.nodePath, 'o caminho escolhido está no plano');
    assert.equal(planScheduler({ ...common, platform: 'darwin' }).nodePath, NODE);

    const fake = fakeExecutor();
    installScheduler(mac, { exec: fake.exec });
    const now = new Date(Date.UTC(2026, 10, 14, 12, 0, 0));
    const at = (minutesAgo) => {
      const iso = new Date(now - minutesAgo * 60_000).toISOString();
      return { started_at: iso, finished_at: iso, ok: true, runs: 0, failed: 0 };
    };
    recordTick(vault, at(44));
    assert.equal(detectScheduler(mac, { exec: fake.exec, now: () => now }).stale, false, '44 min com intervalo de 15 ainda não é atraso');
    recordTick(vault, at(46));
    assert.equal(detectScheduler(mac, { exec: fake.exec, now: () => now }).stale, true, 'mais de 3 intervalos');
    assert.equal(detectScheduler(mac, { exec: fake.exec, now: () => now }).node, NODE);
    assert.equal(typeof schedulerStatus(vault, { platform: 'darwin', exec: fake.exec, now: () => now }).stale, 'boolean');
    rmSync(join(vault, '.cerebro', 'runtime'), { recursive: true, force: true });
    rmSync(mac.files[0].path, { force: true });
  }

  // achado 5: aviso para pastas protegidas do macOS
  {
    for (const sub of [['Documents', 'v'], ['Desktop', 'v'], ['Library', 'Mobile Documents', 'com~apple~CloudDocs', 'v']]) {
      const protectedVault = join(home, ...sub);
      mkdirSync(join(protectedVault, '.cerebro', 'bin'), { recursive: true });
      writeFileSync(join(protectedVault, '.cerebro', 'bin', 'cerebro.mjs'), '// launcher\n');
      const plan = planScheduler({ ...common, root: protectedVault, platform: 'darwin' });
      assert.equal(plan.warnings.length, 1, `aviso para ${sub[0]}`);
      assert.match(plan.warnings[0], /Acesso Total ao Disco/);
      assert.deepEqual(installScheduler(plan, { exec: fakeExecutor().exec }).warnings, plan.warnings, 'resultado do install traz o aviso');
      rmSync(plan.files[0].path, { force: true });
    }
    assert.deepEqual(mac.warnings, [], 'vault fora das pastas protegidas: sem aviso');
    assert.deepEqual(planScheduler({ ...common, root: join(home, 'Documents', 'v'), platform: 'linux' }).warnings, [], 'só no macOS');
  }

  // menores: quebra de linha, PATH relativo, $ no Environment=, label do realpath
  {
    assert.throws(() => planScheduler({ ...common, nodePath: '/opt/no\nde', platform: 'linux' }), /quebra de linha/);
    assert.throws(() => planScheduler({ ...common, root: `${vault}\r`, platform: 'darwin' }), /quebra de linha/);
    assert.equal(sanitizePath('/usr/bin:bin:./x::/opt/a', 'linux'), '/usr/bin:/opt/a');
    assert.equal(sanitizePath('C:\\Windows;rel\\dir;D:/x', 'win32'), 'C:\\Windows;D:/x');
    const plan = planScheduler({ ...common, platform: 'linux', linuxMode: 'systemd', envPath: '/opt/$HOME/bin:rel:/usr/bin' });
    const service = plan.files[0].content;
    assert.match(service, /Environment="PATH=\/opt\/\$HOME\/bin:\/usr\/bin"/, '$ literal no Environment=');
    assert.equal(service.includes('rel'), false, 'entrada relativa descartada');
    const dollarNode = planScheduler({ ...common, nodePath: '/opt/$x/node', platform: 'linux', linuxMode: 'systemd' });
    assert.match(dollarNode.files[0].content, /ExecStart="\/opt\/\$\$x\/node"/, '$ dobrado no ExecStart');
    const link = join(tmp, 'link-do-vault');
    symlinkSync(vault, link);
    assert.equal(schedulerLabel(link), schedulerLabel(vault), 'symlink gera a mesma label');
    assert.equal(planScheduler({ ...common, root: link, platform: 'darwin' }).label, label);
  }

  // scheduler-* recusa no motor de instalação dividida
  {
    const motor = join(tmp, 'motor');
    mkdirSync(join(motor, '.cerebro'), { recursive: true });
    writeFileSync(join(motor, '.cerebro', 'motor-install.json'), '{}\n');
    const cli = fileURLToPath(new URL('./routine-runtime.mjs', import.meta.url));
    for (const action of ['scheduler-status', 'scheduler-install', 'scheduler-remove']) {
      const run = spawnSync(process.execPath, [cli, action, '--confirm'], { env: { ...process.env, CEREBRO_INSTALL_ROOT: motor }, encoding: 'utf8' });
      assert.equal(run.status, 1, action);
      assert.match(run.stderr, /motor de uma instalação dividida.*lançador do vault/, action);
    }
  }

  // o tick grava a última execução
  assert.equal(readLastTick(vault), null);
  let clock = 0;
  const tickClock = () => new Date(Date.UTC(2026, 10, 14, 12, 0, clock++));
  await runTickAndRecord(vault, async () => [{ status: 'completed' }, { status: 'no-change' }], { clock: tickClock });
  const okTick = readLastTick(vault);
  assert.equal(okTick.ok, true);
  assert.equal(okTick.runs, 2);
  assert.equal(okTick.finished_at, '2026-11-14T12:00:01.000Z');
  await runTickAndRecord(vault, async () => [{ status: 'failed' }], { clock: tickClock });
  assert.equal(readLastTick(vault).ok, false);
  await assert.rejects(runTickAndRecord(vault, async () => { throw new Error('falha ficticia'); }, { clock: tickClock }), /falha ficticia/);
  assert.equal(readLastTick(vault).error, 'falha ficticia');
  const fake = fakeExecutor();
  installScheduler(mac, { exec: fake.exec });
  assert.equal(detectScheduler(mac, { exec: fake.exec }).last_tick.error, 'falha ficticia', 'status expõe a última execução');

  console.log('✓ agendador local: plano nas três plataformas, instalar, detectar, idempotência, última execução e remoção sem tocar em terceiros');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

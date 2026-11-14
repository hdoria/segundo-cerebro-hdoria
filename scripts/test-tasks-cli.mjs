#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(realpathSync(tmpdir()), 'cerebro-tasks-cli-'));
const put = (ref, text) => { mkdirSync(dirname(join(root, ref)), { recursive: true }); writeFileSync(join(root, ref), text); };
const run = (...args) => spawnSync(process.execPath, [join(here, 'tasks.mjs'), ...args], {
  cwd: root, encoding: 'utf8', env: { ...process.env, CEREBRO_INSTALL_ROOT: root },
});
const note = '---\ntype: Project\n---\n\n# Projeto Fictício\n\n- [ ] Enviar proposta revisada\n- [x] Reunir referências\n- [ ] Ligar para o fornecedor 📅 2026-12-01\n- [ ] Rodar `echo invadido` e pagar $100\n';

try {
  put('VERSION', 'fixture\n');
  put('COMECE-AQUI.md', '# Fixture\n');
  put('.cerebro/layout.json', JSON.stringify({ knowledgeRoot: '.' }));
  put('projetos/ficticio.md', note);

  const listed = JSON.parse(run('list', '--json').stdout);
  assert.deepEqual(listed.open.map((task) => [task.ref, task.line, task.text]), [
    ['projetos/ficticio.md', 7, 'Enviar proposta revisada'],
    ['projetos/ficticio.md', 9, 'Ligar para o fornecedor'],
    ['projetos/ficticio.md', 10, 'Rodar `echo invadido` e pagar $100'],
  ], 'list devolve só as abertas, com nota e linha');
  assert(listed.open.every((task) => /^[a-f0-9]{12}$/.test(task.id)), 'cada tarefa tem id seguro para o shell');
  assert.match(run('list').stdout, /3 tarefas abertas/);
  const proposal = listed.open[0].id;

  const preview = run('close', proposal);
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /Prévia: marcaria como feita projetos\/ficticio\.md:7/);
  assert.equal(readFileSync(join(root, 'projetos/ficticio.md'), 'utf8'), note, 'sem --confirm nada muda');

  assert.equal(run('close', 'abc', '--confirm').status, 1, 'id malformado é recusado');
  assert.match(run('close', '000000000000', '--confirm').stderr, /nenhuma tarefa com esse id/);

  const closed = run('close', proposal, '--confirm');
  assert.equal(closed.status, 0, closed.stderr);
  const after = readFileSync(join(root, 'projetos/ficticio.md'), 'utf8');
  assert.equal(after, note.replace('- [ ] Enviar proposta revisada', '- [x] Enviar proposta revisada'), 'só o checkbox muda');
  assert.equal(after.split('').filter((char, index) => char !== note[index]).length, 1, 'exatamente um caractere diferente');
  assert.deepEqual(JSON.parse(run('list', '--json').stdout).open.map((task) => task.line), [9, 10]);
  assert.match(run('close', proposal, '--confirm').stdout, /já estava feita/, 'fechar de novo é idempotente');

  const risky = JSON.parse(run('list', '--json').stdout).open.find((task) => task.line === 10);
  assert.equal(run('close', risky.id, '--confirm').status, 0, 'tarefa com crase e cifrão fecha pelo id');
  assert.match(readFileSync(join(root, 'projetos/ficticio.md'), 'utf8'), /- \[x\] Rodar `echo invadido` e pagar \$100/);

  put('projetos/ficticio.md', note);
  const stale = JSON.parse(run('list', '--json').stdout).open[0].id;
  put('projetos/ficticio.md', note.replace('Enviar proposta revisada', 'Enviar proposta final'));
  const changed = run('close', stale, '--confirm');
  assert.equal(changed.status, 1, 'id de texto que mudou não fecha nada');
  assert.match(changed.stderr, /Rode tasks list de novo/);

  const outside = spawnSync(process.execPath, [join(here, 'tasks.mjs'), 'list'], { cwd: root, encoding: 'utf8', env: { ...process.env, CEREBRO_INSTALL_ROOT: join(root, 'nao-existe') } });
  assert.equal(outside.status, 1);
  assert.doesNotMatch(outside.stderr, /\bat \/|\.mjs:\d+/, 'erro de leitura sem stack trace nem caminho do motor');

  for (const launcher of ['templates/vault/.cerebro/bin/cerebro.mjs', '.cerebro/bin/cerebro.mjs']) {
    assert.match(readFileSync(join(here, '..', launcher), 'utf8'), /'tasks'/, `${launcher} aceita o comando tasks`);
  }
  const contract = readFileSync(join(here, '..', 'templates/vault/AGENTS.md'), 'utf8');
  assert.match(contract, /tasks close <id> --confirm/, 'contrato ensina o agente a fechar pelo lançador, por id');
  assert.match(contract, /Qualquer outra evidência vira sugestão/);
  assert.match(contract, /única exceção à regra 4/);
  assert.match(readFileSync(join(here, '..', '.claude/skills/daily/SKILL.md'), 'utf8'), /Tarefas que parecem prontas/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('✓ tasks list e close: id seguro para o shell, prévia sem --confirm, nota conferida e um caractere gravado');

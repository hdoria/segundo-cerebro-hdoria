#!/usr/bin/env node

// Todos os dados de negócio deste fixture são fictícios.
// Seam único do ticket 07: vault sintético (uma Área, duas Fontes, um Sistema) →
// `vault:sync` (CLI) → API HTTP do Console. Verifica comportamento externo: o que a CLI
// imprime, o que fica gravado e o que o Console devolve para Sistemas, para o workspace do
// Sistema, para o Canvas e para Estrutura › Áreas.
//
// Cobre: System Contract v2 válido pelo validador do protocolo; o Sistema aparece em
// Sistemas; as áreas do vault somam com as dos Sistemas sem duplicar; o workspace responde
// 200; o grafo do Sistema devolve nós; nota inválida sai como `<nota> · <campo> · <motivo>`;
// recompilar não muda nada; instalação padrão sem vault continua igual.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapLegacyConsole } from './console-bootstrap.mjs';
import { createConsoleServer } from './console-server.mjs';
import { buildConsoleReadModel } from './lib/console-read-model.mjs';
import { buildBrainGraph } from './lib/graph-read-model.mjs';
import { vaultAreaCatalog, vaultToday } from './lib/vault-today.mjs';
import { validateSystemContract } from './lib/system-protocol.mjs';
import { operatingAreaLabel } from './lib/system-taxonomy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, 'vault-compile.mjs');
const SYSTEMS = join('.cerebro', 'contracts', 'systems');
const vaultRoot = mkdtempSync(join(realpathSync(tmpdir()), 'vault-systems-'));
const standardRoot = mkdtempSync(join(realpathSync(tmpdir()), 'vault-systems-'));

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function sync(root, ...flags) {
  const run = spawnSync(process.execPath, [SCRIPT, `--root=${root}`, ...flags], { encoding: 'utf8' });
  assert.equal(run.stderr, '', `vault-compile não deve falhar em stderr: ${run.stderr}`);
  return { out: run.stdout, code: run.status, lines: run.stdout.split('\n').filter(Boolean) };
}

function systemsDir(root) {
  const directory = join(root, SYSTEMS);
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

async function readApi(root, paths) {
  const instance = createConsoleServer({
    root,
    sessionToken: 'fixed-session-token',
    csrfToken: 'fixed-csrf-token',
    clock: () => new Date('2035-10-03T12:00:00.000Z'),
  });
  await new Promise((listening) => instance.server.listen(0, '127.0.0.1', listening));
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  try {
    const page = await fetch(`${base}/`);
    await page.text();
    const cookie = page.headers.get('set-cookie').split(';', 1)[0];
    const values = {};
    for (const [name, path] of Object.entries(paths)) {
      const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, `${path} precisa responder 200`);
      values[name] = await response.json();
    }
    return values;
  } finally {
    await new Promise((closed) => instance.server.close(closed));
  }
}

function dataSource(id, name) {
  return `---
type: DataSource
source_id: ${id}
nome: ${name}
kind: mcp
dono: "[[pessoa-ficticia-alfa]]"
casa_da_verdade: servico ${name}
finalidade: alimentar a daily do dia
sensibilidade: media
pii: indireto
frescor: 1 dia
retencao: so referencia no recibo
acesso: leitura
consumidores:
  - "[[daily]]"
status: Ativo
updated: 2035-10-01
---

# ${name}
`;
}

const DAILY_NOTE = `---
type: System
system_id: daily
nome: Daily do dia
versao: 0.1.0
status: Ativo
area: "[[software-ficticio]]"
area_confirmada: nao
resultado: a daily note do dia com prioridades, agenda e loops abertos
nao_sucesso: listar o dia em vez de escolher o dia
entrega: daily-note
pronto_quando: a daily de hoje existe com no maximo cinco prioridades
dono: "[[pessoa-ficticia-alfa]]"
gate_humano: o dono confirma as prioridades do dia
gatilho: agendado
quando: rotina ficticia todo dia as 08h20 e invocacao manual de teste
capacidade: daily
capacidade_origem: local
entidades:
  - tipo: project
    papel: projeto-parado
    obrigatoria: nao
fontes:
  - papel: agenda
    fonte: "[[google-calendar]]"
    obrigatoria: sim
    acesso: leitura
    frescor: 1 dia
    finalidade: montar a secao de agenda
    janela: o dia de hoje
    selecao: recente
  - papel: email
    fonte: "[[gmail|Gmail]]"
    obrigatoria: nao
    acesso: leitura
    frescor: 2 dias
    finalidade: achar o que exige resposta hoje
    se_faltar: seguir-com-lacuna
    filtros:
      - so as threads nao lidas ou importantes
etapas:
  - estado: coletado
    entrada: fontes que responderem
    saida: contexto do dia com origem
    gate: fato de agenda so entra com fonte real
  - estado: escrito
    entrada: contexto do dia
    saida: daily note do dia
    gate: no maximo cinco prioridades
gates:
  - a secao Prioridades tem no maximo cinco itens
  - nenhum fato de agenda sem fonte real
  - projeto Active parado ha sete dias aparece em Loops abertos
perguntas_humanas:
  - as prioridades sao as do dia?
medida: daily-aprovada
paradas:
  - parar se a daily de hoje ja existir
leitura:
  - as fontes declaradas neste Sistema
escrita:
  - a daily note do dia
acoes_externas: nao
updated: 2035-10-03
---

# Daily do dia
`;

// Nota inválida: sem gates e apontando para uma fonte que não tem nota DataSource.
const WEEKLY_NOTE = `---
type: System
system_id: weekly-review
nome: Weekly review
status: Ativo
area: "[[software-ficticio]]"
resultado: o resumo da semana
nao_sucesso: repetir as dailies sem conclusao
entrega: weekly-review
pronto_quando: o resumo da semana existe
dono: "[[pessoa-ficticia-alfa]]"
gate_humano: o dono aprova o foco da semana
gatilho: agendado
quando: quarta-feira as 16h40 no cenario ficticio
fontes:
  - papel: dailies
    fonte: "[[notion]]"
    obrigatoria: sim
    acesso: leitura
    frescor: 7 dias
    finalidade: ler as dailies da semana
etapas:
  - estado: escrito
    entrada: dailies da semana
    saida: resumo da semana
    gate: o dono aprova
perguntas_humanas:
  - o foco da semana mudou?
medida: weekly-aprovada
paradas:
  - parar se a semana nao tiver daily
---

# Weekly review
`;

try {
  // ── vault sintético em modo vault ───────────────────────────────────────────────
  write(join(vaultRoot, 'AGENTS.md'), '# Vault sintético\n');
  write(join(vaultRoot, '.git', 'info', 'exclude'), '# local excludes\n');
  assert.equal(bootstrapLegacyConsole(vaultRoot, { confirm: true }).status, 'created');
  const layoutPath = join(vaultRoot, '.cerebro', 'layout.json');
  write(layoutPath, {
    ...JSON.parse(readFileSync(layoutPath, 'utf8')),
    knowledgeRoot: '.',
    vault: { daily: 'journal', inbox: 'inbox', projects: 'projects', areas: 'areas' },
  });

  write(join(vaultRoot, 'areas', 'software-ficticio.md'), '---\ntype: Area\nstatus: Active\n---\n\n# Software Fictício Studio\n');
  write(join(vaultRoot, 'projects', 'site.md'), '---\ntype: Project\nstatus: Active\nupdated: 2035-10-02\nbelongs_to:\n  - "[[software-ficticio]]"\n---\n\n# Site\n');
  write(join(vaultRoot, 'sistema', 'fontes', 'gmail.md'), dataSource('gmail', 'Gmail de demonstração'));
  write(join(vaultRoot, 'sistema', 'fontes', 'google-calendar.md'), dataSource('google-calendar', 'Agenda de demonstração'));
  write(join(vaultRoot, 'sistema', 'sistemas', 'daily.md'), DAILY_NOTE);
  write(join(vaultRoot, 'sistema', 'sistemas', 'weekly-review.md'), WEEKLY_NOTE);

  // ── 1. simulação por padrão: nada é gravado ─────────────────────────────────────
  const dry = sync(vaultRoot);
  assert.equal(dry.code, 1, 'com nota inválida, a simulação sai com código 1');
  assert.match(dry.out, /^ok · sistema\/sistemas\/daily\.md · sistema daily → \.cerebro\/contracts\/systems\/daily\.json \(gravaria\)$/m,
    'a simulação diz qual nota de Sistema viraria qual contrato');
  assert.deepEqual(systemsDir(vaultRoot), [], 'sem --confirm, nenhum System Contract é gravado');

  // ── 2. nota inválida: campo e motivo legíveis ───────────────────────────────────
  assert.ok(dry.lines.includes('sistema/sistemas/weekly-review.md · gates · declare pelo menos um gate determinístico'),
    `gate ausente precisa sair como <nota> · <campo> · <motivo>: ${dry.out}`);
  assert.ok(dry.lines.includes('sistema/sistemas/weekly-review.md · fontes · item 1: a fonte "notion" não tem nota DataSource com source_id neste vault'),
    `fonte não resolvida precisa dizer qual wikilink falhou: ${dry.out}`);
  assert.equal(dry.lines.some((line) => line.startsWith('ok · sistema/sistemas/weekly-review.md')), false,
    'nota inválida nunca sai como contrato pronto');

  // ── 3. --confirm grava um contrato v2 válido ────────────────────────────────────
  const confirmed = sync(vaultRoot, '--confirm');
  assert.equal(confirmed.code, 1, 'a nota quebrada continua reportada');
  assert.deepEqual(systemsDir(vaultRoot), ['daily.json'], 'só a nota válida vira contrato');
  const contract = JSON.parse(readFileSync(join(vaultRoot, SYSTEMS, 'daily.json'), 'utf8'));
  assert.deepEqual(validateSystemContract(contract), [],
    'o System Contract gerado passa no validador do protocolo sem ajuste');
  assert.equal(contract.protocol_version, 2, 'o contrato é v2');
  assert.equal(contract.status, 'active', 'status Ativo vira active');
  assert.equal(contract.trigger.type, 'schedule', 'gatilho agendado vira schedule');
  assert.equal(contract.result.owner, 'pessoa-ficticia-alfa', 'o dono vem do alvo do wikilink');
  assert.equal(contract.result.output_type, 'daily-note');
  assert.deepEqual(contract.sources.map((source) => [source.role, source.source_id, source.required]), [
    ['agenda', 'google-calendar', true],
    ['email', 'gmail', false],
  ], 'cada fonte resolve o wikilink no source_id da nota DataSource, na ordem declarada');
  assert.deepEqual(contract.retrieval.source_roles.map((role) => [role.role, role.priority, role.on_unavailable]), [
    ['agenda', 1, 'stop'],
    ['email', 2, 'continue-with-gap'],
  ], 'a recuperação deriva das fontes: prioridade pela ordem e parada pela obrigatoriedade');
  assert.equal(contract.retrieval.source_roles[0].window, 'o dia de hoje', 'janela declarada vira window');
  assert.equal(contract.retrieval.source_roles[1].window, '2 dias', 'sem janela, a window é o frescor da fonte');
  assert.equal(contract.retrieval.evidence.required, true, 'evidência é sempre obrigatória');
  assert.equal(contract.retrieval.fallback.enabled, false, 'sem lista de fallback, o fallback fica desligado');
  assert.equal(contract.eval.deterministic_gates.length, 3, 'os gates da nota viram os gates determinísticos');
  assert.equal(contract.learning.promotion_threshold, 3);
  assert.equal(contract.extensions.operating_area, 'software-ficticio', 'a área operacional é o slug da nota de área');
  assert.equal(contract.extensions.operating_area_status, 'to-confirm', 'area_confirmada: nao fica registrada como a confirmar');
  assert.equal(contract.extensions.product_kind, 'business-system');
  assert.equal(contract.extensions.surface, 'systems');
  assert.equal(contract.extensions.vault_note_ref, 'sistema/sistemas/daily.md',
    'o contrato aponta a nota que o gerou');
  assert.equal(Object.keys(contract.extensions).some((key) => /raw|bruto|content|body|transcript|secret|token/.test(key)), false,
    'nenhuma chave de extensão parece payload');

  const registry = JSON.parse(readFileSync(join(vaultRoot, '.cerebro', 'compiled.json'), 'utf8'));
  assert.ok(registry.files.some((file) => file.path === '.cerebro/contracts/systems/daily.json'
    && file.type === 'System' && file.note === 'sistema/sistemas/daily.md'),
    'o registro lista o contrato de Sistema com a nota de origem');

  // ── 4. o Console mostra o Sistema, o workspace abre e o Canvas tem nós ──────────
  const api = await readApi(vaultRoot, {
    console: '/api/console',
    vault: '/api/vault-today',
    workspace: '/api/systems/daily/workspace',
    graph: '/api/graphs/systems/daily',
  });
  const daily = api.console.systems.find((system) => system.system_id === 'daily');
  assert.ok(daily, 'a tela Sistemas mostra a daily');
  assert.equal(daily.name, 'Daily do dia');
  assert.equal(daily.status, 'active');
  assert.equal(daily.operating_area, 'software-ficticio');
  assert.equal(daily.product_kind, 'business-system');
  assert.equal(daily.retrieval_status, 'declared', 'contrato v2 conta como recuperação declarada');
  assert.deepEqual(daily.source_refs.map((ref) => ref.source_id), ['google-calendar', 'gmail'],
    'o Sistema mostra as fontes que ele declara');
  assert.equal(api.console.issues.some((issue) => issue.reason_code === 'system-contract-invalid'), false,
    'nenhum contrato gerado entra na tela Saúde como inválido');

  const areas = api.console.areas.filter((area) => area.operating_area === 'software-ficticio');
  assert.equal(areas.length, 1, 'a área do Sistema aparece uma única vez no modelo do Console');
  assert.equal(areas[0].name, 'Software Fictício Studio', 'em modo vault o nome da área vem do H1 da nota de área, não do slug');
  assert.deepEqual(areas[0].system_refs, ['daily'], 'a área do Sistema lista a daily');
  assert.deepEqual(api.vault.areas.map((area) => area.slug), ['software-ficticio'],
    'a área do vault continua sendo lida do vault');

  assert.equal(api.workspace.system.system_id, 'daily', 'o workspace do Sistema abre pelo id');
  assert.equal(api.workspace.contract.result.statement, contract.result.statement,
    'o workspace mostra o resultado do contrato compilado');
  assert.deepEqual(api.workspace.sources.map((source) => source.source_id), ['google-calendar', 'gmail'],
    'o workspace desmembra as fontes do Sistema');
  assert.equal(api.workspace.contract.pipeline.length, 2, 'o workspace mostra as etapas do contrato');

  assert.ok(api.graph.nodes.length > 0, 'o Canvas do Sistema devolve nós');
  assert.ok(api.graph.nodes.some((node) => node.id === 'source:gmail'), 'o Canvas mostra a fonte declarada');
  assert.ok(api.graph.nodes.some((node) => node.kind === 'retrieval'), 'o Canvas mostra a recuperação de contexto');
  assert.ok(api.graph.nodes.some((node) => node.id === 'stage:1:coletado'), 'o Canvas mostra as etapas do pipeline');

  // ── 5. Estrutura › Áreas soma vault e Sistemas sem duplicar ─────────────────────
  const app = readFileSync(resolve(here, '..', 'console', 'app.js'), 'utf8');
  const policy = app.slice(app.indexOf('function areaKey('), app.indexOf('function renderAreas()'));
  const mergeAreas = new Function(`${policy}\nreturn mergedAreas;`)();
  const merged = mergeAreas(api.vault.areas, api.console.areas);
  assert.equal(merged.length, 1, 'área presente no vault e no Sistema aparece uma única vez');
  assert.equal(merged[0].name, 'Software Fictício Studio', 'o título da área do vault manda no nome do cartão');
  assert.deepEqual(merged[0].system_refs, ['daily'], 'o cartão da área do vault passa a listar o Sistema');
  assert.equal(merged[0].origin, 'both', 'a área casada é marcada como vault mais Sistema');
  assert.equal(merged[0].active_projects, 1, 'o cartão mantém a contagem de projetos do vault');
  const extra = mergeAreas(api.vault.areas, [
    ...api.console.areas,
    { operating_area: 'comercial', name: 'Comercial', system_refs: ['vender'], routine_refs: [] },
  ]);
  assert.deepEqual(extra.map((area) => area.origin), ['both', 'system'],
    'área que só existe em Sistema entra na lista sem virar duplicata da do vault');

  // Área declarada não precisa de um Sistema para entrar no modelo e no grafo.
  for (const [slug, meta, title] of [
    ['academia-ficticia-beta', 'type: Area', 'Academia Fictícia Beta'],
    ['pessoal', 'type: Area', 'Pessoal'],
    ['nao-area', 'type: Project', 'NOT-AN-AREA'],
    ['privada', 'type: Area\nvisibility: private', 'PRIVATE-AREA-TITLE'],
  ]) write(join(vaultRoot, 'areas', `${slug}.md`), `---\n${meta}\n---\n\n# ${title}\n\nPRIVATE-AREA-BODY\n`);
  const catalog = buildConsoleReadModel(vaultRoot);
  assert.deepEqual(catalog.areas.map((area) => area.operating_area), ['academia-ficticia-beta', 'pessoal', 'software-ficticio'],
    'notas Area somam com as áreas dos Sistemas, deduplicadas pelo slug; outros types e private ficam fora');
  assert.deepEqual(catalog.areas.find((area) => area.operating_area === 'software-ficticio').system_refs, ['daily'],
    'a união preserva as referências dos Sistemas da área existente');
  for (const [slug, name] of [['academia-ficticia-beta', 'Academia Fictícia Beta'], ['pessoal', 'Pessoal']]) {
    assert.deepEqual(catalog.areas.find((area) => area.operating_area === slug), {
      operating_area: slug, name, system_refs: [], routine_refs: [],
    }, 'área sem Sistema expõe só metadados e listas de referências vazias');
  }
  const brain = buildBrainGraph(vaultRoot);
  for (const id of ['area:academia-ficticia-beta', 'area:pessoal']) {
    const node = brain.nodes.find((item) => item.id === id);
    assert.equal(node?.state, 'declared', 'área sem execução entra como declarada');
    assert.deepEqual(node.details, { system_count: 0, routine_count: 0 });
    assert.equal(brain.edges.some((edge) => edge.source === id || edge.target === id), false,
      'não inventa arestas nem Sistemas para uma área declarada');
  }
  assert.equal(/NOT-AN-AREA|PRIVATE-AREA-TITLE|PRIVATE-AREA-BODY/.test(JSON.stringify({ catalog, brain })), false,
    'a nova enumeração não expõe corpo de nota, título privado ou nota de outro type');

  for (const [slug, privacy] of [
    ['comment-private', 'visibility: private # owner-only'],
    ['quoted-private', '"visibility": private'],
    ['flag-private', 'private: true'],
    ['classified-private', 'classification: private'],
  ]) write(join(vaultRoot, 'areas', `${slug}.md`), `---\ntype: Area\n${privacy}\n---\n# HIDDEN-AREA\n`);
  assert.deepEqual(buildConsoleReadModel(vaultRoot).areas.map((area) => area.operating_area), ['academia-ficticia-beta', 'pessoal', 'software-ficticio'],
    'catálogo aplica a mesma política de privacidade da leitura de arquivos');
  const alias = join(standardRoot, 'root-alias');
  symlinkSync(vaultRoot, alias, 'dir');
  write(join(vaultRoot, 'nested-brain/areas/hidden.md'), '---\ntype: Area\n---\n# ANCESTOR-ALIAS-AREA\n');
  assert.deepEqual(vaultAreaCatalog(join(alias, 'nested-brain'), { areas: 'areas' }), [], 'um ancestral symlink da raiz também é recusado');
  const configuredLayout = JSON.parse(readFileSync(layoutPath, 'utf8'));
  assert.deepEqual(vaultToday(vaultRoot, configuredLayout.vault).areas.map((area) => area.slug).sort(), ['academia-ficticia-beta', 'pessoal', 'software-ficticio'],
    'Hoje não reintroduz áreas privadas ou notas de outro tipo');
  const outside = join(standardRoot, 'areas');
  write(join(outside, 'fora.md'), '---\ntype: Area\n---\n\n# OUTSIDE-AREA\n');
  symlinkSync(outside, join(vaultRoot, 'linked-areas'), 'dir');
  for (const directory of [relative(vaultRoot, outside), outside, 'linked-areas', 'areas/software-ficticio.md', 'missing-areas']) {
    write(layoutPath, { ...configuredLayout, vault: { ...configuredLayout.vault, areas: directory } });
    assert.deepEqual(buildConsoleReadModel(vaultRoot).areas.map((area) => area.operating_area), ['software-ficticio'],
      `diretório inválido ou ausente é ignorado sem perder a área do Sistema: ${directory}`);
    assert.deepEqual(vaultToday(vaultRoot, { ...configuredLayout.vault, areas: directory }).areas, [], 'Hoje também recusa o diretório fora da raiz ou por symlink');
  }
  const { vault, ...plainLayout } = configuredLayout;
  write(layoutPath, plainLayout);
  assert.deepEqual(buildConsoleReadModel(vaultRoot).areas.map((area) => [area.operating_area, area.name]), [['software-ficticio', operatingAreaLabel('software-ficticio')]],
    'sem modo vault, notas Area não entram e o nome legado da área do Sistema é preservado');
  write(layoutPath, configuredLayout);

  // ── 6. recompilar não muda nada ─────────────────────────────────────────────────
  const before = statSync(join(vaultRoot, SYSTEMS, 'daily.json')).mtimeMs;
  const content = readFileSync(join(vaultRoot, SYSTEMS, 'daily.json'), 'utf8');
  const again = sync(vaultRoot, '--confirm');
  assert.match(again.out, /· 0 arquivo\(s\) gravado\(s\) · 0 órfão\(s\) removido\(s\)/,
    'a segunda rodada não grava nada');
  assert.equal(readFileSync(join(vaultRoot, SYSTEMS, 'daily.json'), 'utf8'), content,
    'o conteúdo do contrato é idêntico na recompilação');
  assert.equal(statSync(join(vaultRoot, SYSTEMS, 'daily.json')).mtimeMs, before,
    'o arquivo não é reescrito quando nada mudou');

  // ── 7. instalação padrão sem vault segue igual ─────────────────────────────────
  write(join(standardRoot, 'VERSION'), 'fixture\n');
  write(join(standardRoot, 'COMECE-AQUI.md'), '# Fixture\n');
  write(join(standardRoot, '.cerebro', 'layout.json'), { version: 3 });
  const standardContract = JSON.parse(readFileSync(resolve(here, '..', 'protocol', 'examples', 'system-contract.v2.json'), 'utf8'));
  write(join(standardRoot, SYSTEMS, 'analisar-funil.json'), standardContract);
  const standard = sync(standardRoot, '--confirm');
  assert.equal(standard.code, 0, 'instalação sem nota compilável não é erro');
  assert.match(standard.out, /nenhuma nota compilável encontrada neste vault/);
  assert.deepEqual(systemsDir(standardRoot), ['analisar-funil.json'],
    'instalação padrão não perde nem ganha System Contract');
  assert.deepEqual(
    JSON.parse(readFileSync(join(standardRoot, SYSTEMS, 'analisar-funil.json'), 'utf8')),
    standardContract,
    'o contrato de exemplo do Cérebro continua byte a byte o mesmo',
  );
  assert.equal(existsSync(join(standardRoot, '.cerebro', 'compiled.json')), false,
    'sem nota compilável, o compilador não cria registro');

  console.log('✓ vault:sync compila notas System em System Contract v2 e o Console mostra Sistemas, workspace, Canvas e Áreas somadas');
} finally {
  rmSync(vaultRoot, { recursive: true, force: true });
  rmSync(standardRoot, { recursive: true, force: true });
}

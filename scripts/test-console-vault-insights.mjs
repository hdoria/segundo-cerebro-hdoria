#!/usr/bin/env node

// Todos os dados de negócio deste fixture são fictícios.
// Decisões, lições e recall lidos do vault, testados pelo seam HTTP contra um Cérebro
// sintético: /api/vault-insights devolve a linha do tempo de decisões por mês (mais
// novo primeiro, com a nota afetada e o log de sessão), as lições por tema com
// contagem e as três últimas de cada tema, as regras promovidas ao MEMORY e o último
// resultado do teste de recall. Nenhum corpo bruto sai do servidor, nota privada não
// entrega entrada, e instalação padrão sem vault responde available:false.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { bootstrapLegacyConsole } from './console-bootstrap.mjs';
import { createConsoleServer } from './console-server.mjs';

const vaultRoot = mkdtempSync(join(tmpdir(), 'console-insights-'));
const standardRoot = mkdtempSync(join(tmpdir(), 'console-insights-'));

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
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
    // Sem cookie de sessão, aprendizado nenhum sai do servidor.
    const anonymous = await fetch(`${base}/api/vault-insights`);
    assert.equal(anonymous.status >= 400, true, '/api/vault-insights exige sessão');
    return values;
  } finally {
    await new Promise((closed) => instance.server.close(closed));
  }
}

const bySlug = (list, slug) => list.find((item) => item.slug === slug);

try {
  write(join(vaultRoot, 'AGENTS.md'), '# Vault sintético\n');
  write(join(vaultRoot, '.git', 'info', 'exclude'), '# local excludes\n');
  assert.equal(bootstrapLegacyConsole(vaultRoot, { confirm: true }).status, 'created');
  const layoutPath = join(vaultRoot, '.cerebro', 'layout.json');
  write(layoutPath, {
    ...JSON.parse(readFileSync(layoutPath, 'utf8')),
    knowledgeRoot: '.',
    vault: {
      daily: 'journal',
      inbox: 'inbox',
      projects: 'projects',
      areas: 'areas',
      decisions: 'decisions',
      learnings: 'resources/learnings',
      recall: 'resources/teste-de-recall.md',
      memory: 'MEMORY.md',
    },
  });

  // Dois meses de decisões, no formato de append do log mensal.
  write(join(vaultRoot, 'decisions', '2035-09.md'), `---
type: Note
tags: [decisoes]
updated: 2035-09-30
---

# Decisões de setembro de 2035

Log de append do mês.

## Entradas

- **2035-09-02 · o catálogo fictício recebeu a coleção de amostras**. Contexto: a coleção de teste usa o catálogo de demonstração. Notas: [[projeto-ficticio-alfa]], [[plataforma-ficticia-beta]], log [[2035-09-02-catalogo-ficticio-alfa]].
- **2035-09-16 · o mural fictício publica só amostras com \`status: pronto\`**. Contexto: amostras de demonstração ficam em arquivos Markdown. Notas: [[academia-ficticia-gama]], log [[2035-09-16-mural-ficticio-gama]].
`);
  write(join(vaultRoot, 'decisions', '2035-10.md'), `---
type: Note
tags: [decisoes]
updated: 2035-10-03
---

# Decisões de outubro de 2035

## Entradas

- **2035-10-01 · a margem do contrato fictício passou a 18,7% por mês**. Contexto: o cenário de teste alterou um parâmetro de custo simulado. Notas: [[contrato-ficticio-alfa-0042]], log [[2035-10-01-calculo-ficticio-alfa]].
`);
  // Mês privado: a contagem é honesta, a entrada não sai.
  write(join(vaultRoot, 'decisions', '2035-08.md'), `---
type: Note
visibility: private
---

# Decisões de agosto de 2035

- **2035-08-10 · decisão com nome de pessoa**. Contexto: ficha cadastral. Notas: [[pessoa-ficticia-privada]].
`);
  // Rascunho não entra.
  write(join(vaultRoot, 'decisions', '_rascunho.md'), '# Rascunho\n\n- **2035-07-01 · nada**. Contexto: nada.\n');

  // Três temas de lição, no formato de bullet com data e regra.
  write(join(vaultRoot, 'resources', 'learnings', 'tema-ficticio-texto.md'), `---
type: Reference
updated: 2035-10-02
---

# Lições do mural fictício

Cartões fictícios de um mural de demonstração.

- **2035-09-28 · amostras do mural usam verbo no presente**: a persona fictícia aprovou o cartão de demonstração. **Why**: o exercício usa uma persona fictícia. **How to apply**: confira o cartão de demonstração.
- **2035-09-20 · título identifica a coleção fictícia**: o cartão de teste omitia a coleção. **Why**: a coleção organiza o catálogo fictício. **How to apply**: adicione a coleção de teste.
  - caso: [[post-ficticio-omega]]
- **2035-09-10 · cartão sem amostra fica no rascunho**: o cartão fictício não tinha exemplo. **Why**: a demonstração exige uma amostra. **How to apply**: inclua uma amostra fictícia.
- **2035-08-30 · usar somente símbolos do catálogo fictício**: a amostra usou um símbolo fora do catálogo. **Why**: o catálogo fictício delimita a demonstração. **How to apply**: compare com o catálogo de teste.
`);
  write(join(vaultRoot, 'resources', 'learnings', 'tema-ficticio-codigo.md'), `---
type: Reference
updated: 2035-10-01
---

# Lições de código e API

Módulos fictícios de uma aplicação de demonstração.

- **2035-09-15 · inventariar os módulos fictícios**: a amostra repetia um módulo fictício. **Why**: o catálogo de teste exige módulos distintos. **How to apply**: liste os módulos de demonstração.
  - caso: [[academia-ficticia-gama]]
- **2035-09-09 · módulo fictício usa etiqueta de demonstração**: a amostra omitia a etiqueta fictícia. **Why**: o exercício depende de uma etiqueta visível. **How to apply**: confira a etiqueta de teste.
  - caso: [[guia-ficticio-epsilon]]
`);
  write(join(vaultRoot, 'resources', 'learnings', 'tema-ficticio-validacao.md'), `---
type: Reference
updated: 2035-10-03
---

# Lições de verificação

Contagem de cartões do lote fictício.

- **2035-10-02 · validar a contagem do lote fictício**: o lote fictício contém três cartões de teste. **Why**: a contagem faz parte da demonstração. **How to apply**: conte os cartões fictícios.
`);
  // Tema privado: o nome do arquivo é o próprio assunto, então nem ele sai do servidor.
  write(join(vaultRoot, 'resources', 'learnings', 'cliente-ficticio-privado.md'), `---
type: Reference
visibility: private
updated: 2035-10-02
---

# Lições de um cliente nominal

- **2035-09-30 · primeira**: nada. **Why**: nada. **How to apply**: nada.
- **2035-09-20 · segunda**: nada. **Why**: nada. **How to apply**: nada.
- **2035-09-10 · terceira**: nada. **Why**: nada. **How to apply**: nada.
`);
  write(join(vaultRoot, 'resources', 'learnings', '_novo.md'), '# Rascunho\n\n- **2035-10-03 · nada**: nada.\n');

  // MEMORY com seções: só a contagem e o título das regras promovidas.
  write(join(vaultRoot, 'MEMORY.md'), `---
type: Note
updated: 2035-10-03
---

# MEMORY

Regras de toda sessão.

**Identificar toda amostra fictícia.** O catálogo de demonstração usa apenas dados inventados.

**Conferir o catálogo de demonstração.** A amostra de teste precisa aparecer na lista esperada.

## Vault

Nota citada é nota linkada.
`);

  // Teste de recall com duas linhas de resultado.
  write(join(vaultRoot, 'resources', 'teste-de-recall.md'), `---
type: Reference
status: Aprovado
updated: 2035-10-03
---

# Teste de recall

A régua do cérebro.

## Resultados

| Data | Acertos | Parciais | Erros | Placar | Perguntas que falharam | O que consertar |
| --- | --- | --- | --- | --- | --- | --- |
| 2035-09-27 | — | — | — | 85% | 2 (custo do contrato fictício), 7 (projetos da escola fictícia) | ligar a decisão simulada à nota do projeto fictício |
| 2035-10-03 | 10 | 0 | 0 | 100% | nenhuma | gabarito da 2 atualizado |

## Para que pode servir

Separa crescer de melhorar.
`);

  const vaultApi = await readApi(vaultRoot, { insights: '/api/vault-insights' });
  const model = vaultApi.insights;
  assert.equal(model.available, true, 'em modo vault, o aprendizado do vault está disponível');

  // Decisões: por mês, mais novo primeiro, com a nota afetada e o log de sessão.
  const decisions = model.decisions;
  assert.equal(decisions.available, true);
  assert.equal(decisions.folder, 'decisions');
  assert.deepEqual(decisions.months.map((month) => month.month), ['2035-10', '2035-09', '2035-08'],
    'os meses saem do mais novo para o mais antigo');
  assert.deepEqual(decisions.counts, { months: 3, entries: 4 },
    'rascunho `_` fica de fora; o mês privado conta sem mostrar');
  const setembro = decisions.months.find((month) => month.month === '2035-09');
  assert.equal(setembro.title, 'Decisões de setembro de 2035', 'o título do mês vem do H1 da nota');
  assert.equal(setembro.path, 'decisions/2035-09.md');
  assert.equal(setembro.count, 2);
  assert.deepEqual(setembro.entries.map((entry) => entry.date), ['2035-09-16', '2035-09-02'],
    'dentro do mês a entrada mais nova vem primeiro');
  const entry = setembro.entries[1];
  assert.equal(entry.decision, 'o catálogo fictício recebeu a coleção de amostras',
    'a linha da decisão sai sem a data e sem negrito');
  assert.equal(entry.context, 'a coleção de teste usa o catálogo de demonstração.',
    'o contexto é uma linha, lido do prefixo Contexto:');
  assert.deepEqual(entry.notes, [{ slug: 'projeto-ficticio-alfa', title: 'projeto-ficticio-alfa' }, { slug: 'plataforma-ficticia-beta', title: 'plataforma-ficticia-beta' }],
    'as notas afetadas mantêm o slug para ligar');
  assert.equal(entry.session, '2035-09-02-catalogo-ficticio-alfa', 'o log de sessão é o wikilink marcado como log');
  assert.equal(decisions.months[0].entries[0].date, '2035-10-01');

  // Mês privado: conta, mas não entrega entrada.
  const agosto = decisions.months.find((month) => month.month === '2035-08');
  assert.equal(agosto.private, true);
  assert.equal(agosto.title, null, 'o título do mês privado não sai do servidor');
  assert.deepEqual(agosto.entries, [], 'a entrada do mês privado fica no vault');
  assert.equal(agosto.count, 1, 'a contagem diz que existe entrada sem mostrá-la');

  // Lições por tema: contagem, as três últimas e o caso ligado.
  const lessons = model.lessons;
  assert.equal(lessons.available, true);
  assert.equal(lessons.folder, 'resources/learnings');
  assert.deepEqual(lessons.counts, { themes: 4, lessons: 10 }, 'quatro temas e dez lições, sem o rascunho');
  assert.deepEqual(lessons.themes.map((theme) => [theme.slug, theme.count]),
    [['tema-ficticio-texto', 4], [null, 3], ['tema-ficticio-codigo', 2], ['tema-ficticio-validacao', 1]],
    'o tema com mais lição vem primeiro, e o tema privado entra sem slug');
  const escrita = bySlug(lessons.themes, 'tema-ficticio-texto');
  assert.equal(escrita.title, 'Lições do mural fictício');
  assert.equal(escrita.path, 'resources/learnings/tema-ficticio-texto.md');
  assert.deepEqual(escrita.latest.map((lesson) => [lesson.date, lesson.rule]), [
    ['2035-09-28', 'amostras do mural usam verbo no presente'],
    ['2035-09-20', 'título identifica a coleção fictícia'],
    ['2035-09-10', 'cartão sem amostra fica no rascunho'],
  ], 'só as três lições mais novas de cada tema, com data e regra');
  assert.equal(escrita.latest[0].rule.includes('Why'), false, 'o corpo da lição não sai do servidor');
  assert.deepEqual(escrita.latest[1].cases, [{ slug: 'post-ficticio-omega', title: 'post-ficticio-omega' }],
    'o sub-bullet `caso:` vira link de caso');
  const codigo = bySlug(lessons.themes, 'tema-ficticio-codigo');
  assert.deepEqual(codigo.cases, [{ slug: 'academia-ficticia-gama', title: 'academia-ficticia-gama' }, { slug: 'guia-ficticio-epsilon', title: 'guia-ficticio-epsilon' }],
    'os casos do tema aparecem juntos, sem repetir');

  // Tema privado: conta, e nada do nome do arquivo sai — nem como slug.
  const privado = lessons.themes.find((theme) => theme.private);
  assert.equal(privado.title, null, 'o título do tema privado não sai do servidor');
  assert.equal(privado.path, null, 'o caminho revelaria o título');
  assert.equal(privado.slug, null, 'o slug é o nome do arquivo: também revelaria o assunto');
  assert.match(privado.id, /^[0-9a-f]{12}$/, 'o tema privado entra na lista com id opaco');
  assert.equal(privado.count, 3, 'a contagem diz que existem lições sem mostrá-las');
  assert.deepEqual(privado.latest, [], 'as lições do tema privado ficam na nota');
  assert.deepEqual(privado.cases, []);
  assert.equal(JSON.stringify(model).includes('cliente-ficticio-privado'), false,
    'o nome do arquivo privado não sai em nenhum campo da resposta');

  // Regras promovidas ao MEMORY: contagem e título, nunca o texto.
  const memory = model.memory;
  assert.equal(memory.available, true);
  assert.equal(memory.path, 'MEMORY.md');
  assert.equal(memory.count, 3, 'duas regras em negrito e uma seção `##` contam como regra promovida');
  assert.deepEqual(memory.rules, [
    'Identificar toda amostra fictícia',
    'Conferir o catálogo de demonstração',
    'Vault',
  ], 'só o título de cada regra sai do servidor');

  // Recall: último resultado, status e tamanho do histórico.
  const recall = model.recall;
  assert.equal(recall.available, true);
  assert.equal(recall.path, 'resources/teste-de-recall.md');
  assert.equal(recall.status, 'Aprovado');
  assert.equal(recall.history, 2, 'duas rodadas registradas');
  assert.deepEqual(recall.latest, {
    date: '2035-10-03',
    hits: 10,
    partials: 0,
    misses: 0,
    score: '100%',
    failed: 'nenhuma',
    fix: 'gabarito da 2 atualizado',
  }, 'o último resultado é o da data mais nova');
  assert.equal(recall.previous.date, '2035-09-27', 'a rodada anterior continua disponível para comparar');
  assert.equal(recall.previous.score, '85%');
  assert.equal(recall.previous.hits, null, 'célula ilegível fica nula: zero medido seria invenção');

  // Instalação padrão sem a chave `vault`: o aprendizado do vault não existe.
  write(join(standardRoot, 'VERSION'), 'fixture\n');
  write(join(standardRoot, 'COMECE-AQUI.md'), '# Fixture\n');
  write(join(standardRoot, '.cerebro', 'layout.json'), { version: 3 });
  write(join(standardRoot, 'decisions', '2035-10.md'), '# Decisões\n\n- **2035-10-01 · nada**. Contexto: nada.\n');
  write(join(standardRoot, 'MEMORY.md'), '# MEMORY\n\n**Regra.** nada.\n');
  const standardApi = await readApi(standardRoot, { insights: '/api/vault-insights' });
  assert.equal(standardApi.insights.available, false, 'sem a chave vault, /api/vault-insights é indisponível');
  assert.equal(standardApi.insights.decisions, undefined, 'instalação padrão não ganha decisões do vault');
  assert.equal(standardApi.insights.memory, undefined, 'instalação padrão não ganha regras do vault');

  // A tela não transforma célula nula em zero medido: o recall diz "não medido".
  const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
  const recallCard = app.slice(app.indexOf('function vaultRecallCard'), app.indexOf('function renderVaultLearning'));
  assert.doesNotMatch(recallCard, /brainCount\(latest\.(hits|partials|misses)\)/,
    'contagem não medida não pode sair como 0 no card do recall');
  assert.match(recallCard, /brainMeasure\(latest\.hits\)/, 'o card do recall mede pelo valor lido');
  assert.match(app, /function brainMeasure\(value\) \{[\s\S]*?'não medido'/,
    'valor nulo precisa aparecer como não medido');

  console.log('✓ /api/vault-insights lê decisões por mês, lições por tema, MEMORY e recall sem expor corpo bruto');
} finally {
  rmSync(vaultRoot, { recursive: true, force: true });
  rmSync(standardRoot, { recursive: true, force: true });
}

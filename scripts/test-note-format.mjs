#!/usr/bin/env node
// Formato de nota do Cérebro: o seed abre no Tolaria (tipos, views, Inbox) e no Obsidian.
// Defende as promessas: sem chave antiga em lugar nenhum do seed, todo type usado existe em type/,
// todo status usado (nota ou filtro de view) está no vocabulário declarado, e as views parseiam.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OLD_KEYS = [
  'tipo', 'criado', 'atualizado', 'confirmado', 'origem', 'tema', 'area',
  'fonte', 'pode-ir-comunidade', 'idioma', 'modelo',
];
const OLD_STATUS = /\bstatus:\s*["'`]?(superado|bruto|ativo|pausado|arquivado)\b/i;
const OLD_KEY_LINE = new RegExp(`^\\s*(${OLD_KEYS.join('|')}):`, 'm');
// Ícones do Tolaria são Phosphor em kebab-case; estes nomes de outras bibliotecas já escaparam uma vez.
const NOT_PHOSPHOR = new Set(['inbox', 'calendar-days', 'map']);

function filesWith(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesWith(path, ext) : name.endsWith(ext) ? [path] : [];
  });
}

// Parser mínimo de YAML (sem dependências; o teste roda também no pacote copiado). Cobre só o
// subconjunto usado aqui: mapas aninhados por indentação, listas com "- ", escalares simples ou
// entre aspas e lista inline [a, b]. Qualquer outra coisa é erro, e é isso que pega yml malformado.
function parseYaml(text, label) {
  const lines = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const body = raw.trim();
    if (!body || body.startsWith('#')) return;
    if (/\t/.test(raw.match(/^\s*/)[0])) throw new Error(`${label}:${i + 1}: tab na indentação`);
    lines.push({ n: i + 1, indent: raw.match(/^ */)[0].length, text: body });
  });
  let pos = 0;
  const fail = (n, why) => { throw new Error(`${label}:${n}: ${why}`); };

  function scalar(value, n) {
    if (value === '') return null;
    if (value[0] === '"' || value[0] === "'") {
      if (value.length < 2 || value[value.length - 1] !== value[0]) fail(n, 'aspas sem fechar');
      return value.slice(1, -1);
    }
    if (value[0] === '[') {
      if (!value.endsWith(']')) fail(n, 'lista inline sem fechar');
      const inner = value.slice(1, -1).trim();
      return inner ? inner.split(',').map((item) => scalar(item.trim(), n)) : [];
    }
    if (/^[{|>&*!]/.test(value)) fail(n, 'sintaxe fora do subconjunto');
    if (/:\s/.test(value)) fail(n, 'dois-pontos dentro de valor sem aspas');
    return value;
  }

  function parseMap(indent) {
    const out = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith('- ')) {
      const { n, text } = lines[pos];
      const match = text.match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
      if (!match) fail(n, 'esperado "chave: valor"');
      if (match[1] in out) fail(n, `chave repetida: ${match[1]}`);
      pos += 1;
      if (match[2]) out[match[1]] = scalar(match[2], n);
      else if (pos < lines.length && lines[pos].indent > indent) out[match[1]] = parseBlock(lines[pos].indent);
      else if (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) out[match[1]] = parseList(indent);
      else out[match[1]] = null;
    }
    return out;
  }

  function parseList(indent) {
    const out = [];
    while (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) {
      const { n, text } = lines[pos];
      const lead = text.match(/^-\s+/)[0].length;
      const rest = text.slice(lead);
      if (/^[A-Za-z_][\w-]*:(\s|$)/.test(rest)) {
        lines[pos] = { n, indent: indent + lead, text: rest };
        out.push(parseMap(indent + lead));
      } else {
        out.push(scalar(rest, n));
        pos += 1;
      }
    }
    return out;
  }

  function parseBlock(indent) {
    return lines[pos].text.startsWith('- ') ? parseList(indent) : parseMap(indent);
  }

  if (!lines.length) return {};
  if (lines[0].indent !== 0) fail(lines[0].n, 'indentação inicial');
  const result = parseBlock(0);
  if (pos < lines.length) fail(lines[pos].n, 'indentação inesperada');
  return result;
}

function frontmatter(path) {
  const text = readFileSync(path, 'utf8');
  if (!text.startsWith('---')) return null;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  assert(match, `${relative(ROOT, path)}: frontmatter sem fechamento`);
  return parseYaml(match[1], relative(ROOT, path));
}

// type/: um documento por tipo, com o vocabulário de status legível por máquina em `statuses`.
const typeDir = join(ROOT, 'type');
const declared = new Map();
for (const file of filesWith(typeDir, '.md')) {
  const rel = relative(ROOT, file);
  const fm = frontmatter(file);
  assert.equal(fm?.type, 'Type', `${rel}: type document precisa de "type: Type"`);
  for (const key of ['_icon', '_color', '_sidebar_label', '_order']) {
    assert(fm[key] !== undefined && fm[key] !== null && fm[key] !== '', `${rel}: falta ${key}`);
  }
  assert(/^[a-z]+(-[a-z]+)*$/.test(fm._icon) && !NOT_PHOSPHOR.has(fm._icon), `${rel}: _icon "${fm._icon}" não é Phosphor em kebab-case`);
  if (fm.statuses !== undefined) {
    assert(Array.isArray(fm.statuses) && fm.statuses.length && fm.statuses.every((s) => typeof s === 'string' && s),
      `${rel}: statuses precisa ser lista não vazia de textos`);
  }
  const h1 = readFileSync(file, 'utf8').match(/^# (.+)$/m)?.[1];
  assert.equal(h1?.toLowerCase(), file.split('/').pop().replace(/\.md$/, ''), `${rel}: H1 e nome do arquivo divergem`);
  declared.set(h1, { file, statuses: fm.statuses ?? [] });
}
for (const required of ['Map', 'Area', 'Thread', 'Person', 'Decision', 'Daily', 'Atom', 'Source', 'Capture']) {
  assert(declared.has(required), `type/${required.toLowerCase()}.md ausente`);
}

// Notas do seed: meu-negocio, capturas (só _LEIA.md vai no pacote), templates e type.
const viewDir = join(ROOT, 'views');
const viewFiles = filesWith(viewDir, '.yml');
const seedNotes = [
  ...filesWith(join(ROOT, 'meu-negocio'), '.md'),
  ...filesWith(join(ROOT, 'capturas'), '.md'),
  ...filesWith(join(ROOT, 'templates'), '.md'),
  ...filesWith(typeDir, '.md'),
];

// Nenhuma chave ou status antigo: no frontmatter (com ou sem aspas), em bloco de código de exemplo
// ou em linha solta do corpo, e também nas views.
for (const file of [...seedNotes, ...viewFiles]) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const bad = text.match(OLD_KEY_LINE);
  assert(!bad, `${rel}: chave antiga "${bad?.[1]}:" (frontmatter, bloco de exemplo ou linha solta)`);
  assert(!OLD_STATUS.test(text), `${rel}: status antigo; use o vocabulário em inglês de type/ (ex.: Superseded, Done)`);
}

for (const file of seedNotes.filter((f) => !f.startsWith(typeDir))) {
  const rel = relative(ROOT, file);
  const fm = frontmatter(file);
  if (fm?.type !== undefined) assert(declared.has(fm.type), `${rel}: type "${fm.type}" sem arquivo em type/`);
  if (fm?.status !== undefined) {
    const vocab = declared.get(fm.type)?.statuses ?? [];
    assert(vocab.includes(fm.status), `${rel}: status "${fm.status}" fora do vocabulário de ${fm.type ?? 'sem type'}: [${vocab.join(', ')}]`);
  }
}

// views/: parseiam de verdade, filtram por types e status que existem
assert(viewFiles.length >= 5, 'views/ precisa das 5 views do Cérebro');
const allStatuses = new Set([...declared.values()].flatMap((t) => t.statuses));
for (const file of viewFiles) {
  const rel = relative(ROOT, file);
  const view = parseYaml(readFileSync(file, 'utf8'), rel);
  for (const key of ['name', 'icon', 'color', 'sort']) {
    assert(typeof view[key] === 'string' && view[key], `${rel}: falta ${key}`);
  }
  assert(/^[a-z]+(-[a-z]+)*$/.test(view.icon) && !NOT_PHOSPHOR.has(view.icon), `${rel}: icon "${view.icon}" não é Phosphor em kebab-case`);
  const all = view.filters?.all;
  assert(Array.isArray(all) && all.length >= 1, `${rel}: filters.all ausente ou vazio`);
  for (const filter of all) {
    for (const key of ['field', 'op', 'value']) {
      assert(typeof filter[key] === 'string' && filter[key], `${rel}: filtro sem ${key}`);
    }
    assert.equal(filter.op, 'equals', `${rel}: só o operador equals é comprovado no Tolaria`);
    assert(!OLD_KEYS.includes(filter.field), `${rel}: filtro por chave antiga "${filter.field}"`);
  }
  const typeValues = all.filter((f) => f.field === 'type').map((f) => f.value);
  for (const value of typeValues) assert(declared.has(value), `${rel}: filtra por type inexistente "${value}"`);
  for (const filter of all.filter((f) => f.field === 'status')) {
    const scope = typeValues.length
      ? new Set(typeValues.flatMap((t) => declared.get(t).statuses))
      : allStatuses;
    assert(scope.has(filter.value), `${rel}: status "${filter.value}" fora do vocabulário declarado em type/ [${[...scope].join(', ')}]`);
  }
}

// o seed instalado precisa levar type/ e views/ para a instalação nova
const seed = readFileSync(join(ROOT, '.cerebro', 'seed.manifest'), 'utf8').split('\n').map((l) => l.trim());
for (const dir of ['type', 'views']) assert(seed.includes(dir), `seed.manifest precisa listar ${dir}`);

console.log(`ok: formato de nota · ${seedNotes.length} notas do seed · ${declared.size} types · ${viewFiles.length} views`);

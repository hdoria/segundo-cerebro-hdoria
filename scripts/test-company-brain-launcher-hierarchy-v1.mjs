#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(process.cwd());
const app = readFileSync(resolve(root, 'console/app.js'), 'utf8');
const css = readFileSync(resolve(root, 'console/styles.css'), 'utf8');


const tokenCss = readFileSync(resolve(root, 'console/design/tokens.css'), 'utf8');
const designValues = new Map([...tokenCss.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(([,name,value])=>[name,value.trim()]));
function designNumber(name) {
  const value=designValues.get(name);
  assert.ok(value, `token canônico ausente: ${name}`);
  const alias=value.match(/^var\((--[\w-]+)\)$/);
  if(alias)return designNumber(alias[1]);
  const scale=value.match(/^calc\(var\((--[\w-]+)\)\s*\*\s*([\d.]+)\)$/);
  if(scale)return designNumber(scale[1])*Number(scale[2]);
  assert.match(value,/^-?(?:\d*\.)?\d+(?:px|ms)?$/);
  return Number.parseFloat(value);
}

const summaryRule = app.match(/const hidesSummary = ([^;]+);/)[1];
for (const view of ['activation', 'canvas', 'system', 'systems', 'skills', 'vibe-makers', 'hermes', 'anatomy']) {
  assert.equal(runInNewContext(summaryRule, { state: { view } }), true,
    `${view} não deve repetir o resumo operacional de Hoje`);
}
assert.equal(runInNewContext(summaryRule, { state: { view: 'today' } }), false);
const launcherMeasure=css.match(/\.systems-market-grid \{[^}]*minmax\(var\((--[\w-]+)\), 1fr\)/)?.[1];
assert.ok(launcherMeasure, 'grade deve consumir uma medida canônica');
assert.ok(designNumber(launcherMeasure)>=330, 'grade deve reservar pelo menos 330px para reconhecer cada Sistema');
assert.match(
  css,
  /\.system-card-title h3 \{[^}]*font-size: var\(--fs-lead\)/,
  'nome do Sistema deve manter hierarquia de título',
);
assert.doesNotMatch(
  css,
  /\.system-card-title h3 \{[^}]*-webkit-line-clamp/,
  'nome do Sistema não pode ser truncado por quantidade fixa de linhas',
);
assert.match(
  css,
  /\.system-result \{[^}]*-webkit-line-clamp: 3/,
  'resultado precisa de três linhas úteis antes do corte',
);
assert.doesNotMatch(css, /\.system-accent-\d/, 'categoria não pode voltar a pintar a casca do card');
assert.doesNotMatch(css, /\.system-launcher-card[^}]*linear-gradient/, 'card não pode usar gradiente decorativo');

console.log('company-brain-launcher-hierarchy-v1: ok');

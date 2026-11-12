#!/usr/bin/env node
// Publica a árvore do HEAD privado como um commit de release no repositório público.
// O commit novo tem como único pai o main público, então o histórico privado nunca sai daqui.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PUBLIC_URL = 'https://github.com/hdoria/segundo-cerebro-hdoria.git';
const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (message) => { console.error(message); process.exit(1); };

const apply = process.argv.includes('--apply');
const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
const tag = `v${version}`;

if (git('status', '--porcelain')) fail('Há mudanças não commitadas. Commit antes de publicar.');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Publique a partir da main.');
if (git('ls-remote', '--tags', PUBLIC_URL, `refs/tags/${tag}`)) fail(`A tag ${tag} já existe no público. Suba o VERSION antes.`);
if (!readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').includes(`## ${tag} `)) fail(`CHANGELOG.md não tem a seção ## ${tag}.`);
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const staleTags = [...new Set(readme.match(/\bv\d+\.\d+\.\d+\b/g) || [])].filter(found => found !== tag);
if (!readme.includes(tag) || staleTags.length) fail(`README.md precisa instalar ${tag}${staleTags.length ? ` (ainda cita ${staleTags.join(', ')})` : ''}.`);

git('fetch', '-q', PUBLIC_URL, 'main');
const publicHead = git('rev-parse', 'FETCH_HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
if (git('rev-parse', `${publicHead}^{tree}`) === tree) fail('O público já tem esta árvore. Nada a publicar.');

const changed = git('diff', '--stat', publicHead, 'HEAD').split('\n').pop();
console.log(`Release ${tag}: árvore ${tree.slice(0, 7)} sobre o público ${publicHead.slice(0, 7)} (${changed}).`);
if (!apply) { console.log('Prévia. Rode de novo com --apply para publicar.'); process.exit(0); }

const commit = execFileSync('git', ['commit-tree', tree, '-p', publicHead, '-m', `chore(release): ${tag}`], { cwd: root, encoding: 'utf8' }).trim();
git('push', '-q', PUBLIC_URL, `${commit}:refs/heads/main`);
git('push', '-q', PUBLIC_URL, `${commit}:refs/tags/${tag}`);
console.log(`Publicado ${tag} em ${commit.slice(0, 7)}.`);

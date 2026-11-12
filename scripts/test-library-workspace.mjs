#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';

const temporary = mkdtempSync(new URL('../.library-workspace-test-', import.meta.url));
try {
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import {LibraryWorkspace,libraryTypeLabel} from './console/ui/library-workspace.jsx';
    import {createNoteDocument} from './console/ui/note-markdown.js';
    export {libraryTypeLabel};
    export function render(options={}) {
      const document=createNoteDocument('# Formatted example\\n\\nA **readable** note.\\n');
      const state={area:'',filters:{query:'',directory:'',type:'Person',tag:'',sort:'title'},selectedRef:'people/example.md',listScroll:0,panel:'note',filtersCollapsed:false,expanded:false,loading:false,loadingMore:false,error:'',noteLoading:false,noteError:'',linkLoading:false,noteInstance:1,
        result:{files:[{ref:'people/example.md',title:'Fictitious person',type:'Person',tags:['sample'],modified_at:'2026-10-21T10:00:00Z'}],total:1,complete:true,facets:{types:[{value:'Person',count:1},{value:'Company',count:2}],tags:[{value:'sample',count:1}],folders:[{ref:'people',name:'people',count:1}]}},
        noteSession:{getState(){},startEditing(){},change(){},cancel(){},save(){}},noteState:{file:{ref:'people/example.md',title:'Fictitious person',text:'# Formatted example\\n\\nA **readable** note.\\n'},document,value:document.value,editing:false,dirty:false,busy:false,error:'',saved:false},...options};
      const controller={setFilters(){},setPanel(){},setExpanded(){},setFiltersCollapsed(){},setListScroll(){},openNote(){},closeNote(){},refresh(){},loadMore(){},followLink(){}};
      return renderToStaticMarkup(<LibraryWorkspace state={state} controller={controller}/>);
    }
  `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' });
  const path = join(temporary, 'render.mjs'); writeFileSync(path, bundle.outputFiles[0].text);
  const { render, libraryTypeLabel } = await import(pathToFileURL(path));
  assert.equal(libraryTypeLabel('Person'), 'Pessoas');
  assert.equal(libraryTypeLabel('Company'), 'Empresas');
  assert.equal(libraryTypeLabel('Custom type'), 'Custom type');
  const html = render();
  for (const label of ['Cérebro', 'Todas as notas', 'Recentes', 'Tipos', 'Tags', 'Pastas', 'Termo de busca', 'Pessoas', 'Empresas', 'Fictitious person', 'Formatted example', 'Expandir leitura']) assert.ok(html.includes(label), label);
  assert.match(html, /data-library-workspace=""/);
  assert.match(html, /aria-label="Categorias do cérebro" tabindex="-1"/);
  assert.match(html, /aria-label="Lista de notas" tabindex="-1"/);
  assert.match(html, /data-note-workspace=""/);
  const groups = [...html.matchAll(/<details\b([^>]*data-library-group="([^"]+)"[^>]*)>([\s\S]*?)<\/details>/g)];
  assert.equal(groups.length, 3, 'types, tags and folders have separate native accessible disclosure groups');
  assert.match(groups.find(group => group[2] === 'types')[1], /\bopen=""/);
  assert.doesNotMatch(groups.find(group => group[2] === 'tags')[1], /\bopen=/, 'large tag catalog starts collapsed so folders remain reachable');
  assert.match(groups.find(group => group[2] === 'folders')[1], /\bopen=""/);
  assert.match(groups.find(group => group[2] === 'types')[3], /<summary[^>]*>[\s\S]*?Tipos[\s\S]*?library-count">2</);
  assert.match(groups.find(group => group[2] === 'tags')[3], /<summary[^>]*>[\s\S]*?Tags[\s\S]*?library-count">1</);
  assert.match(groups.find(group => group[2] === 'folders')[3], /<summary[^>]*>[\s\S]*?Pastas[\s\S]*?library-count">1</);
  assert.match(html, /<h1[^>]*>.*Formatted example/s);
  assert.match(html, /<strong[^>]*>.*readable/s);
  assert.doesNotMatch(html, /class="drawer|<iframe|<script|<img/);
  assert.match(render({ result: { files: [], total: 0, complete: false, facets: { types: [], tags: [], folders: [] } }, noteState: null, noteSession: null }), /Acervo parcial/);
  const loading = render({ loading: true, result: { files: [], total: 0, complete: true, facets: { types: [], tags: [], folders: [] } } });
  assert.match(loading, /Carregando notas/);
  assert.doesNotMatch(loading, /0 notas|Nenhuma nota encontrada|Nenhum tipo disponível|Nenhuma tag disponível|Nenhuma pasta disponível/, 'pending initial metadata is never presented as a verified empty library');
  assert.match(render({ error: 'unsafe internal /private/path' }), /Não foi possível carregar/);
  assert.doesNotMatch(render({ error: 'unsafe internal /private/path' }), /unsafe internal/);
  assert.match(render({ noteState: null, noteSession: null }), /Selecione uma nota/);
  assert.match(render({ panel: 'list', noteState: null, noteSession: null, noteError: 'not-found' }), /Esta nota não está disponível para leitura/);
  console.log('✓ library workspace SSR: contextual metadata navigation, real Plate inline, translated types, empty/loading/partial/error states');
} finally { rmSync(temporary, { recursive: true, force: true }); }

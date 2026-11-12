#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temporary = mkdtempSync(new URL('../.note-workspace-test-', import.meta.url));
try {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {NoteWorkspace,findNoteEditablePoint} from './console/ui/note-workspace.jsx';
      import {createNoteDocument,createNotePlugins} from './console/ui/note-markdown.js';
      import {createSlateEditor} from 'platejs';
      export function editingEntryPoint() {
        const document=createNoteDocument('<!-- Comment -->\\n\\n# First editable text\\n\\n<!-- Final preserved comment -->\\n');
        const editor=createSlateEditor({plugins:createNotePlugins(),value:document.value,nodeId:false});
        const point=findNoteEditablePoint(editor);
        editor.tf.select(point);
        editor.tf.insertText('Inserted ');
        return {point,text:editor.children[1].children[0].text,firstType:editor.children[0].type};
      }
      export function render(text, options={}) {
        const document=createNoteDocument(text);
        const state={file:{ref:'notes/demo.md',title:'Demonstração',type:'Note',text,sha256:'a'.repeat(64)},document,value:document.value,editing:false,dirty:false,busy:false,error:'',saved:false,...options};
        const session={startEditing(){},change(){},cancel(){},save(){},requestLeave:async()=>true};
        return renderToStaticMarkup(<NoteWorkspace state={state} session={session} inline={Boolean(options.inline)} onNavigate={()=>{}} onReload={()=>{}}/>);
      }
      export async function invokeConflictReload() {
        const document=createNoteDocument('# Example');
        let confirmations=0,reloads=0;
        const state={file:{ref:'example.md',title:'Example',text:'# Example'},document,value:document.value,editing:true,dirty:true,busy:false,error:'local-note-conflict'};
        const session={requestLeave:async()=>{confirmations++;return true;}};
        const tree=NoteWorkspace({state,session,onReload:()=>{reloads++;}});
        const pending=[tree];
        while(pending.length) {
          const node=pending.shift();
          if(node?.props?.children==='Recarregar nota') { node.props.onClick(); break; }
          if(node?.props) pending.push(...React.Children.toArray(node.props.children));
        }
        await Promise.resolve();
        return {confirmations,reloads};
      }
    `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent',
  });
  const path = join(temporary, 'render.mjs');
  writeFileSync(path, bundle.outputFiles[0].text);
  const { render, invokeConflictReload, editingEntryPoint } = await import(pathToFileURL(path));
  assert.deepEqual(editingEntryPoint(), { point: { path: [1, 0], offset: 0 }, text: 'Inserted First editable text', firstType: 'note_raw' }, 'entering edit selects real text and can insert immediately despite leading/trailing preserved voids');
  const source = '---\ntype: Note\ntags: [example, demo]\n---\n# Readable title\n\nA **bold** paragraph with *emphasis* and [[Other page|Go to note]].\n\n- One\n- Two\n\n1. First\n2. Second\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| One | Two |\n\n```js\nconst x = 1;\n```\n\n<!-- ai:start -->\nDraft.\n<!-- ai:end -->\n\n<script>alert("fictional")</script>\n\n![Remote](https://invalid.example/tracker.png)\n';
  const reading = render(source);
  assert.match(reading, /data-note-workspace=""/);
  assert.match(reading, /<h1[^>]*>.*Readable title/s);
  assert.match(reading, /<strong[^>]*>.*bold/s);
  assert.match(reading, /<em[^>]*>.*emphasis/s);
  assert.match(reading, /<table[\s>]/);
  assert.match(reading, /<ol[^>]*start="2"/);
  assert.match(reading, /type="checkbox"[^>]*checked/);
  assert.match(reading, /Go to note/);
  assert.match(reading, /Abrir nota: Go to note/);
  assert.match(reading, /Ver Markdown original/);
  assert.match(reading, /Propriedades/);
  assert.match(reading, /aria-haspopup="dialog"/);
  assert.doesNotMatch(reading, /<details class="note-properties"|<dl[ >]/, 'properties occupy no permanent reading column or details block');
  assert.match(render(source, { inline: true }), /class="note-workspace note-workspace-inline"/, 'inline reading does not reserve drawer-close space');
  assert.doesNotMatch(reading, /note-workspace-inline/);
  assert.match(reading, />Editar nota</);
  assert.doesNotMatch(reading, /<script|<img|<iframe|dangerouslySetInnerHTML/);
  assert.match(reading, /&lt;script&gt;/);
  assert.doesNotMatch(reading, /contenteditable="true"/i);
  const editing = render(source, { editing: true, dirty: true });
  assert.match(editing, /contenteditable="true"/i);
  assert.match(editing, /role="toolbar"/);
  assert.match(editing, />Salvar nota</);
  assert.match(editing, />Cancelar edição</);
  assert.match(editing, /Alterações não salvas/);
  const unchangedEditing = render(source, { editing: true, dirty: false });
  assert.match(unchangedEditing, /Edição · sem alterações/);
  assert.doesNotMatch(unchangedEditing, />Leitura</);
  for (const label of ['Negrito', 'Itálico', 'Lista com marcadores', 'Lista numerada', 'Lista de tarefas', 'Código em bloco', 'Inserir link', 'Inserir tabela']) assert.match(editing, new RegExp(`aria-label="${label}"`));
  const conflict = render(source, { editing: true, dirty: true, error: 'local-note-conflict' });
  assert.match(conflict, /arquivo mudou|nota mudou/i);
  assert.match(conflict, /rascunho/);
  assert.match(conflict, /Recarregar nota/);
  assert.deepEqual(await invokeConflictReload(), { confirmations: 0, reloads: 1 }, 'the parent navigation boundary owns the single fresh discard confirmation');
  const recovery = render(source, { editing: true, dirty: true, error: 'local-note-recovery-required' });
  assert.match(recovery, /duas versões foram preservadas em armazenamento privado/);
  assert.match(recovery, /pode já conter sua alteração/);
  assert.match(recovery, /recuperação manual/);
  assert.match(recovery, /Recarregar nota/);
  assert.doesNotMatch(recovery, /Reinicie o Console/);
  assert.match(recovery, /rascunho/);
  const unsupportedFilesystem = render(source, { editing: true, dirty: true, error: 'local-note-filesystem-unsupported' });
  assert.match(unsupportedFilesystem, /volume/);
  assert.match(unsupportedFilesystem, /rascunho/);
  const unsafe = render('[Do not execute](javascript:alert)\n\n![Do not load](https://invalid.example/secret.png)\n');
  assert.doesNotMatch(unsafe, /href="javascript:|<img/);
  console.log('✓ note workspace actual React/Plate SSR: formatted reading, explicit edit controls, preserved blocks, safe links/embeds and conflict recovery');
} finally { rmSync(temporary, { recursive: true, force: true }); }

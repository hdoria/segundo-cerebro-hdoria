import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Plate, PlateContent, PlateElement, PlateLeaf, usePlateEditor, useReadOnly } from 'platejs/react';
import { toggleList } from '@platejs/list';
import { toggleCodeBlock } from '@platejs/code-block';
import { insertTable } from '@platejs/table';
import { upsertLink } from '@platejs/link';
import { Bold, Italic, List, ListOrdered, ListChecks, Code2, Link2, Table2, Undo2, Redo2, SlidersHorizontal, X } from 'lucide-react';
import { Button } from './components/button.jsx';
import { Input } from './components/input.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './components/dialog.jsx';
import { NativeSelect, NativeSelectOption } from './components/native-select.jsx';
import { createNoteDocument, serializeNoteDocument, createNotePlugins } from './note-markdown.js';
import { createNoteSession } from './note-session.js';

const messages = {
  'local-note-conflict': 'A nota mudou no arquivo enquanto você editava. Seu rascunho foi mantido. Recarregue a nota somente quando puder descartar estas alterações.',
  'local-note-busy': 'Esta nota está sendo salva em outra operação. Seu rascunho foi mantido; tente salvar novamente.',
  'local-note-metadata-immutable': 'As propriedades da nota são somente leitura. Seu rascunho foi mantido.',
  'local-note-markers-immutable': 'Os marcadores de IA precisam permanecer no texto. Desfaça a alteração no bloco preservado e tente salvar novamente.',
  'local-note-format-immutable': 'O formato original do arquivo precisa ser preservado. Seu rascunho foi mantido.',
  'local-note-invalid': 'Não foi possível salvar este conteúdo. O arquivo aceita texto UTF-8 de até 512 KiB.',
  'local-note-recovery-required': 'Não foi possível confirmar o resultado. A nota pode já conter sua alteração; as duas versões foram preservadas em armazenamento privado para recuperação manual. Seu rascunho continua aberto. Reabra a nota para conferir antes de salvar novamente.',
  'local-note-filesystem-unsupported': 'Esta nota está em um volume que não permite o salvamento seguro pelo Console. Seu rascunho foi mantido; o arquivo original não foi substituído.',
  'note-markdown-protected-content': 'Um bloco preservado foi removido ou alterado. Desfaça essa alteração para salvar o restante da nota.',
  'note-markdown-split-source-block': 'Uma alteração dividiu um bloco que precisa ser preservado. Desfaça essa alteração para salvar.',
  'note-markdown-unsupported': 'Esta alteração contém uma formatação que ainda não pode ser salva como Markdown. Desfaça a alteração; seu rascunho continua aberto.',
  'note-markdown-invalid-frontmatter': 'As propriedades desta nota não puderam ser interpretadas com segurança. A leitura continua disponível; a edição visual está desativada.',
  'note-markdown-invalid-ai-markers': 'Esta nota tem marcadores de IA incompletos. A leitura continua disponível; a edição visual está desativada.',
};
const errorMessage = reason => messages[reason] || 'Não foi possível salvar a nota. Seu rascunho foi mantido. Tente novamente.';
const safeHref = value => {
  if (typeof value !== 'string' || /[\u0000-\u0020]/.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};
const plainText = node => typeof node?.text === 'string' ? node.text : (node?.children || []).map(plainText).join('');
const propertyText = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(propertyText).join(', ') : value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

function NoteElement(props) {
  const { element, editor, children } = props;
  const readOnly = useReadOnly();
  const type = element.type;
  if (type === 'p' && element.listStyleType) {
    const todo = element.listStyleType === 'todo';
    const ordered = !todo && !['disc', 'circle', 'square'].includes(element.listStyleType);
    const start = Number.isSafeInteger(element.listStart) ? element.listStart : Number.isSafeInteger(element.listRestart) ? element.listRestart : 1;
    const attributes = ordered ? { ...props.attributes, start } : props.attributes;
    const checked = Boolean(element.checked);
    return <PlateElement {...props} attributes={attributes} as={ordered ? 'ol' : 'ul'} className={`note-list${todo ? ' note-task-list' : ''}`} style={{ '--note-indent': Math.min(12, Math.max(1, Number(element.indent) || 1)) }}>
      <li>{todo && <span contentEditable={false} className="note-task-control"><input type="checkbox" checked={checked} disabled={readOnly} aria-label={`${checked ? 'Concluído' : 'Pendente'}: ${plainText(element).slice(0, 100)}`} onMouseDown={event => event.preventDefault()} onChange={() => {
        const at = editor.api.findPath(element);
        if (at) editor.tf.setNodes({ checked: !checked }, { at });
      }} /></span>}{children}</li>
    </PlateElement>;
  }
  if (type === 'table') return <PlateElement {...props} as="table" className="note-table"><tbody>{children}</tbody></PlateElement>;
  if (type === 'code_block') return <PlateElement {...props} as="pre" className="note-code-block"><code>{children}</code></PlateElement>;
  if (type === 'code_line') return <PlateElement {...props} as="div" className="note-code-line">{children}</PlateElement>;
  if (type === 'hr') return <PlateElement {...props} as="div" className="note-rule"><hr contentEditable={false}/>{children}</PlateElement>;
  if (type === 'a') {
    const href = safeHref(element.url);
    return <PlateElement {...props} attributes={{ ...props.attributes, ...(href ? { href, target: '_blank', rel: 'noopener noreferrer', title: element.title || undefined, onClick: event => { if (!editor.dom.readOnly) event.preventDefault(); } } : {}) }} as={href ? 'a' : 'span'} className={href ? 'note-external-link' : undefined}>{children}</PlateElement>;
  }
  const tag = /^(?:p|h[1-6]|blockquote|tr|td|th)$/.test(type) ? type : 'div';
  return <PlateElement {...props} as={tag}>{children}</PlateElement>;
}

function RawElement(props) {
  const { element, children } = props;
  return <PlateElement {...props} as="div" className="note-preserved-block">
    <details contentEditable={false}><summary>{element.label || 'Bloco preservado'}</summary><pre>{element.raw}</pre></details>{children}
  </PlateElement>;
}

function WikiElement({ onNavigate, ...props }) {
  const { element, editor, children } = props;
  const readOnly = useReadOnly();
  let label = element.label;
  if (element.noteMarks?.bold) label = <strong>{label}</strong>;
  if (element.noteMarks?.italic) label = <em>{label}</em>;
  if (element.noteMarks?.strikethrough) label = <s>{label}</s>;
  return <PlateElement {...props} as="span" className="note-wikilink">
    <button type="button" contentEditable={false} disabled={!readOnly} aria-label={`Abrir nota: ${element.label}`} title={element.target} onClick={() => onNavigate?.(element.target)}>{label}</button>{children}
  </PlateElement>;
}

const BoldLeaf = props => <PlateLeaf {...props} as="strong"/>;
const ItalicLeaf = props => <PlateLeaf {...props} as="em"/>;
const CodeLeaf = props => <PlateLeaf {...props} as="code" className="note-inline-code"/>;
const StrikeLeaf = props => <PlateLeaf {...props} as="s"/>;

function EditorToolbar({ editor, busy }) {
  const [link, setLink] = React.useState(false);
  const [linkError, setLinkError] = React.useState('');
  const selection = React.useRef(null);
  const act = operation => { if (busy) return; editor.tf.focus(); operation(); };
  const tool = (label, Icon, operation) => <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => act(operation)}><Icon aria-hidden="true"/></Button>;
  return <div className="note-toolbar-wrap">
    <div className="note-toolbar" role="toolbar" aria-label="Formatação da nota">
      <NativeSelect aria-label="Estilo do bloco" disabled={busy} defaultValue="p" onFocus={() => { selection.current = editor.selection; }} onChange={event => {
        if (selection.current) editor.tf.select(selection.current);
        act(() => editor.tf.toggleBlock(event.target.value));
      }}>
        <NativeSelectOption value="p">Texto</NativeSelectOption><NativeSelectOption value="h1">Título 1</NativeSelectOption><NativeSelectOption value="h2">Título 2</NativeSelectOption><NativeSelectOption value="h3">Título 3</NativeSelectOption><NativeSelectOption value="blockquote">Citação</NativeSelectOption>
      </NativeSelect>
      <span className="note-toolbar-group">
        {tool('Negrito', Bold, () => editor.tf.toggleMark('bold'))}
        {tool('Itálico', Italic, () => editor.tf.toggleMark('italic'))}
      </span>
      <span className="note-toolbar-group">
        {tool('Lista com marcadores', List, () => toggleList(editor, { listStyleType: 'disc' }))}
        {tool('Lista numerada', ListOrdered, () => toggleList(editor, { listStyleType: 'decimal' }))}
        {tool('Lista de tarefas', ListChecks, () => toggleList(editor, { listStyleType: 'todo' }))}
      </span>
      <span className="note-toolbar-group">
        {tool('Código em bloco', Code2, () => toggleCodeBlock(editor))}
        {tool('Inserir link', Link2, () => { selection.current = editor.selection; setLink(value => !value); setLinkError(''); })}
        {tool('Inserir tabela', Table2, () => insertTable(editor, { rowCount: 3, colCount: 2, header: true }, { select: true }))}
      </span>
      <span className="note-toolbar-group">
        {tool('Desfazer', Undo2, () => editor.tf.undo())}{tool('Refazer', Redo2, () => editor.tf.redo())}
      </span>
    </div>
    {link && <form className="note-link-form" onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      const data = new FormData(event.currentTarget);
      const url = safeHref(String(data.get('url') || '').trim());
      if (!url) { setLinkError('Use um endereço completo com http ou https.'); return; }
      if (selection.current) editor.tf.select(selection.current);
      act(() => upsertLink(editor, { url, ...(String(data.get('label') || '').trim() ? { text: String(data.get('label')).trim() } : {}) }));
      setLink(false);
    }}>
      <label>Endereço<Input autoFocus type="url" name="url" placeholder="https://" required disabled={busy}/></label>
      <label>Texto do link<Input name="label" placeholder="Manter texto selecionado" disabled={busy}/></label>
      <div className="note-link-actions"><Button type="button" variant="ghost" onClick={() => { setLink(false); editor.tf.focus(); }}>Cancelar link</Button><Button type="submit" disabled={busy}>Inserir</Button></div>
      {linkError && <p className="note-error" role="alert">{linkError}</p>}
    </form>}
  </div>;
}

export function findNoteEditablePoint(editor) {
  for (const [, path] of editor.api.nodes({ at: [], match: node => typeof node.text === 'string', voids: false })) return { path, offset: 0 };
  return null;
}

function NoteEditor({ state, session, onNavigate }) {
  const wiki = React.useCallback(props => <WikiElement {...props} onNavigate={onNavigate}/>, [onNavigate]);
  const components = React.useMemo(() => ({ ...Object.fromEntries(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'code_block', 'code_line', 'table', 'tr', 'td', 'th', 'a'].map(key => [key, NoteElement])), note_raw: RawElement, note_wikilink: wiki, bold: BoldLeaf, italic: ItalicLeaf, code: CodeLeaf, strikethrough: StrikeLeaf }), [wiki]);
  const editor = usePlateEditor({ plugins: createNotePlugins(), value: structuredClone(state.value), nodeId: false, override: { components } }, [state.document]);
  const reading = !state.editing || state.busy;
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    const entering = state.editing && !wasEditing.current;
    wasEditing.current = state.editing;
    if (entering && !state.busy) {
      const at = findNoteEditablePoint(editor);
      if (at) editor.tf.focus({ at });
    }
  }, [editor, state.editing, state.busy]);
  return <Plate editor={editor} readOnly={reading} onValueChange={({ value }) => session.change(value)}>
    {state.editing && <EditorToolbar editor={editor} busy={state.busy}/>}
    <PlateContent readOnly={reading} className={`note-prose${state.editing ? ' note-prose-editing' : ''}`} aria-label={state.editing ? 'Conteúdo da nota' : 'Leitura da nota'} spellCheck={state.editing} placeholder="Escreva sua nota…" onDrop={event => event.preventDefault()} onPaste={event => {
      // The canonical format is Markdown, so HTML/Slate clipboard payloads never
      // introduce hidden attributes, remote images or unsupported editor nodes.
      if (!state.editing || state.busy) return;
      event.preventDefault();
      editor.tf.insertText(event.clipboardData.getData('text/plain'));
    }}/>
  </Plate>;
}

function NoteProperties({ properties, busy }) {
  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={busy} aria-label={`Propriedades da nota: ${properties.length}`}><SlidersHorizontal aria-hidden="true"/>Propriedades <span className="note-property-count">{properties.length}</span></Button></DialogTrigger>
    <DialogContent className="note-properties-dialog" data-note-properties-dialog="" showCloseButton={false}>
      <DialogHeader><DialogTitle>Propriedades da nota</DialogTitle><DialogDescription>Metadados e relações declarados no arquivo. Somente leitura.</DialogDescription></DialogHeader>
      {properties.length ? <dl className="note-properties-list" aria-label="Propriedades declaradas">{properties.map(property => <div key={property.key}><dt>{property.key}</dt><dd>{propertyText(property.value)}</dd></div>)}</dl> : <p className="note-properties-empty">Esta nota não declara propriedades.</p>}
      <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" className="ui-dialog-close" aria-label="Fechar propriedades"><X aria-hidden="true"/></Button></DialogClose>
    </DialogContent>
  </Dialog>;
}

export function NoteWorkspace({ state, session, onReload, onNavigate, inline = false }) {
  const reload = () => onReload?.();
  const properties = state.document.properties || [];
  return <section className={`note-workspace${inline ? ' note-workspace-inline' : ''}`} data-note-workspace="" aria-label="Nota" aria-busy={state.busy} onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (state.editing && !state.busy) void session.save(); }
  }}>
    <header className="note-workspace-header">
      <div className="note-file-heading"><h2>{state.file.title}</h2><span className="note-file-ref">{state.file.ref}</span></div>
      <div className="note-workspace-actions">
        <NoteProperties properties={properties} busy={state.busy}/>
        {state.editing ? <><Button type="button" variant="outline" disabled={state.busy} onClick={() => void session.cancel()}>Cancelar edição</Button><Button type="button" disabled={state.busy || !state.dirty} onClick={() => void session.save()}>{state.busy ? 'Salvando…' : 'Salvar nota'}</Button></> : <Button type="button" disabled={!state.document.editable} onClick={() => session.startEditing()}>Editar nota</Button>}
      </div>
    </header>
    <div className="note-workspace-status" role="status" aria-live="polite">{state.busy ? 'Salvando no arquivo…' : state.dirty ? 'Alterações não salvas' : state.editing ? 'Edição · sem alterações' : state.saved ? 'Nota salva.' : 'Leitura'}</div>
    {state.error && <div className="note-error" role="alert"><p>{errorMessage(state.error)}</p>{['local-note-conflict', 'local-note-recovery-required'].includes(state.error) && <Button type="button" variant="outline" disabled={state.busy} onClick={() => void reload()}>Recarregar nota</Button>}</div>}
    {!state.document.editable && <p className="note-read-only" role="status">{errorMessage(state.document.reason)}</p>}
    {state.editing && state.value.some(node => node.type === 'note_raw') && <p className="note-preservation-hint">Os blocos preservados são somente leitura. O restante do texto pode ser editado.</p>}
    <NoteEditor state={state} session={session} onNavigate={onNavigate}/>
    <details className="note-original"><summary>Ver Markdown original</summary><p>Conteúdo do arquivo salvo.</p><pre>{state.file.text}</pre></details>
  </section>;
}

export function mountNoteWorkspace(host, { file, onSave, onReload, onNavigate, confirmDiscard, onChange, onSaved, inline = false } = {}) {
  if (!host || !file) throw new Error('note-workspace-invalid');
  const root = createRoot(host);
  let disposed = false;
  let session;
  const paint = state => {
    if (disposed) return;
    root.render(<NoteWorkspace state={state} session={session} inline={inline} onReload={onReload} onNavigate={onNavigate}/>);
    onChange?.(state);
  };
  session = createNoteSession({ file, parse: createNoteDocument, serialize: serializeNoteDocument, save: onSave, confirmDiscard: confirmDiscard || (async () => false), onSaved, onChange: paint });
  const beforeUnload = event => {
    const state = session.getState();
    if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', beforeUnload);
  flushSync(() => paint(session.getState()));
  return {
    getState: session.getState,
    requestLeave: session.requestLeave,
    dispose() {
      if (disposed) return;
      disposed = true; session.dispose(); window.removeEventListener('beforeunload', beforeUnload);
      flushSync(() => root.unmount());
    },
  };
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BookOpen, Clock3, FileText, Folder, Hash, Search, RefreshCw, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from './components/button.jsx';
import { Input } from './components/input.jsx';
import { NativeSelect, NativeSelectOption } from './components/native-select.jsx';
import { NoteWorkspace } from './note-workspace.jsx';
import { createLibrarySession } from './library-session.js';
import { LibraryPanelLayout } from './library-layout.jsx';
import { NoteRelated } from './note-related.jsx';

const types = {
  person: ['Pessoas', 'person'], pessoa: ['Pessoas', 'person'], company: ['Empresas', 'company'], empresa: ['Empresas', 'company'], project: ['Projetos', 'project'], projeto: ['Projetos', 'project'],
  area: ['Áreas', 'area'], área: ['Áreas', 'area'], procedure: ['Procedimentos', 'procedure'], procedimento: ['Procedimentos', 'procedure'], place: ['Lugares', 'place'], lugar: ['Lugares', 'place'],
  topic: ['Tópicos', 'topic'], tópico: ['Tópicos', 'topic'], source: ['Fontes', 'source'], fonte: ['Fontes', 'source'], datasource: ['Fontes de dados', 'source'],
  system: ['Sistemas', 'system'], sistema: ['Sistemas', 'system'], routine: ['Rotinas', 'routine'], rotina: ['Rotinas', 'routine'], reference: ['Referências', 'reference'], referência: ['Referências', 'reference'],
  note: ['Notas', 'note'], nota: ['Notas', 'note'], artifact: ['Artefatos', 'artifact'], artefato: ['Artefatos', 'artifact'], type: ['Tipos', 'type'], decision: ['Decisões', 'decision'], decisão: ['Decisões', 'decision'],
};
const typeKey = value => String(value || '').toLocaleLowerCase().replace(/[ _-]+/g, '');
export const libraryTypeLabel = value => types[typeKey(value)]?.[0] || value || 'Sem tipo';
const typeKind = value => types[typeKey(value)]?.[1] || 'note';
const dateLabel = value => { const date = new Date(value); return typeof value === 'string' && Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sem data'; };
const errorLabel = reason => ({
  'local-note-link-ambiguous': 'Mais de uma nota corresponde a este link. Use o caminho completo para escolher a nota certa.',
  'local-note-link-not-found': 'A nota deste link não foi encontrada entre os arquivos disponíveis.',
  'local-note-link-incomplete': 'A busca encontrou apenas parte do acervo e não pode confirmar este link. Abra a nota pela lista ou refine o caminho.',
  'not-found': 'Esta nota não está disponível para leitura. Ela pode ter sido movida ou ter acesso restrito.',
})[reason] || 'Não foi possível abrir a nota. Seu rascunho atual foi mantido.';

function TypeBadge({ value }) { return <span className="library-type" data-kind={typeKind(value)}>{libraryTypeLabel(value)}</span>; }
function CategoryButton({ active, icon: Icon, children, count, onClick, disabled = false }) {
  return <Button type="button" variant="ghost" className={`library-category${active ? ' is-selected' : ''}`} aria-pressed={active} disabled={disabled} onClick={onClick}>{Icon && <Icon aria-hidden="true"/>}<span>{children}</span>{Number.isFinite(count) && <span className="library-count">{count}</span>}</Button>;
}

function CategoryGroup({ name, label, count, open = false, children }) {
  // Native disclosure state stays in this stable DOM element. Constant initial
  // open props do not reset a user's toggle when the note session rerenders.
  return <details className="library-category-section" data-library-group={name} open={open || undefined}><summary><ChevronRight aria-hidden="true"/><span>{label}</span>{Number.isFinite(count) && <span className="library-count">{count}</span>}</summary>{children}</details>;
}

function LibraryCategories({ state, controller }) {
  const { filters, result } = state;
  const facets = result.facets || { types: [], tags: [], folders: [] };
  const disabled = Boolean(state.noteState?.busy);
  const reset = sort => controller.setFilters({ directory: '', type: '', tag: '', query: '', sort });
  return <aside className="library-categories" aria-label="Categorias do cérebro" tabIndex={-1}>
    <div className="library-pane-heading"><h2>Categorias</h2><Button type="button" variant="ghost" size="icon-sm" aria-label="Recolher categorias" disabled={disabled} onClick={() => { controller.setFiltersCollapsed(true); controller.setPanel('list'); }}><PanelLeftClose aria-hidden="true"/></Button></div>
    <nav aria-label="Coleções de notas">
      <CategoryButton icon={BookOpen} active={!filters.type && !filters.tag && !filters.directory && filters.sort === 'title'} disabled={disabled} onClick={() => void reset('title')}>Todas as notas</CategoryButton>
      <CategoryButton icon={Clock3} active={!filters.type && !filters.tag && !filters.directory && filters.sort === 'modified'} disabled={disabled} onClick={() => void reset('modified')}>Recentes</CategoryButton>
    </nav>
    <CategoryGroup name="types" label="Tipos" open count={state.loading && !facets.types?.length ? null : facets.types?.length || 0}>{facets.types?.length ? facets.types.map(type => <CategoryButton key={type.value} active={filters.type === type.value} count={type.count} disabled={disabled} onClick={() => void controller.setFilters({ type: filters.type === type.value ? '' : type.value })}><span className="library-type-marker" data-kind={typeKind(type.value)}><FileText aria-hidden="true"/></span>{libraryTypeLabel(type.value)}</CategoryButton>) : <p className="library-facet-empty">{state.loading ? 'Carregando tipos…' : 'Nenhum tipo disponível.'}</p>}</CategoryGroup>
    <CategoryGroup name="tags" label="Tags" count={state.loading && !facets.tags?.length ? null : facets.tags?.length || 0}>{facets.tags?.length ? facets.tags.map(tag => <CategoryButton key={tag.value} icon={Hash} active={filters.tag === tag.value} count={tag.count} disabled={disabled} onClick={() => void controller.setFilters({ tag: filters.tag === tag.value ? '' : tag.value })}>{tag.value}</CategoryButton>) : <p className="library-facet-empty">{state.loading ? 'Carregando tags…' : 'Nenhuma tag disponível.'}</p>}</CategoryGroup>
    <CategoryGroup name="folders" label="Pastas" open count={state.loading && !facets.folders?.length ? null : facets.folders?.length || 0}>{facets.folders?.length ? facets.folders.map(folder => <CategoryButton key={folder.ref} icon={Folder} active={filters.directory === folder.ref} count={folder.count} disabled={disabled} onClick={() => void controller.setFilters({ directory: filters.directory === folder.ref ? '' : folder.ref })}>{folder.ref || folder.name}</CategoryButton>) : <p className="library-facet-empty">{state.loading ? 'Carregando pastas…' : 'Nenhuma pasta disponível.'}</p>}</CategoryGroup>
  </aside>;
}

function LibraryList({ state, controller }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = state.listScroll; }, [state.filters, state.result.files.length]);
  const files = state.result.files || [];
  const hasFilters = Boolean(state.filters.query || state.filters.type || state.filters.tag || state.filters.directory);
  const label = state.filters.type ? libraryTypeLabel(state.filters.type) : state.filters.sort === 'modified' ? 'Recentes' : 'Todas as notas';
  return <section className="library-list" aria-label="Lista de notas" tabIndex={-1} aria-busy={state.loading}>
    <div className="library-list-heading"><div><h2>{label}</h2><p>{state.loading && !files.length ? 'Carregando…' : `${state.result.total} ${state.result.total === 1 ? 'nota' : 'notas'}${state.loading ? ' · atualizando' : ''}`}</p></div>
      <NativeSelect aria-label="Ordenar notas" value={state.filters.sort} disabled={state.noteState?.busy} onChange={event => void controller.setFilters({ sort: event.target.value })}><NativeSelectOption value="title">Título</NativeSelectOption><NativeSelectOption value="modified">Modificação</NativeSelectOption></NativeSelect>
    </div>
    {hasFilters && <div className="library-filter-summary" aria-label="Filtros ativos">{state.filters.query && <span>Busca: {state.filters.query}</span>}{state.filters.tag && <span>#{state.filters.tag}</span>}{state.filters.directory && <span>{state.filters.directory}</span>}<Button type="button" variant="ghost" size="sm" disabled={state.noteState?.busy} onClick={() => void controller.setFilters({ query: '', type: '', tag: '', directory: '' })}>Limpar filtros</Button></div>}
    {state.result.complete === false && <p className="library-partial" role="status">Acervo parcial. Os limites de leitura foram atingidos; contagens e resultados podem estar incompletos.</p>}
    {state.noteError && !state.noteState && <p className="library-note-error" role="alert">{errorLabel(state.noteError)}</p>}
    {state.error && <div className="library-load-error" role="alert"><p>Não foi possível carregar as notas.</p><Button type="button" variant="outline" onClick={() => void controller.refresh()}>Tentar novamente</Button></div>}
    <div className="library-list-scroll" ref={ref} onScroll={event => controller.setListScroll(event.currentTarget.scrollTop)}>
      {state.loading && !files.length ? <p className="library-list-message" role="status">Carregando notas…</p> : files.length ? <ul className="library-note-list">{files.map(item => <li key={item.ref}><button type="button" className={`library-note-row${state.selectedRef === item.ref ? ' is-selected' : ''}`} aria-pressed={state.selectedRef === item.ref} disabled={state.noteState?.busy} onClick={() => void controller.openNote(item.ref)}>
        <span className="library-note-title">{item.title}</span><span className="library-note-meta"><TypeBadge value={item.type}/><time dateTime={item.modified_at || undefined} title={item.modified_at || ''}>{dateLabel(item.modified_at)}</time></span>
        {item.tags?.length > 0 && <span className="library-note-tags">{item.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}{item.tags.length > 3 && <span>+{item.tags.length - 3}</span>}</span>}
        {state.filters.query && state.filters.search === 'content' && item.snippet && <span className="library-note-snippet">{item.snippet}</span>}
        {state.loadingRef === item.ref && <span className="library-note-opening">Abrindo…</span>}
      </button></li>)}</ul> : !state.error && <div className="library-list-message"><h3>Nenhuma nota encontrada</h3><p>Altere os filtros ou tente outro termo de busca.</p></div>}
      {files.length < state.result.total && <Button type="button" variant="outline" className="library-load-more" disabled={state.loadingMore || state.loading} onClick={() => void controller.loadMore()}>{state.loadingMore ? 'Carregando…' : 'Carregar mais notas'}</Button>}
    </div>
  </section>;
}

const headingKey = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
function LibraryReader({ state, controller, services }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || !state.noteState || state.panel !== 'note') return;
    ref.current.focus({ preventScroll: true });
    if (state.anchor) [...ref.current.querySelectorAll('.note-prose h1,.note-prose h2,.note-prose h3,.note-prose h4,.note-prose h5,.note-prose h6')].find(heading => headingKey(heading.textContent) === headingKey(state.anchor))?.scrollIntoView({ block: 'start' });
  }, [state.noteInstance, state.anchor, state.panel]);
  return <section className="library-reader" aria-label="Leitor da nota" tabIndex={-1} ref={ref} aria-busy={state.noteLoading}>
    <div className="library-reader-tools"><h2>Leitura</h2>{state.noteState && <><Button type="button" variant="ghost" className="library-reader-back" disabled={state.noteState.busy} onClick={() => void controller.closeNote()}><ChevronLeft aria-hidden="true"/>Voltar para notas</Button><Button type="button" variant="ghost" size="sm" className="library-reader-expand" disabled={state.noteState.busy} onClick={() => controller.setExpanded(!state.expanded)}>{state.expanded ? <Minimize2 aria-hidden="true"/> : <Maximize2 aria-hidden="true"/>}{state.expanded ? 'Restaurar painéis' : 'Expandir leitura'}</Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar nota" title="Fechar nota (Esc)" disabled={state.noteState.busy} onClick={() => void controller.closeNote()}><X aria-hidden="true"/></Button></>}</div>
    {state.noteLoading && <p className="library-note-status" role="status">Abrindo nota…</p>}
    {state.linkLoading && <p className="library-note-status" role="status">Procurando nota relacionada…</p>}
    {state.noteError && state.noteState && <p className="library-note-error" role="alert">{errorLabel(state.noteError)}</p>}
    {state.noteState ? <div className="library-reader-document"><NoteWorkspace key={state.noteInstance} inline state={state.noteState} session={state.noteSession} onReload={() => controller.openNote(state.noteState.file.ref, { reload: true })} onNavigate={target => controller.followLink(target)}/><NoteRelated key={`${state.noteState.file.ref}:${state.noteState.file.sha256}`} file={state.noteState.file} services={services} busy={state.noteState.busy} onOpenNote={ref => controller.openNote(ref)}/></div> : !state.noteLoading && <div className="library-reader-empty"><BookOpen aria-hidden="true"/><h2>Selecione uma nota</h2><p>Escolha na lista para ler o texto formatado. O conteúdo abre somente quando você seleciona um arquivo.</p></div>}
  </section>;
}

export function LibraryWorkspace({ state, controller, services = {} }) {
  const [query, setQuery] = React.useState(state.filters.query);
  const container = React.useRef(null), previousPanel = React.useRef(state.panel);
  React.useEffect(() => setQuery(state.filters.query), [state.filters.query]);
  React.useEffect(() => {
    const changed = previousPanel.current !== state.panel;
    previousPanel.current = state.panel;
    if (!changed) return;
    const target = state.panel === 'list' ? '.library-list' : state.panel === 'categories' ? '.library-categories' : null;
    if (target) container.current?.querySelector(target)?.focus({ preventScroll: true });
  }, [state.panel]);
  return <section className="library-workspace" data-library-workspace="" data-stage={state.panel} data-expanded={state.expanded} data-filters-collapsed={state.filtersCollapsed} aria-label="Notas do cérebro" ref={container}>
    <header className="library-header"><div className="library-header-title"><h1>Cérebro</h1><Button type="button" variant="ghost" size="sm" aria-label="Mostrar categorias" disabled={state.noteState?.busy} onClick={() => { controller.setExpanded(false); controller.setFiltersCollapsed(false); controller.setPanel(state.panel === 'categories' ? 'list' : 'categories'); }}><PanelLeftOpen aria-hidden="true"/><span>Categorias</span></Button></div>
      <form className="library-search" role="search" onSubmit={event => { event.preventDefault(); void controller.setFilters({ query }); }}><NativeSelect aria-label="Onde buscar" value={state.filters.search || 'content'} disabled={state.noteState?.busy} onChange={event => void controller.setFilters({ search: event.target.value, query })}><NativeSelectOption value="content">Conteúdo</NativeSelectOption><NativeSelectOption value="title">Título</NativeSelectOption></NativeSelect><label className="sr-only" htmlFor="library-query">Termo de busca</label><Input id="library-query" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={state.filters.search === 'title' ? 'Buscar pelo título' : 'Buscar no conteúdo'} disabled={state.noteState?.busy}/><Button type="submit" variant="outline" size="icon-sm" aria-label="Buscar notas" disabled={state.noteState?.busy}><Search aria-hidden="true"/></Button></form>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Atualizar notas" title="Atualizar notas" disabled={state.loading || state.noteState?.busy} onClick={() => void controller.refresh()}><RefreshCw aria-hidden="true"/></Button>
    </header>
    <LibraryPanelLayout state={state}><LibraryCategories state={state} controller={controller}/><LibraryList state={state} controller={controller}/><LibraryReader state={state} controller={controller} services={services}/></LibraryPanelLayout>
  </section>;
}

export function mountLibraryWorkspace(host, options = {}) {
  if (!host) throw new Error('library-workspace-invalid');
  const root = createRoot(host);
  let disposed = false, controller;
  const paint = state => { if (!disposed) root.render(<LibraryWorkspace state={state} controller={controller} services={options}/>); };
  controller = createLibrarySession({ ...options, onChange: paint });
  const beforeUnload = event => { const note = controller.getActiveNote()?.getState(); if (note?.dirty || note?.busy) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  flushSync(() => paint(controller.getState()));
  void controller.restore();
  return {
    getActiveNote: controller.getActiveNote, closeNote: controller.closeNote, requestLeave: controller.requestLeave, openNote: controller.openNote, setArea: controller.setArea, refresh: controller.refresh, getSnapshot: controller.getSnapshot,
    dispose() { if (disposed) return; options.onSnapshot?.(controller.getSnapshot()); disposed = true; controller.dispose(); window.removeEventListener('beforeunload', beforeUnload); flushSync(() => root.unmount()); },
  };
}

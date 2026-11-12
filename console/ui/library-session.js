import { createNoteSession } from './note-session.js';
import { createNoteDocument, serializeNoteDocument } from './note-markdown.js';

const string = (value, max = 1024) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value : '';
const filtersOf = value => ({ query: string(value?.query, 200), directory: string(value?.directory), type: string(value?.type, 200), tag: string(value?.tag, 200), sort: value?.sort === 'modified' ? 'modified' : 'title', search: value?.search === 'title' ? 'title' : 'content' });
const emptyResult = () => ({ files: [], folders: [], total: 0, offset: 0, limit: 50, complete: true, facets: { types: [], tags: [], folders: [] } });

export function createLibrarySession(deps = {}) {
  const initial = deps.initialSnapshot || {};
  const area = string(deps.area || '', 200);
  const sameArea = typeof initial.area === 'string' ? initial.area === area : !area;
  const selectedRef = sameArea ? string(initial.selectedRef) : '';
  const panel = initial.panel === 'note' && !selectedRef ? 'list' : ['categories', 'list', 'note'].includes(initial.panel) ? initial.panel : 'list';
  const state = { area, filters: filtersOf(initial.filters), selectedRef, listScroll: sameArea && Number.isFinite(initial.listScroll) ? Math.max(0, initial.listScroll) : 0,
    panel, filtersCollapsed: Boolean(initial.filtersCollapsed), expanded: Boolean(initial.expanded) && Boolean(selectedRef), result: emptyResult(), loading: true, loadingMore: false, error: '', noteLoading: false, loadingRef: '', noteError: '', linkLoading: false, anchor: '', noteInstance: 0 };
  let live = true, navigation = 0, listing = 0, wikiRequest = 0, noteRevision = 0, active = null;
  const listeners = new Set();
  const snapshot = () => ({ area: state.area, filters: { ...state.filters }, selectedRef: state.selectedRef, listScroll: state.listScroll, panel: state.panel, filtersCollapsed: state.filtersCollapsed, expanded: state.expanded });
  const getState = () => ({ ...state, filters: { ...state.filters }, noteSession: active, noteState: active?.getState() || null });
  const notify = () => { if (!live) return; const value = getState(); deps.onChange?.(value); for (const listener of listeners) listener(value); deps.onSnapshot?.(snapshot()); };
  const invalidateNavigation = () => { navigation++; wikiRequest++; state.noteLoading = false; state.loadingRef = ''; state.linkLoading = false; return navigation; };
  const clearNote = () => { active?.dispose(); active = null; noteRevision++; state.selectedRef = ''; state.noteError = ''; state.anchor = ''; state.panel = 'list'; state.expanded = false; };
  const guard = async request => {
    const source = active;
    const revision = noteRevision;
    if (!live || source?.getState().busy) return null;
    if (source && !await source.requestLeave()) return null;
    if (!live || request !== navigation || source !== active || revision !== noteRevision) return null;
    return { source, revision };
  };
  const current = (request, before) => live && navigation === request && active === before.source && noteRevision === before.revision && !active?.getState().busy;

  async function loadList({ append = false } = {}) {
    if (!live) return false;
    const request = ++listing;
    const offset = append ? state.result.files.length : 0;
    state.loading = !append; state.loadingMore = append; state.error = ''; notify();
    try {
      const result = await deps.loadFiles({ mode: 'library', ...state.filters, area: state.area, offset, limit: 50 });
      if (!live || request !== listing) return false;
      if (!result || !Array.isArray(result.files) || !Number.isSafeInteger(result.total) || result.total < 0) throw new Error('library-list-invalid');
      state.result = append ? { ...result, files: [...new Map([...state.result.files, ...result.files].map(item => [item.ref, item])).values()] } : result;
      return true;
    } catch (error) { if (live && request === listing) state.error = error.message || 'library-load-failed'; return false; }
    finally { if (live && request === listing) { state.loading = false; state.loadingMore = false; notify(); } }
  }

  async function openNote(ref, { reload = false, anchor = '' } = {}) {
    if (!live || !string(ref)) return false;
    if (!reload && active?.getState().file.ref === ref) { invalidateNavigation(); state.panel = 'note'; state.anchor = string(anchor); notify(); return true; }
    const request = invalidateNavigation();
    const before = await guard(request);
    if (!before || !current(request, before)) { if (live && request === navigation) notify(); return false; }
    state.noteLoading = true; state.loadingRef = ref; state.noteError = ''; notify();
    try {
      const file = await deps.readNote(ref);
      if (!current(request, before)) return false;
      if (!file || file.ref !== ref || typeof file.text !== 'string') throw new Error('library-note-invalid');
      let session;
      session = createNoteSession({ file, parse: deps.parse || createNoteDocument, serialize: deps.serialize || serializeNoteDocument, save: deps.saveNote, confirmDiscard: deps.confirmDiscard || (async () => false),
        onChange() { if (!live || active !== session) return; noteRevision++; notify(); },
        onSaved() { if (live && active === session) void loadList(); },
      });
      active?.dispose(); active = session; noteRevision++;
      state.selectedRef = file.ref; state.noteInstance++; state.anchor = string(anchor); state.panel = 'note';
      return true;
    } catch (error) { if (live && request === navigation) state.noteError = error.message || 'library-note-failed'; return false; }
    finally { if (live && request === navigation) { state.noteLoading = false; state.loadingRef = ''; notify(); } }
  }

  async function followLink(target) {
    if (!live || !active || active.getState().busy || typeof deps.resolveLink !== 'function') return false;
    const source = active, revision = noteRevision, originalNavigation = navigation, request = ++wikiRequest;
    state.linkLoading = true; state.noteError = ''; notify();
    try {
      const link = await deps.resolveLink({ from_ref: source.getState().file.ref, target });
      if (!live || request !== wikiRequest || source !== active || revision !== noteRevision || navigation !== originalNavigation) return false;
      state.linkLoading = false;
      return await openNote(link.ref, { anchor: link.anchor || '' });
    } catch (error) { if (live && request === wikiRequest && source === active) state.noteError = error.message || 'local-note-link-not-found'; return false; }
    finally { if (live && request === wikiRequest) { state.linkLoading = false; notify(); } }
  }

  async function setFilters(patch = {}) {
    if (!live) return false;
    const next = filtersOf({ ...state.filters, ...patch });
    if (JSON.stringify(next) === JSON.stringify(state.filters)) { invalidateNavigation(); state.panel = 'list'; notify(); return true; }
    const request = invalidateNavigation();
    const before = await guard(request);
    if (!before || !current(request, before)) { if (live && request === navigation) notify(); return false; }
    clearNote(); state.filters = next; state.listScroll = 0; state.result = { ...emptyResult(), facets: state.result.facets, complete: state.result.complete }; notify();
    return loadList();
  }

  async function setArea(nextArea) {
    if (!live) return false;
    const value = string(nextArea, 200);
    if (value === state.area) return true;
    const request = invalidateNavigation();
    const before = await guard(request);
    if (!before || !current(request, before)) { if (live && request === navigation) notify(); return false; }
    clearNote(); state.area = value; state.listScroll = 0; state.result = emptyResult(); notify();
    return loadList();
  }

  async function closeNote({ force = false } = {}) {
    if (!live) return false;
    const request = invalidateNavigation();
    if (!force) {
      const before = await guard(request);
      if (!before || !current(request, before)) { if (live && request === navigation) notify(); return false; }
    }
    if (!live || request !== navigation) return false;
    clearNote(); notify(); return true;
  }

  return {
    getState, getSnapshot: snapshot, getActiveNote: () => active, openNote, followLink, setFilters, setArea, closeNote,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    requestLeave: () => live ? active?.requestLeave() || Promise.resolve(true) : Promise.resolve(false),
    refresh: () => loadList(),
    loadMore: () => state.loading || state.loadingMore || state.result.files.length >= state.result.total ? Promise.resolve(false) : loadList({ append: true }),
    setListScroll(value) { if (!live || !Number.isFinite(value)) return; state.listScroll = Math.max(0, value); deps.onSnapshot?.(snapshot()); },
    setPanel(panel) { if (!live || !['categories', 'list', 'note'].includes(panel)) return; invalidateNavigation(); state.panel = panel; notify(); },
    setExpanded(value) { if (!live) return; state.expanded = Boolean(value); if (value) state.panel = 'note'; notify(); },
    setFiltersCollapsed(value) { if (!live) return; state.filtersCollapsed = Boolean(value); notify(); },
    async restore() {
      const ref = state.selectedRef, before = navigation, panel = state.panel;
      const result = await loadList();
      if (live && navigation === before && ref && !active) {
        const opening = openNote(ref), request = navigation;
        await opening;
        if (live && request === navigation) {
          if (active?.getState().file.ref === ref) state.panel = panel;
          else { state.selectedRef = ''; state.panel = 'list'; state.expanded = false; }
          notify();
        }
      }
      return result;
    },
    dispose() { if (!live) return; live = false; navigation++; listing++; wikiRequest++; active?.dispose(); active = null; listeners.clear(); },
  };
}

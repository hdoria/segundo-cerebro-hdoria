import { identityForKey } from '../console/design/tokens.js';
import { iconMarkup } from '../console/ui.bundle.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createDrawerController } from '../console/experience.js';
const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../console/index.html', import.meta.url), 'utf8');
const section = (start, end) => { const from = app.indexOf(start); assert.notEqual(from, -1, `${start} exists`); const to = app.indexOf(end, from); assert.notEqual(to, -1); return app.slice(from, to); };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const area = { operating_area: 'delta', key: 'delta', name: 'Delta', system_refs: [], routine_refs: [], ref: 'areas/delta.md' };
const state = { view: 'today', model: { areas: [area], systems: [] }, operatingAreaFilter: '', canvas: { scope: 'run', ref: 'old', positions: {} } };
let renders = 0;
const areaApi = runInNewContext(`${section('function renderAreaSwitcher(', '// Views irmãs')}\n({ setOperatingAreaFilter })`, { state, localStorage: { setItem() {} }, closeDrawer() {}, render() { renders++; }, systemOperatingArea() {}, inActiveOperatingArea() { return true; } });
areaApi.setOperatingAreaFilter('delta');
assert.equal(state.view, 'area', 'sidebar/mobile area action opens context even from Today');
assert.equal(state.operatingAreaFilter, 'delta'); assert.equal(state.canvas.ref, null); assert.equal(renders, 1);
areaApi.setOperatingAreaFilter(''); assert.equal(state.view, 'areas', 'global area reset opens overview');
const card = runInNewContext(`${section('function areaCard(', 'function renderAreas(')}\nareaCard`, { escapeHtml, identityForKey, iconMarkup });
assert.match(card(area), /<button[^>]*data-operating-area-filter="delta"/); assert.doesNotMatch(card(area), /<article/);
assert.match(html, /data-views="areas,area,sources,experiments"/);
assert.match(html, /data-view="files"/); assert.match(html, /data-view="metrics"/);

const slot = (extra = {}) => ({ data: null, loaded: false, loading: false, error: false, request: 0, ...extra });
const initial = () => ({ view: 'files', operatingAreaFilter: '', model: { areas: [area], systems: [] }, files: slot({ directory: '', query: '', type: '', offset: 0, limit: 50 }), areaFiles: slot({ offset: 0, limit: 50 }), metrics: slot(), localFileRequest: 0, selectedLocalFile: null, localViewContext: 'files:' });
const payload = { available: true, directory: '', parent_ref: null, folders: [], files: [{ ref: 'notes/test.md', title: '<img src=x onerror=bad()>', type: 'Project', updated: null, area_refs: ['delta'] }], total: 1, offset: 0, limit: 50 };
function fixture() {
  const state = initial();
  const pending = [];
  const hosts = { '#drawer-content': { innerHTML: '' } }; hosts['#note-workspace-mount'] = hosts['#drawer-content'];
  const noteState = {dirty:false,busy:false}; let noteOptions; let leaveCalls=0; let leaveAllowed=true;
  const document = { body:{classList:{add(){},remove(){}}}, activeElement: null, fileButtons: [], querySelectorAll() { return this.fileButtons; } };
  const el = () => ({ hidden: true, inert: true, isConnected: true, classList: { add() {}, remove() {} }, setAttribute() {}, focus() { document.activeElement = this; }, contains(target) { return target === this; } });
  const drawer = el(); const backdrop = el(); const background = el(); background.inert = false;
  const closeButton = el(); const invoker = el(); document.activeElement = invoker;
  const resolveInvoker = runInNewContext(`${section('function resolveDrawerInvoker(', 'const drawerController')}\nresolveDrawerInvoker`, { document });
  const drawerController = createDrawerController({ drawer, backdrop, background, closeButton, document, resolveInvoker });
  let renders = 0;
  const loadNoteWorkspace = async () => ({mountNoteWorkspace(host,options) {
    noteOptions=options; host.innerHTML=`<pre>${escapeHtml(options.file.text)}</pre>`;
    return {getState:()=>noteState,requestLeave:async()=>{leaveCalls++;return !noteState.busy && (!noteState.dirty || leaveAllowed);},dispose(){}};
  }});
  const context = { document, state, loadNoteWorkspace, URLSearchParams, Intl, escapeHtml, renderMarkup(target, markup) { target.innerHTML = markup; }, fmtDate: (value) => value || '—', empty: (a, b) => `<p>${escapeHtml(a)} ${escapeHtml(b)}</p>`, $: (s) => hosts[s], drawerController,
    getJson(url) { return new Promise((resolve, reject) => pending.push({ url, resolve, reject })); }, render() { renders++; }, mergedAreas(vault, areas) { return areas; }, visibleSystems() { return []; } };
  const api = runInNewContext(`${section('function localReadStatus(', 'function systemOperational(')}\n${section('function closeDrawer(', 'function experimentPipeline(')}\n${section('function showDrawerShell(', 'function entityLink(')}\n({loadLocalFiles,renderFiles,renderAreaWorkspace,renderFileRows,renderFilePagination,openLocalFile,closeDrawer,syncLocalViewContext,renderMetrics,loadBusinessMetrics})`, context);
  return { state, pending, hosts, api, document, drawer, background, invoker, context, noteState, noteOptions:()=>noteOptions, leaveCalls:()=>leaveCalls, setLeaveAllowed:value=>{leaveAllowed=value;}, renders: () => renders };
}
{
  const f = fixture(); f.state.files.query = 'título & teste'; f.state.files.type = 'Project';
  const loading = f.api.loadLocalFiles();
  assert.match(f.api.renderFiles(), /role="status">Lendo/);
  const url = new URL(f.pending[0].url, 'http://localhost');
  assert.equal(url.searchParams.get('q'), 'título & teste'); assert.equal(url.searchParams.get('type'), 'Project'); assert.equal(url.searchParams.get('limit'), '50');
  f.pending[0].resolve(payload); await loading;
  assert.equal(f.state.files.loading, false); assert.equal(f.state.files.loaded, true);
  const markup = f.api.renderFiles(); assert.match(markup, /&lt;img src=x onerror=bad\(\)&gt;/); assert.doesNotMatch(markup, /<img/); assert.match(markup, /data-open-local-file="notes\/test.md"/); assert.equal(f.pending.length, 1, 'list rendering must not fetch any file body');
  const page = f.api.renderFilePagination({ data: { ...payload, offset: 50, limit: 50, total: 101 } }, 'data-local-files-page'); assert.match(page, /51–100 de 101/); assert.match(page, /data-local-files-page="100"/);
}
{
  const f = fixture(); const older = f.api.loadLocalFiles(); f.state.files.query = 'new'; const newer = f.api.loadLocalFiles();
  f.pending[1].resolve({ ...payload, files: [], total: 0 }); await newer; f.pending[0].resolve(payload); await older;
  assert.equal(f.state.files.data.total, 0, 'older title search cannot overwrite latest result');
  assert.match(f.api.renderFiles(), /Nenhum arquivo encontrado/);
  const failure = f.api.loadLocalFiles(); f.pending[2].reject(new Error('private/internal/path')); await failure;
  assert.match(f.api.renderFiles(), /Tentar novamente/); assert.doesNotMatch(f.api.renderFiles(), /private\/internal/);
}
{
  const f = fixture(); const pending = f.api.loadLocalFiles(); f.state.view = 'today'; f.api.syncLocalViewContext(); f.pending[0].resolve(payload); await pending;
  assert.equal(f.state.files.data, null); assert.equal(f.state.files.loaded, false, 'navigation invalidates pending file lists');
  f.state.view = 'area'; f.state.operatingAreaFilter = 'delta'; f.api.syncLocalViewContext(); const areaLoad = f.api.loadLocalFiles(true);
  assert.equal(new URL(f.pending[1].url, 'http://localhost').searchParams.get('area'), 'delta');
  f.state.operatingAreaFilter = 'another'; f.api.syncLocalViewContext(); f.pending[1].resolve(payload); await areaLoad;
  assert.equal(f.state.areaFiles.data, null, 'area switch invalidates previous area files');
}
{
  const f = fixture(); const opening = f.api.openLocalFile('notes/test.md'); assert.equal(f.drawer.hidden, false); assert.equal(f.background.inert, true);
  f.pending[0].resolve({ ref: 'notes/test.md', title: '<title>', type: 'Project', text: '<script>bad()</script> ![](https://example.com/private.png)', bytes: 80 }); await opening;
  const markup = f.hosts['#drawer-content'].innerHTML; assert.match(markup, /<pre[^>]*>&lt;script&gt;bad\(\)&lt;\/script&gt;/); assert.doesNotMatch(markup, /<script|<img|<iframe/);
  f.api.closeDrawer(); assert.equal(f.drawer.hidden, true); assert.equal(f.background.inert, false); assert.equal(f.document.activeElement, f.invoker, 'closing explicit file returns focus to invoker');
  const stale = f.api.openLocalFile('notes/slow.md'); f.api.closeDrawer(); const closed = f.hosts['#drawer-content'].innerHTML;
  f.pending[1].resolve({ ref: 'notes/slow.md', title: 'late body', text: 'late body', bytes: 9 }); await stale;
  assert.equal(f.hosts['#drawer-content'].innerHTML, closed, 'closed drawer must ignore late body');
  const navigated = f.api.openLocalFile('notes/nav.md'); f.state.view = 'today'; f.api.syncLocalViewContext(); f.pending[2].resolve({ title: 'nav late', text: 'nav late' }); await navigated;
  assert.equal(f.drawer.hidden, true); assert.doesNotMatch(f.hosts['#drawer-content'].innerHTML, /nav late/);
}
{
  const f = fixture(); f.state.view = 'metrics'; f.api.syncLocalViewContext(); const loading = f.api.loadBusinessMetrics();
  f.pending[0].resolve({ available: true, issues: [], metrics: [{ id: 'm', name: 'Indicador existente', definition: '<definition>', unit: '%', source_ref: 'source:test', current: null, goal: 0, period: { label: 'Outubro' }, history: [{ value: 0, period: { label: 'Setembro' }, observed_at: null, source_ref: 'source:test' }] }] }); await loading;
  const markup = f.api.renderMetrics(); assert.match(markup, /Sem leitura/); assert.match(markup, /<dt>Meta<\/dt><dd>0<\/dd>/); assert.match(markup, /Setembro/); assert.match(markup, /source:test/); assert.match(markup, /&lt;definition&gt;/); assert.doesNotMatch(markup, /saúde|saude|health/i);
  f.state.metrics.data.metrics[0].current = 0; assert.match(f.api.renderMetrics(), /<strong>0<\/strong>/);
  const stale = f.api.loadBusinessMetrics(); f.state.operatingAreaFilter = 'delta'; f.api.syncLocalViewContext(); f.pending[1].resolve({ metrics: [{ name: 'stale' }] }); await stale; assert.equal(f.state.metrics.data, null);
}
// Dispatch the production click/mobile/form handlers, not a duplicate of their rules.
{
  const f = fixture(); f.state.view = 'today'; f.state.canvas = { scope: 'brain' };
  const api = runInNewContext(`${section('function renderAreaSwitcher(', '// Views irmãs')}\n({setOperatingAreaFilter})`, { ...f.context, localStorage: { setItem() {} }, closeDrawer: f.api.closeDrawer, inActiveOperatingArea() { return true; } });
  const listeners = [];
  for (const match of app.matchAll(/document\.addEventListener\('(click|change|submit)', \(event\) => \{/g)) {
    const end = app.indexOf('\n});', match.index) + 4;
    runInNewContext(app.slice(match.index, end), { ...f.context, document: { addEventListener(type, handler) { listeners.push({ type, handler }); } }, setOperatingAreaFilter: api.setOperatingAreaFilter, closeDrawer: f.api.closeDrawer, localStorage: { setItem() {} } });
  }
  const clickArea = (value) => listeners.filter((x) => x.type === 'click').forEach(({handler}) => handler({ target: { closest(selector) { return selector === '[data-operating-area-filter]' ? { dataset: { operatingAreaFilter: value } } : null; } } }));
  clickArea('delta'); assert.equal(f.state.view, 'area');
  f.state.view = 'today'; listeners.filter((x) => x.type === 'change').forEach(({handler}) => handler({ target: { id: 'mobile-operating-area', value: 'delta', closest() { return null; } } })); assert.equal(f.state.view, 'area');
  clickArea(''); assert.equal(f.state.view, 'areas');
  f.state.view = 'files'; const form = { elements: { q: { value: 'new title' }, type: { value: 'Project' }, area: { value: 'delta' } } }; let prevented = false;
  listeners.filter((x) => x.type === 'submit').forEach(({handler}) => handler({ target: { closest(selector) { return selector === '[data-local-file-search]' ? form : null; }, matches() { return false; } }, preventDefault() { prevented = true; } }));
  assert.equal(prevented, true); assert.equal(f.state.files.query, 'new title'); assert.equal(f.state.operatingAreaFilter, 'delta'); assert.equal(f.state.view, 'files');
}
{
  const f = fixture(); f.state.view = 'area'; f.state.operatingAreaFilter = 'delta'; f.state.areaFiles.loaded = true; f.state.areaFiles.data = { ...payload, files: [], total: 0 };
  const markup = f.api.renderAreaWorkspace();
  assert.match(markup, /data-open-local-file="areas\/delta.md"/); assert.match(markup, /Sistemas · 0/); assert.match(markup, /Nenhum arquivo relacionado/);
}
{
  const f = fixture(); const opening = f.api.openLocalFile('notes/failure.md');
  f.pending[0].reject(new Error('sensitive source failure')); await opening;
  assert.match(f.hosts['#drawer-content'].innerHTML, /Nota indisponível/); assert.doesNotMatch(f.hosts['#drawer-content'].innerHTML, /sensitive source/);
}
{
  const buttons = ['areas', 'files', 'metrics'].map((view) => ({ dataset: { view, ...(view === 'areas' ? { views: 'areas,area,sources,experiments' } : {}) }, attributes: new Map(), closest() { return true; }, classList: { toggle() {} }, setAttribute(k,v) { this.attributes.set(k,v); }, removeAttribute(k) { this.attributes.delete(k); } }));
  const state = { view: 'area' };
  const update = runInNewContext(`${section('function updateNavigation(', 'function render()')}\nupdateNavigation`, { state, document: { querySelectorAll() { return buttons; } } });
  update(); assert.equal(buttons[0].attributes.get('aria-current'), 'page'); state.view = 'files'; update(); assert.equal(buttons[0].attributes.has('aria-current'), false); assert.equal(buttons[1].attributes.get('aria-current'), 'page');
}

// Execute the actual asynchronous list completion while the file drawer is open.
{
  const f = fixture(); f.state.view = 'area'; f.state.operatingAreaFilter = 'delta';
  f.invoker.dataset = { openLocalFile: 'areas/delta.md' };
  const replacement = { isConnected: true, dataset: { openLocalFile: 'areas/delta.md' }, focus() { f.document.activeElement = this; } };
  f.context.render = () => { f.invoker.isConnected = false; f.document.fileButtons = [replacement]; };
  const areaLoading = f.api.loadLocalFiles(true);
  const opening = f.api.openLocalFile('areas/delta.md');
  f.pending[0].resolve({ ...payload, files: [], total: 0 }); await areaLoading;
  assert.equal(f.state.areaFiles.loaded, true); assert.equal(f.state.areaFiles.loading, false);
  assert.equal(f.drawer.hidden, false, 'background area completion preserves the open file drawer');
  f.pending[1].resolve({ ref: 'areas/delta.md', title: 'Delta', text: 'Public note', bytes: 11 }); await opening;
  f.api.closeDrawer(); assert.equal(f.document.activeElement, replacement, 'closing returns focus to the same file action after list DOM replacement');
}

// A canonical label must not hide the interval; all adapter aliases retain meaning.
{
  const period = runInNewContext(`${section('function metricPeriod(', 'function metricValue(')}\nmetricPeriod`);
  assert.equal(period({ label: 'October', start_date: '2026-10-01', end_date: '2026-10-20' }), 'October · 2026-10-01 → 2026-10-20');
  for (const [start, end] of [['start', 'end'], ['started_at', 'ended_at'], ['from', 'to']]) assert.equal(period({ [start]: '2026-10-01', [end]: '2026-10-20' }), '2026-10-01 → 2026-10-20');
  assert.equal(period({ mode: 'cycle', cycle_ref: 'cycle:oct', edition_ref: 'edition:2' }), 'cycle · cycle:oct · edition:2');
  const f = fixture(); f.state.view = 'metrics'; f.state.metrics.loaded = true;
  f.state.metrics.data = { metrics: [{ name: 'Metric', current: 0, period: { label: 'October', start_date: '2026-10-01', end_date: '2026-10-20' }, history: [{ value: 0, period: { label: 'September', from: '2026-09-01', to: '2026-09-30' } }] }] };
  assert.match(f.api.renderMetrics(), /October · 2026-10-01 → 2026-10-20/); assert.match(f.api.renderMetrics(), /September · 2026-09-01 → 2026-09-30/);
}
// Finishing the area list may replace the note button while its drawer is open.
{
  const document = { activeElement: null, querySelectorAll() { return [replacement]; } };
  const el = () => ({ hidden: true, inert: true, isConnected: true, classList: { add() {}, remove() {} }, setAttribute() {}, focus() { document.activeElement = this; } });
  const original = el(); original.dataset = { openLocalFile: 'areas/delta.md' };
  const replacement = el(); replacement.dataset = { openLocalFile: 'areas/delta.md' };
  const resolveInvoker = runInNewContext(`${section('function resolveDrawerInvoker(', 'const drawerController')}\nresolveDrawerInvoker`, { document });
  const controller = createDrawerController({ drawer: el(), backdrop: el(), background: el(), closeButton: el(), document, resolveInvoker });
  document.activeElement = original; controller.open(); original.isConnected = false; controller.close();
  assert.equal(document.activeElement, replacement, 'a replacement note button receives return focus after asynchronous render');
}

{
  const f = fixture(); f.state.view = 'metrics'; f.state.metrics.loaded = true;
  const common = { name: 'Same name', current: 1, unit: '%', source_ref: 'source:same' };
  f.state.metrics.data = { metrics: [{ ...common, scope: { system_ref: 'system:alpha', workflow_refs: ['workflow:alpha'], subject: { kind: 'cycle', ref: 'cycle:alpha' } } }, { ...common, scope: { system_ref: 'system:beta', workflow_refs: ['workflow:beta'], subject: { kind: 'cycle', ref: 'cycle:beta' } } }] };
  const markup = f.api.renderMetrics();
  for (const ref of ['system:alpha', 'system:beta', 'workflow:alpha', 'workflow:beta', 'cycle:alpha', 'cycle:beta']) assert.ok(markup.includes(ref), `distinct series scope ${ref} is visible`);
}

{
  const f = fixture(); f.state.view = 'metrics'; f.state.metrics.loaded = true;
  f.state.metrics.data = { metrics: [{ name: 'Array sources', current: null, source_ref: null, source_refs: ['source:approved', '<unsafe>'], history: [{ value: 0, source_ref: 'source:history', source_refs: ['source:history', 'source:other'] }] }, { name: 'Duplicate sources', current: 0, source_ref: 'source:duplicate', source_refs: ['source:duplicate', 'source:extra'] }] };
  const markup = f.api.renderMetrics();
  assert.match(markup, /source:approved/); assert.match(markup, /&lt;unsafe&gt;/); assert.doesNotMatch(markup, /<unsafe>/);
  assert.equal((markup.match(/source:duplicate/g) || []).length, 1, 'current sources deduplicate singular and array forms');
  assert.equal((markup.match(/source:history/g) || []).length, 1, 'history sources deduplicate singular and array forms');
  assert.match(markup, /source:other/); assert.match(markup, /source:extra/);
}

console.log('console-local-workspaces: ok (area/sidebar/mobile, files, safe drawer/focus/stale replies, indicators)');

// A link resolution response cannot carry an old discard authorization into a newer edit.
{
 const f=fixture();const opening=f.api.openLocalFile('notes/source.md');f.pending[0].resolve({ref:'notes/source.md',title:'Source',text:'Source'});await opening;
 const navigation=f.noteOptions().onNavigate('destination');
 assert.equal(f.pending.length,2);
 f.noteState.dirty=true;f.setLeaveAllowed(false);
 f.pending[1].resolve({ref:'notes/destination.md'});await navigation;
 assert.equal(f.state.selectedLocalFile,'notes/source.md');
 assert.equal(f.noteState.dirty,true);assert.equal(f.leaveCalls(),1,'fresh leave consent is requested after the asynchronous resolution');
}
{
 const f=fixture();let loadModule,markRequested;const requested=new Promise(resolve=>{markRequested=resolve;});f.context.loadNoteWorkspace=()=>new Promise(resolve=>{loadModule=resolve;markRequested();});
 const opening=f.api.openLocalFile('notes/lazy.md');f.pending[0].resolve({ref:'notes/lazy.md',title:'Lazy',text:'Private lazy body'});await requested;
 f.api.closeDrawer();let mounted=false;loadModule({mountNoteWorkspace(){mounted=true;}});await opening;
 assert.equal(mounted,false,'a lazy editor response must not mount after the drawer closes');
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../console/index.html', import.meta.url), 'utf8');
const section = (start, end) => { const from = app.indexOf(start); assert.notEqual(from, -1, `${start} exists`); const to = app.indexOf(end, from); assert.notEqual(to, -1); return app.slice(from, to); };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slot = (extra = {}) => ({ data: null, loaded: false, loading: false, error: false, request: 0, ...extra });
const notice = { id: 'opaque-id', fingerprint: 'fp-v1', kind: 'failed-run', title: '<private>', severity: 'error', status: 'failed', occurred_at: null, area_ref: 'delta', system_ref: 'system:a', evidence_ref: 'routine-receipt:r1', read: false, target: { kind: 'receipt', ref: 'r1' } };
const payload = { available: true, notices: [notice], counts: { total: 101, unread: 100 }, total: 101, offset: 0, limit: 50, issues: [] };
function fixture() {
  const state = { view: 'notices', operatingAreaFilter: 'delta', localViewContext: 'notices:delta', canvas: {}, model: { routines: [{ routine_id: 'routine:a', receipts: [{ receipt_id: 'r1' }] }], run_records: [{ run_id: 'run:a' }] }, inbox: slot({ unread: false, offset: 0, limit: 50, mutation: null, mutationError: false }), metrics: slot({ system: '', workflow: '' }), files: slot(), areaFiles: slot() };
  const pending = []; const mutations = []; const actions = []; const listeners = [];
  const context = { $: () => null, state, URLSearchParams, Intl, escapeHtml, fmtDate: (v) => v || 'Sem data', empty: (a,b) => `<p>${a} ${b}</p>`, badge: (v) => `<span>${escapeHtml(v)}</span>`, label: (v) => v, render() {}, closeDrawer() {}, toast() {}, getJson(url) { return new Promise((resolve,reject) => pending.push({ url, resolve, reject })); }, mutate(url,body) { return new Promise((resolve,reject) => mutations.push({url,body,resolve,reject})); }, openJudgment(ref) { actions.push(['receipt',ref]); }, openDrawer(ref) { actions.push(['routine',ref]); }, openCase(ref) { actions.push(['decision-case',ref]); }, document: { addEventListener(type,handler) { listeners.push({type,handler}); } } };
  const api = runInNewContext(`${section('function metricPeriod(', 'function systemOperational(')}\n({renderOperationalInbox,loadOperationalInbox,markOperationalNotice,openOperationalNotice,renderMetrics,loadBusinessMetrics,syncLocalViewContext,renderLocalWorkspace})`, context);
  for (const match of app.matchAll(/document\.addEventListener\('(click|change|submit)', \(event\) => \{/g)) {
    const end = app.indexOf('\n});', match.index) + 4;
    runInNewContext(app.slice(match.index,end), {...context,...api});
  }
  const dispatch = (type, selector, dataset, extra = {}) => listeners.filter((x) => x.type === type).forEach(({handler}) => handler({target:{closest(s) { return s === selector ? {dataset,...extra} : null; }, matches() { return false; }},preventDefault() {}}));
  return {state,pending,mutations,actions,api,dispatch,context};
}
assert.match(html, /data-view="notices"/);
{
  const f = fixture(); const loading = f.api.loadOperationalInbox();
  assert.match(f.api.renderOperationalInbox(), /Lendo avisos/);
  const url = new URL(f.pending[0].url,'http://localhost'); assert.equal(url.searchParams.get('area'),'delta'); assert.equal(url.searchParams.get('limit'),'50');
  f.pending[0].resolve(payload); await loading;
  const markup = f.api.renderOperationalInbox(); assert.match(markup,/&lt;private&gt;/); assert.doesNotMatch(markup,/<private>/); assert.match(markup,/100 não lidos/); assert.match(markup,/1–50 de 101/); assert.equal(f.mutations.length,0,'reading list never marks read');
  f.dispatch('click','[data-inbox-page]',{inboxPage:'50'}); assert.equal(f.state.inbox.offset,50); assert.equal(f.state.inbox.loaded,false);
  f.dispatch('change','[data-inbox-unread]',{}, {checked:true}); assert.equal(f.state.inbox.unread,true); assert.equal(f.state.inbox.offset,0);
  const filtered = f.api.loadOperationalInbox(); assert.equal(new URL(f.pending[1].url,'http://localhost').searchParams.get('unread'),'1'); f.pending[1].resolve({...payload,notices:[],total:0}); await filtered; assert.match(f.api.renderOperationalInbox(),/Nenhum aviso não lido/);
  const failure = f.api.loadOperationalInbox(); f.pending[2].reject(new Error('/secret/path')); await failure; assert.match(f.api.renderOperationalInbox(),/Tentar novamente/); assert.doesNotMatch(f.api.renderOperationalInbox(),/secret/);
  f.dispatch('click','[data-inbox-retry]',{}); assert.equal(f.state.inbox.loaded,false);
}
{
  const f = fixture(); const old = f.api.loadOperationalInbox(); f.state.inbox.unread = true; const fresh = f.api.loadOperationalInbox();
  f.pending[1].resolve({...payload,notices:[],total:0}); await fresh; f.pending[0].resolve(payload); await old; assert.equal(f.state.inbox.data.total,0,'old filter reply ignored');
  const navigation = f.api.loadOperationalInbox(); f.state.view = 'today'; f.api.syncLocalViewContext(); f.pending[2].resolve(payload); await navigation; assert.equal(f.state.inbox.data,null);
}
{
  const f = fixture(); f.state.inbox.loaded = true; f.state.inbox.data = payload;
  f.api.openOperationalNotice('opaque-id'); assert.equal(f.mutations.length,0,'source opening never marks read'); assert.equal(f.actions.length,1);
  const change = f.api.markOperationalNotice('opaque-id'); assert.equal(f.mutations[0].url,'/api/operational-inbox/read'); assert.deepEqual({...f.mutations[0].body},{id:'opaque-id',fingerprint:'fp-v1',read:true}); assert.match(f.api.renderOperationalInbox(),/disabled/);
  f.mutations[0].resolve({id:'opaque-id',fingerprint:'fp-v1',read:true}); await new Promise(setImmediate); assert.equal(f.pending.length,1,'mutation re-reads canonical projection'); f.pending[0].resolve({...payload,notices:[{...notice,read:true}],counts:{total:101,unread:99}}); await change;
  assert.match(f.api.renderOperationalInbox(),/Marcar como não lido/);
  const stale = f.api.markOperationalNotice('opaque-id'); f.mutations[1].reject(new Error('operational-notice-stale')); await new Promise(setImmediate); assert.equal(f.pending.length,2,'stale mutation refreshes'); f.pending[1].resolve({...payload,notices:[],total:0}); await stale; assert.equal(f.state.inbox.data.notices.length,0);
}
{
  const f = fixture(); f.state.inbox.data = {...payload,notices:[notice,{...notice,id:'routine',target:{kind:'routine',ref:'routine:a'}},{...notice,id:'run',target:{kind:'run-record',ref:'run:a'}},{...notice,id:'case',target:{kind:'decision-case',ref:'case:a'}},{...notice,id:'bad',target:{kind:'url',ref:'https://bad'}}]};
  f.api.openOperationalNotice('routine'); f.api.openOperationalNotice('case'); f.api.openOperationalNotice('run'); f.api.openOperationalNotice('bad'); assert.equal(f.actions.length,2); assert.equal(f.state.view,'canvas'); assert.equal(f.state.canvas.ref,'run-record:run:a');
}
{
  const f = fixture(); f.state.view = 'metrics'; f.state.metrics.loaded = true; f.state.metrics.data = {filters:{systems:['system:a','<unsafe>'],workflows:['workflow:a']},metrics:[{name:'Metric',current:0,numerator:0,denominator:{key:'base',label:'Eligible',value:0,definition:'<definition>'},attribution:'source only',scope:{system_ref:'system:a'},source_ref:'source:current',history:[{value:0,numerator:null,denominator:0,attribution:null,scope:{system_ref:'system:b'},source_ref:'source:history'}]}]};
  const markup = f.api.renderMetrics(); assert.match(markup,/Sistema/); assert.match(markup,/Fluxo/); assert.match(markup,/Numerador/); assert.match(markup,/Denominador/); assert.match(markup,/Eligible/); assert.match(markup,/&lt;definition&gt;/); assert.match(markup,/Não declarado/); assert.match(markup,/source only/); assert.match(markup,/system:b/); assert.match(markup,/<strong>0<\/strong>/); assert.doesNotMatch(markup,/<unsafe>|<definition>/);
  f.state.metrics.system = 'system:a'; f.state.metrics.workflow = 'workflow:a'; const first = f.api.loadBusinessMetrics(); const url = new URL(f.pending[0].url,'http://localhost'); assert.equal(url.searchParams.get('system'),'system:a'); assert.equal(url.searchParams.get('workflow'),'workflow:a');
  f.state.metrics.system = 'system:b'; const second = f.api.loadBusinessMetrics(); f.pending[1].resolve({metrics:[],filters:{systems:['system:b'],workflows:[]}}); await second; f.pending[0].resolve({metrics:[{name:'stale'}]}); await first; assert.equal(f.state.metrics.data.metrics.length,0);
  f.dispatch('change','[data-metric-filter]',{metricFilter:'workflow'}, {value:'workflow:b'}); assert.equal(f.state.metrics.workflow,'workflow:b'); assert.equal(f.state.metrics.loaded,false);
}
// Existing authenticated mutation helper remains the only write path.
{
  const requests = [];
  const mutate = runInNewContext(`${section('async function mutate(', 'function summaryCards(')}\nmutate`, {state:{csrf:'session-token'},fetch:async (url,options) => { requests.push({url,options}); return {ok:true,json:async () => ({read:true})}; }});
  await mutate('/api/operational-inbox/read',{id:'notice',fingerprint:'current',read:true});
  assert.equal(requests[0].options.credentials,'same-origin'); assert.equal(requests[0].options.headers['X-Cerebro-CSRF'],'session-token'); assert.equal(JSON.parse(requests[0].options.body).confirm,true);
}
// A list that started before a read mutation cannot revert the new state.
{
  const f = fixture(); f.state.inbox.loaded = true; f.state.inbox.data = payload;
  const oldList = f.api.loadOperationalInbox();
  f.dispatch('click','[data-inbox-read]',{inboxRead:'opaque-id'}); assert.equal(f.mutations.length,1);
  f.mutations[0].resolve({read:true}); await new Promise(setImmediate);
  f.pending[1].resolve({...payload,notices:[{...notice,read:true}]}); await new Promise(setImmediate);
  f.pending[0].resolve(payload); await oldList; assert.equal(f.state.inbox.data.notices[0].read,true);
}
// A filtered final page returns to an existing page after marking its last item read.
{
  const f = fixture(); f.state.inbox.offset = 50; const loading = f.api.loadOperationalInbox();
  f.pending[0].resolve({...payload,notices:[],total:50,offset:50}); await new Promise(setImmediate);
  assert.equal(f.state.inbox.offset,0); assert.equal(new URL(f.pending[1].url,'http://localhost').searchParams.get('offset'),'0'); f.pending[1].resolve({...payload,total:50}); await loading;
}
// Async rendering retains keyboard focus, including when a read button is temporarily disabled.
{
  const f = fixture(); let focus = '';
  f.context.document.activeElement = {dataset:{inboxRead:'opaque-id'}};
  f.context.document.querySelectorAll = (selector) => selector === '[data-inbox-read]' ? [{dataset:{inboxRead:'opaque-id'},disabled:true}] : selector === '[data-inbox-source]' ? [{dataset:{inboxSource:'opaque-id'},focus(){focus='origin';}}] : [];
  f.api.renderLocalWorkspace(); assert.equal(focus,'origin');
  f.context.document.activeElement = {dataset:{metricFilter:'system'}};
  f.context.document.querySelectorAll = () => [{dataset:{metricFilter:'system'},focus(){focus='system';}}];
  f.api.renderLocalWorkspace(); assert.equal(focus,'system');
}
// Date-only notice evidence keeps its calendar precision; timestamps keep their time.
{
  const f = fixture(); const calls = [];
  const fmtDate = runInNewContext(`${section('const fmtDate =', 'const sameLocalDay =')}\nfmtDate`, {Intl:{DateTimeFormat:class {constructor(locale,options){return new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'});}}}});
  f.context.fmtDate = (value,withTime) => { calls.push({value,withTime}); return fmtDate(value,withTime); };
  f.state.inbox.loaded = true;
  f.state.inbox.data = {...payload,notices:[{...notice,occurred_at:'2026-10-19'},{...notice,id:'timestamp',occurred_at:'2026-10-19T00:00:00Z'}]};
  const markup = f.api.renderOperationalInbox();
  assert.match(markup,/<time>19\/10\/2026<\/time>/); assert.match(markup,/<time>19\/10\/2026.*00:00<\/time>/);
  assert.equal(calls[0].withTime,false); assert.equal(calls[1].withTime,true);
}
// A stale persisted area is normalized only after the fresh model catalog arrives.
for (const [selected, view, expectedArea, expectedView] of [['ghost', 'notices', '', 'notices'], ['ghost', 'area', '', 'areas'], ['ghost', 'cases', '', 'cases'], ['delta', 'metrics', 'delta', 'metrics'], ['', 'files', '', 'files']]) {
  const state = { model: {areas:[{operating_area:'ghost'}]}, view, operatingAreaFilter:selected, initialRouteResolved:true, procedures:{}, cases:{}, skills:{}, vibeMakers:{}, runs:{}, brainGraph:null };
  const pending = []; const writes = []; const renders = [];
  const context = { state, localStorage:{setItem(...args){writes.push(args);}}, render(){renders.push({view:state.view,area:state.operatingAreaFilter});}, scheduleActivationPoll(){}, getJson(url){return new Promise((resolve,reject)=>pending.push({url,resolve,reject}));} };
  const code = `${section('async function loadCases(', 'async function openCase(')}\n${section('async function loadModel()', '/* Formulário do Decision Case:')}\nloadModel`;
  const load = runInNewContext(code,context);
  const loading = load();
  assert.equal(state.operatingAreaFilter,selected,'storage is not normalized against a previous catalog'); assert.equal(renders.length,0);
  pending.find((entry)=>entry.url === '/api/decision-cases').resolve({available:true,cases:[]}); await new Promise(setImmediate);
  assert.equal(renders.length,0,'batch refresh does not render a partial model when decision cases arrive first');
  for (const request of pending) if (request.url !== '/api/decision-cases') request.resolve(request.url === '/api/console' ? {areas:[{operating_area:'delta'},{operating_area:'pessoal'}],activation:{complete:true}} : null);
  await loading;
  assert.equal(state.operatingAreaFilter,expectedArea); assert.equal(state.view,expectedView); assert.equal(renders.length,1); assert.equal(renders[0].area,expectedArea,'first render and derived requests see only the canonical area');
  assert.deepEqual(writes,selected === 'ghost' ? [['cb-operating-area','']] : []);
}
console.log('console-operational-workspace: ok (notices, explicit read, stale/error states, source dispatch, metric details/filters)');

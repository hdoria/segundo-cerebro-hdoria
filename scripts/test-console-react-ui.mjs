import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const bundle = new URL('../console/ui.bundle.js', import.meta.url);
assert.ok(existsSync(bundle), 'compiled genuine React component renderer must ship');
const ui = await import(bundle);
assert.equal(typeof ui.elementFromDescriptor, 'function');
const button = ui.elementFromDescriptor({ tag:'button', attrs:{'data-view':'metrics',class:'action primary'}, children:['Indicadores'] });
assert.equal(button.type, ui.componentRegistry.button);
assert.equal(button.props['data-view'], 'metrics');
assert.equal(button.props.variant, 'default');
for (const tag of ['input','textarea','select','table','thead','tbody','tr','th','td']) {
 const element = ui.elementFromDescriptor({tag,attrs:{},children:[]});
 assert.equal(element.type, ui.componentRegistry[tag], `${tag} must render shared shadcn component`);
}
const checkbox = ui.elementFromDescriptor({tag:'input',attrs:{type:'checkbox',checked:'','data-inbox-unread':''},children:[]});
assert.equal(checkbox.type, ui.componentRegistry.checkbox);
assert.equal(checkbox.props.defaultChecked,true);
const selected = ui.elementFromDescriptor({tag:'select',attrs:{},children:[{tag:'option',attrs:{value:'x',selected:''},children:['x']}]});
assert.equal(selected.props.defaultValue,'x');
const input = ui.elementFromDescriptor({tag:'input',attrs:{value:'zero',oninput:'bad()',style:'color:red'},children:[]});
assert.equal(input.props.defaultValue,'zero'); assert.equal(input.props.oninput,undefined); assert.equal(input.props.style,undefined);
assert.equal(ui.elementFromDescriptor({tag:'script',attrs:{},children:['bad()']}),null);
const source = readFileSync(new URL('../console/app.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/\.innerHTML\s*=/,'all workspace DOM must pass exclusive React renderer');
assert.doesNotMatch(readFileSync(new URL('../console/ui/index.jsx',import.meta.url),'utf8'),/dangerouslySetInnerHTML/);
const html = readFileSync(new URL('../console/index.html',import.meta.url),'utf8');
assert.match(html, /id="open-palette"[^>]*aria-label="Buscar e navegar"/, 'search remains named when mobile hides its visible label');
assert.match(html, /id="collapse-nav"[^>]*aria-label="Encolher menu"/, 'collapsed navigation control retains an explicit name');
assert.match(source, /collapsed \? 'Expandir menu' : 'Encolher menu'/);
assert.equal(ui.normalizeTheme('invalid'),'system');
assert.equal(ui.normalizeTheme('dark'),'dark');
for (const name of ['x','external-link','copy','chevron-left','chevron-right','chevron-down','check']) {
  const markup=ui.iconMarkup(name);
  assert.match(markup, /aria-hidden="true"/);
  assert.ok(markup.includes(`href="#i-${name}"`));
  assert.ok(html.includes(`id="i-${name}"`),'every shared action references a shipped Lucide sprite symbol');
}
assert.throws(()=>ui.iconMarkup('untrusted" onclick="bad'), /Unknown shared action icon/);
assert.doesNotMatch(source, /<p class="micro">(?:Mapa inteiro|Rotinas do Cérebro|Seu Cérebro hoje)<\/p>/);
assert.match(source, /<p class="micro">\$\{escapeHtml\(origin\)\} · \$\{escapeHtml\(routine.system_ref\)\}<\/p>/,'object provenance is retained');
assert.match(source, /Ver mais \$\{laterDecisions.length\} decisões\$\{iconMarkup\('chevron-down'\)\}/);
assert.match(html, /id="close-drawer"[^>]*aria-label="Fechar"[^>]*><svg class="ui-icon"/);


// Disconnected transient roots must be disposed while their host still exists.
{
 const start=source.indexOf('function stopTraceReplay('), end=source.indexOf('  if (!restore) return;',start);
 const calls=[]; const ticker={remove(){calls.push('remove');}};
 runInNewContext('('+source.slice(start,end)+'})', {clearTimeout(){}, replay:{timer:null}, $:selector=>selector==='#replay-ticker'?ticker:null, disposeMarkup(host){assert.equal(host,ticker);calls.push('dispose');}}).call(null,false);
 assert.deepEqual(calls,['dispose','remove']);
}

// An async response may retain a slot removed by a newer workspace. Execute the
// actual renderer's imperative boundary with a disconnected DOM host: it must
// dispose stale ownership before any parse/createRoot work can run.
{
 const rendererSource=readFileSync(new URL('../console/ui/index.jsx',import.meta.url),'utf8');
 const start=rendererSource.indexOf('export function renderMarkup(');
 const end=rendererSource.indexOf('  const nodes=parseMarkup(',start);
 const calls=[]; const stale={isConnected:false};
 const render=runInNewContext(rendererSource.slice(start,end).replace('export function','function')+'}\nrenderMarkup',{
   disposeMarkup(host,options){assert.equal(host,stale);calls.push({operation:'dispose',options});},
   roots:new Map(),
   createRoot(){throw Error('A disconnected host must never acquire a React root');},
 });
 render(stale,'<button>Delayed response</button>');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options,undefined,'dispose self and descendants for an abandoned host');
 render(null,'<button>Missing host</button>');assert.equal(calls.length,1);
}

console.log('console-react-ui: ok (genuine shared component registry, form defaults, escaped attributes, complete workspace boundary)');

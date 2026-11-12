import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Button } from './components/button.jsx';
import { Input } from './components/input.jsx';
import { Textarea } from './components/textarea.jsx';
import { Checkbox } from './components/checkbox.jsx';
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from './components/native-select.jsx';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from './components/table.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/tabs.jsx';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/dialog.jsx';
import { Sheet, SheetContent, SheetTitle } from './components/sheet.jsx';
import { Label } from './components/label.jsx';
import { Separator } from './components/separator.jsx';
import { readDesignToken, readDesignNumber, identityForKey, TOKEN_GROUPS } from '../design/tokens.js';

export { readDesignToken, readDesignNumber, identityForKey };
export { renderReviewMarkdown } from './review-markdown.js';
export const componentRegistry = Object.freeze({ button:Button,input:Input,checkbox:CompatibleCheckbox,textarea:Textarea,select:NativeSelect,option:NativeSelectOption,optgroup:NativeSelectOptGroup,table:Table,thead:TableHeader,tbody:TableBody,tfoot:TableFooter,tr:TableRow,th:TableHead,td:TableCell,caption:TableCaption,label:Label,hr:Separator });
const ACTION_ICONS = new Set(['x','external-link','copy','chevron-left','chevron-right','chevron-down','chevron-up','check','arrow-up','arrow-down','play','square','arrow-right']);
// Paths live once in index.html's Lucide sprite; geometry comes from @lucide/icons.
export function iconMarkup(name) {
  if(!ACTION_ICONS.has(name)) throw new Error('Unknown shared action icon');
  return `<svg class="ui-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;
}
const roots = new Map();
let generation = 0;
const aliases = { class:'className',for:'htmlFor',tabindex:'tabIndex',readonly:'readOnly',autofocus:'autoFocus',autocomplete:'autoComplete',spellcheck:'spellCheck',formnovalidate:'formNoValidate',maxlength:'maxLength',minlength:'minLength',colspan:'colSpan',rowspan:'rowSpan',datetime:'dateTime',viewbox:'viewBox','stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin','fill-rule':'fillRule','clip-rule':'clipRule', 'xlink:href':'xlinkHref' };
const booleans = new Set(['disabled','required','multiple','readOnly','autoFocus','formNoValidate','hidden','inert','open','checked','selected']);
const rejected = new Set(['script','style','iframe','object','embed']);

// Markup is produced by the existing escaped view functions. It is parsed as inert
// descriptors, never installed as live HTML. React exclusively owns every rendered child.
export function descriptorFromNode(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  return {tag:node.localName,attrs:Object.fromEntries([...node.attributes].map(a=>[a.name,a.value])),children:[...node.childNodes].map(descriptorFromNode).filter(x=>x !== null)};
}
function propsFromAttributes(attrs = {}) {
  const props = {};
  for (const [name,value] of Object.entries(attrs)) {
    if (name === 'style' || /^on/i.test(name) || name === 'srcdoc') continue;
    if (['href','src','xlink:href'].includes(name) && /^\s*javascript:/i.test(value)) continue;
    const key = aliases[name] || name;
    props[key] = booleans.has(key) ? true : value;
  }
  return props;
}
function CompatibleCheckbox({defaultChecked=false,...props}) {
  const element = React.useRef(null);
  return <Checkbox {...props} ref={element} defaultChecked={defaultChecked} onCheckedChange={(checked)=>{
    // Existing engine handlers consume a native bubbling change and .checked/.value.
    // Radix's button remains the single visible/accessibility control.
    const target = element.current;
    if (target) { target.checked = checked === true; target.dispatchEvent(new Event('change',{bubbles:true})); }
  }} />;
}
export function elementFromDescriptor(node, key='root') {
  if (node == null || typeof node === 'string') return node;
  const {tag,attrs={},children=[]} = node;
  if (rejected.has(tag)) return null;
  const props = {...propsFromAttributes(attrs),key};
  if (props.className?.split(/\s+/).includes('eyebrow')) return null;
  if (props.className?.includes('nav-group') && children.length === 0) return null;
  if (tag === 'input' || tag === 'textarea') {
    if ('value' in props) { props.defaultValue=props.value; delete props.value; }
    if ('checked' in props) { props.defaultChecked=props.checked; delete props.checked; }
    if (tag === 'textarea') props.defaultValue=children.filter(x=>typeof x==='string').join('');
  }
  if (tag === 'select') {
    const selected=[];
    const scan=(items)=>items.forEach(item=> { if (typeof item !== 'object' || !item) return; if(item.tag==='option' && 'selected' in (item.attrs||{})) selected.push(item.attrs.value ?? item.children.join('')); scan(item.children||[]); });
    scan(children); if(selected.length) props.defaultValue=props.multiple?selected:selected[0];
    if ('size' in props) { props['data-native-size']=props.size; delete props.size; }
  }
  if (tag === 'option') delete props.selected;
  if (tag === 'button') {
    props.variant = /\b(primary|run)\b/.test(props.className||'') ? 'default' : /\b(danger|destructive)\b/.test(props.className||'') ? 'destructive' : 'ghost';
  }
  if (attrs.role === 'tablist') {
    const triggers = children.filter(child=>child && typeof child==='object' && child.attrs?.role==='tab');
    const active = triggers.find(child=>/\bactive\b/.test(child.attrs.class||'') || child.attrs['aria-selected']==='true');
    return <Tabs key={key} defaultValue={active?.attrs['data-view'] || active?.attrs['data-ws-tab'] || active?.attrs['data-brain-mode'] || active?.attrs['data-judgment-tab'] || 'initial'} activationMode="manual"><TabsList {...props}>{children.map((child,index)=>{
      if(!child || typeof child!=='object' || child.attrs?.role!=='tab') return elementFromDescriptor(child,`${key}:${index}`);
      const p=propsFromAttributes(child.attrs); delete p.role; return <TabsTrigger {...p} key={index} value={child.attrs['data-view']||child.attrs['data-ws-tab']||child.attrs['data-brain-mode']||child.attrs['data-judgment-tab']||String(index)}>{child.children.map((c,i)=>elementFromDescriptor(c,`${key}:${index}:${i}`))}</TabsTrigger>;
    })}</TabsList></Tabs>;
  }
  const Component = tag==='input' && attrs.type==='checkbox' ? componentRegistry.checkbox : componentRegistry[tag] || tag;
  if (Component===componentRegistry.checkbox) { delete props.type; return React.createElement(Component,props); }
  const converted=tag==='textarea'?[]:children.map((child,index)=>elementFromDescriptor(child,`${key}:${index}`));
  return React.createElement(Component,props,...converted);
}
export function parseMarkup(html) {
  const document = new DOMParser().parseFromString(String(html),'text/html');
  return [...document.body.childNodes].map(descriptorFromNode).filter(x=>x!==null);
}
export function disposeMarkup(host,{includeSelf=true}={}) {
  for(const [element,record] of [...roots]) {
    if ((includeSelf && element===host) || (element!==host && host.contains(element))) {
      flushSync(()=>record.root.unmount()); roots.delete(element);
    }
  }
}
export function renderMarkup(host,html) {
  if(!host) return;
  // A delayed response may hold a host removed by a newer React workspace.
  // It cannot acquire or retain a root after leaving the live document.
  if(host.isConnected === false) { disposeMarkup(host); return; }
  disposeMarkup(host,{includeSelf:false});
  let record=roots.get(host);
  if(!record) {record={root:createRoot(host)}; roots.set(host,record);}
  const nodes=parseMarkup(html), version=++generation;
  // A complete imperative view replacement intentionally remounts uncontrolled forms.
  // This bounded synchronous boundary preserves immediate DOM queries and focus restoration.
  flushSync(()=>record.root.render(<React.Fragment key={version}>{nodes.map((node,index)=>elementFromDescriptor(node,String(index)))}</React.Fragment>));
}

const modals = new Map();
function mountModal(name,host,backdrop,sheet=false) {
  const descriptor=descriptorFromNode(host);
  renderMarkup(host,host.innerHTML);
  const parking=document.createElement('div');parking.hidden=true;parking.dataset.uiParking=name;
  host.before(parking);parking.append(host);host.hidden=false;host.inert=false;
  host.className='';host.removeAttribute('role');host.removeAttribute('aria-modal');host.removeAttribute('aria-hidden');
  const mount=document.createElement('div');mount.dataset.uiModal=name;parking.after(mount);
  const record={root:createRoot(mount),open:false,descriptor,sheet,onClose:null,host,parking};modals.set(name,record);
  // Closed dialogs are unmounted: force-mounted Radix modal content would hide the
  // rest of the page from assistive technology even while visually hidden.
}
function drawModal(name) {
  const record=modals.get(name);if(!record)return;
  if(!record.open){record.parking.append(record.host);flushSync(()=>record.root.render(null));return;}
  const Root=record.sheet?Sheet:Dialog,Content=record.sheet?SheetContent:DialogContent,Title=record.sheet?SheetTitle:DialogTitle;
  const close=()=>{if(record.onClose)record.onClose();else setModalOpen(name,false);};
  flushSync(()=>record.root.render(<Root open onOpenChange={open=>{if(!open)close();}}><Content className={record.descriptor.attrs.class} showCloseButton={false} aria-describedby={undefined} onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()}><Title className="sr-only">{record.descriptor.attrs['aria-label']||'Detalhes'}</Title><div data-ui-modal-content={name} ref={target=>{if(target)target.append(record.host);}}/></Content></Root>));
}
export function setModalOpen(name,open){const record=modals.get(name);if(record&&record.open!==open){record.open=open;drawModal(name);}}
export function createReactDrawerController({background,resolveInvoker}) {
  let invoker=null,opened=false;
  const controller={open(){if(!opened)invoker=document.activeElement;opened=true;setModalOpen('drawer',true);background.inert=true;document.getElementById('close-drawer')?.focus();},close(){if(!opened)return;opened=false;setModalOpen('drawer',false);background.inert=false;const target=invoker?.isConnected?invoker:resolveInvoker?.(invoker);target?.focus();invoker=null;},trapFocus(){/* Radix FocusScope owns modal focus. */}};
  modals.get('drawer').onClose=()=>document.getElementById('close-drawer')?.click();
  return controller;
}
export function normalizeTheme(value) { return ['light','dark','system'].includes(value)?value:'system'; }
let theme='system'; let media=null;
function applyTheme() {
  const resolved=theme==='system'?(media?.matches?'dark':'light'):theme;
  document.documentElement.dataset.theme=resolved;
  document.documentElement.dataset.themePreference=theme;
  document.documentElement.classList.toggle('dark',resolved==='dark');
  window.dispatchEvent(new CustomEvent('cerebro:theme-change',{detail:{theme:resolved,preference:theme}}));
}
export function setTheme(value) {theme=normalizeTheme(value);try{localStorage.setItem('cb-theme',theme);}catch{}applyTheme();}
function ThemeControl(){return <label className="ds-theme-control"><span>Tema</span><NativeSelect aria-label="Tema" defaultValue={theme} onChange={event=>setTheme(event.target.value)}><NativeSelectOption value="system">Sistema</NativeSelectOption><NativeSelectOption value="light">Claro</NativeSelectOption><NativeSelectOption value="dark">Escuro</NativeSelectOption></NativeSelect></label>;}
export function hydrateShell() {
  media=window.matchMedia('(prefers-color-scheme: dark)'); try{theme=normalizeTheme(localStorage.getItem('cb-theme'));}catch{}
  media.addEventListener('change',()=>{if(theme==='system')applyTheme();}); applyTheme();
  const shell=document.querySelector('.app-shell'); if(shell)renderMarkup(shell,shell.innerHTML);
  for(const name of ['drawer','palette']){const host=document.getElementById(name);if(host)mountModal(name,host,document.getElementById(`${name}-backdrop`),name==='drawer');}
  const paletteRecord=modals.get('palette');if(paletteRecord)paletteRecord.onClose=()=>window.dispatchEvent(new CustomEvent('cerebro:close-palette'));
  const themeHost=document.getElementById('theme-control');if(themeHost){const root=createRoot(themeHost);roots.set(themeHost,{root});flushSync(()=>root.render(<ThemeControl/>));}
}
export function askConfirmation({title,body='',confirmLabel='Confirmar',tone='primary',fields=[]}) {
  const host=document.getElementById('confirm-dialog'); disposeMarkup(host);
  const root=createRoot(host);roots.set(host,{root});const invoker=document.activeElement;
  return new Promise(resolve=>{
    const finish=value=>{flushSync(()=>root.unmount());roots.delete(host);host.open=false;if(invoker?.isConnected)invoker.focus();resolve(value);};
    host.open=true;
    flushSync(()=>root.render(<Dialog open onOpenChange={open=>{if(!open)finish(null);}}><DialogContent className="confirm-dialog" onCloseAutoFocus={e=>e.preventDefault()} showCloseButton={false}><form onSubmit={event=>{event.preventDefault(); const values={};for(const field of fields)values[field.key]=event.currentTarget.elements[field.key].value.trim();finish(values);}}><DialogTitle>{title}</DialogTitle>{body&&<DialogDescription>{body}</DialogDescription>}{fields.map(field=><Label key={field.key}><span>{field.label}</span><Input name={field.key} defaultValue={field.value||''} placeholder={field.placeholder||''} autoComplete="off" spellCheck={false} required/></Label>)}<div className="confirm-dialog-actions"><Button type="button" variant="outline" onClick={()=>finish(null)}>Cancelar</Button><Button type="submit" variant={tone==='danger'?'destructive':'default'}>{confirmLabel}</Button></div></form></DialogContent></Dialog>));
    const input=document.querySelector('[data-slot="dialog-content"] input');input?.focus();input?.select();
  });
}
function Catalog(){const [dialog,setDialog]=React.useState(false);const [,refreshTheme]=React.useState(0);React.useEffect(()=>{const update=()=>refreshTheme(value=>value+1);window.addEventListener('cerebro:theme-change',update);return()=>window.removeEventListener('cerebro:theme-change',update);},[]);return <main className="ds-catalog"><header className="ds-header"><h1>Design system</h1><p>Componentes compartilhados do Console. Sem dados do cérebro.</p><ThemeControl/></header><section className="ds-section"><h2>Ações e campos</h2><div className="ds-components"><Button onClick={()=>setDialog(true)}>Abrir diálogo</Button><Button variant="outline">Secundário</Button><Button disabled>Indisponível</Button><Label>Texto<Input placeholder="Campo de texto"/></Label><Label>Seleção<NativeSelect><NativeSelectOption>Primeira opção</NativeSelectOption><NativeSelectOption>Segunda opção</NativeSelectOption></NativeSelect></Label><Label><Checkbox/> Opção</Label><Textarea placeholder="Descrição"/></div></section><section className="ds-section"><h2>Navegação e tabela</h2><Tabs defaultValue="components"><TabsList><TabsTrigger value="components">Componentes</TabsTrigger><TabsTrigger value="tokens">Tokens</TabsTrigger></TabsList><TabsContent value="components"><Table><TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Implementação</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Controles</TableCell><TableCell>React e shadcn/ui</TableCell></TableRow><TableRow><TableCell>Interação</TableCell><TableCell>Radix</TableCell></TableRow></TableBody></Table></TabsContent><TabsContent value="tokens"><p>As escalas e a paleta são definidas em console/design/tokens.css.</p></TabsContent></Tabs></section><Separator/><section className="ds-section"><h2>Tokens do sistema</h2><p>Inventário completo, com valores computados no tema atual.</p>{TOKEN_GROUPS.map(group=><details key={group.title}><summary>{group.title} · {group.tokens.length}</summary><dl className="ds-token-list">{group.tokens.map(name=><div key={name} data-token={name}><dt><code>{name}</code></dt><dd>{readDesignToken(name)}</dd></div>)}</dl></details>)}</section><Dialog open={dialog} onOpenChange={setDialog}><DialogContent><DialogTitle>Componente de diálogo</DialogTitle><DialogDescription>Este catálogo usa os mesmos componentes das workspaces.</DialogDescription><Button onClick={()=>setDialog(false)}>Fechar</Button></DialogContent></Dialog></main>;}
if(typeof document!=='undefined' && document.getElementById('catalog-root')){hydrateShell();const root=createRoot(document.getElementById('catalog-root'));flushSync(()=>root.render(<Catalog/>));}

export { createDeliveryApplicationController, deliveryApplicationMarkup } from './delivery-application.js';
export { routinePreflightMarkup } from './routine-preflight.js';

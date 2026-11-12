/** Plate is a view of canonical Markdown. Original bytes live only in this adapter. */
import { createSlateEditor, createSlatePlugin } from 'platejs';
import { MarkdownPlugin, defaultRules } from '@platejs/markdown';
import { BaseBasicBlocksPlugin, BaseBoldPlugin, BaseItalicPlugin, BaseCodePlugin, BaseStrikethroughPlugin } from '@platejs/basic-nodes';
import { BaseListPlugin } from '@platejs/list';
import { BaseCodeBlockPlugin } from '@platejs/code-block';
import { BaseLinkPlugin } from '@platejs/link';
import { BaseTablePlugin } from '@platejs/table';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { parseDocument } from 'yaml';

const documents = new WeakMap();
const parser = unified().use(remarkParse).use(remarkGfm);
const knownAst = new Set(['root', 'paragraph', 'heading', 'text', 'strong', 'emphasis', 'delete', 'inlineCode', 'break', 'link', 'blockquote', 'list', 'listItem', 'table', 'tableRow', 'tableCell', 'code', 'thematicBreak']);
const knownElements = new Set(['p','h1','h2','h3','h4','h5','h6','blockquote','hr','code_block','code_line','code','table','tr','td','th','a','note_wikilink','note_raw']);
const marks = new Set(['bold','italic','code','strikethrough']);
const transient = new Set(['id', 'noteSource', 'selected', 'width']);
const fail = (reason) => { throw new Error(`note-markdown-${reason}`); };

function wikiAst(node) {
  let ast={type:'html',value:node.raw};
  for(const [mark,type] of [['strikethrough','delete'],['italic','emphasis'],['bold','strong']]) {
    if(node.noteMarks?.[mark]) ast={type,children:[ast]};
  }
  return ast;
}

export function createNotePlugins({ components = {} } = {}) {
  const raw = createSlatePlugin({ key:'note_raw', node:{ isElement:true, isVoid:true } });
  const wiki = createSlatePlugin({ key:'note_wikilink', node:{ isElement:true, isInline:true, isVoid:true } });
  const plugins = [BaseBasicBlocksPlugin, BaseBoldPlugin, BaseItalicPlugin, BaseCodePlugin, BaseStrikethroughPlugin,
    BaseListPlugin, BaseCodeBlockPlugin, BaseLinkPlugin, BaseTablePlugin, raw, wiki,
    MarkdownPlugin.configure({ options:{ remarkPlugins:[remarkGfm], rules:{
      note_wikilink:{ serialize:wikiAst },
      note_raw:{ serialize:(node) => ({ type:'html', value:node.raw }) },
      a:{ deserialize:(node,deco,options) => ({...defaultRules.a.deserialize(node,deco,options),...(node.title ? {title:node.title} : {})}),
        serialize:(node,options) => ({...defaultRules.a.serialize(node,options),...(node.title ? {title:node.title} : {})}) },
      table:{ serialize:(node,options) => ({...defaultRules.table.serialize(node,options),...(node.noteAlign ? {align:node.noteAlign} : {})}) },
    } } }),
  ];
  return plugins.map(plugin => components[plugin.key]
    ? plugin.configure({ node:{ component:components[plugin.key] } }) : plugin);
}
const editor = () => createSlateEditor({ plugins:createNotePlugins(), nodeId:false });
const copy = (v) => JSON.parse(JSON.stringify(v));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(key => !transient.has(key) && value[key] !== undefined).sort().map(key => [key,canonical(value[key])]));
  return value;
}
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function trimTrailing(value) {
  const v = [...value];
  while(v.length > 1 && !v.at(-1).noteSource && equal(v.at(-1),{type:'p',children:[{text:''}]})) v.pop();
  return v;
}
function propertiesOf(yaml) {
  const parsed = parseDocument(yaml, { uniqueKeys:true, maxAliasCount:0 });
  if (parsed.errors.length) throw new Error('invalid-yaml');
  const value = parsed.toJS({ maxAliasCount:0 });
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid-yaml');
  return Object.entries(value).map(([key,value]) => ({ key, value }));
}
function splitSource(text) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const rest = text.slice(bom.length);
  if (!/^---[ \t]*(?:\r?\n|$)/.test(rest)) return { prefix:bom, body:rest, properties:[] };
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(rest);
  if (!match) throw new Error('invalid-frontmatter');
  return { prefix:bom + match[0], body:rest.slice(match[0].length), properties:propertiesOf(match[1]) };
}
function markersValid(body) {
  const tokens = [...body.matchAll(/<!--\s*ai:(start|end)\s*-->/g)].map(m => m[1]);
  let opened = false;
  for(const token of tokens) { if((token === 'start') === opened) return false; opened = token === 'start'; }
  return !opened;
}
function unsupported(ast) {
  return !knownAst.has(ast.type) || (ast.type === 'code' && !!ast.meta) || (ast.children || []).some(unsupported);
}
function rawNode(raw, ast) {
  return { type:'note_raw', raw, label:ast.type === 'html' ? (raw.trimStart().startsWith('<!--') ? 'Comentário preservado' : 'HTML preservado como texto') : 'Sintaxe preservada', children:[{text:''}] };
}
function wikify(nodes) {
  return nodes.flatMap(node => {
    if (node.children && node.type !== 'code_block') return [{...node,children:wikify(node.children)}];
    if (typeof node.text !== 'string' || node.code || node.noteLiteralWiki) return [node];
    const output=[]; const pattern=/(?<!!)(\[\[([^\]\n]+)\]\])/g;
    let previous=0; let m;
    while((m = pattern.exec(node.text))) {
      // Escaped brackets are text, not links.
      if (m.index > 0 && node.text[m.index-1] === '\\') continue;
      const split=m[2].indexOf('|');
      const target=split < 0 ? m[2] : m[2].slice(0,split);
      const label=split < 0 ? target : m[2].slice(split+1);
      if (!target.trim() || !label) continue;
      if(m.index > previous) output.push({...node,text:node.text.slice(previous,m.index)});
      if(output.at(-1)?.type) output.push({text:''});
      output.push({ type:'note_wikilink', target, label, raw:m[1], noteMarks:Object.fromEntries(Object.entries(node).filter(([key,val]) => marks.has(key) && val === true)), children:[{text:''}] });
      previous=pattern.lastIndex;
    }
    if(!output.length) return [node];
    if(previous < node.text.length) output.push({...node,text:node.text.slice(previous)});
    // Slate needs text siblings around void inline elements.
    if(output[0].type) output.unshift({text:''});
    if(output.at(-1).type) output.push({text:''});
    return output;
  });
}

function deserializeBlock(e,raw) {
  // Tokenize from original Markdown before escape decoding. This distinguishes
  // \[[literal]] from \\[[active]] without touching fenced/inline code.
  let prefix='CEREBRONOTETOKEN';
  while(raw.includes(prefix)) prefix += 'X';
  const protectedRanges=[];
  const ast=parser.parse(raw);
  function ranges(node) {
    if(['code','inlineCode','link'].includes(node.type)) protectedRanges.push([node.position.start.offset,node.position.end.offset]);
    else (node.children || []).forEach(ranges);
  }
  ranges(ast);
  const tokens=[];
  const prepared=raw.replace(/(\\*)\[(\\?)\[([^\]\n]+)\]\]/g,(match,slashes,middle,inner,offset) => {
    if(protectedRanges.some(([start,end])=>offset>=start && offset<end)) return match;
    const oddSlash=slashes.length % 2 === 1;
    const literal=oddSlash || middle.length > 0;
    const token=`${prefix}${tokens.length}END`;
    const wiki=`[[${inner}]]`;
    const split=inner.indexOf('|');
    const target=split < 0 ? inner : inner.slice(0,split);
    const label=split < 0 ? target : inner.slice(split+1);
    tokens.push({literal:literal || !target.trim() || !label,raw:wiki,target,label});
    return (oddSlash ? slashes.slice(0,-1) : slashes) + token;
  });
  function restore(nodes) {
    return nodes.flatMap(n => {
      if(n.children) return [{...n,children:restore(n.children)}];
      if(typeof n.text !== 'string') return [n];
      const pattern=new RegExp(`${prefix}(\\d+)END`,'g');
      const parts=[]; let last=0; let match;
      while((match=pattern.exec(n.text))) {
        const token=tokens[Number(match[1])];
        if(!token) continue;
        if(match.index > last) parts.push({...n,text:n.text.slice(last,match.index)});
        if(token.literal) parts.push({...n,text:token.raw,noteLiteralWiki:true});
        else parts.push({type:'note_wikilink',target:token.target,label:token.label,raw:token.raw,noteMarks:Object.fromEntries(Object.entries(n).filter(([key,val])=>marks.has(key) && val === true)),children:[{text:''}]});
        last=pattern.lastIndex;
      }
      if(!parts.length) return [n];
      if(last<n.text.length) parts.push({...n,text:n.text.slice(last)});
      return parts;
    });
  }
  return restore(e.api.markdown.deserialize(prepared));
}

export function createNoteDocument(text) {
  if (typeof text !== 'string') fail('invalid-source');
  let source; let reason = null;
  try { source = splitSource(text); } catch { source={prefix:'',body:text,properties:[]}; reason='note-markdown-invalid-frontmatter'; }
  if (!markersValid(source.body)) reason ||= 'note-markdown-invalid-ai-markers';
  const segments=[]; let value=[]; let end=0;
  try {
    const ast = parser.parse(source.body);
    const e = editor();
    for(const [index,node] of ast.children.entries()) {
      const start=node.position.start.offset, stop=node.position.end.offset;
      const raw=source.body.slice(start,stop);
      const key=`source-${index}`;
      const nodes=unsupported(node) ? [rawNode(raw,node)] : deserializeBlock(e,raw);
      if (!nodes.length) throw new Error('unsupported-empty-node');
      const mapped=nodes.map(n => ({...n,...(n.type === 'table' && node.align ? {noteAlign:node.align} : {}),noteSource:key}));
      value.push(...mapped);
      segments.push({ key, raw, before:source.body.slice(end,start), nodes:copy(mapped), protected:nodes.some(n=>n.type==='note_raw') });
      end=stop;
    }
    if(!value.length) value=[{type:'p',children:[{text:''}]}];
    const normalized=createSlateEditor({plugins:createNotePlugins(),value:copy(value)});
    normalized.tf.normalize({force:true});
    value=trimTrailing(copy(normalized.children));
    for(const segment of segments) segment.nodes=copy(value.filter(n=>n.noteSource === segment.key));
  } catch {
    reason ||= 'note-markdown-unsupported';
    value=[rawNode(source.body,{type:'unsupported'})];
  }
  const doc={ value, properties:source.properties, editable:!reason, reason };
  documents.set(doc,{ original:text, ...source, segments, baseline:copy(value), tail:source.body.slice(end), eol:text.includes('\r\n') ? '\r\n' : '\n' });
  return doc;
}
function validateNodes(nodes) {
  for(const node of nodes) {
    if (!node || typeof node !== 'object') fail('unsupported');
    if (typeof node.text === 'string') {
      if (Object.keys(node).some(k => k !== 'text' && k !== 'noteLiteralWiki' && !transient.has(k) && (!marks.has(k) || node[k] !== true))) fail('unsupported');
    } else {
      if(!knownElements.has(node.type) || !Array.isArray(node.children)) fail('unsupported');
      if(node.type === 'note_wikilink' && (!/^\[\[[^\]\n]+\]\]$/.test(node.raw || '') || node.target !== (node.raw.slice(2,-2).split('|')[0]))) fail('unsupported');
      validateNodes(node.children);
    }
  }
}
function restoreLineEndings(text,eol) { return text.replace(/\r\n|\r|\n/g,eol); }

export function serializeNoteDocument(document, value) {
  const state=documents.get(document);
  if(!state || !Array.isArray(value)) fail('invalid-document');
  const current=trimTrailing(value);
  if(equal(current,state.baseline)) return state.original;
  if(!document.editable) fail('read-only');
  validateNodes(current);
  // Raw syntax and comments are immutable islands, never silently removed by Slate transforms.
  const originalProtected=state.segments.filter(s=>s.protected).map(s=>s.nodes).flat();
  const currentProtected=current.filter(n=>n.type==='note_raw');
  if(!equal(originalProtected,currentProtected)) fail('protected-content');
  const known=new Map(state.segments.map(s=>[s.key,s]));
  const groups=[];
  for(const node of current) {
    const key=node.noteSource && known.has(node.noteSource) ? node.noteSource : null;
    const last=groups.at(-1);
    if(key && last?.key === key) last.nodes.push(node);
    else groups.push({key,nodes:[node]});
  }
  const seen=new Set(); let body=''; const e=editor();
  for(const group of groups) {
    if(group.key && seen.has(group.key)) fail('split-source-block');
    if(group.key) seen.add(group.key);
    const segment=known.get(group.key);
    const unchanged=segment && equal(group.nodes,segment.nodes);
    let raw;
    if(unchanged) raw=segment.raw;
    else {
      // Serialization only receives known Markdown nodes and explicit raw/wiki rules; never MDX.
      raw=e.api.markdown.serialize({value:wikify(group.nodes)}).replace(/\n+$/,'');
      if(!raw && group.nodes.some(n=>n.type!=='p')) fail('unsupported');
      raw=restoreLineEndings(raw,state.eol);
    }
    const gap=segment ? segment.before : (body ? state.eol+state.eol : '');
    body += gap + raw;
  }
  body += state.tail;
  if(!markersValid(body)) fail('protected-content');
  return state.prefix + body;
}

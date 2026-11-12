// Ephemeral, bounded relations derived from visible Markdown. No content index is
// persisted; every binary request proves its source declaration again.
import {parseNoteMarkdown} from './note-markdown-parser.bundle.mjs';
import {closeSync,constants,fstatSync,openSync,opendirSync,readSync} from 'node:fs';
import {basename,dirname,extname,relative,resolve,sep} from 'node:path';
const MAX_ATTACHMENT_BYTES=20*1024*1024;
const MAX_LINKS=1000;
const MAX_ATTACHMENTS=100;
const MAX_ENTRIES=10_000;
const fail=()=>{throw new Error('not-found');};
const slash=value=>value.split(sep).join('/');
const normalized=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
const nameKey=value=>value.normalize('NFC').toLocaleLowerCase();
const extensionMime=new Map([['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.gif','image/gif'],['.webp','image/webp'],['.pdf','application/pdf']]);

function treeText(node) {
  if(['html','definition'].includes(node.type)) return '';
  if(typeof node.value==='string') return node.value;
  if(node.type==='image') return node.alt || '';
  return (node.children || []).map(treeText).join(' ');
}
export function contentSearchMatch(item,query) {
  const plain=treeText(parseNoteMarkdown(item.body)).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const needle=normalized(query), haystack=normalized(plain);
  const matches=[];
  if(normalized(item.title).includes(needle)) matches.push('title');
  const index=haystack.indexOf(needle);
  if(index!==-1) matches.push('body');
  if(!matches.length) return null;
  const start=Math.max(0,index-55);
  return {matches,snippet:plain.slice(start,start+180)};
}

function declarations(body) {
  const tree=parseNoteMarkdown(body), definitions=new Map(), links=[];
  let complete=true;
  function collectDefinitions(node) {
    if(node.type==='definition' && !definitions.has(node.identifier)) definitions.set(node.identifier,node.url);
    for(const child of node.children || []) collectDefinitions(child);
  }
  collectDefinitions(tree);
  function add(target,kind) {
    if(links.length>=MAX_LINKS) {complete=false;return;}
    if(typeof target==='string' && target.length<=1024) links.push({target,kind});
  }
  function visit(node) {
    if(['code','inlineCode','html','definition'].includes(node.type)) return;
    if(['link','image'].includes(node.type)) {add(node.url,'markdown');return;}
    if(['linkReference','imageReference'].includes(node.type)) {add(definitions.get(node.identifier),'markdown');return;}
    if(node.type==='text') {
      // Parse the source span: Markdown's text value removes escapes, which must
      // not turn an escaped [[example]] into a real link.
      const raw=body.slice(node.position.start.offset,node.position.end.offset);
      for(const match of raw.matchAll(/!?\[\[([^\]\r\n]+)\]\]/g)) {
        let escapes=0;
        for(let i=match.index-1;i>=0 && raw[i]==='\\';i--) escapes++;
        if(escapes%2===0) add(match[1].split('|',1)[0].trim(),'wiki');
      }
    }
    for(const child of node.children || []) visit(child);
  }
  visit(tree);
  return {links,complete};
}
function destination(target) {
  if(typeof target!=='string' || !target.trim() || target.length>1024 || /[\u0000-\u001f\\:]/.test(target)) fail();
  let value;
  try {value=decodeURIComponent(target);} catch {fail();}
  if(/[\u0000-\u001f\\:]/.test(value) || value.startsWith('//') || value.includes('?')) fail();
  return value.split('#',1)[0].trim();
}
function publicMetadata(item) {
  return {ref:item.ref,title:item.title,type:item.library_type,updated:item.updated,tags:item.tags,modified_at:item.modified_at};
}
function signatureMime(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'image/png';
  if(bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString('ascii'))) return 'image/gif';
  if(bytes.subarray(0,4).toString('ascii')==='RIFF' && bytes.subarray(8,12).toString('ascii')==='WEBP') return 'image/webp';
  if(/^%PDF-\d\.\d/.test(bytes.subarray(0,8).toString('ascii'))) return 'application/pdf';
  fail();
}

export function createLocalNoteRelations(access) {
  const {context,note,scan,resolveSafe,allowedName,within,cleanRef}=access;
  function candidatePaths(ctx,source,name) {
    const paths=name.startsWith('/') ? [resolve(ctx.knowledgePath,name.slice(1))]
      : name.startsWith('./') || name.startsWith('../') ? [resolve(dirname(resolve(ctx.root,source.ref)),name)]
      : [resolve(dirname(resolve(ctx.root,source.ref)),name),resolve(ctx.knowledgePath,name),resolve(ctx.root,name)];
    return [...new Set(paths)].filter(path=>within(ctx.knowledgePath,path)).map(path=>cleanRef(slash(relative(ctx.root,path))));
  }
  function noteIndex(scanned) {
    const byRef=new Set(),byName=new Map();
    for(const item of scanned.notes) {
      byRef.add(item.ref);
      for(const key of new Set([nameKey(item.stem),nameKey(item.title)])) {
        if(!byName.has(key)) byName.set(key,new Set());
        byName.get(key).add(item.ref);
      }
    }
    return {byRef,byName,complete:scanned.complete};
  }
  function resolveNote(ctx,source,link,index) {
    // Match resolveLocalFileLink's canonical note semantics. Attachment paths
    // intentionally use the separate resolver below. Resolution here is pure:
    // scan's bounded snapshot is never an excuse for another per-link read.
    const target=link.target;
    if(typeof target!=='string' || !target.trim() || target.length>1024 || /[\u0000-\u001f\\:\[\]]/.test(target)) return null;
    const destination=target.split('|',1)[0].trim();
    const hash=destination.indexOf('#');
    const name=(hash===-1?destination:destination.slice(0,hash)).trim();
    const anchor=hash===-1?'':destination.slice(hash+1).trim();
    if(!name) return anchor?source.ref:null;
    let candidates;
    if(name.includes('/') || name.startsWith('.')) {
      const md=/\.md$/i.test(name)?name:`${name}.md`;
      const paths=name.startsWith('/')?[resolve(ctx.knowledgePath,md.slice(1))]
        :name.startsWith('./') || name.startsWith('../')?[resolve(dirname(resolve(ctx.root,source.ref)),md)]
        :[resolve(ctx.root,md),resolve(dirname(resolve(ctx.root,source.ref)),md)];
      candidates=new Set();
      for(const path of paths) {
        if(!within(ctx.knowledgePath,path)) continue;
        const ref=slash(relative(ctx.root,path));
        if(index.byRef.has(ref)) candidates.add(ref);
      }
    } else {
      if(!index.complete) return null;
      candidates=index.byName.get(nameKey(name.replace(/\.md$/i,''))) || new Set();
    }
    return candidates.size===1?[...candidates][0]:null;
  }
  function binary(ctx,ref,{full=false}={}) {
    const mime=extensionMime.get(extname(ref).toLowerCase());
    if(!mime || !within(ctx.knowledgePath,resolve(ctx.root,ref))) fail();
    const initial=resolveSafe(ctx.root,ref,{binary:true});
    if(initial.stat.size>MAX_ATTACHMENT_BYTES) fail();
    let fd;
    try {
      fd=openSync(initial.path,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const opened=fstatSync(fd);
      if(!opened.isFile() || opened.size>MAX_ATTACHMENT_BYTES || opened.ino!==initial.stat.ino || opened.dev!==initial.stat.dev) fail();
      const bytes=Buffer.alloc(full?opened.size+1:12);
      let size=0;
      while(size<bytes.length) {const count=readSync(fd,bytes,size,bytes.length-size,null);if(!count) break;size+=count;}
      if(full && (size!==opened.size || size>MAX_ATTACHMENT_BYTES)) fail();
      if(signatureMime(bytes.subarray(0,size))!==mime) fail();
      const final=resolveSafe(ctx.root,ref,{binary:true});
      const after=fstatSync(fd);
      if(final.stat.ino!==opened.ino || final.stat.dev!==opened.dev || after.size!==opened.size || after.mtimeMs!==opened.mtimeMs || final.stat.mtimeMs!==opened.mtimeMs) fail();
      return {name:basename(ref),mime,bytes:full?bytes.subarray(0,size):opened.size};
    } finally {if(fd!==undefined) closeSync(fd);}
  }
  // Basename resolution examines names only, never arbitrary attachment bodies.
  function binaryNames(ctx) {
    const refs=[];let visited=0,complete=true;
    function walk(ref,depth) {
      if(depth>32 || visited>=MAX_ENTRIES) {complete=false;return;}
      let handle;
      try {
        handle=opendirSync(resolveSafe(ctx.root,ref,{directory:true}).path);
        let entry;
        while((entry=handle.readSync())) {
          if(++visited>MAX_ENTRIES) {complete=false;break;}
          if(!allowedName(entry.name) || entry.isSymbolicLink()) continue;
          const child=ref==='.'?entry.name:`${ref}/${entry.name}`;
          if(entry.isDirectory()) walk(child,depth+1);
          else if(entry.isFile() && extensionMime.has(extname(entry.name).toLowerCase())) refs.push(child);
        }
      } catch {complete=false;} finally {if(handle) handle.closeSync();}
    }
    walk(ctx.knowledgeRef,0);
    return {refs,complete};
  }
  function attachmentResolver(ctx,source) {
    let names;
    const resolver=link=>{
      const name=destination(link.target);
      if(!extensionMime.has(extname(name).toLowerCase())) fail();
      let candidates=[];
      if(link.kind==='wiki' && !name.includes('/')) {
        names ||= binaryNames(ctx);
        if(!names.complete) fail();
        candidates=names.refs.filter(ref=>nameKey(basename(ref))===nameKey(name));
      } else {
        candidates=candidatePaths(ctx,source,name).filter(ref=>{try {resolveSafe(ctx.root,ref,{binary:true});return true;} catch {return false;}});
        if(!candidates.length && !name.includes('/')) {
          names ||= binaryNames(ctx);
          if(!names.complete) fail();
          candidates=names.refs.filter(ref=>nameKey(basename(ref))===nameKey(name));
        }
      }
      if(candidates.length!==1) fail();
      return candidates[0];
    };
    Object.defineProperty(resolver,'complete',{get:()=>names?.complete ?? true});
    return resolver;
  }
  function listBacklinks(root,{ref,offset=0,limit=50}={}) {
    if(!Number.isSafeInteger(offset) || offset<0 || offset>MAX_ENTRIES || !Number.isSafeInteger(limit) || limit<1 || limit>100) throw new Error('local-files-query-invalid');
    try {
      const ctx=context(root),target=note(ctx,cleanRef(ref)),scanned=scan(ctx),index=noteIndex(scanned),files=[];
      let complete=scanned.complete;
      for(const source of scanned.notes) {
        const declared=declarations(source.body);complete &&= declared.complete;
        if(declared.links.some(link=>{try {return resolveNote(ctx,source,link,index)===target.ref;} catch {return false;}})) files.push(publicMetadata(source));
      }
      files.sort((a,b)=>a.title.localeCompare(b.title) || a.ref.localeCompare(b.ref));
      return {files:files.slice(offset,offset+limit),complete,total:files.length,offset,limit};
    } catch {fail();}
  }
  function listAttachments(root,{from_ref}={}) {
    try {
      const ctx=context(root),source=note(ctx,cleanRef(from_ref)),declared=declarations(source.body),resolveAttachment=attachmentResolver(ctx,source),attachments=[],seen=new Set();
      let complete=declared.complete;
      for(const link of declared.links) {
        if(seen.has(link.target)) continue;
        seen.add(link.target);
        try {
          const ref=resolveAttachment(link),descriptor=binary(ctx,ref);
          if(attachments.length>=MAX_ATTACHMENTS) {complete=false;break;}
          attachments.push({target:link.target,...descriptor});
        } catch {}
      }
      return {attachments,complete:complete && resolveAttachment.complete};
    } catch {fail();}
  }
  function readAttachment(root,{from_ref,target}={}) {
    try {
      const ctx=context(root),source=note(ctx,cleanRef(from_ref));
      const declared=declarations(source.body).links.filter(link=>link.target===target);
      if(!declared.length) fail();
      const resolveAttachment=attachmentResolver(ctx,source);
      const refs=new Set();
      for(const link of declared) try {refs.add(resolveAttachment(link));} catch {}
      if(refs.size!==1) fail();
      const result=binary(ctx,[...refs][0],{full:true});
      // Recheck the source after the read too: stale declarations cannot grant
      // access when a writer changes the note during binary validation.
      if(note(context(root),source.ref).sha256!==source.sha256) fail();
      return result;
    } catch {fail();}
  }
  return {listBacklinks,listAttachments,readAttachment};
}

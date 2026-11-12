/** Console design guard. Canonical values live in design/tokens.css.
 * Exceptions: structural zero/full percentages, grid ratios/counts, SVG path/viewBox
 * geometry, measured runtime coordinates, domain data and generated build artifacts.
 * These are not substitute locations for authored visual decisions.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKEN_GROUPS } from '../console/design/tokens.js';
const GENERATED = new Set(['canvas.bundle.js','ui.bundle.js','note-workspace.bundle.js','library.bundle.js','styles.bundle.css']);
const COLOR = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
const UNIT = /(?<![\w-])-?(?:\d*\.)?\d+(?:px|rem|em|ch|vh|vw|ms|s)\b/i;
const VISUAL_NUMBER = /^(?:font-weight|line-height|letter-spacing|opacity|z-index|stroke-width)$/;
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g,'');
export async function readConsoleTokenSources(root = resolve(fileURLToPath(new URL('..',import.meta.url)))) {
  async function walk(dir) {
    const entries = await readdir(dir,{withFileTypes:true});
    return (await Promise.all(entries.map(entry=>entry.isDirectory()?walk(`${dir}/${entry.name}`):`${dir}/${entry.name}`))).flat();
  }
  return Promise.all((await walk(`${root}/console`)).filter(path=>/\.(?:css|js|jsx)$/.test(path)&&!GENERATED.has(path.split('/').at(-1))).map(async path=>({path:path.slice(root.length+1),source:await readFile(path,'utf8')})));
}
export function auditConsoleTokenSources(sources,{groups=TOKEN_GROUPS}={}) {
  const failures=[];
  const canonical=sources.find(file=>file.path==='console/design/tokens.css');
  if(!canonical)return ['Missing canonical console/design/tokens.css'];
  const declarations=new Set([...canonical.source.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));
  const media=new Set([...canonical.source.matchAll(/@custom-media\s+(--[\w-]+)/g)].map(m=>m[1]));
  const inventory=groups.flatMap(group=>group.tokens);
  for(const name of declarations)if(!inventory.includes(name))failures.push(`Token inventory missing ${name}`);
  for(const name of inventory)if(!declarations.has(name))failures.push(`Token inventory references undefined ${name}`);
  if(new Set(inventory).size!==inventory.length)failures.push('Token inventory contains duplicate names');
  const scoped=new Set(sources.flatMap(file=>[...strip(file.source).matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1])));
  function declaration(path,property,value) {
    if(COLOR.test(value))failures.push(`${path}: literal color in ${property}`);
    const literalValue=value.replace(/var\([^)]*\)/g,'');
    if(/^(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)$/.test(property)&&/\b(?:black|white|red|blue|green|gray|grey|orange|purple|pink|yellow|teal|navy|silver|maroon|lime|aqua|fuchsia|olive)\b/i.test(literalValue))failures.push(`${path}: literal named color in ${property}`);
    if(property==='font-family'&&!/var\(|^(?:inherit|initial|unset)$/.test(value.trim()))failures.push(`${path}: literal font family`);
    if(UNIT.test(value))failures.push(`${path}: visual literal in ${property}: ${value.trim()}`);
    if(VISUAL_NUMBER.test(property)&&/^\s*-?(?:\d|\.\d)/.test(value)&&!/^\s*(?:0|1)(?:\s*!important)?\s*$/.test(value))failures.push(`${path}: visual literal in ${property}: ${value.trim()}`);
  }
  for(const file of sources) {
    const {path}=file,source=strip(file.source);
    for(const m of source.matchAll(/var\(\s*(--[\w-]+)/g))if(!declarations.has(m[1])&&!scoped.has(m[1])&&!source.slice(m.index).startsWith('var(--kind-${'))failures.push(`${path}: undefined token ${m[1]}`);
    for(const m of source.matchAll(/(?:readDesignToken|readDesignNumber|token|number)\(\s*['"](--[\w-]+)['"]/g))if(!declarations.has(m[1]))failures.push(`${path}: undefined design reader token ${m[1]}`);
    if(path===canonical.path)continue;
    if(path.endsWith('.css')) {
      for(const m of source.matchAll(/@media\s*\((--[\w-]+)\)/g))if(!media.has(m[1]))failures.push(`${path}: undefined media ${m[1]}`);
      if(/@media[^{}]*\d+(?:px|rem|em)/.test(source))failures.push(`${path}: literal viewport outside canonical tokens`);
      for(const m of source.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]+)/g)) {
        const [,property,value]=m;
        if(property.startsWith('--')) {
          // A scoped state/geometry alias may select a canonical token or runtime value,
          // but cannot introduce a new visual value or a hidden scale.
          if(UNIT.test(value)||COLOR.test(value)||(/^\s*-?(?:\d|\.\d)/.test(value)&&!(property==='--w'&&/^\d+%\s*$/.test(value.trim()))))failures.push(`${path}: value must be canonical: ${property}`);
        } else declaration(path,property,value);
      }
    } else if(/\.(?:js|jsx)$/.test(path)) {
      // CSS style strings and JSX style objects are authored visual code. Numeric domain
      // fields, SVG paths and API payloads are deliberately outside this grammar.
      for(const m of source.matchAll(/style\s*=\s*['"`]([^'"`]*?)['"`]/g))for(const d of m[1].matchAll(/([\w-]+)\s*:\s*([^;]+)/g))declaration(path,d[1],d[2]);
      for(const m of source.matchAll(/\b(?:color|backgroundColor|borderColor|fill|stroke|fontSize|fontFamily|fontWeight|borderRadius|padding|margin|gap|lineWidth|opacity)\s*:\s*(['"])(.*?)\1/g)) {
        if(COLOR.test(m[2])||UNIT.test(m[2])||/^fontFamily/.test(m[0])||/^(?:black|white|red|blue|green|gray|grey|orange|purple|pink|yellow|teal|navy)$/i.test(m[2]))failures.push(`${path}: literal visual property ${m[0]}`);
      }
      for(const m of source.matchAll(/\.(?:fillStyle|strokeStyle|shadowColor|font)\s*=\s*(['"])(.*?)\1/g)) {
        if(COLOR.test(m[2])||UNIT.test(m[2]))failures.push(`${path}: literal Canvas visual assignment ${m[0]}`);
      }
      for(const m of source.matchAll(/\b(?:fontSize|fontWeight|borderRadius|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?|gap|rowGap|columnGap|lineWidth|strokeWidth|opacity|fillOpacity|strokeOpacity)\s*:\s*(-?(?:\d*\.)?\d+)(?=\s*[,}])/g)) {
        if(!['0','1'].includes(m[1]))failures.push(`${path}: literal numeric visual property ${m[0]}`);
      }
      for(const m of source.matchAll(/(?:text|bg|border|ring|shadow|rounded|p[xytrbl]?|m[xytrbl]?|gap|w|min-w|max-w|h|min-h|max-h|duration|ease)-\[([^\]]+)\]/g)) {
        if(COLOR.test(m[1])||UNIT.test(m[1])||/^\d/.test(m[1]))failures.push(`${path}: literal arbitrary utility ${m[0]}`);
      }
      for(const m of source.matchAll(/['"`]([^'"`]*?#[\da-f]{3,8}\b[^'"`]*?)['"`]/gi)) {
        // Literal HTML entity escapes and supplier identity metadata are not theme colors.
        if(/&#(?:\d|x)|supplier|brand\/|simple-icons/i.test(m[1]))continue;
        failures.push(`${path}: literal color outside canonical tokens`);
      }
    }
  }
  return [...new Set(failures)];
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const sources=await readConsoleTokenSources();
  const failures=auditConsoleTokenSources(sources);
  if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
  else console.log(`Console token audit passed: ${TOKEN_GROUPS.flatMap(g=>g.tokens).length} tokens, ${sources.length} authored sources.`);
}

// Browser-free design consumers use authored values, not duplicated theme defaults.
// Browser QA independently verifies actual CSS cascade, color-mix and both themes.
import { readFileSync } from 'node:fs';

export function designTestStyles() {
  const css = readFileSync(new URL('../../console/design/tokens.css', import.meta.url), 'utf8');
  const declarations = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)]
    .map(([, name, value]) => [name, value.trim()]));
  const resolve = (name, visited = new Set()) => {
    if (visited.has(name)) throw Error(`Cyclic design fixture token: ${name}`);
    const next = new Set(visited).add(name);
    return (declarations.get(name) || '').replace(/var\((--[\w-]+)\)/g, (_, ref) => resolve(ref, next));
  };
  return { getPropertyValue: name => resolve(name) };
}

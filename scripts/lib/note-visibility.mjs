// Shared privacy gate for Markdown readers. It does not read files or infer
// permission from the caller: each reader must also authorize its own path.
const PRIVATE_VALUE = /^(?:private|confidential|restricted)$/i;
const fail = () => { throw new Error('not-found'); };

export function publicMarkdownParts(text) {
  if (typeof text !== 'string') fail();
  // readFileSync('utf8') preserves a BOM; TextDecoder strips it. Both readers
  // must make the same privacy decision before trying their metadata parser.
  const source = text.replace(/^\uFEFF/, '');
  const header = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (/^---[ \t]*\r?\n/.test(source) && !header) fail();
  // The general frontmatter parser only handles a YAML subset. Access controls
  // get this conservative pass before that parser, including duplicate keys.
  for (const line of (header?.[1] || '').split(/\r?\n/)) {
    const match = /^\s*(["']?)(visibility|access|privacy|status|classification|sensitivity|private|confidential)\1[ \t]*:\s*(.*?)\s*$/i.exec(line);
    if (!match) continue;
    const value = match[3].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '').trim();
    // Unsupported anchors, aliases, objects and block scalars in access
    // controls are denied rather than guessed public by a smaller parser.
    if (!value || /^[!&*|>{\[]/.test(value) || PRIVATE_VALUE.test(value)
      || (/^(private|confidential)$/i.test(match[2]) && /^(true|yes|1)$/i.test(value))) fail();
  }
  return { header: header?.[1] || '', body: header ? source.slice(header[0].length) : source };
}

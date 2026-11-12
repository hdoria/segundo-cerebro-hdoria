// A deliberately small, escaped Markdown reader for local delivery review.
// Raw HTML and remote embeds stay text. The original bytes remain authoritative.
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function inline(text) {
  const parts = /(`[^`]+`|\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\[[^\]]+\]\([^\s)]+\))/g;
  let result = '';
  let offset = 0;
  for (const match of text.matchAll(parts)) {
    result += escape(text.slice(offset, match.index));
    const part = match[0];
    if (part.startsWith('`')) result += `<code>${escape(part.slice(1, -1))}</code>`;
    else if (part.startsWith('**')) result += `<strong>${escape(part.slice(2, -2))}</strong>`;
    else if (part.startsWith('[[')) {
      const [target, ...labels] = part.slice(2, -2).split('|');
      result += `${labels.length ? `${escape(labels.join('|'))} ` : ''}<code>[[${escape(target)}]]</code>`;
    }
    else {
      const [, label, url] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      let allowed = false;
      try { allowed = ['https:', 'http:'].includes(new URL(url).protocol); } catch { /* Local references remain text. */ }
      result += allowed ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(part);
    }
    offset = match.index + part.length;
  }
  return result + escape(text.slice(offset));
}

export function renderReviewMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const result = [];
  let cursor = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      result.push(`<details class="review-metadata"><summary>Metadados da nota</summary><pre>${escape(lines.slice(1, end).join('\n'))}</pre></details>`);
      cursor = end + 1;
    }
  }
  const cells = (line) => {
    const text = line.trim();
    const values = [];
    let cell = '', brackets = 0, code = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '\\' && text[index + 1] === '|') { cell += '|'; index++; continue; }
      if (char === '`') code = !code;
      if (!code && char === '[') brackets++;
      if (!code && char === ']') brackets = Math.max(0, brackets - 1);
      if (char === '|' && !brackets && !code) { values.push(cell.trim()); cell = ''; }
      else cell += char;
    }
    values.push(cell.trim());
    if (text.startsWith('|') && values[0] === '') values.shift();
    if (text.endsWith('|') && values.at(-1) === '') values.pop();
    return values;
  };
  const list = (line) => /^\s*(?:([-*+])|\d+[.)])\s+(.+)$/.exec(line);
  const special = (line) => !line.trim() || /^\s*(?:#{1,6}\s|```|~~~|>\s|(?:[-*+]\s)|\d+[.)]\s|---\s*$)/.test(line);
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) { cursor++; continue; }
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const code = [];
      cursor++;
      while (cursor < lines.length && !lines[cursor].trim().startsWith(fence[1])) code.push(lines[cursor++]);
      cursor++;
      result.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      result.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      cursor++;
      continue;
    }
    if (/^\s*---\s*$/.test(line)) { result.push('<hr>'); cursor++; continue; }
    if (line.includes('|') && lines[cursor + 1]?.includes('|') && cells(lines[cursor + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const head = cells(line).map((cell) => `<th>${inline(cell)}</th>`).join('');
      cursor += 2;
      const rows = [];
      while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) rows.push(`<tr>${cells(lines[cursor++]).map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
      result.push(`<div class="review-table"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
      continue;
    }
    const item = list(line);
    if (item) {
      const tag = item[1] ? 'ul' : 'ol';
      const items = [];
      while (cursor < lines.length) {
        const match = list(lines[cursor]);
        if (!match || (match[1] ? 'ul' : 'ol') !== tag) break;
        const task = /^\[([ xX])\]\s+(.+)$/.exec(match[2]);
        items.push(`<li>${task ? `<span class="review-task-state">${task[1].trim() ? 'Concluído' : 'Pendente'}:</span> ${inline(task[2])}` : inline(match[2])}</li>`);
        cursor++;
      }
      const start = tag === 'ol' ? Number(/^\s*(\d+)/.exec(line)[1]) : null;
      result.push(`<${tag}${start !== null && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (cursor < lines.length && /^\s*>\s?/.test(lines[cursor])) quote.push(lines[cursor++].replace(/^\s*>\s?/, ''));
      result.push(`<blockquote>${inline(quote.join('\n')).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }
    const paragraph = [line];
    cursor++;
    while (cursor < lines.length && !special(lines[cursor]) && !(lines[cursor].includes('|') && lines[cursor + 1]?.includes('---'))) paragraph.push(lines[cursor++]);
    result.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return result.join('');
}

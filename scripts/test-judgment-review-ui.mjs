import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { renderReviewMarkdown } from '../console/ui/review-markdown.js';

const markup = renderReviewMarkdown('# Relatório\n\nTexto **importante** e `código`.\n\n## Prioridades\n\n- Revisar a fonte\n- [x] Conferir o resumo\n\n1. Primeira ação\n2. Segunda ação\n\n| Item | Estado |\n| --- | --- |\n| Exemplo | Revisado |\n\n```js\n<script>alert(1)</script>\n```');
assert.match(markup, /<h2>Relatório<\/h2>/);
assert.match(markup, /<strong>importante<\/strong>/);
assert.match(markup, /<ul>/);
assert.match(markup, /<ol>/);
assert.match(markup, /<table>/);
assert.match(markup, /Concluído/);
assert.doesNotMatch(markup, /<script/);
const hostile = renderReviewMarkdown('<img src=x onerror=alert(1)>\n\n[x](javascript:alert) [ok](https://example.com/a?q=1&b=2) ![remote](https://example.com/image.png)');
assert.doesNotMatch(hostile, /<img|<script|href="javascript:/i);
assert.match(hostile, /href="https:\/\/example.com/);
assert.match(hostile, /rel="noopener noreferrer"/);
assert.match(renderReviewMarkdown('---\ntype: Note\n---\n\nTexto'), /Metadados da nota/);
assert.match(renderReviewMarkdown('```\nsem fechamento'), /sem fechamento/);
const aliasedTable = renderReviewMarkdown('| Origem | Total |\n| --- | --- |\n| [[clientes/conta-exemplo|Conta]] | 100 |');
assert.equal((aliasedTable.match(/<td>/g) || []).length, 2, 'um alias local não desloca as colunas da evidência');
assert.match(aliasedTable, /clientes\/conta-exemplo/);
assert.equal((renderReviewMarkdown('| Nota | Total |\n| --- | --- |\n| valor \\| literal | 100 |').match(/<td>/g) || []).length, 2);
assert.match(renderReviewMarkdown('Confira [evidência](fontes/contrato-exemplo.pdf)'), /fontes\/contrato-exemplo\.pdf/);
assert.match(renderReviewMarkdown('3. Conferir terceiro item\n4. Conferir quarto item'), /<ol start="3">/);
const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
assert.match(app, /reviewed_sha256:\s*review\.content_sha256/);
assert.match(app, /state\.judgmentReview\s*=\s*null/);
assert.match(app, /data-judgment-tab="imported"/);
assert.match(app, /renderReviewMarkdown\(detail\.output\.content\)/);
assert.match(app, /review\.can_judge/);
const fn = app.slice(app.indexOf('async function performJudgment('), app.indexOf('\nasync function performCorrectionAction('));
function setupReview() {
  const buttons = [{ disabled: false }];
  const events = [];
  const feedback = {};
  const note = { value: 'Comentário fictício para revisar a entrega.' };
  const state = { busy: false, selectedJudgment: 'receipt-fictional', judgmentReview: { receiptId: 'receipt-fictional', can_judge: true, content_sha256: 'a'.repeat(64) } };
  const context = { state, document: { querySelectorAll: () => buttons }, $: (selector) => selector === '#judgment-note' ? note : feedback,
    toast: (message) => events.push(['toast', message]), label: (value) => value, escapeHtml: (value) => value,
    APPROVED_BY_FIELD: {}, askConfirm: async (value) => { events.push(['confirm', value]); return { approvedBy: 'role-reviewer' }; },
    mutate: async (path, payload) => { events.push(['mutation', path, payload]); return { summary: { verdict: 'approved' } }; },
    loadModel: async () => {}, openJudgment: async () => {}, renderMarkup: (target, markup) => { target.markup = markup; } };
  return { context, buttons, events, feedback, perform: runInNewContext(`(${fn})`, context) };
}
const valid = setupReview();
await valid.perform('approve');
assert.equal(valid.events.find(([type]) => type === 'mutation')[2].reviewed_sha256, 'a'.repeat(64));
assert.match(valid.events.find(([type]) => type === 'confirm')[1].body, /qualidade do relatório.*versão/);
const unread = setupReview(); unread.context.state.judgmentReview = null;
await unread.perform('approve');
assert.equal(unread.events.some(([type]) => type === 'mutation'), false);
const changedContext = setupReview();
changedContext.context.askConfirm = async () => { changedContext.context.state.selectedJudgment = 'other-receipt'; return { approvedBy: 'role-reviewer' }; };
await changedContext.perform('approve');
assert.equal(changedContext.events.some(([type]) => type === 'mutation'), false, 'a confirmação não pode migrar para outro recibo');
const stale = setupReview();
stale.context.mutate = async () => { throw new Error('judgment-reviewed-version-stale'); };
await stale.perform('approve');
assert.equal(stale.context.state.judgmentReview, null);
assert.equal(stale.buttons[0].disabled, true);
assert.match(stale.feedback.markup, /data-judgment-reload/);
const otherDrawer = setupReview();
const otherReview = { receiptId: 'receipt-other', can_judge: true, content_sha256: 'b'.repeat(64) };
otherDrawer.context.mutate = async () => {
  otherDrawer.context.state.selectedJudgment = 'receipt-other';
  otherDrawer.context.state.judgmentReview = otherReview;
  throw new Error('judgment-reviewed-version-stale');
};
await otherDrawer.perform('approve');
assert.equal(otherDrawer.context.state.judgmentReview, otherReview, 'erro antigo preserva a versão de outra entrega aberta');
assert.equal(otherDrawer.feedback.markup, undefined, 'erro antigo não insere recuperação no drawer de outro recibo');
const otherOnSuccess = setupReview();
let reopened = false;
otherOnSuccess.context.openJudgment = async () => { reopened = true; };
otherOnSuccess.context.mutate = async () => {
  otherOnSuccess.context.state.selectedJudgment = 'receipt-other';
  otherOnSuccess.context.state.judgmentReview = otherReview;
  return { summary: { verdict: 'approved' } };
};
await otherOnSuccess.perform('approve');
assert.equal(reopened, false, 'sucesso tardio não reabre nem descarta o comentário de outro recibo');
const recoverable = setupReview();
recoverable.context.mutate = async () => { throw new Error('request-failed'); };
await recoverable.perform('approve');
assert.equal(recoverable.buttons[0].disabled, false, 'erro recuperável permite nova tentativa');
console.log('✓ leitura legível, conteúdo escapado, histórico separado e versão enviada no julgamento');

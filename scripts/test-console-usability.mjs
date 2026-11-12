import { identityForKey } from '../console/design/tokens.js';
// Behavioral checks use synthetic DOM objects and execute the actual presentation/app functions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as experience from '../console/experience.js';

const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../console/index.html', import.meta.url), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const formatDate = (value) => value || 'não registrado';
assert.equal(typeof experience.renderActivationStatus, 'function', 'activation copy must distinguish declared vault from evidence');
const declared = experience.renderActivationStatus({ complete: true, reason_code: 'vault-declared' }, { formatDate });
assert.match(declared, /Vault integrado/);
assert.match(declared, /compatibilidade/);
assert.doesNotMatch(declared, /já provou|segunda tarefa reutilizou|Cérebro base ativado/);
const evidenced = experience.renderActivationStatus({ complete: true, reason_code: 't4-complete', receipt_ref: 'synthetic/receipt.json', completed_at: '2026-10-20', run_id: 'synthetic-run' }, { formatDate });
assert.match(evidenced, /segunda tarefa reutilizou/);
assert.match(evidenced, /synthetic\/receipt.json/);
assert.match(experience.renderJourneyCue('canvas', {}), /is-guidance/);
assert.match(experience.renderJourneyCue('today', { counts: { judgments: 2 } }), /is-attention/);

function element() {
  const attributes = new Map();
  return { hidden: true, inert: true, isConnected: true, classList: { add() {}, remove() {} },
    setAttribute(k, v) { attributes.set(k, v); }, getAttribute(k) { return attributes.get(k); },
    closest() { return null; }, focus() { document.activeElement = this; }, contains(target) { return target === this || target === closeButton; }, querySelectorAll() { return [closeButton]; } };
}
const document = { activeElement: null };
const drawer = element(); const backdrop = element(); const background = element(); background.inert = false;
const closeButton = element(); const invoker = element(); document.activeElement = invoker;
const lifecycle = experience.createDrawerController({ drawer, backdrop, background, closeButton, document });
lifecycle.open();
assert.equal(drawer.inert, false); assert.equal(drawer.hidden, false); assert.equal(backdrop.hidden, false);
assert.equal(background.inert, true); assert.equal(document.activeElement, closeButton);
lifecycle.open(); // Moving between details must keep the original invoker.
let tabPrevented = false;
lifecycle.trapFocus({ key: 'Tab', shiftKey: false, preventDefault() { tabPrevented = true; } });
assert.equal(tabPrevented, true); assert.equal(document.activeElement, closeButton);
lifecycle.close();
assert.equal(drawer.inert, true); assert.equal(drawer.hidden, true); assert.equal(backdrop.hidden, true);
assert.equal(background.inert, false); assert.equal(document.activeElement, invoker);

// Exercise the actual app Escape handler and close-button wiring, not only helper calls.
const lifecycleState = {};
const appClose = runInNewContext(`${section('function activeNoteWorkspace(', 'function disposeLibraryView(')}\n${section('function closeDrawer(', 'function experimentPipeline(')}\ncloseDrawer`, { state: lifecycleState, drawerController: lifecycle, document: {body:{classList:{remove(){}}}} });
let keyHandler;
const paletteState = { open: false };
const keyboardStart = app.indexOf("document.addEventListener('keydown', (event) => {");
runInNewContext(app.slice(keyboardStart, app.indexOf('\n});', keyboardStart) + 4), {
  document: { querySelector(){return null;}, addEventListener(type, handler) { keyHandler = handler; } },
  $() { return { open: false }; }, HTMLElement: class {}, drawerController: lifecycle, closeDrawer: appClose, palette: paletteState,
});
lifecycle.open(); keyHandler({ key: 'Escape', target: null });
assert.equal(drawer.inert, true); assert.equal(document.activeElement, invoker);

// A command palette above the drawer owns Tab until it closes.
lifecycle.open();
paletteState.open = true;
const paletteInput = element(); document.activeElement = paletteInput;
let paletteTabPrevented = false;
keyHandler({ key: 'Tab', target: paletteInput, preventDefault() { paletteTabPrevented = true; } });
assert.equal(paletteTabPrevented, false, 'drawer must suspend its trap beneath the palette');
assert.equal(document.activeElement, paletteInput);
paletteState.invoker = closeButton;
const paletteHosts = { '#palette': element(), '#palette-backdrop': element() };
runInNewContext(`${section('function closePalette()', "$('#open-palette').addEventListener")}\nclosePalette()`, {
  palette: paletteState, $: (selector) => paletteHosts[selector], window: { addEventListener() {} }, setModalOpen(name, open) { paletteHosts['#palette'].hidden = !open; },
});
assert.equal(document.activeElement, closeButton);
lifecycle.open(); // Palette may launch another detail while preserving drawer invoker.
lifecycle.close(); assert.equal(document.activeElement, invoker);

const clickHandlers = {};
runInNewContext(section("$('#close-drawer').addEventListener", "$('#refresh').addEventListener"), {
  $: (selector) => ({ addEventListener(type, handler) { clickHandlers[selector] = handler; } }), closeDrawer: appClose,
});
lifecycle.open(); clickHandlers['#close-drawer']();
assert.equal(drawer.hidden, true); assert.equal(document.activeElement, invoker);
lifecycle.open(); clickHandlers['#drawer-backdrop'](); assert.equal(drawer.inert, true);

const hermesState = { hermesTarget: { loaded: true, loading: false, ssh_hosts: ['popcode-server-01'], default_brain_path: '~/cerebro', choice: null, draft: null, saving: false, other: false, helpOpen: false, test: { running: false, host: '', code: null } }, hermesRemote: { data: null, loading: true, error: null }, model: { hermes: { target: { kind: 'local' }, installed: false, project_bound: false, skills_trusted: false, codex_authenticated: false, telegram: {}, gateway: {}, activation: { phase: 'prepare', action: {}, bot: {} } } } };
const renderHermes = runInNewContext(`${section('function renderHermes()', 'async function performHermesAction(')}\nrenderHermes`, {
  state: hermesState, escapeHtml: (v) => String(v), friendlyFailure: experience.friendlyFailure, detailDisclosure: experience.detailDisclosure,
  toolsCheckedAt: (v) => String(v), badge: (code, tone, text) => `<i class="${tone}" data-code="${code}">${text}</i>`, empty: (title, text) => `<p>${title} ${text}</p>`, loadHermesRemote() {},
});
assert.match(renderHermes(), /Etapa atual: preparar e autorizar o agente/);
assert.match(renderHermes(), /Disponível depois de preparar o Hermes e autorizar o agente na etapa 1/);
assert.doesNotMatch(renderHermes(), /id="telegram-token"/);
assert.match(renderHermes(), /<li class="hermes-step is-current" aria-current="step">[\s\S]*>Preparar<[\s\S]*is-locked[\s\S]*>Conectar o bot<[\s\S]*is-locked[\s\S]*>Conversar</);
assert.doesNotMatch(renderHermes(), /data-hermes-action="doctor"/, 'manutenção só aparece com o Hermes instalado');
assert.match(renderHermes(), />Onde o Hermes vai rodar\?</);
assert.match(renderHermes(), /Nesta máquina[\s\S]*Em outra máquina/);
assert.doesNotMatch(renderHermes(), /id="hermes-target-form"/);
hermesState.hermesTarget.choice = 'remote';
assert.match(renderHermes(), /id="hermes-target-form"[\s\S]*<option value="popcode-server-01"/);
assert.match(renderHermes(), /Nome do perfil que o cérebro vai usar na outra máquina\./);
assert.doesNotMatch(renderHermes(), />Preparar o Hermes<|data-activation-action/, 'remoto não salvo não mostra o fluxo local');
assert.match(renderHermes(), /Salve a outra máquina para ver o estado dela\./);
assert.match(renderHermes(), /data-copy-label="Texto copiado\."/);
assert.match(renderHermes(), /Login Remoto/);
assert.match(renderHermes(), /Debian e Ubuntu[\s\S]*Depois ligue o serviço:[\s\S]*data-copy-ref="sudo systemctl enable --now ssh"/);
assert.match(renderHermes(), /data-hermes-target-field="profile" value="cerebro"/);
assert.match(renderHermes(), /<option value="__other__" >Outra máquina \(digitar\)<\/option>/);
assert.doesNotMatch(renderHermes(), /data-hermes-target-field="host"/);
assert.match(renderHermes(), /data-hermes-ssh-test >Testar conexão/);
assert.match(renderHermes(), /<details class="hermes-ssh-help" ><summary>Como preparar a outra máquina<\/summary>/);
assert.match(renderHermes(), /data-copy-ref="ssh-copy-id usuario@endereco-da-maquina"/);
assert.match(renderHermes(), /Ele não guarda senha\./);
assert.match(renderHermes(), /data-hermes-hosts-refresh>Atualizar lista/);
hermesState.hermesTarget.other = true;
assert.match(renderHermes(), /<option value="__other__" selected>[\s\S]*data-hermes-target-field="host" value=""[\s\S]*sem usuario@/);
hermesState.hermesTarget.other = false;
hermesState.hermesTarget.draft = { host: 'macbook-pro', profile: 'cerebro', brain_path: '~/cerebro' };
assert.match(renderHermes(), /<option value="__other__" selected>[\s\S]*data-hermes-target-field="host" value="macbook-pro"/, 'host fora da lista abre o campo de digitar');
hermesState.hermesTarget.test = { running: false, host: 'macbook-pro', code: 'auth-required' };
assert.match(renderHermes(), /data-code="auth-required">A máquina respondeu, mas não aceitou sua chave\. Veja o passo 3 da ajuda\./);
const hermesInputHandlers = {};
let removedResult = 0;
runInNewContext(`${section("document.addEventListener('input', (event) => {\n  const field = event.target.closest('[data-hermes-target-field]');", "document.addEventListener('submit'")}`, {
  state: hermesState, hermesTargetDraft: (saved) => ({ host: '', profile: 'cerebro', brain_path: '~/cerebro', ...(hermesState.hermesTarget.draft || {}) }),
  document: { addEventListener(type, fn) { hermesInputHandlers[type] = fn; }, querySelector: (selector) => (selector === '.hermes-ssh-result' ? { remove() { removedResult += 1; } } : null) },
});
const typeHost = (value) => hermesInputHandlers.input({ target: { closest: () => ({ dataset: { hermesTargetField: 'host' }, value }) } });
hermesState.hermesTarget.test = { running: false, host: 'macbook-pro', code: 'auth-required' };
typeHost('macbook-pro ');
assert.equal(hermesState.hermesTarget.test.code, 'auth-required', 'mesmo host mantém o resultado');
typeHost('macbook-pr');
assert.equal(hermesState.hermesTarget.test.code, null, 'host diferente limpa o resultado do teste');
assert.equal(removedResult, 1);
hermesState.hermesTarget.draft = { host: 'macbook-pro', profile: 'cerebro', brain_path: '~/cerebro' };
hermesState.hermesTarget.test = { running: false, host: 'outro', code: 'ok' };
assert.doesNotMatch(renderHermes(), /Conexão funcionando/, 'resultado de outro host não aparece');
hermesState.hermesTarget.test = { running: false, host: 'macbook-pro', code: 'refused' };
assert.match(renderHermes(), /A máquina recusou a conexão\. Pode ser um bloqueio de segurança dela\. Tente de novo em alguns minutos ou fale com quem administra a máquina\./);
hermesState.hermesTarget.test = { running: true, host: 'macbook-pro', code: null };
assert.match(renderHermes(), /data-hermes-ssh-test disabled>Testando…/);
hermesState.hermesTarget.test = { running: false, host: '', code: null };
hermesState.hermesTarget.draft = null;
hermesState.hermesTarget.choice = null;
const localHermes = hermesState.model.hermes;
hermesState.model.hermes = { target: { kind: 'remote', host: 'popcode-server-01', profile: 'tron', brain_path: '~/second-brain' }, remote: null, activation: localHermes.activation };
const remoteMarkup = renderHermes();
assert.match(remoteMarkup, /Isso pode levar até 30 segundos/);
const remoteTarget = hermesState.model.hermes.target;
for (const [reason, copy] of [
  ['ssh-unreachable', /Não foi possível acessar popcode-server-01 por SSH\./],
  ['ssh-timeout', /Não foi possível acessar popcode-server-01 por SSH\./],
  ['ssh-command-failed', /O SSH conectou, mas a leitura do estado falhou\./],
  ['remote-output-invalid', /O SSH conectou, mas a leitura do estado falhou\./],
]) {
  hermesState.hermesRemote = { data: { target: remoteTarget, reachable: false, checked_at: '2026-10-22T12:00:00.000Z', reason_code: reason }, loading: false, error: null };
  const unreachableMarkup = renderHermes();
  assert.match(unreachableMarkup, copy, reason);
  assert.match(unreachableMarkup, /data-hermes-remote-refresh/, reason);
}
hermesState.hermesRemote = { data: null, loading: true, error: null };
assert.doesNotMatch(remoteMarkup, /<button[^>]*>Preparar o Hermes|data-activation-action|telegram-activation-form/);
hermesState.model.hermes = localHermes;
Object.assign(hermesState.model.hermes, { installed: true, project_bound: true, skills_trusted: true, codex_authenticated: true });
assert.match(renderHermes(), /id="telegram-token"/);
assert.match(renderHermes(), /Etapa atual: conectar o bot/);
assert.match(renderHermes(), /is-done[\s\S]*>Preparar<[\s\S]*is-current[\s\S]*>Conectar o bot</);
assert.match(renderHermes(), /data-hermes-action="doctor"/);
hermesState.model.hermes.activation.phase = 'finalizing';
assert.match(renderHermes(), /Etapa atual: iniciar o gateway/);
assert.doesNotMatch(renderHermes(), /id="telegram-token"/);
Object.assign(hermesState.model.hermes, { telegram: { token_configured: true, allowlist_configured: true, allow_all_disabled: true }, gateway: { installed: true, running: false } });
hermesState.model.hermes.activation = { phase: 'attention', action: { status: 'idle' }, bot: { username: 'cerebro_bot' } };
const stalledMarkup = renderHermes();
assert.match(stalledMarkup, /is-done[\s\S]*>Conectar o bot<[\s\S]*is-current[\s\S]*>Conversar<[\s\S]*O gateway está parado\. Reinicie para conversar\.[\s\S]*data-hermes-action="gateway-restart"/);
assert.doesNotMatch(stalledMarkup, /id="telegram-token"/, 'etapa feita não pede o token de novo');
assert.equal(stalledMarkup.match(/data-hermes-action="gateway-restart"/g).length, 1, 'reinício aparece uma vez, na etapa 3');
assert.match(stalledMarkup, /Etapa atual: iniciar o gateway/);
hermesState.model.hermes.codex_authenticated = false;
assert.match(renderHermes(), /is-current[\s\S]*>Preparar<[\s\S]*is-locked[\s\S]*>Conectar o bot</, 'login expirado não marca a etapa 2 como feita');
hermesState.model.hermes.codex_authenticated = true;
hermesState.model.hermes.gateway.running = true;
hermesState.model.hermes.activation.phase = 'ready';
const readyMarkup = renderHermes();
assert.match(readyMarkup, /is-done[\s\S]*>Conversar<[\s\S]*href="https:\/\/t\.me\/cerebro_bot"/);
assert.doesNotMatch(readyMarkup, /aria-current="step"/);
hermesState.model.hermes.activation = { phase: 'identify-owner', action: { status: 'awaiting-confirmation', kind: 'telegram-owner', id: 'a1' }, bot: { owner_candidate_display: 'Hugo' } };
assert.match(renderHermes(), /is-current[\s\S]*>Conectar o bot<[\s\S]*owner-confirm[\s\S]*owner-reject/);

const hosts = { '#area-switcher': {}, '#mobile-area-switcher': {} };
const state = { operatingAreaFilter: 'long-area', model: { areas: [{ operating_area: 'long-area', name: 'Área com nome completo e comprido', system_refs: ['a'] }] }, canvas: { scope: 'run', ref: 'x', positions: {} } };
const saved = new Map(); let renders = 0;
const areaApi = runInNewContext(`${section('function renderAreaSwitcher(', '// Views irmãs')}\n({renderAreaSwitcher, setOperatingAreaFilter})`, {
  state, identityForKey, $: (selector) => hosts[selector], renderMarkup(target, markup) { target.innerHTML = markup; }, escapeHtml: (v) => String(v), closeDrawer() {}, render() { renders++; },
  localStorage: { setItem(k, v) { saved.set(k, v); } }, inActiveOperatingArea() { return true; }, systemOperatingArea() {},
});
areaApi.renderAreaSwitcher();
assert.match(hosts['#mobile-area-switcher'].innerHTML, /label[^>]*for="mobile-operating-area"/);
assert.match(hosts['#mobile-area-switcher'].innerHTML, /value="long-area" selected>Área com nome completo e comprido/);
areaApi.setOperatingAreaFilter('long-area');
assert.equal(saved.get('cb-operating-area'), 'long-area'); assert.equal(state.canvas.ref, null); assert.equal(renders, 1);

// Dispatch one change event through every registered app change listener.
const changeHandlers = [];
for (const match of app.matchAll(/document\.addEventListener\('change', \(event\) => \{/g)) {
  const end = app.indexOf('\n});', match.index) + 4;
  runInNewContext(section('function activeNoteWorkspace(', 'function disposeLibraryView(') + '\n' + app.slice(match.index, end), {
    document: { addEventListener(type, handler) { changeHandlers.push(handler); } },
    state: { cases: { form: null } }, setOperatingAreaFilter() { renders++; },
  });
}
const beforeChange = renders;
for (const handler of changeHandlers) handler({ target: { id: 'mobile-operating-area', value: 'long-area', closest() { return null; } } });
assert.equal(renders - beforeChange, 1, 'one area change must cause exactly one render/mount');

const canvasMarkup = runInNewContext(`${section('function renderCanvas()', 'function renderJudgments(')}\nrenderCanvas()`, {
  state: { canvas: { scope: 'brain', editable: false }, model: { systems: [] } }, escapeHtml: (v) => String(v),
});
assert.ok(canvasMarkup.indexOf('class="canvas-toolbar"') < canvasMarkup.indexOf('class="canvas-viewport"'), 'toolbar must precede graph viewport in normal flow');
assert.ok(canvasMarkup.indexOf('class="canvas-movement-hint"') > canvasMarkup.indexOf('data-canvas-save'), 'movement hint follows the complete controls row');

const navButtons = ['today', 'systems', 'hermes'].map((view) => ({ closest() { return true; }, dataset: { view }, attributes: new Map(), classList: { toggle() {} }, setAttribute(k,v) {this.attributes.set(k,v);}, removeAttribute(k) {this.attributes.delete(k);} }));
runInNewContext(`${section('function updateNavigation(', 'function render()')}\nupdateNavigation()`, {
  state: { view: 'system' }, document: { querySelectorAll() { return navButtons; } },
});
assert.equal(navButtons[1].attributes.get('aria-current'), 'page'); assert.equal(navButtons[0].attributes.has('aria-current'), false);
assert.match(html, /data-view="hermes"[^>]*aria-label="Telegram"[^>]*><span class="nav-glyph"/);
assert.match(html, /data-view="tools"[^>]*aria-label="Ferramentas"[^>]*data-identity="green"[^>]*><span class="nav-glyph"/);
assert.ok(html.indexOf('data-view="tools"') < html.indexOf('data-view="hermes"'), 'Ferramentas precede Telegram na navegação');
assert.match(html, /id="drawer"[^>]*hidden[^>]*inert/);
console.log('console-usability: ok (declared/T4, journey, area selection, navigation, drawer focus)');

assert.match(app, /hermes: \['Telegram', 'Levar o cérebro para uma conversa privada no Telegram, com o token guardado só na máquina onde o Hermes roda\.'\]/);

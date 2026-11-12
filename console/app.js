import { renderMarkup, disposeMarkup, iconMarkup, hydrateShell, createReactDrawerController, askConfirmation, setModalOpen, readDesignToken, readDesignNumber, identityForKey, renderReviewMarkdown, createDeliveryApplicationController, deliveryApplicationMarkup, routinePreflightMarkup } from './ui.bundle.js';
hydrateShell();
import { detailDisclosure, friendlyFailure, renderActivationStatus, renderJourneyCue } from './experience.js';

let operationalCanvasModulePromise = null;

function loadOperationalCanvas() {
  if (!operationalCanvasModulePromise) {
    operationalCanvasModulePromise = import('/canvas.bundle.js?v=5').catch((error) => {
      operationalCanvasModulePromise = null;
      throw error;
    });
  }
  return operationalCanvasModulePromise;
}

let noteWorkspaceModulePromise = null;
function loadNoteWorkspace() {
  if (!noteWorkspaceModulePromise) noteWorkspaceModulePromise = import('/note-workspace.bundle.js?v=1').catch(error => { noteWorkspaceModulePromise = null; throw error; });
  return noteWorkspaceModulePromise;
}

let libraryWorkspaceModulePromise = null;
function loadLibraryWorkspace() {
  if (!libraryWorkspaceModulePromise) libraryWorkspaceModulePromise = import('/library.bundle.js?v=1').catch(error => { libraryWorkspaceModulePromise = null; throw error; });
  return libraryWorkspaceModulePromise;
}

const state = {
  model: null,
  csrf: '',
  view: 'today',
  initialRouteResolved: false,
  selectedRoutine: null,
  selectedJudgment: null,
  judgmentReview: null,
  judgmentRequest: 0,
  deliveryApplication: null,
  routineDrawerVersion: 0,
  judgmentTab: 'active',
  selectedExperiment: null,
  busy: false,
  operatingAreaFilter: (() => { try { return localStorage.getItem('cb-operating-area') || ''; } catch { return ''; } })(),
  rerunPending: false,
  runs: {
    data: null,
    filters: { system: '', routine: '', mode: '', status: '', decision: '', snapshot: '' },
    sort: { key: 'when', dir: 'desc' },
    cmpA: '', cmpB: '',
  },
  systems: { category: 'all', stage: 'all', query: '', interfaceHealth: {} },
  brain: {
    mode: (() => {
      try {
        const saved = localStorage.getItem('cb-brain-mode');
        return ['overview', 'memory', 'recovery', 'learning', 'architecture', 'updates'].includes(saved) ? saved : 'overview';
      } catch { return 'overview'; }
    })(),
    query: '',
    updates: { data: null, loading: false, checking: false, applying: false, error: null },
  },
  brainGraph: null,
  // Aprendizado lido do vault: decisões por mês, lições por tema, regras promovidas
  // e recall. Fica `null` fora do modo vault e a aba Aprendizado não muda.
  vaultInsights: null,
  skills: { origin: 'company', status: 'all', link: 'all', query: '', data: null, loading: false, error: null },
  // Procedimentos (SOPs) do vault. `available` desliga a view inteira fora do modo
  // vault; `reveal` nasce desligado em cada carregamento, como em knowledge.
  procedures: { data: null, loading: false, loaded: false, error: null, available: false, selected: null, reveal: false },
  vibeMakers: { filter: 'all', query: '', data: null, loading: false, error: null, selected: null },
  tools: { data: null, loading: false, error: null },
  hermesTarget: { loaded: false, loading: false, ssh_hosts: [], default_brain_path: '', choice: null, draft: null, saving: false, other: false, helpOpen: false, test: { running: false, host: '', code: null } },
  hermesRemote: { data: null, loading: false, error: null },
  cases: { list: null, detail: null, form: null, preview: null, actor: '' },
  // Revelar título de nota privada é estado só do cliente: nasce desligado em cada
  // carregamento e nunca é guardado, para a tela poder ser mostrada sem expor nomes.
  knowledge: { reveal: false },
  files: { directory: '', query: '', type: '', offset: 0, limit: 50, data: null, loading: false, loaded: false, error: false, request: 0 },
  areaFiles: { data: null, loading: false, loaded: false, error: false, request: 0, offset: 0, limit: 50 },
  metrics: { data: null, loading: false, loaded: false, error: false, request: 0, system: '', workflow: '' },
  tasks: { data: null, loading: false, loaded: false, error: false, request: 0, pending: new Set(), notice: '', stale: false },
  inbox: { data: null, loading: false, loaded: false, error: false, request: 0, unread: false, offset: 0, limit: 50, mutation: null, mutationError: '' },
  localFileRequest: 0,
  selectedLocalFile: null,
  noteWorkspace: null,
  library: { controller: null, snapshot: null, request: 0, loading: false, area: '' },
  localViewContext: '',
  canvas: {
    scope: 'brain', ref: null, editable: false, controller: null, graph: null, positions: null,
  },
};

const $ = (selector) => document.querySelector(selector);
function resolveDrawerInvoker(invoker) {
  for (const key of ['openLocalFile', 'inboxSource']) {
    const ref = invoker?.dataset?.[key];
    if (ref) return [...document.querySelectorAll(key === 'openLocalFile' ? '[data-open-local-file]' : '[data-inbox-source]')].find((element) => element.dataset[key] === ref) || null;
  }
  return null;
}

const drawerController = createReactDrawerController({
  drawer: $('#drawer'), backdrop: $('#drawer-backdrop'), background: $('.app-shell'),
  closeButton: $('#close-drawer'), document, resolveInvoker: resolveDrawerInvoker,
});
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);
const fmtDate = (value, withTime = true) => value ? new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', ...(withTime ? { timeStyle: 'short' } : {}),
}).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)) : '—';

const sameLocalDay = (value, reference = new Date()) => {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
};
const fmtClock = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(value)) : '—';
const fmtRelative = (value) => {
  if (!value) return '—';
  const diff = Date.parse(value) - Date.now();
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return diff >= 0 ? `em ${minutes} min` : `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff >= 0 ? `em ${hours}h` : `há ${hours}h`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `em ${days}d` : `há ${days}d`;
};

function fmtDuration(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace('.0', '')}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return seconds === 60 ? `${minutes + 1}min` : `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

const labels = {
  'hermes-target-invalid': 'Confira a máquina, o perfil e a pasta.',
  'hermes-target-remote': 'O Hermes está configurado para outra máquina.',
  'hermes-action-running': 'Espere a etapa em andamento terminar.',
  'hermes-remote-failed': 'Não foi possível verificar a outra máquina.',
  'executor-observation-required': 'Verifique a sessão do executor antes de rodar.',
  'executor-observation-stale': 'A conferência da sessão expirou. Verifique novamente.',
  'executor-observation-unavailable': 'Não foi possível registrar a conferência da sessão.',
  'executor-missing': 'O executor não foi encontrado nesta máquina.',
  'executor-authentication-required': 'Entre na conta do executor e verifique novamente.',
  'executor-degraded': 'O executor não respondeu corretamente à conferência.',
  'routine-configuration-changed': 'A configuração mudou. Verifique novamente antes de executar.',
  'collector-script-unavailable': 'O script do coletor não está disponível.',
  'delivery-application-approval-required': 'Aprove a versão atual do relatório para preparar sua aplicação.',
  'delivery-application-approval-stale': 'O relatório mudou desde a aprovação. Leia e avalie a versão atual.',
  'delivery-application-contract-ineligible': 'Esta entrega não está configurada como rascunho para aplicação no diário.',
  'delivery-application-delivery-ineligible': 'O histórico importado permanece somente para consulta.',
  'delivery-application-unavailable': 'A aplicação desta entrega não está disponível.',
  'delivery-application-already-applied': 'Esta entrega já foi aplicada ao diário.',
  'delivery-application-date-invalid': 'Escolha uma data válida para a nota.',
  'delivery-application-actor-invalid': 'Informe uma referência válida de quem confirma.',
  'delivery-application-target-changed': 'A nota foi alterada. Gere outra prévia antes de continuar.',
  'delivery-application-preview-stale': 'A proposta mudou. Gere outra prévia e confira as alterações.',
  'delivery-application-preview-expired': 'A prévia expirou. Gere outra antes de aplicar.',
  'delivery-application-preview-required': 'Confira uma prévia antes de aplicar.',
  'delivery-application-markers-invalid': 'A nota contém marcações de IA ambíguas. A aplicação foi bloqueada para preservar o conteúdo.',
  'delivery-application-content-private': 'A proposta contém conteúdo marcado como privado e não pode ser aplicada aqui.',
  'delivery-application-content-secret': 'A proposta pode conter um segredo. A aplicação foi bloqueada.',
  'delivery-application-target-busy': 'Outra aplicação está usando esta entrega ou nota. Tente novamente ao terminar.',
  'delivery-application-recovery-required': 'Recupere a operação interrompida antes de continuar.',
  'delivery-application-recovery-conflict': 'O conteúdo não coincide com as versões salvas. A nota foi preservada.',
  'delivery-application-symlink-blocked': 'O destino usa um link simbólico. A aplicação foi bloqueada.',
  'delivery-application-identity-changed': 'O arquivo mudou durante a conferência. Tente novamente.',
  'delivery-application-diff-too-large': 'A proposta é grande demais para aplicação por esta tela.',

  active: 'Ativa',
  'ready-manual-run': 'Pronta para execução manual',
  'destination-is-directory': 'Destino aponta para uma pasta',
  'destination-parent-not-directory': 'Pasta de destino inválida',
  'destination-symlink-not-allowed': 'Destino com link simbólico bloqueado',
  'destination-not-regular-file': 'Destino precisa ser um arquivo',
  'destination-not-private': 'Destino sem proteção de privacidade',
  'destination-private-manifest-missing': 'Manifesto de privacidade ausente',
  'destination-path-invalid': 'Caminho de destino inválido',
  'destination-check-failed': 'Não foi possível conferir o destino',
  'ready-to-activate': 'Pronta para ativar',
  'external-schedule': 'Roda fora do Console',
  'legacy-schedule-not-paused': 'Agenda antiga não pausada',
  'routine-paused': 'Pausada',
  'routine-not-approved': 'Aguardando aprovação',
  'routine-migration-cancelled': 'Migração cancelada',
  'executor-missing': 'Executor ausente',
  'executor-authentication-required': 'Login necessário',
  'executor-degraded': 'Executor degradado',
  'awaiting-legacy-pause': 'Aguardando pausa da agenda antiga',
  'ready-for-activation': 'Agenda antiga pausada',
  'cutover-completed': 'Migração concluída',
  'future-only': 'Revogação vale para o futuro',
  'receipt-only': 'Revogação apenas auditável',
  'irreversible-export': 'Cópia não revogável',
  manual: 'Manual', schedule: 'Agenda', read: 'Leitura',
  completed: 'Concluída', failed: 'Falhou', denied: 'Negada', skipped: 'Pulada',
  'runtime-enforced': 'Bloqueio pelo runtime',
  'receipt-audited': 'Auditado por recibo', exported: 'Cópia exportada', unknown: 'Não verificado',
  imported: 'Histórico importado',
  'judgment-reviewed-hash-required': 'Reabra a entrega para conferir a versão antes de julgar.',
  'judgment-reviewed-version-stale': 'A entrega mudou. Reabra e leia a nova versão antes de julgar.',
  'judgment-evidence-changed': 'A nota mudou desde a importação. A versão original não pode ser aprovada.',
  'judgment-evidence-unavailable': 'O conteúdo original não está disponível para revisão.',
  pending: 'Pendente', decided: 'Julgado', approved: 'Aprovado',
  'changes-requested': 'Pedir ajuste', changes_requested: 'Pedir ajuste', rejected: 'Rejeitado',
  started: 'Iniciada',
  'propose-action': 'Intenção de ação', none: 'Sem ação', unavailable: 'Indisponível',
  candidate: 'Candidato', baseline: 'Baseline',
  'not-eligible': 'Ainda não elegível',
  recorded: 'Contexto selecionado',
  'context-not-recorded': 'Contexto não registrado',
  declared: 'Declarado', running: 'Em execução', gap: 'Lacuna',
  'evaluation-passed': 'Gates passaram', 'evaluation-gate-failed': 'Gate falhou',
  reconstructed: 'Reconstruído',
  queued: 'Na fila', 'ready-for-read': 'Pronto para leitura', decided: 'Decidido', cancelled: 'Cancelado', blocked: 'Bloqueado',
  contract: 'Contrato', execution: 'Execução', measurement: 'Medição', decision: 'Martelo', learning: 'Aprendizado',
  'not-started': 'Não iniciado', collecting: 'Coletando', ready: 'Pronto', complete: 'Completo',
  'not-executed': 'Não executado', linked: 'Ligado', unlinked: 'Não ligado', 'not-applicable': 'Não se aplica',
  source: 'Fonte', area: 'Área', system: 'Sistema', routine: 'Rotina',
  collector: 'Coleta', retrieval: 'Contexto', skill: 'Skill', capability: 'Capability',
  stage: 'Etapa', artifact: 'Artefato', output: 'Output', gate: 'Gate', judgment: 'Julgamento',
  run: 'Execução', handoff: 'Handoff', model: 'Modelo', connector: 'Conector',
  replay: 'Replay', live: 'Ao vivo',
  'requested-not-verified': 'Solicitado, não verificado', 'provider-reported': 'Reportado pelo provider', verified: 'Verificado',
  met: 'Atendido', partial: 'Parcial', missing: 'Ausente', installed: 'Instalado', degraded: 'Degradado',
  available: 'Alinhada', 'motor-only': 'Só no motor', company: 'Da empresa', engine: 'Do motor',
  'authentication-required': 'Login necessário', 'read-only': 'Somente leitura', 'workspace-write': 'Escrita no workspace',
  'codex-cli': 'Codex CLI', 'claude-code': 'Claude Code',
  new: 'Começando do zero', 'organized-context': 'Contexto organizado',
  'human-capture': 'Captura humana',
  'partial-brain': 'Cérebro parcial', 'cerebro-compatible': 'Compatível com o protocolo',
  foundation: 'Fundação', contracted: 'Contratado', operational: 'Operacional',
  valid: 'Válido', invalid: 'Inválido', unassigned: 'Ainda não atribuído', assigned: 'Atribuído',
  'run-ledger-invalid': 'Ledger de runs ilegível', 'routine-receipt-invalid': 'Recibo de rotina ilegível',
  // Decision Case — o vocabulário do martelo humano na fonte canônica.
  applied: 'Registrado', 'rolled-back': 'Revertido', 'already-applied': 'Já registrado',
  'already-rolled-back': 'Já revertido', 'nothing-to-roll-back': 'Nada a reverter',
  decided: 'Decidido', dropped: 'Descartado', deferred: 'Adiado',
  'preview-required': 'Simule antes de registrar',
  'preview-stale': 'A simulação não vale mais — simule de novo',
  'preview-expired': 'Simulação vencida — simule de novo',
  'preview-in-future': 'Simulação com data no futuro',
  'rollback-conflict': 'A nota mudou depois do martelo — reversão bloqueada',
  'evidence-required': 'Escolha a evidência', 'evidence-not-found': 'Evidência não abre no disco',
  'evidence-beyond-queue-required': 'Precisa de evidência além do item da fila',
  'evidence-note-outside-moat': 'Nota fora do núcleo privado não vira evidência',
  'human-authorship-required': 'O martelo exige autoria humana',
  'decision-text-too-short': 'Texto da decisão curto demais',
  'decision-text-contains-pii': 'Texto com dado pessoal — o vault não aceita',
  'decision-text-looks-like-secret': 'Texto parece conter segredo',
  'title-invalid': 'Título fora do tamanho permitido',
  'review-on-invalid': 'Adiar exige data de revisão',
  'review-on-not-future': 'A data de revisão precisa ser no futuro',
  'canonical-target-exists': 'Já existe nota com esse nome hoje',
  'canonical-target-missing': 'A nota registrada não está mais no lugar',
  'decision-case-already-applied': 'Este caso já tem martelo',
  'decision-case-not-found': 'Item saiu da fila — caso não existe mais',
  'decision-notes-missing': 'A casa canônica das decisões não existe',
  'wrong-verdict': 'Veredito errado', 'wrong-evidence': 'Evidência errada',
  duplicate: 'Duplicado', superseded: 'Superado', mistake: 'Registro por engano',
};

function label(value) {
  return labels[value] || String(value || '—').replaceAll('-', ' ');
}

function tone(reason) {
  if (['active', 'completed', 'ready-manual-run', 'ready-to-activate', 'external-schedule', 'approved', 'decided'].includes(reason)) return 'good';
  if (['legacy-schedule-not-paused', 'routine-paused', 'executor-authentication-required', 'pending', 'changes-requested', 'gap', 'ready-for-read', 'unlinked'].includes(reason)) return 'warn';
  if (['declared', 'running', 'skipped', 'queued', 'collecting', 'not-started'].includes(reason)) return 'neutral';
  return 'bad';
}

function badge(value, customTone = tone(value), customLabel = label(value)) {
  return `<span class="badge ${customTone}"><i></i>${escapeHtml(customLabel)}</span>`;
}

function toast(message, kind = 'good') {
  const element = $('#toast');
  element.className = `toast visible ${kind}`;
  element.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.className = 'toast'; }, readDesignNumber('--duration-toast'));
}

async function getJson(path) {
  const response = await fetch(path, { credentials: 'same-origin' });
  const value = await response.json();
  if (!response.ok) throw new Error(value.reason_code || 'request-failed');
  return value;
}

async function mutate(path, payload, method = 'POST') {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Cerebro-CSRF': state.csrf },
    body: JSON.stringify({ ...payload, confirm: true }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.reason_code || 'request-failed');
  return value;
}

function summaryCards() {
  const model = state.model;
  if (state.view === 'compatibility') {
    const diagnostic = model.compatibility;
    return [
      ['Compatibilidade', `${diagnostic.score.percent}%`, `${diagnostic.score.met}/${diagnostic.score.applicable} checks atendidos`, 'compatibility'],
      ['Fontes governadas', diagnostic.inventory.sources.valid, 'Contrato válido; presença não significa conexão', 'sources'],
      ['Sistemas declarados', diagnostic.inventory.systems.valid, `${diagnostic.inventory.systems.retrieval_v2} com recuperação V2`, 'systems'],
      ['Runs com contexto', diagnostic.inventory.runs.context_snapshot_v2, `${diagnostic.inventory.runs.valid} execuções observadas`, 'runs'],
    ].map(summaryCard).join('');
  }
  const active = model.today.active.length;
  const ready = model.today.ready_to_work.length;
  const judgments = model.counts.judgments;
  const queueCount = state.decisions?.available ? state.decisions.open_count : null;
  return [
    ...(queueCount !== null ? [['Fila de decisão', queueCount, 'Decisões do cérebro esperando seu martelo hoje', 'judgments', true]] : []),
    ['Rotinas ativas', active, 'Rodam apenas quando o estado canônico está ativo', 'routines'],
    ['Aguardam julgamento', judgments, 'Outputs privados de rotina para julgar', 'judgments', true],
    ['Prontas para trabalhar', ready, 'Replay manual não liga o agendamento', 'play'],
    ['Recibos privados', model.routines.reduce((total, routine) => total + routine.receipts.length, 0), 'Prompt e output não aparecem no ledger', 'runs'],
  ].map(summaryCard).join('');
}

function vaultSummaryCards(vault) {
  return [
    ['Projetos ativos', vault.projects.active, 'status Active no frontmatter', 'projects'],
    ['Parados', vault.projects.stale_total, `sem update há ${vault.projects.stale_days}+ dias`, 'stale', true],
    ['Áreas', vault.areas.length, 'notas type Area', 'areas'],
    ['Inbox', vault.inbox?.count ?? 0, 'capturas esperando triagem', 'inbox', true],
  ].map(summaryCard).join('');
}

// Identity describes the kind of information; attention still requires real work.
function summaryCard([title, value, description, kind, actionable]) {
  const visuals = {
    projects: ['systems', 'indigo'], stale: ['clock', 'orange'], areas: ['areas', 'blue'], inbox: ['inbox', 'teal'],
    compatibility: ['compatibility', 'teal'], sources: ['sources', 'teal'], systems: ['systems', 'violet'],
    runs: ['runs', 'violet'], judgments: ['judgments', 'orange'], routines: ['routines', 'green'], play: ['play', 'blue'],
  };
  const [glyph, identity] = visuals[kind] || ['runs', 'indigo'];
  return `<article class="summary-card${actionable && Number(value) > 0 ? ' is-actionable' : ''}" data-identity="${identity}" data-empty="${Number(value) === 0}"><small><span class="summary-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-${glyph}"/></svg></span>${title}</small><strong>${value}</strong><p>${description}</p></article>`;
}

function routineTodayChip(routine) {
  if (routine.trigger !== 'schedule') return '<span class="run-chip neutral">Sob demanda</span>';
  const today = routine.receipts.filter((receipt) => sameLocalDay(receipt.started_at || receipt.completed_at));
  if (!today.length) {
    return routine.state.status === 'active'
      ? '<span class="run-chip warn">Ainda não rodou hoje</span>'
      : '<span class="run-chip neutral">Agenda parada</span>';
  }
  const failed = today.filter((receipt) => receipt.status !== 'completed').length;
  const times = today.length > 1 ? ` · ${today.length}x` : '';
  if (failed === today.length) return `<span class="run-chip bad">Hoje: só falha${times}</span>`;
  if (failed) return `<span class="run-chip warn">Rodou hoje${times} · ${failed} falha(s)</span>`;
  return `<span class="run-chip good">Rodou hoje ${fmtClock(today[0].completed_at || today[0].started_at)}${times}</span>`;
}

function routineCard(routine) {
  const access = routine.access.length ? routine.access.map((item) => badge(item.assurance, item.assurance === 'runtime-enforced' ? 'good' : 'neutral')).join('') : '<span class="muted">Sem grants declarados</span>';
  const last = routine.receipts[0] || null;
  const next = routine.next_scheduled_at
    ? `${fmtRelative(routine.next_scheduled_at)} · ${fmtDate(routine.next_scheduled_at)}`
    : routine.state.status === 'disabled' ? 'Relógio desligado' : 'Sem próxima ocorrência';
  const origin = routine.product_kind === 'brain-native' ? 'Rotina do Cérebro' : 'Rotina de Sistema';
  return `<article class="routine-card" data-routine-kind="${escapeHtml(routine.product_kind)}" data-open-routine="${escapeHtml(routine.routine_id)}" role="button" tabindex="0">
    <div class="routine-card-head"><div class="routine-symbol">↻</div><div><p class="micro">${escapeHtml(origin)} · ${escapeHtml(routine.system_ref)}</p><h3>${escapeHtml(routine.name)}</h3></div>${badge(routine.health_reason_code)}</div>
    <div class="run-chips">${routineTodayChip(routine)}${last ? `<span class="run-chip ${tone(last.status)}">Último: ${escapeHtml(label(last.status))} ${escapeHtml(fmtRelative(last.completed_at || last.started_at))}</span>` : '<span class="run-chip neutral">Nunca executou</span>'}</div>
    <div class="routine-meta"><span><b>Cadência</b>${escapeHtml(routine.schedule)}</span><span><b>Próxima</b>${escapeHtml(next)}</span></div>
    <div class="routine-meta"><span><b>Executor</b>${escapeHtml(routine.binding.adapter)} · ${escapeHtml(routine.binding.requested_model)}</span></div>
    <div class="assurance-row">${access}</div>
    <div class="card-footer"><button type="button" class="table-action" data-runs-for-routine="${escapeHtml(routine.routine_id)}">${routine.receipts.length} execução(ões) →</button><button data-open-routine="${escapeHtml(routine.routine_id)}">Inspecionar <b>→</b></button></div>
  </article>`;
}

function empty(title, body) {
  return `<div class="empty"><div class="empty-mark">◇</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
}

function renderActivation() {
  const activation = state.model.activation;
  const update = state.model.communication?.latest || null;
  const current = activation.steps.find((step) => step.id === activation.current_step) || activation.steps[0];
  const started = activation.status === 'in-progress';
  const progress = Math.round((activation.completed_steps / activation.total_steps) * 100);
  return `<div class="first-mission">
    <section class="first-mission-hero">
      <div class="first-mission-copy">
        <h2>${started ? escapeHtml(current.name) : 'Ative seu Cérebro com um trabalho que já precisa acontecer.'}</h2>
        <p class="micro">PRIMEIRA MISSÃO · ${started ? 'EM ANDAMENTO' : 'COMECE POR AQUI'}</p>
        <p>${started ? escapeHtml(current.description) : 'Você não precisa organizar a empresa inteira nem conectar ferramentas. Traga um trabalho real e uma pequena amostra da realidade; o resto nasce do uso.'}</p>
        <div class="first-mission-actions">
          <button type="button" class="first-mission-primary" data-copy-ref="${escapeHtml(activation.command)}">Copiar ${escapeHtml(activation.command)}</button>
          <button type="button" class="first-mission-secondary" data-view="anatomy">Conhecer a arquitetura</button>
        </div>
        <small>Cole o comando na conversa com seu agente. Abrir este cockpit não chama modelo, conecta Fonte nem envia conteúdo.</small>
      </div>
      <div class="first-mission-promise" aria-label="O que esta missão prova">
        <span class="first-mission-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <p class="micro">O que vai ficar pronto</p>
        <strong>Um resultado que você usaria.</strong>
        <p>Depois, o mesmo contexto volta para uma segunda tarefa sem você precisar explicar tudo outra vez.</p>
        <div><span>Cérebro</span><i>prepara contexto</i><span>Sistema</span><i>produz resultado</i></div>
      </div>
    </section>

    ${update ? `<section class="first-mission-update">
      <div><p class="micro">Novidade do motor · ${fmtDate(update.published_at, false)}</p><h3>${escapeHtml(update.title)}</h3><p>${escapeHtml(update.summary)}</p></div>
      <button type="button" data-open-brain-updates>Ver atualizações →</button>
    </section>` : ''}

    <section class="first-mission-source">
      <div><p class="micro">E se eu não tiver Fonte conectada?</p><h3>Nenhuma integração é necessária para começar.</h3><p>A fonte-semente é só o menor pedaço de realidade capaz de sustentar o primeiro trabalho.</p></div>
      <ul>${activation.seed_options.map((option) => `<li><i></i>${escapeHtml(option)}</li>`).join('')}</ul>
    </section>

    <section class="first-mission-progress">
      <header><div><p class="micro">Ativação por uso</p><h3>${activation.completed_steps} de ${activation.total_steps} passos observados</h3></div><span>${progress}%</span></header>
      <progress max="100" value="${progress}">${progress}%</progress>
      <ol>${activation.steps.map((step, index) => {
        const stepState = step.completed_at ? 'complete' : step.id === activation.current_step ? 'current' : 'pending';
        return `<li class="${stepState}"><span>${step.completed_at ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(step.name)}</strong><p>${escapeHtml(step.description)}</p>${step.completed_at ? `<small>observado em ${fmtDate(step.completed_at)}</small>` : ''}</div></li>`;
      }).join('')}</ol>
    </section>
  </div>`;
}

const compatibilityReasons = {
  'canonical-manifest-valid': 'A instalação declara protocolo, referências e capacidades sem duplicar o inventário.',
  'canonical-manifest-missing': 'Ainda não existe um Brain Manifest V1 canônico.',
  'legacy-marker-only': 'O Console reconhece o legado, mas ele ainda não declara o Manifest V1.',
  'layout-compatible': 'Os caminhos canônicos são relativos, seguros e suficientes para o read model.',
  'layout-incompatible': 'O layout está ausente, incompleto ou contém uma referência incompatível.',
  'local-privacy-declared': 'Dados permanecem locais e recibos são reference-only.',
  'legacy-privacy-boundary': 'A fronteira existe no legado, mas ainda não está formalizada no Manifest V1.',
  'privacy-profile-missing': 'A instalação ainda não declara sua fronteira de dados.',
  'company-map-present': 'Existe uma referência canônica para o mapa da empresa.',
  'organized-context-without-canonical-map': 'Existe estrutura útil, mas ela ainda não está costurada a um mapa canônico.',
  'company-context-missing': 'Ainda não há mapa nem estrutura de contexto reconhecível.',
  'source-contracts-valid': 'Fontes possuem casa de verdade, autoridade e política declaradas.',
  'source-contracts-missing': 'Nenhuma Fonte possui contrato válido ainda.',
  'system-contracts-valid': 'Existem resultados executáveis declarados por contrato.',
  'system-contracts-missing': 'Nenhum Sistema foi contratado ainda.',
  'retrieval-v2-complete': 'Todos os Sistemas declaram seleção, frescor, conflito e fallback.',
  'retrieval-v2-partial': 'Somente parte dos Sistemas usa o Retrieval Contract V2.',
  'retrieval-v2-missing': 'Ainda não existe recuperação de contexto V2 declarada.',
  'run-records-valid': 'Existe execução observada com Run Record válido.',
  'run-records-missing': 'Ainda não existe execução observada.',
  'context-snapshots-complete': 'Todos os Runs observados registram o contexto exato usado.',
  'context-snapshots-partial': 'Somente parte dos Runs registra Context Snapshot V2.',
  'context-snapshots-missing': 'Ainda não existe recibo exato do contexto usado.',
};

function compatibilityReason(value) {
  return compatibilityReasons[value] || label(value);
}

function diagnosticList(items, emptyText, { limit = 8, raw = false } = {}) {
  const visible = items.slice(0, limit);
  return items.length
    ? `<ul>${visible.map((item) => `<li>${escapeHtml(raw ? item : compatibilityReason(item))}</li>`).join('')}${items.length > limit ? `<li class="more-items">+ ${items.length - limit} item(ns) preservado(s)</li>` : ''}</ul>`
    : `<p class="muted">${escapeHtml(emptyText)}</p>`;
}

function evidenceMarkup(refs) {
  const visible = refs.slice(0, 2);
  return `${visible.map((ref) => `<code>${escapeHtml(ref)}</code>`).join('')}${refs.length > 2 ? `<span>+ ${refs.length - 2} evidências</span>` : ''}` || '<span>sem evidência técnica</span>';
}

function readinessReason(value) {
  if (value === 'system-not-active:configured') return 'Configurado; falta evidência para ativar';
  if (value === 'system-not-active:mapped') return 'Mapeado; contrato ainda não configurado';
  if (value === 'retrieval-not-declared') return 'Recuperação de contexto ainda não declarada';
  if (value.startsWith('source-role-unbound:')) return `Papel de Fonte sem vínculo: ${value.split(':').at(-1)}`;
  if (value.startsWith('source-contract-missing:')) return `Contrato de Fonte ausente: ${value.split(':').at(-1)}`;
  return label(value);
}

function renderCompatibility() {
  const diagnostic = state.model.compatibility;
  const readiness = diagnostic.system_readiness;
  const checks = diagnostic.checks.map((item) => `<article class="compat-check ${escapeHtml(item.status)}">
    <div>${badge(item.status, item.status === 'met' ? 'good' : item.status === 'partial' ? 'warn' : 'bad')}<code>${escapeHtml(item.id)}</code></div>
    <h3>${escapeHtml(item.label)}</h3>
    <p>${escapeHtml(compatibilityReason(item.reason_code))}</p>
    <div class="compat-evidence">${evidenceMarkup(item.evidence_refs)}</div>
  </article>`).join('');
  const ready = readiness.ready.map((item) => `<li><code>${escapeHtml(item.system_id)}</code><span>pode receber Run pelo protocolo atual</span></li>`).join('');
  const blocked = readiness.blocked.map((item) => `<li><code>${escapeHtml(item.system_id)}</code><span>${item.blockers.map((reason) => escapeHtml(readinessReason(reason))).join(' · ')}</span></li>`).join('');
  const profile = diagnostic.manifest.profile ? `${diagnostic.manifest.profile} · Manifest V${diagnostic.manifest.version}` : 'manifesto canônico ausente';
  return `<div class="compat-page">
    <section class="compat-hero">
      <div class="compat-score"><strong>${diagnostic.score.percent}</strong><span>% compatível</span></div>
      <div><p class="eyebrow">Compatibility doctor · Read-only</p><h2>${escapeHtml(label(diagnostic.target.classification))}</h2><p>Estágio ${escapeHtml(label(diagnostic.target.activation_stage))} · ${escapeHtml(profile)}</p><progress max="${diagnostic.score.applicable}" value="${diagnostic.score.met}">${diagnostic.score.percent}%</progress></div>
      <div class="compat-guarantee"><span>${iconMarkup('check')}Não abriu conteúdo</span><span>${iconMarkup('check')}Não conectou Fonte</span><span>${iconMarkup('check')}Não migrou nada</span></div>
    </section>
    <div class="section-heading"><div><p class="eyebrow">9 Contratos de compatibilidade</p><h2>O que existe de verdade</h2></div><p>Presença técnica é declaração. Só Run e recibo válido contam como observado.</p></div>
    <div class="compat-grid">${checks}</div>
    <div class="compat-lower-grid">
      <section class="compat-panel"><div class="section-heading"><div><p class="eyebrow">System readiness</p><h2>Sistemas instalados</h2></div></div><div class="readiness-group"><h3>Prontos pelo protocolo</h3><ul>${ready || '<li><span>Nenhum Sistema pronto ainda.</span></li>'}</ul></div><div class="readiness-group blocked"><h3>Bloqueados honestamente</h3><ul>${blocked || '<li><span>Nenhum bloqueio protocolar.</span></li>'}</ul></div></section>
      <section class="compat-panel"><div class="section-heading"><div><p class="eyebrow">Plano sem destruição</p><h2>Preservar, adaptar e adicionar</h2></div></div><div class="migration-plan"><article><span>Preservar</span>${diagnosticList(diagnostic.recommendations.preserve, 'Nenhuma evidência canônica ainda.', { limit: 6, raw: true })}</article><article><span>Adaptar</span>${diagnosticList(diagnostic.recommendations.adapt, 'Nada precisa ser adaptado.')}</article><article><span>Adicionar</span>${diagnosticList(diagnostic.recommendations.add, 'Fundação protocolar completa.')}</article><article class="do-not-touch"><span>Não tocar</span>${diagnosticList(diagnostic.recommendations.do_not_touch, '')}</article></div></section>
    </div>
    <div class="boundary-note compat-boundary"><b>Diagnóstico não é migração</b>O próximo passo continua sendo preview → diff → confirmação. Este readback não criou outro cérebro, não moveu Fontes e não alterou nenhum contrato.</div>
  </div>`;
}

function judgmentCard(item) {
  const current = item.judgment;
  const status = item.imported && current.status === 'pending' ? 'imported' : current.status === 'pending' ? 'pending' : current.verdict || current.status;
  const action = current.action_intent === 'propose-action' ? badge('propose-action', 'neutral') : '';
  const correction = item.correction ? badge(item.correction.role, 'neutral') : '';
  const learning = item.correction?.learning_candidate
    ? `Aprendizado ${item.correction.learning_candidate.occurrences}/${item.correction.learning_candidate.promotion_threshold}`
    : '';
  return `<article class="judgment-card" data-open-judgment="${escapeHtml(item.receipt_id)}">
    <div class="judgment-head"><div><p class="micro">${escapeHtml(item.system_ref)} · ${escapeHtml(item.trigger)}</p><h3>${escapeHtml(item.routine_name)}</h3></div><div class="judgment-badges">${badge(status, status === 'imported' ? 'neutral' : tone(status))}${action}${correction}${item.context_status === 'recorded' ? badge('recorded', 'good') : ''}</div></div>
    <p>${item.imported ? 'Registro histórico de' : 'Entrega concluída em'} ${fmtDate(item.completed_at)}. ${item.imported ? 'Consulte a nota e confira a versão importada.' : 'Leia o conteúdo antes de avaliar.'}</p>
    <div class="judgment-meta"><code>${escapeHtml(item.receipt_ref)}</code><span>${learning || `${current.history_count || 0} julgamento(s)`}</span></div>
    <button data-open-judgment="${escapeHtml(item.receipt_id)}">${item.imported ? 'Consultar nota' : 'Revisar entrega'} <b>→</b></button>
  </article>`;
}

function judgmentList(items) {
  return `<div class="judgment-list">${items.map(judgmentCard).join('')}</div>`;
}

function renderRoutines() {
  const routines = visibleRoutines();
  const native = routines.filter((routine) => routine.product_kind === 'brain-native');
  const system = routines.filter((routine) => routine.product_kind !== 'brain-native');
  const group = (title, description, items) => items.length ? `<section class="routine-origin-group"><div class="routine-origin-head"><div><p class="micro">${escapeHtml(title)}</p><p>${escapeHtml(description)}</p></div><b>${items.length}</b></div><div class="routine-list">${items.map(routineCard).join('')}</div></section>` : '';
  return `<div class="section-heading"><div><p class="eyebrow">Control plane</p><h2>Todas as rotinas</h2></div><p>Abrir e inspecionar nunca executa modelos. O relógio só liga após replay e aprovação.</p></div>
    ${routines.length ? `${group('Nativas do Cérebro', 'Mantêm contexto, saúde, recuperação e aprendizado.', native)}${group('Dos Sistemas', 'Transformam contexto em resultados de negócio.', system)}` : empty('Nenhuma rotina nesta área', 'Crie um Routine Contract para o primeiro trabalho recorrente.')}`;
}

/* Workspace do Sistema — trabalho fora; confiança e operação dentro do Cockpit. */

const WS_TABS = [
  ['overview', 'Sobre'], ['how', 'Como funciona'], ['runs', 'Execuções'],
  ['experiments', 'Experimentos'], ['learning', 'Aprendizado'], ['config', 'Configuração'],
];

function openWorkspace(ref, tab = 'overview') {
  closeDrawer();
  state.view = 'system';
  state.workspace = {
    ref,
    tab,
    howMode: state.workspace?.ref === ref ? state.workspace.howMode || 'declared' : 'declared',
    data: state.workspace?.ref === ref ? state.workspace.data : null,
  };
  render();
  if (!state.workspace.data) void loadWorkspace(ref);
}

async function loadWorkspace(ref) {
  try {
    const data = await getJson(`/api/systems/${encodeURIComponent(ref)}/workspace`);
    if (state.view === 'system' && state.workspace?.ref === ref) { state.workspace.data = data; render(); }
  } catch (error) { toast(label(error.message), 'bad'); }
}

function wsRunSelector(record) {
  return `run-record:${record.run_id}`;
}

// Matriz dos sete componentes: estado do manifest + evidência real + porta.
function wsMatrix(ws) {
  const statuses = ws.system.component_statuses || {};
  const evalsTotal = ws.records.filter((record) => record.eval?.passed !== undefined && record.eval?.passed !== null).length;
  const evalsPassed = ws.records.filter((record) => record.eval?.passed === true).length;
  const receiptsTotal = ws.routines.reduce((total, routine) => total + routine.receipts, 0);
  const outcomes = ws.records.filter((record) => (record.outcomes || []).length).length;
  const rows = [
    ['pipeline', 'Pipeline', `${ws.contract.pipeline.length} etapa(s) declaradas`, ws.contract.pipeline.length > 0, 'how'],
    ['routines', 'Rotinas', `${ws.routines.length} rotina(s) · ${receiptsTotal} recibo(s)`, receiptsTotal > 0, 'config'],
    ['skills', 'Skills', ws.contract.capability ? `capability ${ws.contract.capability.capability_id} v${ws.contract.capability.version}` : 'nenhuma declarada', false, 'how'],
    ['interfaces', 'Interfaces', ws.system.runtime_binding
      ? `${ws.system.runtime_binding.binding_id} · ${label(ws.system.runtime_binding.status)}`
      : ws.system.interface_expected ? 'interface esperada · binding ausente' : 'sem interface própria', Boolean(ws.system.runtime_binding), 'overview'],
    ['gates', 'Gates', ws.contract.eval ? `${(ws.contract.eval.deterministic_gates || []).length} determinístico(s) · ${(ws.contract.eval.human_questions || []).length} pergunta(s) humanas` : 'não declarados', ws.judgments.length > 0, 'how'],
    ['evals', 'Evals', evalsTotal ? `${evalsPassed}/${evalsTotal} passaram em execuções reais` : 'nenhum eval observado', evalsTotal > 0, 'runs'],
    ['learning', 'Aprendizado', outcomes ? `${outcomes} run(s) com outcomes` : 'nenhum outcome registrado', outcomes > 0, 'learning'],
  ];
  return `<div class="ws-matrix">${rows.map(([key, name, evidence, observed, tab]) => {
    const declared = statuses[key] || 'ausente';
    const hollow = ['ativo', 'repetivel', 'instrumentado'].includes(declared) && !observed;
    return `<button type="button" class="ws-dim" data-ws-tab="${tab}">
      <span class="ws-dim-name">${escapeHtml(name)}</span>
      ${badge(declared, ['ativo', 'repetivel', 'instrumentado'].includes(declared) ? 'good' : declared === 'parcial' ? 'warn' : 'neutral')}
      <small>${escapeHtml(evidence)} ${observed ? prov('observado') : prov('declarado')}</small>
      ${hollow ? '<small class="gap-mark">estado declarado sem observação</small>' : ''}
      <b>→</b>
    </button>`;
  }).join('')}</div>`;
}

function wsMetricGroup(kind, title, rows) {
  return `<section class="ws-metric-group" data-metric-kind="${kind}"><p class="micro">${escapeHtml(title)}</p>
    ${rows.map(([name, value, proof = 'observado']) => `<div><span>${escapeHtml(name)}</span><b>${escapeHtml(String(value))}</b>${prov(proof)}</div>`).join('')}
  </section>`;
}

function wsMetrics(ws) {
  const failed = ws.records.filter((record) => record.status === 'failed').length;
  const snapshots = ws.records.filter((record) => record.context_snapshot).length;
  const gaps = ws.records.reduce((total, record) => total + (record.context_snapshot?.gaps || []).length, 0);
  const conflicts = ws.records.reduce((total, record) => total + (record.context_snapshot?.conflicts || []).length, 0);
  const pending = ws.judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length;
  const approved = ws.judgments.filter((item) => item.judgment.verdict === 'approved').length;
  const corrections = ws.records.filter((record) => record.correction_ref).length;
  const outcomes = ws.records.filter((record) => (record.outcomes || []).length).length;
  const lastRun = ws.records[0];
  return `<div class="ws-metrics" aria-label="Métricas separadas do Sistema">
    ${wsMetricGroup('operation', 'Operação', [
      ['Runs registrados', ws.records.length],
      ['Falhas observadas', failed],
      ['Última execução', lastRun ? fmtDate(lastRun.completed_at, false) : 'nunca'],
    ])}
    ${wsMetricGroup('context', 'Contexto', [
      ['Snapshots', snapshots],
      ['Lacunas', gaps],
      ['Conflitos', conflicts],
    ])}
    ${wsMetricGroup('trust', 'Confiança', [
      ['Pendentes', pending],
      ['Aprovados', approved],
      ['Correções', corrections],
    ])}
    ${wsMetricGroup('value', 'Valor', [
      ['Runs com outcome', outcomes],
      ['Benchmark', 'não calculado', 'declarado'],
      ['Repetição provada', outcomes > 1 ? `${outcomes} outcomes` : 'sem prova'],
    ])}
  </div>`;
}

function wsOverview(ws) {
  const result = ws.contract.result || {};
  const lastRun = ws.records[0];
  return `<div class="ws-stack">
    <section class="organ system-about"><header class="organ-head"><div><p class="micro">Sobre o Sistema</p><h3>Para que este sistema existe</h3></div></header>
      <p class="organ-answer">${escapeHtml(ws.system.result)} ${prov('declarado')}</p>
      <dl class="ws-dl">
        <div><dt>Dono</dt><dd>${escapeHtml(result.owner || '—')}</dd></div>
        <div><dt>Gate humano</dt><dd>${escapeHtml(result.human_gate || ws.system.human_gate || '—')}</dd></div>
        <div><dt>Pronto quando</dt><dd>${escapeHtml(result.definition_of_done || '—')}</dd></div>
        <div><dt>Não é sucesso</dt><dd>${escapeHtml(result.non_success || '—')}</dd></div>
        <div><dt>Estágio</dt><dd>${escapeHtml(label(ws.system.migration_stage))} · ${escapeHtml(ws.system.human_maturity || '—')} · v${escapeHtml(ws.system.version)}</dd></div>
        <div><dt>Última execução</dt><dd>${lastRun ? `${fmtDate(lastRun.completed_at)} ${prov('observado')}` : 'nenhuma no ledger'}</dd></div>
      </dl>
      ${ws.system.next_gate ? `<div class="organ-gaps"><span>Próximo gate: ${escapeHtml(ws.system.next_gate)}</span></div>` : ''}
    </section>
    <details class="ws-technical-summary"><summary><span><b>Saúde dos sete componentes</b><small>Pipeline, rotinas, Skills, interfaces, gates, evals e aprendizado</small></span><i>Ver estado →</i></summary><section class="organ"><header class="organ-head"><div><h3>Os sete componentes</h3><p>estado declarado × evidência observada</p></div></header>${wsMatrix(ws)}</section></details>
    <section class="ws-evidence"><div class="section-heading"><div><p class="eyebrow">Evidência operacional</p><h2>O que já aconteceu de verdade</h2></div><p>Runs, contexto, julgamento e valor permanecem separados da promessa publicada.</p></div>${wsMetrics(ws)}</section>
  </div>`;
}

// O SOP que o Sistema declara: o contrato aponta o procedimento pelo slug e a tela só
// desenha o fluxo quando /api/procedures tem essa nota com passo legível. Procedimento
// não declarado, não encontrado ou privado e escondido devolve null — e o Sistema
// mantém o fluxo declarado de seis etapas.
function wsLinkedProcedure(ws, model) {
  const ref = ws?.contract?.procedure_ref;
  if (!ref) return null;
  const found = (model?.procedures || []).find((item) => item.slug === ref);
  return found && found.flows.length ? found : null;
}

// Mesmos componentes da tela Procedimentos (classes `sop-*`): o processo é um só, visto
// de dois lugares. Nada de estilo inline, que a CSP do Console bloqueia.
function wsProcedureOrgan(procedure) {
  const meta = [
    procedure.path ? `<code>${escapeHtml(procedure.path)}</code>` : '',
    procedure.status ? badge(procedure.status, 'neutral', procedure.status) : '',
    procedure.updated ? `<span class="sop-updated">atualizado em ${escapeHtml(fmtDate(procedure.updated, false))}</span>` : '',
  ].filter(Boolean).join('');
  return `<section class="organ ws-sop-organ"><header class="organ-head">
      <div><h3>Procedimento ligado · ${escapeHtml(procedure.title)}</h3>
      <p>O SOP que a nota do Sistema declara, lido do vault: ${procedure.flow_count} fluxo(s) e ${procedure.step_count} passo(s), com papel e ramo de decisão.</p></div>
      <button class="action" type="button" data-open-procedure="${escapeHtml(procedure.id)}">Abrir em Procedimentos →</button>
    </header>
    ${meta ? `<div class="sop-head-meta ws-sop-meta">${meta}</div>` : ''}
    ${procedure.flows.map(procedureFlow).join('')}
    ${procedure.done.length
      ? `<section class="sop-done"><p class="micro">Critério de pronto</p><ul>${procedure.done.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
      : ''}
  </section>`;
}

function wsProcessFlow(stages) {
  return `<div class="ws-canvas-flow" role="list">${stages.map((stage, index) => `<div class="ws-flow-step" role="listitem" data-flow-kind="${escapeHtml(stage.kind)}">
    <p class="micro">${escapeHtml(stage.label)}</p><b>${escapeHtml(stage.value)}</b><small>${escapeHtml(stage.detail)}</small>
  </div>${index < stages.length - 1 ? '<span class="ws-flow-arrow" aria-hidden="true">→</span>' : ''}`).join('')}</div>`;
}

function wsHowDeclared(ws) {
  const retrieval = ws.contract.retrieval;
  const capability = ws.contract.capability;
  const evalContract = ws.contract.eval;
  const result = ws.contract.result || {};
  const sourceNames = ws.sources.map((source) => source.name);
  const stages = [
    { kind: 'source', label: 'Fontes', value: `${ws.sources.length} declaradas`, detail: sourceNames.join(' · ') || 'nenhuma declarada' },
    { kind: 'retrieval', label: 'Recuperação', value: retrieval ? `contrato v${retrieval.version}` : 'não declarada', detail: retrieval ? `${(retrieval.source_roles || []).length} papéis de contexto` : 'sem política recuperável' },
    { kind: 'system', label: 'Pipeline', value: `${ws.contract.pipeline.length} etapas`, detail: ws.contract.pipeline.map((step) => step.name || step.step_id || step.state).filter(Boolean).join(' → ') || 'nenhuma etapa' },
    { kind: 'system', label: 'Capability', value: capability ? capability.capability_id : 'não declarada', detail: capability ? `v${capability.version}` : 'sem contrato de capacidade' },
    { kind: 'gate', label: 'Gates', value: evalContract ? `${(evalContract.deterministic_gates || []).length + (evalContract.human_questions || []).length} declarados` : 'não declarados', detail: result.definition_of_done || 'definição de pronto ausente' },
    { kind: 'judgment', label: 'Julgamento', value: result.human_gate || ws.system.human_gate || 'não declarado', detail: 'o Sistema não julga a própria resposta' },
  ];
  const linked = wsLinkedProcedure(ws, state.procedures.data);
  const flow = linked
    ? wsProcedureOrgan(linked)
    : `<section class="organ ws-canvas-organ"><header class="organ-head"><div><h3>Fluxo declarado</h3><p>System Contract e contratos associados — nenhuma execução inferida.</p></div></header>${wsProcessFlow(stages)}</section>`;
  return `<div class="ws-stack">
    ${flow}
    <section class="organ"><header class="organ-head"><div><h3>Política de recuperação ${retrieval ? `v${escapeHtml(retrieval.version)}` : ''}</h3><p>o backend de contexto que o Sistema pode consumir</p></div></header>
      ${retrieval ? `<div class="table-wrap organ-table"><table><thead><tr><th>Papel</th><th>Seleção</th><th>Filtros</th><th>Janela</th><th>Frescor exigido</th><th>Se indisponível</th></tr></thead><tbody>${(retrieval.source_roles || []).map((role) => `<tr><td><b>${role.priority}</b> ${escapeHtml(role.role)}</td><td>${escapeHtml(role.selection || '—')}</td><td>${(role.filters || []).map((filter) => `<code>${escapeHtml(filter)}</code>`).join(' ')}</td><td>${escapeHtml(role.window || '—')}</td><td>${escapeHtml(role.required_freshness || '—')}</td><td>${escapeHtml(role.on_unavailable || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="gap-mark">Recuperação não declarada.</p>'}
    </section>
  </div>`;
}

function wsHowInstalled(ws) {
  const retrieval = ws.contract.retrieval;
  const sourceRows = ws.sources.map((source) => `<tr>
    <td><button type="button" class="table-action" data-open-source="${escapeHtml(source.source_id)}">${escapeHtml(source.name)}</button><small>${escapeHtml(source.role)}</small></td>
    <td>${source.contract_status ? badge(source.contract_status, source.contract_status === 'active' ? 'good' : 'neutral') : '<span class="muted">—</span>'}</td>
    <td>${source.binding_ref ? `<code>${escapeHtml(source.binding_ref)}</code>${source.has_credential ? ' 🔑' : ''}` : '<span class="gap-mark">sem binding</span>'}</td>
    <td>${source.last_access ? `${escapeHtml(label(source.last_access.decision))} · ${fmtDate(source.last_access.occurred_at, false)}` : '<span class="gap-mark">nunca</span>'}</td>
    <td>${source.freshness_observed ? fmtDate(source.freshness_observed, false) : '<span class="gap-mark">não observado</span>'}</td>
  </tr>`).join('');
  const retrievalRows = (retrieval?.source_roles || []).map((role) => `<tr>
    <td><b>${role.priority}</b> ${escapeHtml(role.role)}</td><td>${escapeHtml(role.selection || '—')}</td>
    <td>${(role.filters || []).map((filter) => `<code>${escapeHtml(filter)}</code>`).join(' ')}</td>
    <td>${escapeHtml(role.window || '—')}</td><td>${escapeHtml(role.required_freshness || '—')}</td>
    <td>${escapeHtml(role.on_unavailable || '—')}</td>
  </tr>`).join('');
  return `<div class="ws-stack">
    <section class="organ"><header class="organ-head"><div><h3>Fontes deste sistema</h3><p>contrato × binding × acesso × frescor</p></div></header>
      <div class="table-wrap organ-table"><table><thead><tr><th>Fonte · papel</th><th>Contrato</th><th>Binding</th><th>Último acesso</th><th>Frescor</th></tr></thead><tbody>${sourceRows}</tbody></table></div></section>
    <section class="organ"><header class="organ-head"><div><h3>Política de recuperação ${retrieval ? `v${escapeHtml(retrieval.version)}` : ''}</h3><p>a atenção declarada — não um "sim"</p></div></header>
      ${retrieval ? `<div class="table-wrap organ-table"><table><thead><tr><th>Papel</th><th>Seleção</th><th>Filtros</th><th>Janela</th><th>Frescor exigido</th><th>Se indisponível</th></tr></thead><tbody>${retrievalRows}</tbody></table></div>` : '<p class="muted">Recuperação não declarada.</p>'}</section>
    <section class="organ"><header class="organ-head"><div><h3>Pipeline · ${ws.contract.pipeline.length} etapas</h3></div></header>
      <ul class="organ-list">${ws.contract.pipeline.map((step, index) => `<li><span>${index + 1}</span>${escapeHtml(step.name || step.step_id || step.state || JSON.stringify(step).slice(0, 60))}</li>`).join('')}</ul>
      ${ws.contract.eval ? `<p class="muted">Gates determinísticos: ${(ws.contract.eval.deterministic_gates || []).map((gate) => `<code>${escapeHtml(gate)}</code>`).join(' ')}</p>` : ''}</section>
  </div>`;
}

function wsHowItWorks(ws) {
  const mode = state.workspace?.howMode || 'declared';
  const body = mode === 'installed' ? wsHowInstalled(ws) : wsHowDeclared(ws);
  return `<div class="ws-stack">
    <div class="ws-canvas-head">
      <div><p class="eyebrow">Como o Sistema funciona</p><p class="section-help">Arquitetura declarada e instalação observada. Runs e julgamentos vivem em Execuções.</p></div>
      <div class="ws-canvas-actions">
        <div class="ws-mode-switch" role="group" aria-label="Leitura de como o Sistema funciona">
          <button type="button" data-ws-how-mode="declared" class="${mode === 'declared' ? 'active' : ''}">Declarado</button>
          <button type="button" data-ws-how-mode="installed" class="${mode === 'installed' ? 'active' : ''}">Instalado</button>
        </div>
        <button class="action" type="button" data-open-system-canvas="${escapeHtml(ws.system.system_id)}">Abrir no Mapa Operacional →</button>
      </div>
    </div>
    ${body}
  </div>`;
}

function wsJudgmentForRun(ws, record) {
  return ws.judgments.find((item) => item.run_id === record.run_id) || null;
}

function wsRunJudgment(ws, record) {
  const item = wsJudgmentForRun(ws, record);
  if (!item) {
    const decision = record.human_decision || 'sem recibo';
    const origin = record.human_decision ? 'estado no Run Record · sem Judgment Receipt' : 'nenhum Judgment Receipt ligado';
    return `<div class="ws-run-judgment">${badge(decision)}<small>${origin}</small></div>`;
  }
  if (item.imported) return `<div class="ws-run-judgment">${badge('imported', 'neutral', 'Histórico importado')}<button class="table-action" data-open-judgment="${escapeHtml(item.receipt_id)}">Consultar nota →</button></div>`;
  const current = item.judgment || {};
  const stateLabel = current.verdict || current.status || 'indisponível';
  const tone = current.verdict === 'approved' ? 'good' : current.verdict === 'rejected' ? 'bad' : current.status === 'pending' ? 'warn' : 'neutral';
  return `<div class="ws-run-judgment">${badge(stateLabel, tone)}<button class="table-action" data-open-judgment="${escapeHtml(item.receipt_id)}">${current.status === 'pending' ? 'Julgar' : 'Ver recibo'} →</button></div>`;
}

function wsRuns(ws) {
  const pending = ws.judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length;
  const authority = `<div class="boundary-note ws-run-authority"><div><b>Uma fila constitucional</b>Execuções projeta o estado do julgamento em cada Run. O martelo e o recibo continuam na Caixa de Julgamento global.</div><button class="action" data-view="judgments">Abrir fila${pending ? ` · ${pending} pendente${pending === 1 ? '' : 's'}` : ''} →</button></div>`;
  if (!ws.records.length) return `<div class="ws-stack">${authority}${empty('Nenhuma execução no ledger', 'O primeiro run registrado aparece aqui com contexto, eval e comparação.')}</div>`;
  const rows = ws.records.map((record) => `<tr>
    <td><strong>${fmtDate(record.completed_at)}</strong><small>${escapeHtml(record.run_id.slice(0, 24))}…</small></td>
    <td>${escapeHtml(label(record.mode || '—'))}</td><td>${badge(record.status)}</td>
    <td>${record.context_snapshot?.accesses?.length ? `${record.context_snapshot.accesses.length} fontes${(record.context_snapshot.gaps || []).length ? ` · <span class="gap-mark">${record.context_snapshot.gaps.length} lacunas</span>` : ''}` : '<span class="muted">sem snapshot</span>'}</td>
    <td>${record.eval?.passed === true ? badge('evaluation-passed', 'good') : record.eval?.passed === false ? badge('evaluation-gate-failed', 'bad') : '<span class="muted">—</span>'}</td>
    <td>${wsRunJudgment(ws, record)}</td>
    <td><button class="table-action" data-canvas-jump-run="${escapeHtml(wsRunSelector(record))}">trace →</button></td>
  </tr>`).join('');
  const options = ws.records.map((record, index) => `<option value="${index}">${fmtDate(record.completed_at)} · ${escapeHtml(label(record.mode || 'run'))}</option>`);
  const compare = ws.records.length >= 2 ? `<section class="organ"><header class="organ-head"><div><h3>O que mudou entre duas runs</h3></div></header>
    <div class="ws-compare-pick"><label>A <select id="ws-cmp-a">${options.map((option, index) => index === 1 ? option.replace('<option', '<option selected') : option).join('')}</select></label>
    <label>B <select id="ws-cmp-b">${options.map((option, index) => index === 0 ? option.replace('<option', '<option selected') : option).join('')}</select></label></div>
    <div id="ws-compare">${wsCompareTable(ws, 1, 0)}</div></section>` : '<p class="section-help">Comparação disponível a partir de duas execuções.</p>';
  return `<div class="ws-stack">${authority}<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Modo</th><th>Status</th><th>Contexto</th><th>Eval</th><th>Julgamento</th><th>Trace</th></tr></thead><tbody>${rows}</tbody></table></div>${compare}</div>`;
}

function wsCompareTable(ws, indexA, indexB) {
  return runCompareTable(ws.records[indexA], ws.records[indexB]);
}

// Compara dois Run Records integrais do MESMO sistema — a base da aba Execuções
// e do workspace. Sistemas diferentes não entram aqui: não são comparáveis.
function runCompareTable(a, b) {
  if (!a || !b) return '';
  const sourcesOf = (record) => (record.context_snapshot?.accesses || []).map((access) => access.source_ref?.id).filter(Boolean).join(', ') || '—';
  const freshOf = (record) => (record.context_snapshot?.accesses || []).map((access) => access.freshness_marker).filter(Boolean).join(' · ') || '—';
  const rows = [
    ['Contrato', `v${a.system_version}`, `v${b.system_version}`],
    ['Recuperação', `v${a.context_snapshot?.retrieval_version || '—'}`, `v${b.context_snapshot?.retrieval_version || '—'}`],
    ['Modo', label(a.mode || '—'), label(b.mode || '—')],
    ['Fontes acessadas', sourcesOf(a), sourcesOf(b)],
    ['Frescor', freshOf(a), freshOf(b)],
    ['Lacunas/conflitos', `${(a.context_snapshot?.gaps || []).length}/${(a.context_snapshot?.conflicts || []).length}`, `${(b.context_snapshot?.gaps || []).length}/${(b.context_snapshot?.conflicts || []).length}`],
    ['Eval', a.eval?.passed === true ? 'passou' : a.eval?.passed === false ? 'falhou' : '—', b.eval?.passed === true ? 'passou' : b.eval?.passed === false ? 'falhou' : '—'],
    ['Decisão humana', label(a.human_decision), label(b.human_decision)],
    ['Outcomes', String((a.outcomes || []).length), String((b.outcomes || []).length)],
    ['Outputs', (a.output_refs || []).join(' · ') || '—', (b.output_refs || []).join(' · ') || '—'],
  ];
  return `<div class="table-wrap"><table><thead><tr><th></th><th>A · ${fmtDate(a.completed_at)}</th><th>B · ${fmtDate(b.completed_at)}</th></tr></thead><tbody>${rows.map(([name, left, right]) => `<tr${left !== right ? ' class="ws-diff"' : ''}><td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(String(left))}</td><td>${escapeHtml(String(right))}</td></tr>`).join('')}</tbody></table></div>`;
}

function wsExperiments(ws) {
  if (!ws.experiments.length) return empty('Nenhum experimento deste sistema', 'Experimentos aparecem quando o contrato aponta este sistema como palco ou leitura.');
  return `<div class="experiment-grid">${ws.experiments.map((experiment) => `<article class="experiment-card" data-open-experiment="${escapeHtml(experiment.experiment_id)}" role="button" tabindex="0">
    <div class="experiment-card-head"><div><p class="micro">${escapeHtml(experiment.experiment_id)}</p><h3>${escapeHtml(experiment.name)}</h3></div>${badge(experiment.status, experiment.status === 'decided' ? 'good' : experiment.status === 'running' ? 'neutral' : 'warn')}</div>
    ${experimentProgress(experiment)}
  </article>`).join('')}</div>`;
}

function wsLearning(ws) {
  const learning = ws.contract.learning || {};
  const outcomes = ws.records.filter((record) => (record.outcomes || []).length);
  const corrected = ws.records.filter((record) => record.correction_ref);
  const replays = ws.records.filter((record) => record.mode === 'replay').length;
  const stages = [
    ['Candidatos', 'não projetado', false, `política: ${learning.correction_policy || '—'} · limiar ${learning.promotion_threshold ?? '—'} casos`],
    ['Correções', corrected.length, corrected.length > 0, 'correções humanas ligadas a Runs deste Sistema'],
    ['Replays', replays, replays > 0, 'reexecuções comparáveis observadas'],
    ['Melhoria provada', 'sem prova', false, 'exige replay melhor que o baseline e novo martelo'],
  ];
  return `<div class="ws-stack">
    <section class="organ"><header class="organ-head"><div><h3>O funil de aprendizado deste sistema</h3><p>candidato → aprovado → replay → provado</p></div></header>
      <div class="ws-learning">${stages.map(([name, value, observed, help]) => `<div class="ws-stage${observed ? ' has' : ''}"><b>${escapeHtml(String(value))}</b><span>${escapeHtml(name)}</span><small>${escapeHtml(help)}</small></div>`).join('')}</div>
      <p class="organ-answer">${outcomes.length ? `<b>${outcomes.length}</b> run(s) com outcomes registrados ${prov('observado')} — matéria-prima do próximo candidato.` : `Nenhum outcome registrado ainda ${prov('observado')}.`}</p>
    </section>
  </div>`;
}

function wsConfig(ws) {
  const interfaceUrl = safeSystemInterfaceUrl(ws.system.interface_ref);
  const experience = ws.system.experience;
  return `<div class="ws-stack">
    ${ws.routines.length ? ws.routines.map((routine) => `<section class="organ"><header class="organ-head"><div><h3>${escapeHtml(routine.name)}</h3><p>declarado × observado</p></div></header>
      <dl class="ws-dl">
        <div><dt>Agenda declarada</dt><dd>${escapeHtml(routine.schedule)} ${prov('declarado')}</dd></div>
        <div><dt>Estado observado</dt><dd>${escapeHtml(label(routine.health))} ${prov('observado')}</dd></div>
        <div><dt>Executor</dt><dd>${escapeHtml(routine.binding.adapter)} · ${escapeHtml(routine.binding.requested_model)} · auth ${escapeHtml(routine.binding.auth_status)} </dd></div>
        <div><dt>Recibos</dt><dd>${routine.receipts} ${prov('observado')}</dd></div>
        <div><dt>Grants</dt><dd>${routine.access.map((access) => `<code>${escapeHtml(access.source_ref)}</code>`).join(' ') || '—'}</dd></div>
      </dl>
      <button class="action" data-open-routine="${escapeHtml(routine.routine_id)}">Abrir rotina →</button></section>`).join('') : empty('Nenhuma rotina instalada', 'Este sistema ainda roda fora do protocolo de Rotinas — a execução não deixa recibo automático.')}
    <section class="organ"><header class="organ-head"><div><h3>Versões e interface</h3></div></header>
      <dl class="ws-dl">
        <div><dt>Contrato</dt><dd><code>${escapeHtml(ws.system.contract_id)}</code> v${escapeHtml(ws.system.version)}</dd></div>
        <div><dt>Recuperação</dt><dd>v${escapeHtml(ws.contract.retrieval?.version || '—')}</dd></div>
        <div><dt>Eval</dt><dd>v${escapeHtml(ws.contract.eval?.version || '—')}</dd></div>
        <div><dt>Interface</dt><dd>${interfaceUrl ? `<a class="copy-ref" href="${escapeHtml(interfaceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(interfaceUrl)} ${iconMarkup('external-link')}</a>` : 'nenhuma interface segura declarada'}</dd></div>
        <div><dt>Experience Manifest</dt><dd>${experience ? `<button type="button" class="copy-ref" data-copy-ref="${escapeHtml(experience.manifest_ref)}">${escapeHtml(experience.experience_id)} ${iconMarkup('copy')}</button> · v${experience.protocol_version} ${prov('declarado')}` : `não publicado ${prov('declarado')}`}</dd></div>
        <div><dt>Publisher</dt><dd>${experience ? `${escapeHtml(experience.publisher.display_name)} · ${escapeHtml(publisherKindLabel(experience.publisher.kind))}` : '—'}</dd></div>
        <div><dt>Superfície publicada</dt><dd>${experience ? `<code>${escapeHtml(experience.primary_surface.role)}</code> · ${escapeHtml(experience.primary_surface.launch_label)}` : '—'}</dd></div>
        <div><dt>Runtime Binding</dt><dd>${ws.system.runtime_binding ? `<code>${escapeHtml(ws.system.runtime_binding.binding_id)}</code> · ${escapeHtml(label(ws.system.runtime_binding.status))} ${prov('observado')}` : `${ws.system.interface_expected ? 'não instalado' : 'não exigido'} ${prov('observado')}`}</dd></div>
        <div><dt>Manifest do Sistema</dt><dd>${ws.system.source_manifest_ref ? `<button type="button" class="copy-ref" data-copy-ref="${escapeHtml(ws.system.source_manifest_ref)}">copiar caminho ${iconMarkup('copy')}</button>` : '—'}</dd></div>
      </dl></section>
  </div>`;
}

function renderSystemWorkspace() {
  const workspace = state.workspace;
  if (!workspace) return empty('Nenhum sistema aberto', 'Abra um sistema pela lista ou pelo Canvas.');
  const ws = workspace.data;
  if (!ws) return '<div class="loading"><i></i><span>Abrindo o workspace do sistema…</span></div>';
  const tabs = {
    overview: wsOverview,
    how: wsHowItWorks,
    runs: wsRuns,
    experiments: wsExperiments,
    learning: wsLearning,
    config: wsConfig,
  };
  return `<div class="ws">
    <div class="ws-top">
      <button class="action" data-view="systems">← Sistemas</button>
      ${systemIdentity(ws.system, 'is-workspace')}
      <span class="ws-experience"><b>${escapeHtml(ws.system.experience?.presentation?.tagline || ws.system.name)}</b><small>${ws.system.experience ? `Publicado por ${escapeHtml(ws.system.experience.publisher.display_name)}` : 'Identidade constitucional'}</small></span>
      ${badge(ws.system.migration_stage, ws.system.migration_stage === 'active' ? 'good' : 'neutral')}
      <span class="system-kind-mark" aria-hidden="true">● Sistema</span>
      <span class="muted">${escapeHtml(operatingAreaName(ws.system.operating_area))} · ${escapeHtml(businessFunctionName(ws.system.business_function))} · v${escapeHtml(ws.system.version)} · ${ws.records.length} execuções · ${ws.judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length} para julgar</span>
      <span class="canvas-spacer"></span>
      ${systemLaunchAction(ws.system)}
    </div>
    <div class="tabstrip" role="tablist">${WS_TABS.map(([id, name]) => `<button role="tab" data-ws-tab="${id}" class="${workspace.tab === id ? 'active' : ''}">${name}${id === 'runs' && ws.judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length ? `<b>${ws.judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length}</b>` : ''}</button>`).join('')}</div>
    ${(tabs[workspace.tab] || wsOverview)(ws)}
  </div>`;
}

/* Anatomia do Cérebro — seis módulos + governança transversal.
   Cada dado carimba a proveniência: DECLARADO (contrato/documento),
   OBSERVADO (recibo/ledger) ou INFERIDO (derivação explícita). */

function prov(kind) {
  return `<span class="prov prov--${kind}">${kind.toUpperCase()}</span>`;
}

function shortBrainLabel(value, max = 30) {
  const text_ = String(value || '—');
  return text_.length > max ? `${text_.slice(0, max - 1).trim()}…` : text_;
}

function brainPreviewLayout(graph) {
  const positions = new Map();
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const byKind = (kind) => nodes.filter((node) => node.kind === kind);
  const areas = byKind('area');
  const areaRank = new Map(areas.map((node, index) => [node.id, index]));
  const parentArea = new Map(edges.filter((edge) => edge.relation === 'contains').map((edge) => [edge.target, edge.source]));
  const systems = byKind('system').sort((left, right) => {
    const areaDiff = (areaRank.get(parentArea.get(left.id)) ?? 999) - (areaRank.get(parentArea.get(right.id)) ?? 999);
    return areaDiff || left.label.localeCompare(right.label, 'pt-BR');
  });
  const distribute = (items, x, top = 32, bottom = 448) => items.forEach((node, index) => {
    const y = items.length < 2 ? (top + bottom) / 2 : top + ((bottom - top) * index) / (items.length - 1);
    positions.set(node.id, { x, y });
  });

  distribute(systems, 420);
  areas.forEach((area, index) => {
    const children = systems.map((node) => ({ node, position: positions.get(node.id) }))
      .filter(({ node }) => parentArea.get(node.id) === area.id);
    const y = children.length
      ? children.reduce((sum, item) => sum + item.position.y, 0) / children.length
      : 48 + (index * 360) / Math.max(1, areas.length - 1);
    positions.set(area.id, { x: 95, y });
  });
  distribute(byKind('handoff'), 575, 70, 410);
  distribute(byKind('routine'), 630, 70, 410);
  distribute(byKind('source'), 835);
  distribute(nodes.filter((node) => !positions.has(node.id)), 650, 70, 410);
  return positions;
}

function renderBrainGraphPreview(graph) {
  if (!graph) {
    return `<section class="brain-map-panel"><div class="brain-section-head"><div><h2>Como tudo se conecta</h2></div></div><div class="brain-map-loading"><i></i><span>Preparando a visão leve do grafo…</span></div></section>`;
  }
  const positions = brainPreviewLayout(graph);
  const nodes = (graph.nodes || []).filter((node) => positions.has(node.id));
  const edges = (graph.edges || []).filter((edge) => positions.has(edge.source) && positions.has(edge.target));
  const counts = nodes.reduce((result, node) => ({ ...result, [node.kind]: (result[node.kind] || 0) + 1 }), {});
  const edgeMarkup = edges.map((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    return `<line class="brain-map-edge${edge.actual ? ' is-actual' : ''}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"><title>${escapeHtml(label(edge.relation))}</title></line>`;
  }).join('');
  const nodeMarkup = nodes.map((node) => {
    const position = positions.get(node.id);
    const areaLabel = node.label;
    const showLabel = ['area', 'system', 'source'].includes(node.kind);
    return `<g class="brain-preview-node brain-preview-node--${escapeHtml(node.kind)}${node.actual ? ' is-actual' : ''}" transform="translate(${position.x} ${position.y})">
      <title>${escapeHtml(areaLabel)} · ${escapeHtml(label(node.kind))} · ${escapeHtml(label(node.state))}</title>
      <circle r="${node.kind === 'area' ? 7 : node.kind === 'system' ? 5 : 3.5}"></circle>
      ${showLabel ? `<text x="${node.kind === 'area' ? 13 : 9}" y="4">${escapeHtml(shortBrainLabel(areaLabel, node.kind === 'source' ? 24 : 29))}</text>` : ''}
    </g>`;
  }).join('');
  return `<section class="brain-map-panel">
    <div class="brain-section-head"><div><h2>Como tudo se conecta</h2><p>Áreas organizam. Sistemas trabalham. Fontes continuam sendo as casas de verdade.</p></div><button class="action" type="button" data-open-brain-map>Explorar o mapa →</button></div>
    <div class="brain-map-frame">
      <svg class="brain-map-preview" viewBox="0 0 1000 480" role="img" aria-label="${escapeHtml(graph.subtitle || 'Mapa do Cérebro')}">
        <g class="brain-map-edges">${edgeMarkup}</g>
        <g class="brain-map-nodes">${nodeMarkup}</g>
      </svg>
    </div>
    <div class="brain-map-foot"><span><i class="area"></i>${counts.area || 0} áreas</span><span><i class="system"></i>${counts.system || 0} Sistemas</span><span><i class="source"></i>${counts.source || 0} Fontes</span><small>Visão derivada do mesmo contrato usado pelo Canvas.</small></div>
  </section>`;
}

function brainFlowStep(number, name, value, description, state_ = 'declared') {
  return `<li class="brain-flow-step"><span>${String(number).padStart(2, '0')}</span><div><p>${escapeHtml(name)}</p><b>${escapeHtml(value)}</b><small>${escapeHtml(description)}</small></div><i class="${escapeHtml(state_)}"></i></li>`;
}

function renderBrainModeSwitch(anatomy = {}) {
  const tabs = [
    ['overview', 'Visão geral'],
    ['memory', 'Memória'],
    ['recovery', 'Recuperação'],
    ['learning', 'Aprendizado'],
    ['architecture', 'Arquitetura'],
    ['updates', 'Atualizações'],
  ];
  const installation = anatomy.update_center?.installation || {};
  const profile = installation.profile === 'legacy-compatible' ? 'Privado compatível'
    : installation.update_management === 'managed-release' ? 'Canal gerenciado' : 'Instalação local';
  return `<div class="brain-mode-bar"><div class="brain-mode-switch" role="tablist" aria-label="Áreas do Cérebro">
    ${tabs.map(([id, name]) => `<button type="button" role="tab" data-brain-mode="${id}" class="${state.brain.mode === id ? 'active' : ''}" aria-selected="${state.brain.mode === id}">${name}</button>`).join('')}
  </div><button type="button" class="brain-version-chip${state.brain.mode === 'updates' ? ' active' : ''}" data-brain-mode="updates"><span>${escapeHtml(profile)}</span><b>v${escapeHtml(installation.version || '—')}</b></button>
  </div>`;
}

function brainSearchKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function brainCount(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

// Contagem que pode faltar: célula ilegível da tabela do vault chega nula e não pode
// virar 0 medido na tela.
function brainMeasure(value) {
  return value === null || value === undefined ? 'não medido' : brainCount(value);
}

function brainHouseRow(entry) {
  const changed = entry.last_changed ? `mudou ${fmtDate(entry.last_changed, false)}` : 'sem mudança observada';
  const unit = entry.count === 1 ? entry.unit?.[0] || 'item' : entry.unit?.[1] || 'itens';
  return `<li class="company-map-object">
    <div><strong>${escapeHtml(entry.name)}</strong><span>${brainCount(entry.count)} ${escapeHtml(unit)} · ${escapeHtml(changed)}${entry.sealed ? ' · agregado protegido' : ''}</span></div>
    ${entry.view ? `<button type="button" data-view="${escapeHtml(entry.view)}" aria-label="Abrir ${escapeHtml(entry.name)}">${iconMarkup('external-link')}</button>` : ''}
  </li>`;
}

function retrievalStatusLabel(value) {
  return ({ healthy: 'Operacional', active: 'Ativo', unknown: 'Sem diagnóstico', unavailable: 'Indisponível' })[value] || label(value);
}

function renderRetrievalHealth(health) {
  const quality = health?.quality || { measured: false, percent: null };
  const index = health?.index || {};
  const operation = health?.operation || { decisions: {} };
  const snapshots = health?.snapshots || {};
  const provider = health?.provider || {};
  const measured = quality.measured && Number.isFinite(quality.percent);
  const qualityText = measured
    ? `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(quality.percent)}%`
    : 'Não medido';
  const accepted = operation.decisions?.accepted || 0;
  const abstained = operation.decisions?.insufficient_evidence || 0;
  const unavailable = operation.decisions?.retrieval_unavailable || 0;
  const providerLabel = provider.name || provider.provider_id || 'Provider não declarado';
  const implementation = provider.implementation
    ? `${provider.implementation}${provider.implementation_version ? ` ${provider.implementation_version}` : ''}`
    : 'não observada';
  const gate = quality.gate_passed === true ? 'gate aprovado' : quality.gate_passed === false ? 'gate reprovado' : 'gate não observado';
  const scoreAttrs = measured ? `role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${quality.percent}"` : '';

  return `<section class="brain-retrieval-health${measured ? '' : ' is-unmeasured'}" aria-labelledby="retrieval-health-title">
    <div class="retrieval-quality-score" ${scoreAttrs}>
      <div class="retrieval-quality-head"><p class="micro">Saúde do contexto</p><span class="retrieval-live-state"><i class="${operation.current_status === 'healthy' ? 'observed' : ''}"></i>${escapeHtml(retrievalStatusLabel(operation.current_status))}</span></div>
      <div class="retrieval-quality-value"><strong>${qualityText}</strong><div><h2 id="retrieval-health-title">Qualidade local da recuperação</h2><p>${measured ? `Hit@3 em ${brainCount(quality.cases)} casos auditados` : 'Ainda não existe benchmark auditado para esta instalação'}</p></div></div>
      <progress class="retrieval-quality-track" max="100" value="${measured ? Math.max(0, Math.min(100, quality.percent)) : 0}" aria-label="${measured ? `${quality.percent}% no benchmark Hit@3` : 'Benchmark não medido'}"></progress>
      <div class="retrieval-quality-proof"><span>${quality.false_positive_percent !== null && quality.false_positive_percent !== undefined ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(quality.false_positive_percent)}% falsos positivos` : 'falso positivo não medido'}</span><span>${escapeHtml(gate)}</span><span>${quality.measured_at ? `medido ${fmtDate(quality.measured_at, false)}` : 'sem data de medição'}</span></div>
      <p class="retrieval-comparison-note">Benchmark local. Comparar empresas exige a mesma versão, conjunto de casos e política de corpus; isto ainda não é ranking da comunidade Vibe Makers.</p>
    </div>

    <div class="retrieval-evidence-list" aria-label="Evidências da recuperação">
      <article><p class="micro">Índice</p><strong>${index.documents === null || index.documents === undefined ? 'Não observado' : `${brainCount(index.documents)} documentos`}</strong><span>${index.orphans === null || index.orphans === undefined ? 'órfãos não medidos' : `${brainCount(index.orphans)} órfãos`} · ${index.updated_at ? `geração ${fmtDate(index.updated_at, false)}` : 'sem geração auditada'}</span></article>
      <article><p class="micro">Operação real</p><strong>${brainCount(accepted)} recuperações aceitas</strong><span>${brainCount(abstained)} abstiveram por evidência insuficiente · ${brainCount(unavailable)} falharam no histórico</span></article>
      <article><p class="micro">Context snapshots</p><strong>${brainCount(snapshots.complete)}/${brainCount(snapshots.observed)} completos</strong><span>${brainCount(snapshots.gaps)} gaps · ${brainCount(snapshots.conflicts)} conflitos em ${brainCount(snapshots.runs)} Runs</span></article>
    </div>

    <details class="retrieval-operations">
      <summary>Como este número foi provado</summary>
      <dl>
        <div><dt>Métrica</dt><dd>Hit@3 do último Source Index Receipt concluído</dd></div>
        <div><dt>Provider</dt><dd>${escapeHtml(providerLabel)}${provider.version ? ` · v${escapeHtml(provider.version)}` : ''}</dd></div>
        <div><dt>Motor</dt><dd>${escapeHtml(implementation)} · implementação atual e substituível</dd></div>
        <div><dt>Circuito</dt><dd>${escapeHtml(operation.circuit || 'não observado')}${operation.last_success_at ? ` · sucesso ${fmtDate(operation.last_success_at, false)}` : ''}</dd></div>
        <div><dt>Privacidade</dt><dd>Query, conteúdo, snippet e erro bruto não aparecem nesta vista</dd></div>
      </dl>
    </details>
  </section>`;
}

function renderCompanyMap(anatomy) {
  const map = anatomy.company_map;
  if (!map) return empty('Mapa da empresa indisponível', 'Este Cérebro ainda não declarou casas reconhecíveis para esta leitura.');
  const query = brainSearchKey(state.brain.query.trim());
  const domains = map.domains.map((domain) => {
    const domainMatches = brainSearchKey(`${domain.name} ${domain.purpose}`).includes(query);
    const entries = !query || domainMatches
      ? domain.entries
      : domain.entries.filter((entry) => brainSearchKey(entry.name).includes(query));
    return { ...domain, entries };
  }).filter((domain) => domain.entries.length);
  const visibleObjects = domains.reduce((total, domain) => total + domain.entries.length, 0);
  const prioritySources = ['clickup', 'drive', 'vault', 'fathom-calls', 'supabase', 'platform'];
  const sourceById = new Map(anatomy.memory.sources.map((source) => [source.source_id, source]));
  const sources = prioritySources.map((id) => sourceById.get(id)).filter(Boolean);
  const care = [
    map.care.context_gaps ? { value: map.care.context_gaps, label: 'lacunas apareceram em Context Snapshots recentes' } : null,
    map.care.sources_never_observed ? { value: map.care.sources_never_observed, label: 'Fontes ainda não deixaram observação real' } : null,
    map.care.distill_backlog ? { value: 'fila', label: shortBrainLabel(map.care.distill_backlog, 96) } : null,
    map.care.protocol_issues ? { value: map.care.protocol_issues, label: 'inconsistências de protocolo pedem inspeção' } : null,
  ].filter(Boolean);

  return `<div class="company-map-home">
    <section class="company-map-search">
      <div><h2>Encontre o que existe na empresa.</h2><p>Áreas, conhecimento, Fontes e rotinas — sem transformar o Cérebro em outro ClickUp.</p></div>
      <label><span>Buscar no mapa da empresa</span><input type="search" data-brain-map-search value="${escapeHtml(state.brain.query)}" placeholder="Ofertas, Ads, founders, decisões…" autocomplete="off"><small>Busca local nos nomes e áreas já mapeados. Não chama modelo.</small></label>
    </section>

    <div class="company-map-layout">
      <section class="company-map-main" aria-labelledby="company-map-title">
        <header><div><h2 id="company-map-title">O que este Cérebro contém</h2></div><span>${visibleObjects} ${visibleObjects === 1 ? 'objeto visível' : 'objetos visíveis'}</span></header>
        ${domains.length ? `<div class="company-domain-list">${domains.map((domain, index) => `<section class="company-domain">
          <div class="company-domain-heading"><span>${String(index + 1).padStart(2, '0')}</span><div><h3>${escapeHtml(domain.name)}</h3><p>${escapeHtml(domain.purpose)}</p></div></div>
          <ul>${domain.entries.map(brainHouseRow).join('')}</ul>
        </section>`).join('')}</div>` : `<div class="company-map-empty"><strong>Nada no mapa corresponde a “${escapeHtml(state.brain.query)}”.</strong><span>Tente uma casa real, como ofertas, Ads, founders, decisões ou Sistemas.</span></div>`}
      </section>

      <aside class="company-map-rail">
        <section class="company-source-brief">
          <header><div><h2>De onde a realidade entra</h2></div><span>${map.source_summary.observed}/${map.source_summary.total}</span></header>
          <ul>${sources.map((source) => {
            const observedAt = source.last_access?.occurred_at || source.freshness_observed;
            return `<li><i class="${observedAt ? 'observed' : ''}"></i><div><strong>${escapeHtml(source.name)}</strong><span>${observedAt ? `observada ${fmtDate(observedAt, false)}` : 'declarada, ainda sem observação'}</span></div></li>`;
          }).join('')}</ul>
          <button class="action" type="button" data-view="sources">Ver todas as Fontes →</button>
        </section>
        <section class="company-care-brief">

          <h2>Saúde da memória</h2>
          ${care.length ? `<ul>${care.map((item) => `<li><b>${escapeHtml(item.value)}</b><span>${escapeHtml(item.label)}</span></li>`).join('')}</ul>` : '<p class="company-care-clear">Nenhuma lacuna observada pede cuidado agora.</p>'}
          <button class="action" type="button" data-view="health">Abrir saúde →</button>
        </section>
      </aside>
    </div>

    <section class="company-routines">
      <header><div><h2>O que mantém o contexto vivo</h2></div><button class="action" type="button" data-view="routines">Inspecionar rotinas →</button></header>
      <div class="company-routine-list">${map.routines.map((routine) => `<article><div><i class="${routine.state === 'active' || routine.state === 'human-capture' ? 'observed' : ''}"></i><strong>${escapeHtml(routine.name)}</strong><span>${escapeHtml(label(routine.state))} · ${escapeHtml(routine.schedule)}</span></div><p>${escapeHtml(routine.output)}</p>${routine.last_observed ? `<time>${fmtDate(routine.last_observed, false)}</time>` : '<time>sem execução observada</time>'}</article>`).join('')}</div>
      <div class="daily-purpose"><b>Por que existe daily?</b><span>Para registrar o que mudou, por que mudou e qual decisão nasceu. Tarefa, dono e prazo continuam no ClickUp.</span></div>
    </section>

  </div>`;
}

function integrityLabel(value) {
  return ({ complete: 'Completo', limited: 'Limitado', blocked: 'Bloqueado' })[value] || label(value);
}

function integrityTone(value) {
  return ({ complete: 'good', limited: 'warn', blocked: 'bad' })[value] || 'neutral';
}

function careLabel(item) {
  return ({
    'sources-unobserved': 'Fontes declaradas ainda não deixaram observação real',
    'runs-limited': 'Runs operaram com alguma limitação explícita',
    'runs-blocked': 'Runs foram bloqueados antes de sustentar resultado',
    'judgment-reconciliation': 'recibos de julgamento precisam de reconciliação com o ledger',
    'routine-receipt-invalid': 'recibos de execução ilegíveis ficaram fora da leitura',
    'learning-candidates-empty': 'nenhum candidato de aprendizado foi materializado',
  })[item.code] || label(item.code);
}

function nativeCapabilityStateLabel(stateValue) {
  return ({
    declared: 'Declarada',
    available: 'Disponível',
    operational: 'Operacional',
    measured: 'Medida',
  })[stateValue] || label(stateValue);
}

function nativeCapabilityStateTone(stateValue) {
  return ({
    declared: 'neutral',
    available: 'neutral',
    operational: 'good',
    measured: 'good',
  })[stateValue] || 'neutral';
}

function nativeCapabilityAction(action) {
  if (!action) return '';
  const attribute = action.kind === 'view'
    ? `data-view="${escapeHtml(action.ref)}"`
    : `data-brain-mode="${escapeHtml(action.ref)}"`;
  return `<button type="button" class="native-capability-action" ${attribute}>${escapeHtml(action.label)} →</button>`;
}

function renderNativeCapabilities(capabilities = []) {
  if (!capabilities.length) return `<section class="native-capabilities">
    <header><div><h2>O que vem com o Cérebro</h2></div></header>
    <p class="brain-clear-state">Nenhuma capacidade nativa foi projetada por esta instalação.</p>
  </section>`;

  return `<section class="native-capabilities" aria-labelledby="native-capabilities-title">
    <header>
      <div><h2 id="native-capabilities-title">O que já vem com o Cérebro</h2><p>Estas capacidades fazem parte deste cérebro. Sistemas usam essa base automaticamente quando o contrato permite; você não precisa rodar um comando. Capacidade é permanente. Skill é o instrumento. Provider é substituível.</p></div>
      <button type="button" class="action" data-view="skills">Ver Skills →</button>
    </header>
    <div class="native-capability-grid">${capabilities.map((capability) => {
      return `<article class="native-capability-card state-${escapeHtml(capability.state)}">
        <div class="native-capability-heading"><span>${String(capability.position).padStart(2, '0')}</span>${badge(capability.state, nativeCapabilityStateTone(capability.state), nativeCapabilityStateLabel(capability.state))}</div>
        <div class="native-capability-copy"><h3>${escapeHtml(capability.name)}</h3><p>${escapeHtml(capability.promise)}</p></div>
        <div class="native-capability-proof"><small>Estado neste Cérebro</small><strong>${escapeHtml(capability.proof.headline)}</strong></div>
        <footer>${nativeCapabilityAction(capability.action)}</footer>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function overviewQualityText(quality = {}) {
  return quality.measured && Number.isFinite(quality.percent)
    ? `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(quality.percent)}%`
    : 'Não medido';
}

function renderOverviewRecoveryAsset(health = {}) {
  const quality = health.quality || {};
  const operation = health.operation || {};
  const measured = quality.measured && Number.isFinite(quality.percent);
  const gate = quality.gate_passed === true ? 'Aprovado'
    : quality.gate_passed === false ? 'Reprovado' : 'Não observado';
  const falsePositive = quality.false_positive_percent !== null && quality.false_positive_percent !== undefined
    ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(quality.false_positive_percent)}%`
    : 'Não medido';

  return `<section class="brain-recovery-asset${measured ? '' : ' is-unmeasured'}" aria-labelledby="overview-retrieval-title">
    <header><p class="micro">Qualidade de recuperação</p><span class="retrieval-live-state"><i class="${operation.current_status === 'healthy' ? 'observed' : ''}"></i>${escapeHtml(retrievalStatusLabel(operation.current_status))}</span></header>
    <div class="brain-recovery-asset-value"><strong>${overviewQualityText(quality)}</strong><div><h2 id="overview-retrieval-title">Hit@3</h2><p>${measured ? 'do contexto certo entre as três primeiras referências' : 'benchmark local ainda não auditado'}</p></div></div>
    <dl>
      <div><dt>Casos</dt><dd>${quality.cases == null ? '—' : brainCount(quality.cases)}</dd></div>
      <div><dt>Falsos positivos</dt><dd>${falsePositive}</dd></div>
      <div><dt>Gate</dt><dd>${escapeHtml(gate)}</dd></div>
      <div><dt>Medição</dt><dd>${quality.measured_at ? fmtDate(quality.measured_at, false) : 'Sem data'}</dd></div>
    </dl>
    <p>Benchmark local. Comparar empresas exige a mesma versão, conjunto de casos e política de corpus; isto ainda não é ranking da comunidade Vibe Makers.</p>
    <button type="button" class="action" data-brain-mode="recovery">Ver prova e Runs →</button>
  </section>`;
}

function renderOverviewCapabilities(capabilities = []) {
  const visibleIds = new Set(['sources', 'evaluation', 'learning']);
  const visible = capabilities.filter((capability) => visibleIds.has(capability.id));
  if (!visible.length) return '<p class="brain-clear-state">Nenhuma capacidade deixou prova local nesta instalação.</p>';
  return `<div class="brain-supported-grid">${visible.map((capability) => `<article class="state-${escapeHtml(capability.state)}">
    <div><span>${escapeHtml(nativeCapabilityStateLabel(capability.state))}</span><i></i></div>
    <h3>${escapeHtml(capability.name)}</h3>
    <p>${escapeHtml(capability.promise)}</p>
    <strong>${escapeHtml(capability.proof.headline)}</strong>
    ${nativeCapabilityAction(capability.action)}
  </article>`).join('')}</div>`;
}

function renderOverviewActivity(center, health = {}) {
  const latestRun = center.recovery.runs[0] || null;
  const operation = health.operation || {};
  const index = health.index || {};
  const accepted = operation.decisions?.accepted || 0;
  const abstained = operation.decisions?.insufficient_evidence || 0;
  const failed = operation.decisions?.retrieval_unavailable || 0;
  const runAt = latestRun?.completed_at || latestRun?.started_at;
  return `<section class="brain-activity-list">
    <header><div><h2>O que aconteceu por último</h2></div><span>recibos locais</span></header>
    <ol>
      <li><div><span>Último Run</span><strong>${latestRun ? escapeHtml(latestRun.system_name) : 'Nenhum Run observado'}</strong><small>${latestRun ? `${escapeHtml(integrityLabel(latestRun.integrity.state))}${runAt ? ` · ${fmtDate(runAt, false)}` : ''}` : 'o ledger ainda não deixou execução'}</small></div>${latestRun ? '<button type="button" data-brain-mode="recovery">Abrir →</button>' : ''}</li>
      <li><div><span>Última recuperação</span><strong>${operation.last_retrieval_at ? fmtDate(operation.last_retrieval_at, false) : 'Não observada'}</strong><small>${brainCount(accepted)} aceitas · ${brainCount(abstained)} abstiveram · ${brainCount(failed)} falharam no histórico</small></div><button type="button" data-brain-mode="recovery">Inspecionar →</button></li>
      <li><div><span>Índice vigente</span><strong>${index.documents == null ? 'Não observado' : `${brainCount(index.documents)} documentos`}</strong><small>${index.updated_at ? `geração ${fmtDate(index.updated_at, false)}` : 'sem geração auditada'}</small></div><button type="button" data-brain-mode="architecture">Ver arquitetura →</button></li>
    </ol>
  </section>`;
}

function renderBrainOverview(anatomy) {
  const center = anatomy.control_center;
  const overview = center.overview;
  const runs = overview.runs;
  const learning = overview.learning;
  return `<div class="brain-control-view brain-overview">
    <section class="brain-overview-hero">
      <div class="brain-overview-lead">
        <div><h2>Contexto que já consegue voltar para o trabalho.</h2><p>Aqui você vê o que está vivo, o que foi provado e onde o Cérebro decidiu não inventar.</p></div>
        <dl class="brain-overview-facts" aria-label="Estado operacional observado">
          <div><dt>Realidade entrando</dt><dd>${brainCount(overview.sources.observed)}/${brainCount(overview.sources.total)}</dd><span>Fontes observadas</span></div>
          <div><dt>Trabalho sustentado</dt><dd>${brainCount(runs.complete)}/${brainCount(runs.total)}</dd><span>Runs completos · ${brainCount(runs.limited)} limitados</span></div>
          <div><dt>Julgamento humano</dt><dd>${brainCount(learning.judgments)}</dd><span>${brainCount(learning.outcomes)} Runs com outcome · ${brainCount(learning.candidates)} candidatos</span></div>
        </dl>
      </div>
      ${renderOverviewRecoveryAsset(anatomy.retrieval_health)}
    </section>

    ${renderActivationStatus(anatomy.activation, { formatDate: fmtDate })}

    <section class="brain-supported">
      <header><div><h2>Capacidades que já deixaram prova neste Cérebro</h2><p>Disponibilidade técnica não basta: cada linha mostra o efeito e a evidência observada nesta empresa.</p></div></header>
      ${renderOverviewCapabilities(center.capabilities)}
    </section>

    <div class="brain-overview-lower">
      ${renderOverviewActivity(center, anatomy.retrieval_health)}
      <section class="brain-care-list">
        <header><div><h2>O que merece cuidado agora</h2></div><span>${overview.care.length} sinais</span></header>
        ${overview.care.length ? `<ol>${overview.care.map((item) => `<li><b>${item.count === 0 ? '—' : brainCount(item.count)}</b><span>${escapeHtml(careLabel(item))}</span></li>`).join('')}</ol>` : '<p class="brain-clear-state">Nenhum sinal operacional pede atenção agora.</p>'}
      </section>
    </div>

    <details class="brain-capability-details">
      <summary><span><b>Como este Cérebro funciona</b><small>${brainCount(center.capabilities.length)} capacidades nativas · Skills como instrumentos · provider substituível</small></span><i aria-hidden="true">⌄</i></summary>
      ${renderNativeCapabilities(center.capabilities)}
    </details>
  </div>`;
}

function renderBrainMemory(anatomy) {
  const memory = anatomy.control_center.memory;
  return `<div class="brain-control-view brain-memory-view">
    <section class="brain-lifecycle">
      <header><div><p class="micro">Estados da memória</p>${memory.measured_by_vault
    ? '<h2>Do bruto ao contexto vigente, medido pelo vault.</h2><p>Cada estado conta notas reais: inbox, frontmatter organizado, fontes destiladas e o que foi atualizado nos últimos 90 dias.</p>'
    : '<h2>O que é medido — e o que ainda não é.</h2><p>Contagem de pasta não substitui recibo de captura, processamento ou destilação.</p>'}</div></header>
      <ol>${memory.lifecycle.map((step) => `<li class="${step.measured ? 'is-measured' : 'is-unmeasured'}"><span>${escapeHtml(step.name)}</span><strong>${step.measured ? brainCount(step.value) : 'Não instrumentado'}</strong><small>${step.measured ? escapeHtml(step.unit || 'objetos observados') : 'a transição ainda não emite recibo canônico'}</small></li>`).join('')}</ol>
      <div class="brain-freshness-note"><b>Frescor por Fonte · não calculado</b><span>${brainCount(memory.freshness.declared_policies)} políticas declaradas em texto; falta uma regra machine-readable para comparar vigência.</span></div>
    </section>
    ${renderCompanyMap(anatomy)}
  </div>`;
}

function renderBrainRecovery(anatomy) {
  const recovery = anatomy.control_center.recovery;
  return `<div class="brain-control-view brain-recovery-view">
    ${renderRetrievalHealth(anatomy.retrieval_health)}
    <section class="brain-run-ledger">
      <header><div><h2>O contexto que cada Run realmente recebeu</h2><p>Completo, limitado ou bloqueado nasce das dimensões do recibo — nunca de um score inventado.</p></div><div class="brain-integrity-legend"><span><i class="complete"></i>${brainCount(recovery.counts.complete)} completos</span><span><i class="limited"></i>${brainCount(recovery.counts.limited)} limitados</span><span><i class="blocked"></i>${brainCount(recovery.counts.blocked)} bloqueados</span></div></header>
      <div class="brain-run-table" role="table" aria-label="Runs e contexto recuperado">
        <div class="brain-run-row brain-run-head" role="row"><span>Run / Sistema</span><span>Contexto</span><span>Recuperação</span><span>Martelo</span><span></span></div>
        ${recovery.runs.map((run) => `<button type="button" class="brain-run-row" role="row" data-open-brain-run="${escapeHtml(run.run_id)}">
          <span><strong>${escapeHtml(run.system_name)}</strong><small>${fmtDate(run.completed_at || run.started_at, false)} · ${escapeHtml(run.run_id)}</small></span>
          <span>${badge(run.integrity.state, integrityTone(run.integrity.state), integrityLabel(run.integrity.state))}<small>${brainCount(run.integrity.references)} refs · ${brainCount(run.integrity.accesses)} Fontes</small></span>
          <span><strong>${run.retrieval.mode === 'semantic-provider' ? 'Provider semântico' : 'Coleta contratual'}</strong><small>${run.retrieval.mode === 'semantic-provider' ? escapeHtml(label(run.retrieval.decision || run.retrieval.status)) : 'sem recuperação semântica solicitada'}</small></span>
          <span><strong>${escapeHtml(label(run.judgment?.verdict || run.human_decision || 'pending'))}</strong><small>${run.outcomes ? `${brainCount(run.outcomes)} outcomes` : 'sem outcome'}</small></span>
          <span aria-hidden="true">→</span>
        </button>`).join('')}
      </div>
    </section>
  </div>`;
}

/* Aprendizado lido do vault (ticket 14): a linha do tempo de decisões por mês, as
   lições por tema e o último resultado do teste de recall. Só aparece em modo vault;
   fora dele a aba Aprendizado continua sendo a do console, sem vault. Classe, nunca estilo
   inline: a CSP do Console bloqueia style=. */
const MONTH_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function vaultMonthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return String(month || 'mês');
  const label = MONTH_FMT.format(new Date(`${month}-01T12:00:00`));
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

function vaultNoteChips(refs, prefix) {
  if (!refs?.length) return '';
  return `<span class="vault-chips">${prefix ? `<em>${escapeHtml(prefix)}</em>` : ''}${refs
    .map((ref) => `<code>${escapeHtml(ref.title)}</code>`).join('')}</span>`;
}

function vaultDecisionEntry(entry) {
  return `<li class="vault-entry">
    <span class="vault-entry-date">${fmtDate(entry.date, false)}</span>
    <div>
      <p class="vault-entry-claim">${escapeHtml(entry.decision)}</p>
      ${entry.context ? `<p class="vault-entry-context">${escapeHtml(entry.context)}</p>` : ''}
      <div class="vault-entry-refs">${vaultNoteChips(entry.notes, 'notas')}${entry.session
    ? `<span class="vault-chips"><em>sessão</em><code>${escapeHtml(entry.session)}</code></span>` : ''}</div>
    </div>
  </li>`;
}

function vaultDecisionTimeline(decisions) {
  if (!decisions?.available) return '';
  const months = decisions.months || [];
  // Abre o mês mais novo que tem entrada: o mês corrente pode estar vazio e abrir
  // uma lista vazia não mostra decisão nenhuma.
  const opened = months.findIndex((month) => month.entries.length);
  return `<section class="vault-learning-block">
    <header><div><h2>Decisões por mês</h2><p>Log de append do vault: a decisão em uma linha, o contexto e os wikilinks da nota afetada e do log de sessão.</p></div><span>${brainCount(decisions.counts.entries)} decisão(ões) · ${brainCount(decisions.counts.months)} mês(es)</span></header>
    ${months.length ? months.map((month, index) => `<details class="vault-month"${index === opened ? ' open' : ''}>
      <summary><strong>${escapeHtml(month.title || vaultMonthLabel(month.month))}</strong><span>${brainCount(month.count)} decisão(ões)</span></summary>
      ${month.entries.length
    ? `<ol class="vault-entries">${month.entries.map(vaultDecisionEntry).join('')}</ol>`
    : `<p class="vault-withheld">${month.private ? 'Mês privado: a contagem é honesta, a entrada fica na nota.' : 'Nenhuma entrada no formato do log neste mês.'}</p>`}
    </details>`).join('') : '<p class="brain-clear-state">Nenhum mês de decisão no vault.</p>'}
  </section>`;
}

function vaultLessonTheme(theme) {
  return `<article class="vault-theme${theme.private ? ' is-private' : ''}">
    <header><span class="vault-theme-count" aria-label="${theme.count === 1 ? 'uma lição' : `${brainCount(theme.count)} lições`}">${brainCount(theme.count)}</span><div><h3>${escapeHtml(theme.title || 'Tema privado')}</h3><small>${theme.updated ? `atualizado em ${fmtDate(theme.updated, false)}` : theme.count === 1 ? 'uma lição' : `${brainCount(theme.count)} lições`}</small></div></header>
    ${theme.latest.length
    ? `<ul class="vault-theme-latest">${theme.latest.map((lesson) => `<li><b>${fmtDate(lesson.date, false)}</b><span>${escapeHtml(lesson.rule)}</span></li>`).join('')}</ul>`
    : '<p class="vault-withheld">As lições deste tema ficam na nota.</p>'}
    ${theme.cases?.length ? vaultNoteChips(theme.cases.slice(0, 4), 'casos') : ''}
  </article>`;
}

function vaultLessonsByTheme(lessons, memory) {
  if (!lessons?.available) return '';
  const themes = lessons.themes || [];
  return `<section class="vault-learning-block">
    <header><div><h2>Lições por tema</h2><p>Cada tema é um arquivo do vault, carregado só quando a tarefa é dele. O que se repete em dois contextos sobe para o MEMORY.</p></div><span>${brainCount(lessons.counts.lessons)} lição(ões) · ${brainCount(lessons.counts.themes)} tema(s)</span></header>
    ${themes.length ? `<div class="vault-theme-grid">${themes.map(vaultLessonTheme).join('')}</div>` : '<p class="brain-clear-state">Nenhum tema de lição no vault.</p>'}
    ${memory?.available ? `<div class="vault-promoted"><div><strong>${brainCount(memory.count)} regra(s) promovida(s) ao MEMORY</strong><small>Lidas em toda sessão, de ${escapeHtml(memory.path)} — só o título sai do vault.</small></div><ul>${memory.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></div>` : ''}
  </section>`;
}

function vaultRecallCard(recall) {
  if (!recall?.available) return '';
  const latest = recall.latest;
  const pending = String(recall.status || '').toLocaleLowerCase('pt-BR').startsWith('rascunho');
  const counted = latest && [latest.hits, latest.partials, latest.misses].some((value) => value !== null);
  return `<section class="vault-recall${latest ? '' : ' is-empty'}">
    <div class="vault-recall-score"><p class="micro">Último recall</p><strong>${latest ? escapeHtml(latest.score || '—') : '—'}</strong><small>${latest ? fmtDate(latest.date, false) : 'nenhuma rodada registrada'}</small></div>
    <div class="vault-recall-body">
      <h2>${latest
    ? (counted
      ? `${brainMeasure(latest.hits)} acerto(s), ${brainMeasure(latest.partials)} parcial(is) e ${brainMeasure(latest.misses)} erro(s)`
      : 'Rodada registrada com contagem não medida')
    : 'A régua existe e ainda não rodou'}</h2>
      <p>${pending
    ? 'O teste está em rascunho: a weekly não roda a régua até o dono aprovar as perguntas.'
    : 'Dez perguntas respondidas por um chat novo, lendo só o vault. Mede se o cérebro melhorou ou só cresceu.'}</p>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(recall.status || 'não declarado')}</dd></div>
        <div><dt>Histórico</dt><dd>${recall.history === 1 ? 'uma rodada' : `${brainCount(recall.history)} rodadas`}${recall.previous ? ` · antes ${escapeHtml(recall.previous.score || '—')}` : ''}</dd></div>
        <div><dt>Perguntas que falharam</dt><dd>${escapeHtml(latest?.failed || 'nenhuma')}</dd></div>
      </dl>
      ${latest?.fix ? `<p class="vault-recall-fix"><b>O que consertar</b>${escapeHtml(latest.fix)}</p>` : ''}
    </div>
  </section>`;
}

function renderVaultLearning(insights) {
  return `<div class="vault-learning">
    ${vaultRecallCard(insights.recall)}
    ${vaultDecisionTimeline(insights.decisions)}
    ${vaultLessonsByTheme(insights.lessons, insights.memory)}
  </div>`;
}

/* Julgamentos em Aprendizado (ticket 12): a contagem por veredicto, quantas execuções
   ainda esperam martelo e os últimos julgamentos com data, execução e nota curta. Vale
   também para o histórico importado do vault, onde a execução é um recibo de Rotina.
   Classe, nunca estilo inline: a CSP do Console bloqueia style=. */
const JUDGMENT_VERDICT_TONE = { approved: 'good', 'changes-requested': 'warn', rejected: 'bad' };

function brainJudgmentEntry(entry) {
  const origin = entry.system_ref || entry.routine_id || entry.run_id || 'execução não observada';
  return `<li class="brain-judgment-entry">
    <span class="brain-judgment-date">${fmtDate(entry.decided_at, false)}</span>
    <div>
      <strong>${escapeHtml(origin)}</strong>
      <span>${escapeHtml(entry.routine_id || entry.run_id || '')}</span>
      ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : '<p class="brain-judgment-silent">Aprovado sem nota.</p>'}
    </div>
    ${badge(entry.verdict || 'decided', JUDGMENT_VERDICT_TONE[entry.verdict] || 'neutral')}
  </li>`;
}

function brainJudgmentLog(learning) {
  const counts = learning.by_verdict || {};
  const tiles = [
    ['approved', 'aprovados'],
    ['changes-requested', 'pedidos de mudança'],
    ['rejected', 'rejeitados'],
  ].map(([verdict, name]) => `<li class="brain-verdict is-${verdict}"><b>${brainCount(counts[verdict] || 0)}</b><small>${name}</small></li>`).join('');
  const latest = learning.latest || [];
  return `<section class="brain-judgment-log">
    <header><div><h2>Julgamentos registrados</h2><p>Cada julgamento é um recibo no runtime, ligado à execução que ele decidiu. A nota fica local e nunca entra na nota do vault.</p></div><span>${brainCount(learning.judgments)} julgamento(s) · ${brainCount(learning.pending ?? 0)} pendente(s)</span></header>
    <ul class="brain-verdict-counts">${tiles}<li class="brain-verdict is-pending"><b>${brainCount(learning.pending ?? 0)}</b><small>esperando martelo</small></li></ul>
    ${latest.length
    ? `<ol class="brain-judgment-entries">${latest.map(brainJudgmentEntry).join('')}</ol>`
    : '<p class="brain-clear-state">Nenhuma execução julgada ainda. Abrir uma execução em Julgamento registra o primeiro martelo.</p>'}
  </section>`;
}

function renderBrainLearning(anatomy) {
  const learning = anatomy.control_center.learning;
  const runs = anatomy.control_center.recovery.runs.filter((run) => run.judgments || run.outcomes || run.correction_linked);
  const issues = learning.reconciliation.orphan_judgments + learning.reconciliation.duplicate_judgments;
  return `<div class="brain-control-view brain-learning-view">
    ${state.vaultInsights ? renderVaultLearning(state.vaultInsights) : ''}
    <section class="brain-learning-lead">
      <div><h2>${learning.candidates ? `${brainCount(learning.candidates)} melhorias aguardam prova.` : 'Ainda não existe melhoria pronta para promoção.'}</h2><p>Julgamento registra confiança. Outcome prova efeito. Só então uma mudança pode voltar ao Sistema.</p></div>
      <ol><li><span>01</span><b>${brainCount(learning.judgments)}</b><small>julgamentos</small></li><li><span>02</span><b>${brainCount(learning.corrections)}</b><small>correções</small></li><li><span>03</span><b>${brainCount(learning.outcomes)}</b><small>Runs com outcome</small></li><li><span>04</span><b>${brainCount(learning.candidates)}</b><small>candidatos</small></li></ol>
    </section>

    ${brainJudgmentLog(learning)}

    <section class="brain-learning-status ${learning.candidates ? '' : 'is-empty'}">
      <div><h2>${learning.candidates ? 'Fila materializada' : 'Nenhum candidato materializado'}</h2><p>${learning.candidates ? 'A promoção continua dependente de prova e martelo humano.' : 'Isso não significa que o Cérebro não aprendeu nada; significa que nenhum Learning Candidate Receipt foi emitido.'}</p></div>
      <span>${learning.promotions.measured ? brainCount(learning.promotions.value) : 'Promoções · não instrumentadas'}</span>
    </section>

    <section class="brain-learning-ledger">
      <header><div><h2>Runs que chegaram a julgamento ou outcome</h2></div><span>${runs.length} Runs</span></header>
      ${runs.length ? `<ul>${runs.map((run) => `<li><div><strong>${escapeHtml(run.system_name)}</strong><span>${fmtDate(run.completed_at || run.started_at, false)} · ${escapeHtml(run.run_id)}</span></div><span>${run.judgments ? `${run.judgments} julgamento${run.judgments === 1 ? '' : 's'}` : 'sem recibo de julgamento'} · ${run.outcomes ? `${run.outcomes} outcome${run.outcomes === 1 ? '' : 's'}` : 'sem outcome'}</span><button type="button" data-open-brain-run="${escapeHtml(run.run_id)}">Inspecionar →</button></li>`).join('')}</ul>` : '<p class="brain-clear-state">Nenhum Run chegou ao ciclo observado.</p>'}
    </section>

    <section class="brain-reconciliation ${issues ? 'has-issues' : ''}"><div><h2>${issues ? `${brainCount(issues)} inconsistências pedem revisão` : 'Ledger e recibos conciliados'}</h2></div><p>${brainCount(learning.reconciliation.orphan_judgments)} julgamento aponta para Run ausente · ${brainCount(learning.reconciliation.duplicate_judgments)} julgamento excedente no mesmo Run.</p></section>
  </div>`;
}

function renderBrainArchitecture(anatomy) {
  const architecture = anatomy.control_center.architecture;
  const provider = architecture.provider;
  return `<div class="brain-control-view brain-architecture-view">
    <section class="brain-architecture-lead"><div><h2>O protocolo é o produto. O motor é substituível.</h2><p>Sistemas consomem um contrato genérico de recuperação; a implementação atual fica atrás dessa fronteira.</p></div><dl><div><dt>Retrieval Provider</dt><dd>${escapeHtml(provider.name || provider.provider_id || 'não declarado')}${provider.version ? ` · v${escapeHtml(provider.version)}` : ''}</dd></div><div><dt>Implementação atual</dt><dd>${escapeHtml(provider.implementation || 'não observada')}${provider.implementation_version ? ` ${escapeHtml(provider.implementation_version)}` : ''} · substituível</dd></div><div><dt>Estado operacional</dt><dd>${escapeHtml(retrievalStatusLabel(architecture.operation.current_status))} · circuito ${escapeHtml(architecture.operation.circuit || 'não observado')}</dd></div></dl></section>

    <section class="brain-architecture-contracts">
      <header><div><h2>A camada constitucional</h2></div></header>
      <dl><div><dt>System Contracts</dt><dd>${brainCount(architecture.protocol.system_contracts)}</dd><span>declaram fontes, recuperação, evidência e condições de parada</span></div><div><dt>Source Contracts</dt><dd>${brainCount(architecture.protocol.source_contracts)}</dd><span>declaram casa de verdade, binding e política de frescor</span></div><div><dt>Retrieval Contract</dt><dd>${architecture.protocol.retrieval_versions.length ? architecture.protocol.retrieval_versions.map((version) => `v${escapeHtml(version)}`).join(' · ') : 'não observado'}</dd><span>lido pela experiência e pelo runtime</span></div><div><dt>Índice atual</dt><dd>${architecture.index.documents == null ? 'não observado' : `${brainCount(architecture.index.documents)} docs`}</dd><span>${architecture.index.updated_at ? `geração ${fmtDate(architecture.index.updated_at, false)}` : 'sem geração auditada'}</span></div></dl>
    </section>

    <section class="brain-context-agreement">
      <header><div><h2>O Sistema pede contexto; o Cérebro decide como recuperá-lo.</h2><p>A fonte continua sendo a casa da verdade. O contrato do Sistema registra o que precisa, a janela, o frescor, a evidência mínima e quando parar.</p></div></header>
      <ol><li><span>01</span><div><strong>Fonte</strong><p>Guarda o dado bruto e sua autoridade.</p></div></li><li><span>02</span><div><strong>Cérebro</strong><p>Coleta, prepara, destila, recupera e registra o contexto usado.</p></div></li><li><span>03</span><div><strong>Sistema</strong><p>Consome o contexto necessário e produz o resultado contratado.</p></div></li><li><span>04</span><div><strong>Run Record</strong><p>Prova se houve recuperação pelo Cérebro ou leitura direta autorizada da Fonte.</p></div></li></ol>
      <p class="brain-context-rule"><b>Leitura direta é exceção explícita.</b> Ela só acontece quando o contrato e a permissão do Sistema exigem dado fresco ou estruturado na Fonte; nunca por atalho invisível.</p>
    </section>

    ${renderBrainGraphPreview(state.brainGraph)}
    <p class="brain-graph-disclaimer">Este grafo é um mapa estrutural para inspeção. Ele não prova GraphRAG nem participa da recuperação observada hoje.</p>
    <section class="brain-privacy-boundary"><p class="micro">Fronteira de privacidade</p><div><strong>Referências, não payload.</strong><span>Esta área não expõe query, conteúdo, snippet, hashes completos ou erro bruto.</span></div></section>
  </div>`;
}

function updateReasonCopy(code) {
  return {
    'update-source-not-configured': 'Este Cérebro ainda não aderiu ao canal empacotado de releases.',
    'git-checkout-update-protected': 'Checkout de desenvolvimento protegido: atualização automática não sobrescreve trabalho local.',
    'local-updater-missing': 'O updater local ainda não faz parte desta instalação.',
    'installation-version-missing': 'A instalação precisa de uma versão canônica antes de entrar no canal gerenciado.',
    'update-check-unavailable': 'Não foi possível consultar a última release agora.',
    'update-channel-unmanaged': 'Nenhum canal oficial de releases está configurado.',
    'managed-update-unavailable': 'Esta instalação não aceita atualização automática com segurança.',
    'managed-update-failed': 'A atualização foi cancelada. O contexto privado permaneceu intacto.',
    'update-check-required': 'Verifique novamente a última release antes de atualizar.',
  }[code] || label(code || 'não observado');
}

function updateRemoteCopy(remote) {
  if (!remote) return { label: 'Ainda não verificado', tone: 'neutral', detail: 'A consulta externa só acontece quando você pedir.' };
  return {
    current: { label: 'Motor em dia', tone: 'good', detail: `A release ${remote.tag} já está nesta instalação.` },
    'update-available': { label: `Release ${remote.tag} disponível`, tone: 'warn', detail: `Publicada em ${fmtDate(remote.published_at, false)}.` },
    ahead: { label: 'À frente da última release', tone: 'neutral', detail: `O motor local está além de ${remote.tag}.` },
    'comparison-unavailable': { label: 'Versões não comparáveis', tone: 'neutral', detail: 'A instalação e o motor usam esquemas de versão diferentes.' },
  }[remote.status] || { label: label(remote.status), tone: 'neutral', detail: '' };
}

function communicationKind(value) {
  return {
    announcement: 'COMUNICADO',
    maintenance: 'MANUTENÇÃO',
    'product-update': 'NOVIDADE DO PRODUTO',
  }[value] || 'ATUALIZAÇÃO';
}

function vibeMakersReleaseState(value) {
  return {
    validated: 'Disponível',
    validation: 'Em validação',
    hidden: 'Em preparação',
  }[value] || 'Catálogo atual';
}

function renderBrainUpdates(anatomy) {
  const updates = state.brain.updates;
  if (!updates.data && !updates.loading) void loadBrainUpdates();
  const center = updates.data || anatomy.update_center;
  if (!center) return '<div class="loading"><i></i><span>Lendo versão e canal local…</span></div>';
  const installation = center.installation;
  const motor = center.motor;
  const baseline = motor.upstream_baseline;
  const upstreamRecorded = baseline?.status === 'recorded';
  const community = center.community;
  const communication = center.communication || { entries: [], brain_releases: [], privacy: {} };
  const news = communication.entries || [];
  const brainReleases = communication.brain_releases || [];
  const systemReleases = community.releases || [];
  const remote = center.remote || null;
  const remoteCopy = updateRemoteCopy(remote);
  const managed = installation.update_management === 'managed-release';
  const profile = installation.profile === 'legacy-compatible' ? 'Privado · compatível'
    : managed ? 'Release gerenciada' : 'Instalação local';
  const distribution = installation.distribution === 'hdoria' ? 'Canal público' : 'Distribuição privada';
  const checkLabel = updates.checking ? 'Verificando…' : remote ? 'Verificar novamente' : 'Verificar atualização';
  const applyButton = remote?.status === 'update-available' && motor.can_apply
    ? `<button type="button" class="action primary" data-update-apply ${updates.applying ? 'disabled' : ''}>${updates.applying ? 'Atualizando…' : `Atualizar para ${escapeHtml(remote.tag)}`}</button>` : '';
  const unmanagedNote = managed ? 'Esta instalação pode receber uma release publicada com confirmação explícita.'
    : updateReasonCopy(installation.reason_code);
  return `<div class="brain-control-view brain-updates-view">
    <section class="brain-update-hero">
      <div><h2>Seu contexto fica. O motor evolui.</h2><p>Compatibilidade, atualização do software e catálogo da comunidade Vibe Makers são estados diferentes — e aparecem separados aqui.</p></div>
      <div class="brain-update-identity"><span>${escapeHtml(profile)}</span><strong>v${escapeHtml(installation.version)}</strong><small>${escapeHtml(distribution)} · runtime ${escapeHtml(installation.runtime_mode || 'não declarado')}</small></div>
    </section>

    ${center.last_update ? `<div class="brain-update-result"><b>Motor atualizado para v${escapeHtml(center.last_update.installed_version)}</b><span>Reabra o Console para carregar o código novo. O contexto privado não foi enviado.</span></div>` : ''}
    ${updates.error ? `<div class="brain-update-error"><b>Verificação interrompida</b><span>${escapeHtml(updateReasonCopy(updates.error))}</span></div>` : ''}

    <section class="brain-update-now">
      <div class="brain-update-now-copy">
        <p class="micro">Seu Cérebro · Motor & console</p>
        <div class="brain-update-status"><span class="${escapeHtml(remoteCopy.tone)}"></span><div><strong>${escapeHtml(remoteCopy.label)}</strong><small>${escapeHtml(remoteCopy.detail)}</small></div></div>
        <dl><div><dt>Versão do fork</dt><dd>v${escapeHtml(motor.fork_version || motor.version)}</dd></div><div><dt>Referência upstream</dt><dd>${upstreamRecorded ? `${escapeHtml(baseline.repo)} · ${escapeHtml(baseline.tag)} · ${escapeHtml(baseline.commit.slice(0, 7))}` : 'Não verificada'}</dd></div></dl>
        <p>${upstreamRecorded ? 'Integração seletiva: metadados registrados; execução não verificada por este registro. A referência não declara equivalência com o upstream.' : `Registro upstream ${baseline?.status === 'invalid' ? 'inválido' : 'ausente'}. A referência continua não verificada.`}</p>
        <p>A verificação consulta somente metadados da release pública no canal de atualização configurado.</p>
      </div>
      <div class="brain-update-now-action">
        <div class="brain-update-actions"><button type="button" class="action" data-update-check ${!motor.can_check || updates.checking || updates.applying ? 'disabled' : ''}>${escapeHtml(checkLabel)}</button>${applyButton}</div>
        <small>Nenhuma Fonte, query, memória ou output sai desta máquina.</small>
      </div>
    </section>

    <section class="brain-news">
      <header><div><h2>O que muda para você</h2></div><span>canal público · funciona offline</span></header>
      ${news.length ? `<div class="brain-news-list">${news.map((entry) => `<article class="brain-news-entry">
        <div class="brain-news-meta"><span>${escapeHtml(communicationKind(entry.kind))}</span><time>${fmtDate(entry.published_at, false)}</time>${entry.release_version ? `<b>v${escapeHtml(entry.release_version)}</b>` : ''}</div>
        <h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.summary)}</p>
        ${entry.highlights?.length ? `<ul>${entry.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join('')}</ul>` : ''}
      </article>`).join('')}</div>` : '<p class="brain-clear-state">O canal local está sem comunicados públicos nesta versão.</p>'}
    </section>

    <section class="brain-releases">
      <header><div><h2>Cérebro e Sistemas evoluem em trilhas diferentes</h2></div><p>Atualizar o Cérebro não instala nem ativa um Sistema.</p></header>
      <div class="brain-release-board">
        <article class="brain-release-column">
          <header><div><span class="brain-release-mark">C</span><div><strong>Cérebro</strong><small>motor, cockpit e protocolos</small></div></div><b>${brainReleases.length} no histórico</b></header>
          ${brainReleases.length ? `<ol>${brainReleases.slice(0, 5).map((release) => `<li><div><span>v${escapeHtml(release.version)}</span><time>${fmtDate(release.published_at, false)}</time></div><strong>${escapeHtml(release.title)}</strong><p>${escapeHtml(release.summary)}</p></li>`).join('')}</ol>` : '<p class="brain-clear-state">Nenhum release local reconhecido.</p>'}
        </article>
        <article class="brain-release-column is-systems">
          <header><div><span class="brain-release-mark">S</span><div><strong>Sistemas</strong><small>resultados instaláveis da comunidade Vibe Makers</small></div></div><button type="button" data-view="vibe-makers">Abrir Vibe Makers →</button></header>
          ${systemReleases.length ? `<ol>${systemReleases.map((release) => `<li><div><span>v${escapeHtml(release.version)}</span><time>${escapeHtml(vibeMakersReleaseState(release.availability))}</time></div><strong>${escapeHtml(release.name)}</strong><p>${escapeHtml(release.channel ? `Canal ${release.channel}. A instalação continua separada do update do Cérebro.` : 'A instalação continua separada do update do Cérebro.')}</p></li>`).join('')}</ol>` : '<p class="brain-clear-state">Nenhum release de Sistema está visível para esta instalação.</p>'}
        </article>
      </div>
    </section>

    <section class="brain-update-grid brain-update-detail-grid">
      <article class="brain-update-card">
        <header><span>01</span><div><p class="micro">Cérebro da empresa</p><h3>Sua instalação privada</h3></div></header>
        <dl><div><dt>Versão</dt><dd>v${escapeHtml(installation.version)}</dd></div><div><dt>Brain Manifest</dt><dd>${installation.manifest_version ? `v${escapeHtml(installation.manifest_version)}` : 'não observado'}</dd></div><div><dt>Compatibilidade</dt><dd>${installation.compatibility_percent == null ? 'não medida' : `${brainCount(installation.compatibility_percent)}%`}</dd></div><div><dt>Canal</dt><dd>${managed ? 'gerenciado' : 'ainda não gerenciado'}</dd></div></dl>
        <p>${escapeHtml(unmanagedNote)}</p>
        ${managed ? '' : '<button type="button" class="text-action" data-view="compatibility">Ver conformidade antes da migração →</button>'}
      </article>

      <article class="brain-update-card">
        <header><span>02</span><div><p class="micro">Vibe Makers</p><h3>Catálogo distribuído com o motor</h3></div></header>
        <div class="brain-vibe-makers-version"><strong>v${escapeHtml(community.distribution_version)}</strong><span>${brainCount(community.visible)} no catálogo · ${brainCount(community.installed)} destes já ${community.installed === 1 ? 'está' : 'estão'} no Cérebro</span></div>
        <p>Novas fichas, contratos e releases publicados chegam no pacote do motor. Seus Sistemas instalados, grants, julgamentos e contexto continuam locais.</p>
        <button type="button" class="text-action" data-view="vibe-makers">Abrir catálogo da comunidade Vibe Makers →</button>
      </article>
    </section>

    <section class="brain-update-boundary"><div><p class="micro">Garantia de atualização</p><h3>Motor entra. Contexto não sai.</h3></div><ul><li>sem atualização silenciosa</li><li>release publicada obrigatória</li><li>caminhos do dono preservados</li><li>checkout Git nunca sobrescrito</li></ul></section>
  </div>`;
}

function renderAnatomy() {
  const anatomy = state.anatomy;
  if (!anatomy) {
    void loadAnatomy();
    return '<div class="loading"><i></i><span>Compilando contratos e recibos do Cérebro…</span></div>';
  }
  if (!anatomy.control_center) return `${renderBrainModeSwitch()}${empty('Centro operacional indisponível', 'Atualize o Console para recompilar este read model.')}`;
  const views = {
    overview: renderBrainOverview,
    memory: renderBrainMemory,
    recovery: renderBrainRecovery,
    learning: renderBrainLearning,
    architecture: renderBrainArchitecture,
    updates: renderBrainUpdates,
  };
  return `${renderBrainModeSwitch(anatomy)}${(views[state.brain.mode] || renderBrainOverview)(anatomy)}`;
}

function openBrainRun(runId) {
  const run = state.anatomy?.control_center?.recovery?.runs.find((entry) => entry.run_id === runId);
  if (!run) return;
  const expectedSources = run.expected.required_sources.length
    ? run.expected.required_sources.map((source) => `<li><div><strong>${escapeHtml(source.role || source.source_id)}</strong><span>${escapeHtml(source.source_id || 'Fonte sem id')}</span></div><small>${escapeHtml(source.freshness || 'frescor não declarado')}</small></li>`).join('')
    : '<li><span>Nenhuma Fonte obrigatória observada no contrato.</span></li>';
  const observedSources = run.observed.sources.length
    ? run.observed.sources.map((source) => `<li><div><strong>${escapeHtml(source.role || source.source_id)}</strong><span>${escapeHtml(source.source_id || 'Fonte sem id')}</span></div><small>${brainCount(source.selected_refs)} refs · ${escapeHtml(label(source.assurance))} · frescor ${source.freshness_observed ? 'marcado' : 'não verificável'}</small></li>`).join('')
    : '<li><span>Nenhuma Fonte observada no Context Snapshot.</span></li>';
  const issues = [...run.observed.gaps.map((item) => ({ ...item, kind: 'Gap' })), ...run.observed.conflicts.map((item) => ({ ...item, kind: 'Conflito' })), ...run.observed.fallbacks.map((item) => ({ ...item, kind: 'Fallback' }))];
  showDrawerShell(`<div class="drawer-head"><p class="eyebrow">CONTEXT SNAPSHOT · ${escapeHtml(run.system_id)}</p><h2>${escapeHtml(run.system_name)}</h2>${badge(run.integrity.state, integrityTone(run.integrity.state), integrityLabel(run.integrity.state))}<p>${fmtDate(run.completed_at || run.started_at)} · ${escapeHtml(run.run_id)}</p></div>
    <section class="drawer-section brain-run-contract"><h3>Contrato esperado</h3><p class="section-help">O que o System Contract exige antes da execução.</p><ul>${expectedSources}</ul><dl><div><dt>Fontes opcionais</dt><dd>${brainCount(run.expected.optional_sources)}</dd></div><div><dt>Evidência mínima</dt><dd>${run.expected.minimum_refs == null ? 'não declarada' : `${brainCount(run.expected.minimum_refs)} ref por claim`}</dd></div><div><dt>Condições de parada</dt><dd>${brainCount(run.expected.stop_conditions)}</dd></div><div><dt>Fallback</dt><dd>${run.expected.fallback_enabled ? 'permitido pelo contrato' : 'não permitido'}</dd></div></dl></section>
    <section class="drawer-section brain-run-observed"><h3>Contexto observado</h3><p class="section-help">Contagens e garantias do Run Record V2; conteúdo e referências privadas permanecem fechados.</p><ul>${observedSources}</ul><dl><div><dt>Referências</dt><dd>${brainCount(run.integrity.references)}</dd></div><div><dt>Marcadores de frescor</dt><dd>${brainCount(run.integrity.freshness_markers)}/${brainCount(run.integrity.accesses)}</dd></div><div><dt>Eval</dt><dd>${run.eval_passed == null ? 'pendente' : run.eval_passed ? 'passou' : 'falhou'}</dd></div><div><dt>Recuperação</dt><dd>${run.retrieval.mode === 'semantic-provider' ? escapeHtml(label(run.retrieval.decision || run.retrieval.status)) : 'coleta direta/contratual'}</dd></div></dl></section>
    <section class="drawer-section"><h3>Limitações declaradas</h3>${issues.length ? `<div class="brain-run-issues">${issues.map((item) => `<span><b>${escapeHtml(item.kind)}</b>${escapeHtml(item.source_role || 'contexto')} · ${escapeHtml(label(item.reason_code))}</span>`).join('')}</div>` : '<p class="brain-clear-state">Nenhum gap, conflito ou fallback registrado.</p>'}</section>
    <section class="drawer-section brain-run-privacy"><h3>Privacidade</h3><p>Query, conteúdo, snippets, referências selecionadas, hashes e erro bruto não foram enviados para esta vista.</p></section>`);
}

async function loadAnatomy() {
  try {
    state.anatomy = await getJson('/api/anatomy');
    if (state.brain.mode === 'architecture') void loadBrainGraph();
    if (state.view === 'anatomy') render();
  } catch { /* a view mostra loading; refresh recarrega */ }
}

async function loadBrainUpdates() {
  const updates = state.brain.updates;
  if (updates.loading) return;
  updates.loading = true;
  updates.error = null;
  try {
    updates.data = await getJson('/api/update');
  } catch (error) {
    updates.error = error.message;
  } finally {
    updates.loading = false;
    if (state.view === 'anatomy' && state.brain.mode === 'updates') render();
  }
}

async function checkBrainUpdates() {
  const updates = state.brain.updates;
  if (updates.checking || updates.applying) return;
  updates.checking = true;
  updates.error = null;
  render();
  try {
    updates.data = await mutate('/api/update/check', {});
    toast(updateRemoteCopy(updates.data.remote).label);
  } catch (error) {
    updates.error = error.message;
    toast(updateReasonCopy(error.message), 'bad');
  } finally {
    updates.checking = false;
    render();
  }
}

async function applyBrainUpdate() {
  const updates = state.brain.updates;
  const remote = updates.data?.remote;
  if (updates.applying || remote?.status !== 'update-available') return;
  const approval = await askConfirm({
    title: `Atualizar o motor para ${remote.tag}`,
    body: 'A release publicada substituirá somente arquivos do motor. Contexto, operação, configurações, contribuições e feedback do dono permanecem intactos. Depois será necessário reabrir o Console.',
    confirmLabel: 'Atualizar motor',
  });
  if (!approval) return;
  updates.applying = true;
  updates.error = null;
  render();
  try {
    updates.data = await mutate('/api/update/apply', { expected_tag: remote.tag });
    toast(`Motor atualizado para v${updates.data.last_update.installed_version}. Reabra o Console.`);
    await loadAnatomy();
  } catch (error) {
    updates.error = error.message;
    toast(updateReasonCopy(error.message), 'bad');
  } finally {
    updates.applying = false;
    render();
  }
}

async function loadBrainGraph() {
  if (state.brainGraph) return;
  try {
    state.brainGraph = await getJson('/api/graphs/brain');
    if (state.view === 'anatomy' && state.brain.mode === 'architecture') render();
  } catch { /* Arquitetura mantém o estado de mapa indisponível */ }
}

const DECISION_CATEGORIES = {
  experimento: '🧪 experimento em gate',
  escalacao: '🚨 exceção do loop',
  radar: '📡 sinal de mercado',
  persona: '🧭 revisão de persona',
  martelo: '🔨 martelo de negócio',
  curadoria: '🌱 curadoria/promoção',
  integracao: '🧩 integração semanal',
  preflight: '🌱 curadoria/promoção',
};
function decisionCategory(category) {
  return DECISION_CATEGORIES[category] || category;
}

// Vault de notas tipadas (layout.json com `vault`): o "agora" é foco, daily,
// projetos parados e inbox, não rotinas do protocolo.
function vaultList(items, emptyText) {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<div class="decision-list vault-list" role="list">${items.map((item, index) => `<div class="decision-row" role="listitem"><b>${index + 1}</b><div><strong>${escapeHtml(item.text)}</strong>${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ''}</div>${item.side ? `<span class="decision-age${item.late ? ' late' : ''}">${escapeHtml(item.side)}</span>` : '<span></span>'}</div>`).join('')}</div>`;
}

function renderVaultToday(vault) {
  const daily = vault.daily;
  const projects = vault.projects;
  const focus = vaultList(vault.focus.items.map((text) => ({ text })), 'Nenhum foco declarado. Crie hot.md ou a seção "Foco agora" no home.md.');
  const priorities = daily ? vaultList(daily.priorities.map((text) => ({ text })), 'A daily não tem seção "Prioridades".') : '<p class="muted">Nenhuma daily encontrada.</p>';
  const stale = vaultList(projects.stale.map((project) => ({
    text: project.title,
    meta: project.updated ? `atualizado em ${project.updated}` : 'sem campo updated',
    side: project.days === null ? '?' : `${project.days}d`,
    late: (project.days ?? Infinity) >= 30,
  })), 'Nenhum projeto ativo parado.');
  return `<div class="today-dashboard">
    <div class="today-column">
      <section class="today-block dashboard-panel" data-identity="indigo"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-today"/></svg></span>Foco</h3><span>${escapeHtml(vault.focus.ref || 'sem fonte')}</span></div><div class="panel-body">${focus}</div></section>
      <section class="today-block dashboard-panel" data-identity="violet"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-check"/></svg></span>${daily?.is_today ? 'Prioridades de hoje' : 'Prioridades da última daily'}</h3><span>${escapeHtml(daily?.ref || '')}</span></div><div class="panel-body">${priorities}</div></section>
    </div>
    <div class="today-column today-aside">
      <section class="today-block dashboard-panel" data-identity="orange"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-clock"/></svg></span>Projetos parados</h3><span>${projects.stale_total} de ${projects.active} ativos sem update há ${projects.stale_days}+ dias</span></div><div class="panel-body">${stale}${projects.stale_total > projects.stale.length ? `<p class="muted">Mais ${projects.stale_total - projects.stale.length} na weekly review.</p>` : ''}</div></section>
      ${vault.inbox ? `<section class="today-block dashboard-panel" data-identity="teal"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-inbox"/></svg></span>Inbox</h3><span>${escapeHtml(vault.inbox.ref)}</span></div><div class="panel-body"><p class="muted">${vault.inbox.count ? `${vault.inbox.count} captura(s) esperando triagem.` : 'Inbox vazio.'}</p><button type="button" class="action" data-view="files">Ver arquivos ${iconMarkup('arrow-right')}</button></div></section>` : ''}
    </div>
  </div>`;
}

function renderToday() {
  if (state.vaultToday) return renderVaultToday(state.vaultToday);
  const ids = [...state.model.today.needs_attention, ...state.model.today.ready_to_work, ...state.model.today.active];
  const routines = ids.map((id) => state.model.routines.find((routine) => routine.routine_id === id)).filter(Boolean).filter((routine) => inActiveOperatingArea(systemOperatingArea(routine.system_ref)));
  const pending = visibleJudgments().filter((item) => !item.imported && item.judgment.status === 'pending');
  const queue = state.decisions;
  const decisionRow = (item, index) => `<div class="decision-row" role="listitem">
      <b>${index + 1}</b>
      <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(decisionCategory(item.category))} · ${escapeHtml(item.first_seen)}</small></div>
      <span class="decision-age${item.age_days >= 30 ? ' overdue' : item.age_days >= 7 ? ' late' : ''}">${item.age_days}d${item.age_days >= 30 ? ' ⚖️' : item.age_days >= 7 ? ' ⏰' : ''}</span>
    </div>`;
  const decisionRows = queue?.available ? queue.open.slice(0, 5).map(decisionRow).join('') : '';
  const laterDecisions = queue?.available ? queue.open.slice(5) : [];
  const priorityRoutines = routines.slice(0, 4);
  const laterRoutines = routines.slice(4);
  return `<div class="today-dashboard${queue?.available || pending.length ? '' : ' is-single'}"><div class="today-column">
    ${queue?.available ? `<section class="today-block dashboard-panel" data-identity="orange"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-judgments"/></svg></span>Decidir agora</h3><span>${queue.open_count} abertas · ${queue.decided_total} decididas</span></div><div class="panel-body"><div class="decision-list" role="list">${decisionRows || '<p class="muted">Fila vazia — nada espera seu martelo.</p>'}</div>${laterDecisions.length ? `<details class="today-more"><summary>Ver mais ${laterDecisions.length} decisões${iconMarkup('chevron-down')}</summary><div class="decision-list" role="list">${laterDecisions.map((item, index) => decisionRow(item, index + 5)).join('')}</div></details>` : ''}<div class="boundary-note"><b>Uma fila, um juiz</b>O veredito acontece na mesa de martelo; o Console mostra a verdade, não a substitui.</div></div></section>` : ''}
    ${pending.length ? `<section class="today-block dashboard-panel" data-identity="rose"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-judgments"/></svg></span>Outputs para julgar</h3><span>${pending.length} pendentes</span></div><div class="panel-body">${judgmentList(pending)}</div></section>` : ''}  </div><div class="today-column today-aside">
    <section class="today-block dashboard-panel" data-identity="blue"><div class="subheading"><h3><span class="panel-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-play"/></svg></span>Trabalhar agora</h3><span>${routines.length} rotinas no radar</span></div><div class="panel-body"><div class="routine-list">${priorityRoutines.length ? priorityRoutines.map(routineCard).join('') : empty('Nenhuma rotina pede atenção', 'Rotinas ativas e prontas aparecem aqui.')}</div>${laterRoutines.length ? `<details class="today-more"><summary>Ver mais ${laterRoutines.length} rotinas${iconMarkup('chevron-down')}</summary><div class="routine-list">${laterRoutines.map(routineCard).join('')}</div></details>` : ''}</div></section>  </div></div>`;
}

function canvasRefOptions() {
  if (state.canvas.scope === 'system') {
    const byArea = new Map();
    for (const system of visibleSystems()) {
      const areaName = operatingAreaName(system.operating_area);
      if (!byArea.has(areaName)) byArea.set(areaName, []);
      byArea.get(areaName).push(system);
    }
    return [...byArea.entries()].map(([areaName, systems]) => `<optgroup label="${escapeHtml(areaName)}">${systems.map((system) => `<option value="${escapeHtml(system.system_id)}"${state.canvas.ref === system.system_id ? ' selected' : ''}>${escapeHtml(system.name)}</option>`).join('')}</optgroup>`).join('');
  }
  if (state.canvas.scope === 'run') {
    return allCanvasExecutions().map((execution) => `<option value="${escapeHtml(execution.selector_ref)}"${state.canvas.ref === execution.selector_ref ? ' selected' : ''}>${escapeHtml(execution.label)} · ${escapeHtml(execution.mode ? label(execution.mode) : 'Run')} · ${fmtDate(execution.completed_at)}</option>`).join('');
  }
  return '';
}

// Execuções de um sistema, prontas pro seletor do Canvas
function executionsForSystem(system) {
  const routineIds = new Set(state.model.routines.filter((routine) => refMatchesSystem(routine.system_ref, system)).map((routine) => routine.routine_id));
  const receipts = state.model.routines
    .filter((routine) => routineIds.has(routine.routine_id))
    .flatMap((routine) => routine.receipts.map((receipt) => ({
      selector_ref: receipt.receipt_id,
      label: routine.name,
      status: receipt.status,
      mode: 'replay',
      completed_at: receipt.completed_at,
    })));
  const receiptRunIds = new Set(state.model.routines.flatMap((routine) => routine.receipts.map((receipt) => receipt.run_id)));
  const standalone = (state.model.run_records || [])
    .filter((record) => refMatchesSystem(record.system_ref, system) && !receiptRunIds.has(record.run_id))
    .map((record) => ({
      selector_ref: record.run_record_ref,
      label: record.experiment_ref ? `${record.experiment_ref}` : label(record.mode || 'run'),
      status: record.status === 'completed' ? 'completed' : record.status,
      mode: record.mode,
      completed_at: record.completed_at,
    }));
  return [...receipts, ...standalone].sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at));
}

// Cockpit do Sistema — o centro de comando sob o mapa: números reais,
// execuções clicáveis e as portas (detalhes, manifest, interface própria).
function systemCockpit(system) {
  const executions = executionsForSystem(system);
  const judgments = state.model.judgments.filter((item) => refMatchesSystem(item.system_ref, system));
  const approved = judgments.filter((item) => item.judgment.status === 'approved' || item.judgment.verdict === 'approved').length;
  const pending = judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length;
  const routines = state.model.routines.filter((routine) => refMatchesSystem(routine.system_ref, system));
  const experiments = (state.model.experiments || []).filter((experiment) => refMatchesSystem(experiment.system_ref, system));
  const lastRun = executions[0]?.completed_at;
  return `<div class="system-cockpit">
    <div class="cockpit-stats">
      <span><b>${executions.length}</b> execuções</span>
      <span><b>${approved}</b> aprovadas${pending ? ` · <b class="warn-text">${pending}</b> pendentes` : ''}</span>
      <span><b>${routines.length}</b> rotinas</span>
      <span><b>${experiments.length}</b> experimentos</span>
      <span><b>${lastRun ? fmtDate(lastRun) : '—'}</b> última execução</span>
      <span class="cockpit-actions">
        <button class="canvas-tool" data-open-system="${escapeHtml(system.system_id)}">Detalhes</button>
        ${system.source_manifest_ref ? `<button class="canvas-tool" data-copy-ref="${escapeHtml(system.source_manifest_ref)}" title="Copiar caminho do manifest">Manifest ${iconMarkup('copy')}</button>` : ''}
        ${system.interface_ref ? `<a class="canvas-tool replay" href="${system.interface_ref.startsWith('http') ? escapeHtml(system.interface_ref) : `/files/${encodeURIComponent(system.interface_ref)}`}" target="_blank" rel="noopener">Abrir interface ${iconMarkup('external-link')}</a>` : ''}
      </span>
    </div>
    ${executions.length ? `<div class="cockpit-execs"><p class="micro">EXECUÇÕES · ${executions.length} — clique para abrir o trace</p>${executions.slice(0, 12).map((execution) => `<button type="button" class="cockpit-exec" data-canvas-jump-run="${escapeHtml(execution.selector_ref)}"><i class="health-dot ${tone(execution.status)}"></i><strong>${escapeHtml(execution.label)}</strong><small>${escapeHtml(label(execution.mode || '—'))}</small><small>${fmtDate(execution.completed_at)}</small><b>→</b></button>`).join('')}${executions.length > 12 ? `<p class="muted">+ ${executions.length - 12} anteriores na aba Execuções</p>` : ''}</div>` : '<p class="section-help">Nenhuma execução registrada ainda — o primeiro run aparece aqui com trace clicável.</p>'}
  </div>`;
}

const TIMING_LABELS = {
  collector: 'Coleta', retrieval: 'Contexto', capability: 'Execução / modelo',
  model: 'Modelo', output: 'Entrega', eval: 'Avaliação', judgment: 'Julgamento',
};

function runTimingPanel(graph) {
  const timing = graph.trace_timing;
  if (!timing) return '';
  if (timing.assurance === 'total-only') return `<div class="run-timing-head"><div><p class="micro">Tempo do Run</p><strong>${fmtDuration(timing.total_duration_ms)}</strong></div><span>total disponível</span></div><p class="run-timing-limited">Trace reconstruído: não existe granularidade suficiente para atribuir duração às etapas.</p>`;
  const measured = timing.coverage_ratio > 0.999 ? '≈100' : String(Math.round((timing.coverage_ratio || 0) * 100));
  const rows = timing.critical_path.map((stage) => {
    const share = stage.duration_ms === null ? 0 : Math.max(0, (stage.share_of_total || 0) * 100);
    const shareLabel = share < 0.1 ? share.toFixed(3) : share.toFixed(1);
    const dominant = stage.step_id === timing.dominant_step_id;
    return `<button type="button" class="run-timing-row${dominant ? ' dominant' : ''}" ${stage.node_id ? `data-canvas-inspect-node="${escapeHtml(stage.node_id)}"` : 'disabled'}>
      <progress max="100" value="${share}" aria-label="${shareLabel}% do tempo total"></progress>
      <b>${escapeHtml(TIMING_LABELS[stage.step_type] || label(stage.step_type))}</b>
      <strong>${stage.duration_ms === null ? escapeHtml(label(stage.state)) : fmtDuration(stage.duration_ms)}</strong>
    </button>`;
  }).join('');
  const model = timing.nested_stages.find((stage) => stage.step_type === 'model');
  const modelNote = model
    ? `<button type="button" class="run-timing-model" ${model.node_id ? `data-canvas-inspect-node="${escapeHtml(model.node_id)}"` : 'disabled'}><span>↳ Modelo</span><b>${model.duration_ms === null ? 'duração não separada neste trace' : fmtDuration(model.duration_ms)}</b></button>`
    : '';
  return `<div class="run-timing-head"><div><p class="micro">Tempo do Run</p><strong>${fmtDuration(timing.total_duration_ms)}</strong></div><span>${measured}% medido pelo trace</span></div><div class="run-timing-bars">${rows}</div>${modelNote}<div class="run-timing-foot"><span>${timing.dominant_step_id ? `Gargalo: ${escapeHtml(TIMING_LABELS[timing.critical_path.find((stage) => stage.step_id === timing.dominant_step_id)?.step_type] || timing.dominant_step_id)}` : 'Sem etapa dominante'}</span><b>${fmtDuration(timing.unattributed_duration_ms)} entre etapas</b></div>`;
}

function renderCanvas() {
  const hasRef = state.canvas.scope !== 'brain';
  const areaTitle = state.canvas.scope === 'brain' ? 'Mapa da Empresa'
    : state.canvas.scope === 'system' ? (state.model.systems.find((system) => system.system_id === state.canvas.ref)?.name || 'Sistema')
      : 'Execução';
  const cockpitSystem = state.canvas.scope === 'system' && state.canvas.ref
    ? state.model.systems.find((system) => system.system_id === state.canvas.ref) : null;
  return `<div class="canvas-page${cockpitSystem ? ' with-cockpit' : ''}">
    <div class="canvas-stage-shell">
      <div class="canvas-graph-pane">
        <div class="canvas-toolbar" role="toolbar" aria-label="Controles do Canvas">
        <div class="canvas-segmented" aria-label="Escala do mapa">
          <button data-canvas-scope="brain" class="${state.canvas.scope === 'brain' ? 'active' : ''}">Mapa da empresa</button>
          <button data-canvas-scope="system" class="${state.canvas.scope === 'system' ? 'active' : ''}">Sistema</button>
          <button data-canvas-scope="run" class="${state.canvas.scope === 'run' ? 'active' : ''}">Execução</button>
        </div>
        ${hasRef ? `<label class="canvas-select-label"><span>${state.canvas.scope === 'system' ? 'Sistema' : 'Execução real'}</span><select id="canvas-ref">${canvasRefOptions()}</select></label>` : ''}
        ${state.canvas.scope === 'run' ? '<button class="canvas-tool replay" data-canvas-replay disabled aria-describedby="replay-availability">▶ Reproduzir trace</button><span id="replay-availability" class="replay-availability">Confirmando eventos registrados…</span>' : ''}
        <button class="canvas-tool" data-canvas-zoom="out" aria-label="Diminuir zoom">−</button>
        <button class="canvas-tool" data-canvas-zoom="in" aria-label="Aumentar zoom">+</button>
        <button class="canvas-tool" data-canvas-fit>Mapa inteiro</button>
        <button class="canvas-tool ${state.canvas.editable ? 'active' : ''}" data-canvas-edit>${state.canvas.editable ? 'Bloquear' : 'Reorganizar'}</button>
        <button class="canvas-tool primary" data-canvas-save disabled>Salvar</button>
        <span class="canvas-movement-hint">Arraste o fundo para mover o mapa.</span>
      </div>
        <div class="canvas-viewport">
        <div class="canvas-ambient one"></div><div class="canvas-ambient two"></div>
        <canvas id="canvas-particles" class="canvas-particles"></canvas>
        <div class="canvas-area-title">${escapeHtml(areaTitle)}</div>
        <div id="operational-canvas" class="operational-canvas"><div class="loading"><i></i><span>Compilando grafo local…</span></div></div>
        <div id="canvas-origin" class="canvas-origin"></div>
        <section id="run-timing" class="run-timing" hidden aria-label="Duração por etapa do Run"></section>
        <div class="canvas-legend" aria-label="Legenda de estados">
          <span class="declared"><i></i>Declarado</span><span class="running"><i></i>Executando</span><span class="completed"><i></i>Concluído</span><span class="gap"><i></i>Lacuna</span><span class="failed"><i></i>Falhou</span>
        </div>
        ${hasRef ? `<div class="canvas-nav-pill" role="navigation" aria-label="Trocar referência"><button data-canvas-cycle="-1" aria-label="Anterior">${iconMarkup('chevron-left')}</button><span>${escapeHtml(areaTitle)}</span><button data-canvas-cycle="1" aria-label="Próximo">${iconMarkup('chevron-right')}</button></div>` : ''}
      </div>
      </div>
      <aside id="canvas-inspector" class="canvas-inspector"><p class="micro">Detalhes do objeto</p><h3>Selecione um nó</h3><p>Fontes são casas de verdade. Etapas são contrato. Artefatos são os objetos que realmente atravessaram uma execução.</p></aside>
    </div>
    ${cockpitSystem ? systemCockpit(cockpitSystem) : ''}
    <details class="canvas-accessible"><summary>Ver equivalente em lista</summary><div id="canvas-list"></div></details>
    <div class="boundary-note"><b>Layout ≠ arquitetura</b>Reorganizar salva apenas coordenadas privadas nesta máquina. Criar ou remover Fonte, Sistema, gate ou aresta continua exigindo mudança de contrato.</div>
  </div>`;
}

function renderJudgments() {
  const all = visibleJudgments();
  const imported = all.filter((item) => item.imported);
  const active = all.filter((item) => !item.imported);
  const pending = active.filter((item) => item.judgment.status === 'pending');
  const decided = active.filter((item) => item.judgment.status !== 'pending');
  const isImported = state.judgmentTab === 'imported';
  return `<div class="section-heading"><div><h2>Revisão de entregas</h2><p>Leia o resultado e avalie sua qualidade. As tarefas citadas mantêm seus próprios estados.</p></div></div>
    <div class="tabstrip review-tabs" role="tablist" aria-label="Origem das entregas">
      <button role="tab" data-judgment-tab="active" class="${isImported ? '' : 'active'}" aria-selected="${!isImported}">Entregas novas <b>${pending.length}</b></button>
      <button role="tab" data-judgment-tab="imported" class="${isImported ? 'active' : ''}" aria-selected="${isImported}">Histórico importado <b>${imported.length}</b></button>
    </div>
    ${isImported
      ? `<p class="section-help">Registros anteriores trazidos do journal ou de outras rotinas. Não representam novas entregas aguardando aprovação.</p><div class="judgment-section">${imported.length ? judgmentList(imported) : empty('Nenhum histórico importado', 'Registros importados aparecerão aqui para consulta.')}</div>`
      : `<div class="judgment-section"><div class="subheading"><h3>Para revisar</h3><span>${pending.length}</span></div>${pending.length ? judgmentList(pending) : empty('Nenhuma entrega nova para revisar', imported.length ? 'Os registros anteriores continuam disponíveis na aba Histórico importado.' : 'A próxima entrega concluída aparecerá aqui.')}</div>
         <div class="judgment-section"><div class="subheading"><h3>Revisões registradas</h3><span>${decided.length}</span></div>${decided.length ? judgmentList(decided) : '<p class="muted">Nenhuma revisão de entrega nova registrada.</p>'}</div>`}`;
}

function areaKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Estrutura › Áreas mostra uma lista só: as áreas do vault somadas às áreas operacionais
// dos Sistemas. Área que existe nos dois lados aparece uma vez, com os projetos do vault e
// os Sistemas que rodam nela.
function mergedAreas(vaultAreas, systemAreas) {
  const merged = [];
  const byKey = new Map();
  for (const area of vaultAreas || []) {
    const entry = {
      key: areaKey(area.slug || area.title),
      operating_area: area.slug || areaKey(area.title),
      name: area.title,
      status: area.status || null,
      ref: area.ref || null,
      active_projects: Number.isFinite(area.active_projects) ? area.active_projects : 0,
      system_refs: [],
      routine_refs: [],
      origin: 'vault',
    };
    if (byKey.has(entry.key)) continue;
    byKey.set(entry.key, entry);
    merged.push(entry);
  }
  for (const area of systemAreas || []) {
    const match = byKey.get(areaKey(area.operating_area)) || byKey.get(areaKey(area.name));
    const target = match || {
      key: areaKey(area.operating_area),
      operating_area: area.operating_area,
      name: area.name,
      status: null,
      ref: null,
      active_projects: null,
      system_refs: [],
      routine_refs: [],
      origin: 'system',
    };
    target.operating_area = area.operating_area;
    target.ref = target.ref || area.ref || null;
    target.system_refs = [...new Set([...target.system_refs, ...(area.system_refs || [])])];
    target.routine_refs = [...new Set([...target.routine_refs, ...(area.routine_refs || [])])];
    if (match) {
      target.origin = 'both';
      continue;
    }
    byKey.set(target.key, target);
    merged.push(target);
  }
  return merged;
}

function areaCard(area) {
  const systems = area.system_refs || [];
  const routines = area.routine_refs || [];
  const counts = [
    area.active_projects == null ? null : `${area.active_projects} projeto(s) ativo(s)`,
    `${systems.length} sistema(s)`,
    routines.length ? `${routines.length} rotina(s)` : null,
  ].filter(Boolean);
  return `<button type="button" class="object-card area-card" data-kind="area" data-identity="${identityForKey(area.operating_area || area.key)}" data-area-origin="${escapeHtml(area.origin || 'declared')}" data-operating-area-filter="${escapeHtml(area.operating_area || area.key)}"><span class="area-card-heading"><i class="area-identity" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-areas"/></svg></i><strong class="area-card-title">${escapeHtml(area.name)}</strong></span><span class="area-card-meta">${escapeHtml(counts.join(' · '))}</span><span class="area-card-action">Abrir área ${iconMarkup('arrow-right')}</span></button>`;
}

function renderAreas() {
  const areas = mergedAreas(state.vaultToday?.areas, state.model.areas);
  return `<div class="section-heading"><div><h2>Áreas responsáveis</h2></div><p>Abra uma área para consultar sua nota, arquivos relacionados e Sistemas declarados.</p></div><div class="object-grid">${areas.map(areaCard).join('') || empty('Nenhuma área declarada', 'Notas de área e contratos de Sistemas aparecem aqui quando disponíveis.')}</div>`;
}

/* Local reading: lists contain safe metadata; text requires an explicit opening. */
function localReadStatus(slot, retryAttribute) {
  if (slot.loading || !slot.loaded) return '<p class="local-read-status" role="status">Lendo referências locais…</p>';
  if (slot.error) return `<div class="local-read-status" role="status"><p>Não foi possível ler os arquivos locais.</p><button class="action" type="button" ${retryAttribute}>Tentar novamente</button></div>`;
  return '';
}

function renderFileRows(files) {
  return `<ul class="local-file-list">${files.map((file) => `<li><button type="button" data-open-local-file="${escapeHtml(file.ref)}"><strong>${escapeHtml(file.title)}</strong><span>${escapeHtml(file.type || 'Markdown')} · ${escapeHtml(file.ref)}</span></button><time>${file.updated ? fmtDate(file.updated, false) : 'Sem data'}</time></li>`).join('')}</ul>`;
}

function renderFilePagination(slot, attribute) {
  const data = slot.data;
  if (!data || data.total <= data.limit) return '';
  return `<div class="local-pagination"><span>${data.offset + 1}–${Math.min(data.offset + data.limit, data.total)} de ${data.total} arquivos</span><div><button class="action" type="button" ${attribute}="${Math.max(0, data.offset - data.limit)}" ${data.offset === 0 ? 'disabled' : ''}>Anterior</button><button class="action" type="button" ${attribute}="${data.offset + data.limit}" ${data.offset + data.limit >= data.total ? 'disabled' : ''}>Próxima</button></div></div>`;
}

function renderAreaWorkspace() {
  const area = mergedAreas(state.vaultToday?.areas, state.model.areas).find((item) => item.operating_area === state.operatingAreaFilter);
  if (!area) return empty('Área indisponível', 'Escolha uma área no menu ou volte para Toda a empresa.');
  const slot = state.areaFiles;
  if (!slot.loaded && !slot.loading) void loadLocalFiles(true);
  const systems = visibleSystems();
  const data = slot.data;
  return `<div class="local-workspace-head"><div><h2>${escapeHtml(area.name)}</h2><p>Contexto e relações declaradas nos arquivos locais.</p></div><button type="button" class="action" data-operating-area-filter="">Ver todas as áreas</button></div>
    <section class="local-section"><h3>Nota da área</h3>${area.ref ? `<button type="button" class="action" data-open-local-file="${escapeHtml(area.ref)}">Abrir nota da área</button>` : '<p class="muted">Esta área não tem nota própria declarada.</p>'}</section>
    <section class="local-section"><div class="local-section-heading"><h3>Projetos e arquivos relacionados${data ? ` · ${data.total}` : ''}</h3><button type="button" class="action" data-area-files>Ver nos Arquivos</button></div><p class="section-help">Somente a nota da área e vínculos explícitos nos arquivos. Relações ausentes permanecem em branco.</p>${localReadStatus(slot, 'data-local-retry="area"') || (data?.available === false ? empty('Arquivos indisponíveis', 'A pasta local ainda não está disponível para leitura.') : data?.files.length ? renderFileRows(data.files) + renderFilePagination(slot, 'data-area-files-page') : empty('Nenhum arquivo relacionado', 'Nenhum vínculo explícito com esta área foi encontrado.'))}</section>
    <section class="local-section"><h3>Sistemas · ${systems.length}</h3>${systems.length ? `<div class="local-system-list">${systems.map((system) => `<button type="button" class="action" data-open-system="${escapeHtml(system.system_id)}">${escapeHtml(system.name)}</button>`).join('')}</div>` : '<p class="muted">Nenhum Sistema declara esta área como responsável.</p>'}</section>`;
}

function renderFileBreadcrumbs(directory) {
  const parts = directory.split('/').filter((part) => part && part !== '.');
  return `<nav class="local-breadcrumbs" aria-label="Pasta atual"><button type="button" data-local-directory="">Arquivos</button>${parts.map((part, index) => `<span aria-hidden="true">/</span><button type="button" data-local-directory="${escapeHtml(parts.slice(0, index + 1).join('/'))}" ${index === parts.length - 1 ? 'aria-current="location"' : ''}>${escapeHtml(part)}</button>`).join('')}</nav>`;
}

function renderFiles() {
  const slot = state.files;
  if (!slot.loaded && !slot.loading) void loadLocalFiles();
  const data = slot.data;
  return `<form class="local-file-search" data-local-file-search><label>Buscar pelo título<input name="q" type="search" maxlength="200" value="${escapeHtml(slot.query)}" placeholder="Título do arquivo"></label><label>Área<select name="area"><option value="">Toda a empresa</option>${state.model.areas.map((area) => `<option value="${escapeHtml(area.operating_area)}" ${area.operating_area === state.operatingAreaFilter ? 'selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}</select></label><label>Tipo<input name="type" maxlength="80" value="${escapeHtml(slot.type)}" placeholder="Qualquer tipo"></label><button type="submit" class="action primary">Buscar</button></form>
    <p class="section-help">Busca por título na pasta e subpastas. O conteúdo abre somente quando você escolhe um arquivo.</p>
    ${renderFileBreadcrumbs(data?.directory ?? slot.directory)}
    ${localReadStatus(slot, 'data-local-retry="files"') || (data?.available === false ? empty('Pasta indisponível', 'A pasta local ainda não está disponível para leitura.') : `<div class="local-folders">${data?.parent_ref != null ? `<button type="button" class="action" data-local-directory="${escapeHtml(data.parent_ref)}">Pasta anterior</button>` : ''}${(data?.folders || []).map((folder) => `<button type="button" class="action" data-local-directory="${escapeHtml(folder.ref)}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 7h6l2 2h10v11H3Z"/><path d="M3 7V4h7l2 3h9v2"/></svg>${escapeHtml(folder.name)}</button>`).join('')}</div>${data?.files.length ? renderFileRows(data.files) + renderFilePagination(slot, 'data-local-files-page') : empty('Nenhum arquivo encontrado', slot.query || slot.type || state.operatingAreaFilter ? 'Ajuste o título, o tipo ou a área e tente novamente.' : 'Abra uma pasta para continuar a navegação.')}`)}`;
}

async function loadLocalFiles(forArea = false) {
  const slot = forArea ? state.areaFiles : state.files;
  const view = forArea ? 'area' : 'files';
  const area = state.operatingAreaFilter;
  const request = ++slot.request;
  slot.loading = true;
  slot.error = false;
  const params = new URLSearchParams({ dir: forArea ? '' : slot.directory, q: forArea ? '' : slot.query, area, type: forArea ? '' : slot.type, offset: String(slot.offset), limit: String(slot.limit) });
  try {
    const data = await getJson(`/api/local-files?${params}`);
    if (slot.request !== request || state.view !== view || state.operatingAreaFilter !== area) return;
    slot.data = data;
  } catch {
    if (slot.request !== request || state.view !== view || state.operatingAreaFilter !== area) return;
    slot.data = null;
    slot.error = true;
  } finally {
    if (slot.request === request) {
      slot.loading = false;
      slot.loaded = state.view === view && state.operatingAreaFilter === area;
      if (slot.loaded) render();
    }
  }
}

async function openLocalFile(ref) {
  const previous = state.noteWorkspace;
  if (previous) {
    if (!await previous.requestLeave() || state.noteWorkspace !== previous) return;
  }
  closeDrawer({ force: true });
  state.selectedLocalFile = ref;
  const request = ++state.localFileRequest;
  const view = state.view;
  const area = state.operatingAreaFilter;
  const current = () => state.localFileRequest === request && state.selectedLocalFile === ref && state.view === view && state.operatingAreaFilter === area;
  showDrawerShell('<div class="local-read-status" role="status">Abrindo nota local…</div>');
  document.body.classList.add('note-workspace-open');
  try {
    const file = await getJson(`/api/local-files/content?ref=${encodeURIComponent(ref)}`);
    if (!current()) return;
    const module = await loadNoteWorkspace();
    if (!current()) return;
    renderMarkup($('#drawer-content'), '<div id="note-workspace-mount"></div>');
    state.noteWorkspace = module.mountNoteWorkspace($('#note-workspace-mount'), {
      file,
      onSave: payload => mutate('/api/local-files/content', payload),
      confirmDiscard: async () => Boolean(await askConfirmation({ title: 'Descartar alterações desta nota?', body: 'As alterações ainda não salvas serão descartadas. O arquivo no cérebro permanece como está.', confirmLabel: 'Descartar alterações', tone: 'danger' })),
      onReload: () => openLocalFile(ref),
      onSaved: () => { state.files.loaded = false; state.areaFiles.loaded = false; toast('Nota salva no cérebro.'); },
      onNavigate: async target => {
        const opened = state.noteWorkspace;
        if (!opened || opened.getState().busy || !current()) return;
        try {
          const link = await getJson(`/api/local-files/resolve?from=${encodeURIComponent(ref)}&target=${encodeURIComponent(target)}`);
          if (!current() || state.noteWorkspace !== opened) return;
          await openLocalFile(link.ref);
          if (link.anchor && state.selectedLocalFile === link.ref) {
            const canonical = value => value.normalize('NFKC').trim().toLocaleLowerCase();
            const heading = [...($('#note-workspace-mount')?.querySelectorAll('h1,h2,h3,h4,h5,h6') || [])].find(node => canonical(node.textContent) === canonical(link.anchor));
            heading?.scrollIntoView({ block: 'start' });
          }
        } catch(error) {
          if (current()) toast(error.message === 'local-note-link-ambiguous' ? 'Há mais de uma nota com esse nome. Use o caminho completo.' : error.message === 'local-note-link-incomplete' ? 'A busca atingiu o limite de arquivos. Use o caminho completo da nota.' : 'A nota desse link não foi encontrada ou não permite leitura.', 'bad');
        }
      },
    });
  } catch {
    if (!current()) return;
    renderMarkup($('#drawer-content'), empty('Nota indisponível', 'O arquivo pode ter mudado ou não permitir leitura. Feche e atualize a lista para tentar novamente.'));
  }
}

function activeNoteWorkspace() {
  return state.library?.controller?.getActiveNote?.() || state.noteWorkspace;
}

function disposeLibraryView() {
  const library = state.library;
  if (!library) return;
  library.request++;
  library.loading = false;
  if (library.controller) {
    library.snapshot = library.controller.getSnapshot();
    library.controller.dispose();
    library.controller = null;
  }
}

async function mountLibraryView() {
  const library = state.library;
  const host = $('#library-mount');
  if (!library || !host || state.view !== 'files') return;
  if (library.controller) {
    if (library.area !== state.operatingAreaFilter) {
      library.area = state.operatingAreaFilter;
      await library.controller.setArea(library.area);
    }
    return;
  }
  if (library.loading) return;
  library.loading = true;
  const request = ++library.request;
  const area = state.operatingAreaFilter;
  const current = () => state.view === 'files' && library.request === request && host.isConnected && $('#library-mount') === host;
  try {
    const module = await loadLibraryWorkspace();
    if (!current()) return;
    library.area = state.operatingAreaFilter;
    library.controller = module.mountLibraryWorkspace(host, {
      area: library.area, initialSnapshot: library.snapshot,
      loadFiles: options => getJson(`/api/local-files?${new URLSearchParams({ mode: 'library', dir: options.directory || '', q: options.query || '', type: options.type || '', tag: options.tag || '', area: options.area || '', sort: options.sort || 'title', search: options.search || 'content', offset: String(options.offset || 0), limit: String(options.limit || 50) })}`),
      readNote: ref => getJson(`/api/local-files/content?ref=${encodeURIComponent(ref)}`),
      saveNote: async payload => { const result = await mutate('/api/local-files/content', payload); state.files.loaded = false; state.areaFiles.loaded = false; toast('Nota salva no cérebro.'); return result; },
      resolveLink: ({ from_ref, target }) => getJson(`/api/local-files/resolve?from=${encodeURIComponent(from_ref)}&target=${encodeURIComponent(target)}`),
      loadBacklinks: ({ ref, offset, limit }) => getJson(`/api/local-files/backlinks?${new URLSearchParams({ ref, offset, limit })}`),
      loadAttachments: ({ from_ref }) => getJson(`/api/local-files/attachments?from=${encodeURIComponent(from_ref)}`),
      attachmentUrl: ({ from_ref, target }) => `/api/local-files/attachment?${new URLSearchParams({ from: from_ref, target })}`,
      checkAttachment: async ({ from_ref, target }) => { const response = await fetch(`/api/local-files/attachment?${new URLSearchParams({ from: from_ref, target })}`, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw new Error('not-found'); },
      confirmDiscard: async () => Boolean(await askConfirmation({ title: 'Descartar alterações desta nota?', body: 'As alterações ainda não salvas serão descartadas. O arquivo no cérebro permanece como está.', confirmLabel: 'Descartar alterações', tone: 'danger' })),
      onSnapshot: snapshot => { if (current()) library.snapshot = snapshot; },
    });
    if (state.operatingAreaFilter !== area) {
      library.area = state.operatingAreaFilter;
      await library.controller.setArea(library.area);
    }
  } catch {
    if (current()) renderMarkup(host, empty('Cérebro indisponível', 'Não foi possível abrir as notas do cérebro. Atualize a página para tentar novamente.'));
  } finally { if (library.request === request) library.loading = false; }
}

function metricPeriod(period) {
  if (!period) return 'Período não declarado';
  if (typeof period === 'string') return period;
  const start = period.start || period.start_date || period.started_at || period.from;
  const end = period.end || period.end_date || period.ended_at || period.to;
  const interval = [start, end].filter(Boolean).join(' → ');
  return [...new Set([period.label, interval, period.kind || period.mode, period.cycle_ref, period.edition_ref].filter(Boolean))].join(' · ') || 'Período não declarado';
}

function metricValue(value) {
  return value == null ? 'Sem leitura' : typeof value === 'number' ? new Intl.NumberFormat('pt-BR').format(value) : String(value);
}

function metricScope(scope) {
  return [
    scope?.area_ref ? `Área: ${scope.area_ref}` : null,
    scope?.system_ref ? `Sistema: ${scope.system_ref}` : null,
    scope?.workflow_refs?.length ? `Fluxos: ${scope.workflow_refs.join(', ')}` : null,
    scope?.subject?.ref ? `${scope.subject.kind || 'Objeto'}: ${scope.subject.ref}` : null,
  ].filter(Boolean).join(' · ');
}

function metricSources(metric) {
  const refs = [...new Set([metric.source_ref, ...(metric.source_refs || [])].filter(Boolean))];
  return refs.length ? refs.map((ref) => `<code>${escapeHtml(ref)}</code>`).join(' · ') : 'Não declarada';
}

// Async list completion replaces its controls; retain the operator's keyboard focus.
function renderLocalWorkspace() {
  const active = document.activeElement;
  const selectors = { metricFilter: '[data-metric-filter]', inboxUnread: '[data-inbox-unread]', inboxRead: '[data-inbox-read]', inboxSource: '[data-inbox-source]', inboxPage: '[data-inbox-page]', inboxRetry: '[data-inbox-retry]' };
  const key = Object.keys(selectors).find((name) => active?.dataset?.[name] != null);
  const value = key ? active.dataset[key] : null;
  render();
  if (!key) return;
  let replacement = [...(document.querySelectorAll?.(selectors[key]) || [])].find((element) => element.dataset[key] === value);
  if (replacement?.disabled && key === 'inboxRead') replacement = [...(document.querySelectorAll?.('[data-inbox-source]') || [])].find((element) => element.dataset.inboxSource === value);
  if (!replacement && (key === 'inboxRead' || key === 'inboxSource' || key === 'inboxPage')) replacement = document.querySelector?.('[data-inbox-unread]');
  replacement?.focus();
}

function metricFraction(value) {
  if (value == null) return 'Não declarado';
  if (typeof value === 'number') return escapeHtml(metricValue(value));
  const identity = [value.label, value.key && value.key !== value.label ? value.key : null].filter(Boolean).join(' · ');
  return `${identity ? `<span>${escapeHtml(identity)}</span>` : ''}${value.value == null ? '<span>Sem valor declarado</span>' : `<span>${escapeHtml(metricValue(value.value))}</span>`}${value.definition ? `<small>${escapeHtml(value.definition)}</small>` : ''}`;
}

function metricFilters() {
  const slot = state.metrics;
  const choices = slot.data?.filters || {};
  const select = (key, title, values) => `<label>${title}<select data-metric-filter="${key}"><option value="">Todos</option>${[...new Set([...(values || []), slot[key]].filter(Boolean))].map((value) => `<option value="${escapeHtml(value)}"${slot[key] === value ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label>`;
  return `<div class="metric-filters" aria-label="Filtrar indicadores">${select('system', 'Sistema', choices.systems)}${select('workflow', 'Fluxo', choices.workflows)}</div>`;
}

function renderMetrics() {
  const slot = state.metrics;
  if (!slot.loaded && !slot.loading) void loadBusinessMetrics();
  const filters = metricFilters();
  if (slot.loading || !slot.loaded) return `${filters}<p class="local-read-status" role="status">Lendo indicadores existentes…</p>`;
  if (slot.error) return `${filters}<div class="local-read-status" role="status"><p>Não foi possível ler os indicadores locais.</p><button type="button" class="action" data-local-retry="metrics">Tentar novamente</button></div>`;
  const metrics = slot.data?.metrics || [];
  return `${filters}<p class="section-help">Indicadores do negócio definidos nos arquivos locais. Cada leitura mantém seu período e sua origem.</p>${metrics.length ? `<div class="business-metrics">${metrics.map((metric) => `<article class="business-metric"><header><div><h2>${escapeHtml(metric.name || metric.id)}</h2><p>${escapeHtml(metric.definition || 'Definição não declarada')}</p><p class="business-metric-scope">${escapeHtml(metricScope(metric.scope) || 'Escopo não declarado')}</p></div><div class="business-metric-value"><strong>${escapeHtml(metricValue(metric.current))}</strong><span>${escapeHtml(metric.unit || 'Unidade não declarada')}</span></div></header><dl><div><dt>Período</dt><dd>${escapeHtml(metricPeriod(metric.period))}</dd></div><div><dt>Meta</dt><dd>${metric.goal == null ? 'Não declarada' : escapeHtml(metricValue(metric.goal))}</dd></div><div><dt>Origem</dt><dd>${metricSources(metric)}</dd></div><div><dt>Numerador</dt><dd class="metric-fraction">${metricFraction(metric.numerator)}</dd></div><div><dt>Denominador</dt><dd class="metric-fraction">${metricFraction(metric.denominator)}</dd></div><div><dt>Atribuição declarada</dt><dd>${escapeHtml(metric.attribution ?? 'Não declarada')}</dd></div></dl>${metric.history?.length ? `<details><summary>Histórico · ${metric.history.length}</summary><div class="table-wrap"><table class="metric-history"><thead><tr><th>Período</th><th>Leitura</th><th>Unidade</th><th>Meta</th><th>Numerador</th><th>Denominador</th><th>Atribuição declarada</th><th>Escopo</th><th>Registrado em</th><th>Origem</th></tr></thead><tbody>${metric.history.map((item) => `<tr><td>${escapeHtml(metricPeriod(item.period))}</td><td>${escapeHtml(metricValue(item.value))}</td><td>${escapeHtml(item.unit || 'Não declarada')}</td><td>${item.goal == null ? 'Não declarada' : escapeHtml(metricValue(item.goal))}</td><td class="metric-fraction">${metricFraction(item.numerator)}</td><td class="metric-fraction">${metricFraction(item.denominator)}</td><td>${escapeHtml(item.attribution ?? 'Não declarada')}</td><td>${escapeHtml(metricScope(item.scope) || 'Escopo não declarado')}</td><td>${item.observed_at ? fmtDate(item.observed_at) : 'Sem data'}</td><td>${metricSources(item)}</td></tr>`).join('')}</tbody></table></div></details>` : '<p class="muted">Nenhuma leitura histórica registrada.</p>'}</article>`).join('')}</div>` : empty('Nenhum indicador definido nesta seleção', 'Os indicadores aparecem quando já existem definições nos arquivos locais. Ajuste os filtros ou escolha Toda a empresa para ampliar a seleção.')}${slot.data?.issues?.length ? '<p class="section-help" role="status">Alguns registros não puderam ser lidos. As leituras válidas disponíveis estão acima.</p>' : ''}`;
}

async function loadBusinessMetrics() {
  const slot = state.metrics;
  const request = ++slot.request;
  const area = state.operatingAreaFilter;
  const system = slot.system || '';
  const workflow = slot.workflow || '';
  const current = () => slot.request === request && state.view === 'metrics' && state.operatingAreaFilter === area && (slot.system || '') === system && (slot.workflow || '') === workflow;
  slot.loading = true;
  slot.error = false;
  try {
    const params = new URLSearchParams({ area, system, workflow });
    const data = await getJson(`/api/business-metrics?${params}`);
    if (!current()) return;
    slot.data = data;
  } catch {
    if (!current()) return;
    slot.data = null;
    slot.error = true;
  } finally {
    if (slot.request === request) {
      slot.loading = false;
      slot.loaded = current();
      if (slot.loaded) renderLocalWorkspace();
    }
  }
}

function renderOperationalInbox() {
  const slot = state.inbox;
  if (!slot.loaded && !slot.loading) void loadOperationalInbox();
  const counts = slot.data?.counts;
  const toolbar = `<div class="inbox-toolbar"><label><input type="checkbox" data-inbox-unread${slot.unread ? ' checked' : ''}>Somente não lidos</label><p>${counts ? `${counts.unread} não lidos · ${counts.total} avisos na seleção` : 'Avisos da área selecionada'}</p></div><p class="section-help">Marcar como lido guarda sua leitura nesta máquina. A pendência continua na origem.</p>`;
  if (slot.loading || !slot.loaded) return `${toolbar}<div class="inbox-loading" role="status"><p>Lendo avisos operacionais…</p><div></div><div></div><div></div></div>`;
  if (slot.error) return `${toolbar}<div class="local-read-status" role="status"><p>Não foi possível ler os avisos locais.</p><button type="button" class="action" data-inbox-retry>Tentar novamente</button></div>`;
  const data = slot.data;
  if (data?.available === false) return `${toolbar}${empty('Avisos indisponíveis', 'As referências operacionais não estão disponíveis para leitura. Atualize o Console para tentar novamente.')}`;
  const notices = data?.notices || [];
  const rows = notices.map((notice) => `<li class="operational-notice${notice.read ? ' is-read' : ''}"><div class="inbox-notice-heading"><h2>${escapeHtml(notice.title)}</h2>${badge(notice.status, notice.severity === 'error' ? 'bad' : 'warn')}</div><p class="inbox-notice-meta"><span>${notice.read ? 'Lido' : 'Não lido'}</span><time>${notice.occurred_at ? fmtDate(notice.occurred_at, !/^\d{4}-\d{2}-\d{2}$/.test(notice.occurred_at)) : 'Sem data registrada'}</time>${notice.system_ref ? `<code>${escapeHtml(notice.system_ref)}</code>` : ''}${notice.area_ref ? `<code>${escapeHtml(notice.area_ref)}</code>` : ''}</p><code class="inbox-evidence">${escapeHtml(notice.evidence_ref)}</code><div class="inbox-notice-actions"><button type="button" class="action" data-inbox-source="${escapeHtml(notice.id)}">Abrir origem</button><button type="button" class="action" data-inbox-read="${escapeHtml(notice.id)}"${slot.mutation ? ' disabled' : ''}>${slot.mutation === notice.id ? 'Salvando leitura…' : notice.read ? 'Marcar como não lido' : 'Marcar como lido'}</button></div></li>`).join('');
  const pagination = data && data.total > data.limit ? `<div class="local-pagination"><span>${data.offset + 1}–${Math.min(data.offset + data.limit, data.total)} de ${data.total} avisos</span><div><button type="button" class="action" data-inbox-page="${Math.max(0, data.offset - data.limit)}"${data.offset === 0 ? ' disabled' : ''}>Anterior</button><button type="button" class="action" data-inbox-page="${data.offset + data.limit}"${data.offset + data.limit >= data.total ? ' disabled' : ''}>Próxima</button></div></div>` : '';
  return `${toolbar}${slot.mutationError ? `<p class="section-help" role="status">${escapeHtml(slot.mutationError)}</p>` : ''}${notices.length ? `<ul class="operational-inbox">${rows}</ul>${pagination}` : empty(slot.unread ? 'Nenhum aviso não lido' : 'Nenhum aviso nesta seleção', 'Os avisos aparecem a partir de falhas, bloqueios e decisões pendentes registrados. Ajuste a área ou o filtro para ampliar a seleção.')}${data?.issues?.length ? '<p class="section-help" role="status">Alguns registros não puderam ser lidos. Os avisos válidos disponíveis estão acima.</p>' : ''}`;
}

/* Tarefas: checkboxes `- [ ]` das notas. O Console só mostra e marca; a nota continua a
   casa da verdade. Marcar grava um único caractere no Markdown, com hash conferido. */
const TASK_CONFLICT = 'A nota mudou fora daqui. Recarregue para ver a versão nova.';
const TASK_NOTE_TYPES = { project: 'Projeto', thread: 'Fio', daily: 'Daily' };

function recountTasks(data) {
  const counts = { open: 0, today_open: 0, today_done: 0, today_total: 0 };
  for (const group of data.notes) for (const task of group.tasks) {
    if (!task.done) counts.open += 1;
    if (task.today) { counts.today_total += 1; counts[task.done ? 'today_done' : 'today_open'] += 1; }
  }
  data.counts = counts;
}

async function loadTasks() {
  const slot = state.tasks;
  if (slot.loading || slot.pending.size) return;
  const request = ++slot.request;
  slot.loading = true;
  slot.error = false;
  try {
    const data = await getJson('/api/tasks');
    if (slot.request !== request) return;
    slot.data = data.available ? data : null;
    slot.stale = false;
  } catch {
    if (slot.request !== request) return;
    if (!slot.data) slot.error = true;
    else slot.stale = true;
  } finally {
    if (slot.request === request) {
      slot.loading = false;
      slot.loaded = true;
      renderTasksView();
    }
  }
}

function renderTasksView() {
  const slot = state.tasks;
  const active = document.activeElement;
  if (active?.dataset?.taskToggle != null) slot.focusKey = [active.dataset.taskRef, active.dataset.taskLine];
  render();
  if (!slot.focusKey) return;
  const again = [...document.querySelectorAll('[data-task-toggle]')].find((element) => element.dataset.taskRef === slot.focusKey[0] && element.dataset.taskLine === slot.focusKey[1]);
  again?.focus();
}

async function toggleTask(ref, line, done) {
  const slot = state.tasks;
  const group = slot.data?.notes.find((item) => item.ref === ref);
  const task = group?.tasks.find((item) => item.line === line);
  if (!task) return;
  slot.notice = '';
  // Uma gravação por nota: o hash novo só existe depois da resposta.
  if (slot.pending.has(ref)) { slot.notice = 'Aguarde a gravação anterior desta nota terminar.'; renderTasksView(); return; }
  slot.pending.add(ref);
  const previous = task.done;
  task.done = done;
  recountTasks(slot.data);
  renderTasksView();
  try {
    const result = await mutate('/api/tasks/toggle', { ref, line, expected_sha256: group.sha256, done, text_check: task.text });
    group.sha256 = result.sha256;
  } catch (error) {
    task.done = previous;
    recountTasks(slot.data);
    const conflict = ['task-stale', 'task-line-changed', 'local-note-conflict', 'local-note-busy'].includes(error.message);
    slot.notice = conflict ? TASK_CONFLICT : 'Não foi possível gravar a tarefa na nota. Nada foi alterado. Tente novamente.';
    slot.stale = slot.stale || conflict;
  } finally {
    slot.pending.delete(ref);
    renderTasksView();
    if (document.activeElement?.dataset?.taskToggle == null) slot.focusKey = null;
  }
}

function taskDue(task) {
  if (!task.due) return '';
  const [, month, day] = task.due.split('-');
  return task.overdue ? badge('atrasada', 'bad', `Atrasada desde ${day}/${month}`) : badge('data', 'neutral', `Vence ${day}/${month}`);
}

function taskRow(group, task, { showNote = false } = {}) {
  const note = escapeHtml(group.title);
  const attrs = `data-task-toggle data-task-ref="${escapeHtml(group.ref)}" data-task-line="${task.line}"`;
  const depth = Math.min(Math.floor(task.indent / 2), 3);
  return `<li class="task-row${task.done ? ' is-done' : ''}" data-depth="${depth}"><label><input type="checkbox" ${attrs}${task.done ? ' checked' : ''} aria-label="${escapeHtml(task.done ? 'Desmarcar' : 'Marcar')} tarefa: ${escapeHtml(task.text)}, na nota ${note}"><span class="task-text">${escapeHtml(task.text)}</span></label>${taskDue(task)}${showNote ? `<button type="button" class="task-note-link" data-open-local-file="${escapeHtml(group.ref)}">${note}</button>` : ''}</li>`;
}

function renderTasks() {
  const slot = state.tasks;
  if (!slot.loaded && !slot.loading) void loadTasks();
  if (!slot.data && slot.error) return `<div class="local-read-status" role="status"><p>Não foi possível ler as tarefas das notas.</p><button type="button" class="action" data-tasks-retry>Tentar novamente</button></div>`;
  if (!slot.data && !slot.loaded) return `<div class="inbox-loading" role="status"><p>Lendo tarefas das notas…</p><div></div><div></div><div></div></div>`;
  const data = slot.data;
  if (!data) return empty('Tarefas indisponíveis', 'As notas do cérebro não estão disponíveis para leitura. Atualize o Console para tentar novamente.');
  const total = data.notes.reduce((sum, group) => sum + group.tasks.length, 0);
  const banner = slot.notice || slot.stale
    ? `<div class="task-notice" role="alert"><p>${escapeHtml(slot.notice || 'Não foi possível atualizar a lista. O que aparece pode estar desatualizado.')}</p><button type="button" class="action" data-tasks-retry>Recarregar</button></div>`
    : '';
  if (!total) return `${banner}${empty('Nenhuma tarefa nas suas notas', 'Escreva "- [ ] tarefa" em qualquer nota e acrescente "📅 AAAA-MM-DD" para dar uma data. A tarefa aparece aqui, e marcar aqui grava na própria nota.')}`;
  const { today_done: done, today_total: all } = data.counts;
  const todayRows = data.notes.flatMap((group) => group.tasks.filter((task) => task.today).map((task) => taskRow(group, task, { showNote: true })));
  const hoje = `<section class="task-today dashboard-panel" aria-labelledby="tasks-today-title" data-identity="indigo"><div class="subheading"><h3 id="tasks-today-title">Hoje</h3><span>${all ? `${done} de ${all} feitas hoje` : 'Nada marcado para hoje'}</span></div><div class="panel-body">${all ? `<progress max="${all}" value="${done}" aria-label="${done} de ${all} tarefas de hoje feitas"></progress><ul class="task-list">${todayRows.join('')}</ul>` : '<p class="muted">Tarefas da daily de hoje, com data de hoje ou atrasadas aparecem aqui.</p>'}</div></section>`;
  const groups = data.notes.map((group) => {
    const rest = group.tasks.filter((task) => !task.today);
    if (!rest.length) return '';
    const open = rest.filter((task) => !task.done).length;
    return `<section class="task-group dashboard-panel" aria-label="${escapeHtml(group.title)}"><div class="subheading"><h3><button type="button" class="task-note-link" data-open-local-file="${escapeHtml(group.ref)}">${escapeHtml(group.title)}</button></h3><span>${escapeHtml(TASK_NOTE_TYPES[String(group.type || '').toLowerCase()] || group.type || 'Nota')} · ${open} ${open === 1 ? 'aberta' : 'abertas'}</span></div><div class="panel-body"><ul class="task-list">${rest.map((task) => taskRow(group, task)).join('')}</ul></div></section>`;
  }).join('');
  const partial = data.complete === false ? '<p class="section-help" role="status">O cérebro é grande: parte das notas ficou fora desta leitura.</p>' : '';
  return `${banner}<div class="tasks-view">${hoje}${groups}</div>${partial}`;
}

async function loadOperationalInbox() {
  const slot = state.inbox;
  const request = ++slot.request;
  const area = state.operatingAreaFilter;
  const unread = slot.unread;
  const offset = slot.offset;
  const current = () => slot.request === request && state.view === 'notices' && state.operatingAreaFilter === area && slot.unread === unread && slot.offset === offset;
  slot.loading = true;
  slot.error = false;
  try {
    const params = new URLSearchParams({ area, unread: unread ? '1' : '0', offset: String(offset), limit: String(slot.limit) });
    const data = await getJson(`/api/operational-inbox?${params}`);
    if (!current()) return;
    // A read operation can remove the final item from a filtered page.
    if (offset > 0 && data.notices.length === 0 && data.total <= offset) {
      slot.offset = Math.max(0, Math.floor((data.total - 1) / slot.limit) * slot.limit);
      return await loadOperationalInbox();
    }
    slot.data = data;
  } catch {
    if (!current()) return;
    slot.data = null;
    slot.error = true;
  } finally {
    if (slot.request === request) {
      slot.loading = false;
      slot.loaded = current();
      if (slot.loaded) renderLocalWorkspace();
    }
  }
}

async function markOperationalNotice(id) {
  const slot = state.inbox;
  if (slot.mutation) return;
  const notice = slot.data?.notices.find((item) => item.id === id);
  if (!notice) return;
  slot.mutation = id;
  slot.mutationError = '';
  slot.request++; // In-flight lists cannot replace the state being changed.
  slot.loading = false;
  renderLocalWorkspace();
  try {
    await mutate('/api/operational-inbox/read', { id, fingerprint: notice.fingerprint, read: !notice.read });
  } catch {
    slot.mutationError = 'A leitura não foi salva. Confira os avisos atualizados e tente novamente.';
  } finally {
    slot.mutation = null;
    slot.loaded = false;
    if (state.view === 'notices') {
      await loadOperationalInbox();
    }
  }
}

function openOperationalNotice(id) {
  const notice = state.inbox.data?.notices.find((item) => item.id === id);
  const target = notice?.target;
  if (!target?.ref) return;
  if (target.kind === 'receipt') { void openJudgment(target.ref); return; }
  if (target.kind === 'routine') { openDrawer(target.ref); return; }
  if (target.kind === 'decision-case') { void openCase(target.ref); return; }
  if (target.kind === 'run-record') {
    state.canvas.scope = 'run';
    state.canvas.ref = target.ref.startsWith('run-record:') ? target.ref : `run-record:${target.ref}`;
    state.canvas.positions = null;
    state.view = 'canvas';
    closeDrawer();
    render();
  }
}

function syncLocalViewContext() {
  const context = `${state.view}:${state.operatingAreaFilter}`;
  if (state.localViewContext === context) return;
  state.localViewContext = context;
  if (state.view === 'tasks') { state.tasks.loaded = false; state.tasks.notice = ''; }
  for (const slot of [state.files, state.areaFiles, state.metrics, state.inbox].filter(Boolean)) {
    slot.request++;
    slot.loading = false;
    slot.loaded = false;
    slot.data = null;
    slot.error = false;
    if ('offset' in slot) slot.offset = 0;
  }
  if (state.selectedLocalFile) closeDrawer();
}

function systemOperational(system) {
  const records = (state.model.run_records || [])
    .filter((record) => refMatchesSystem(record.system_ref, system))
    .sort((left, right) => String(right.completed_at || '').localeCompare(String(left.completed_at || '')));
  const judgments = (state.model.judgments || []).filter((item) => refMatchesSystem(item.system_ref, system));
  return {
    records,
    lastRun: records[0] || null,
    pendingJudgments: judgments.filter((item) => !item.imported && item.judgment.status === 'pending').length,
  };
}

function systemPreflight(system) {
  const installedSourceIds = new Set((state.model.sources || []).map((source) => source.source_id));
  const required = (system.source_refs || []).filter((source) => source.required);
  const verifiable = required.filter((source) => source.source_id);
  const found = verifiable.filter((source) => installedSourceIds.has(source.source_id));
  const missing = verifiable.filter((source) => !installedSourceIds.has(source.source_id));
  const afterAuthorization = required.filter((source) => !source.source_id);
  if (missing.length) {
    return {
      status: 'context-required', label: 'Precisa preparar contexto', tone: 'warn',
      detail: `${found.length}/${verifiable.length} Fontes obrigatórias encontradas · ${missing.length} ausente(s)`,
    };
  }
  if (afterAuthorization.length) {
    return {
      status: 'verify-after-authorization', label: 'Verificar após autorização', tone: 'neutral',
      detail: `${afterAuthorization.length} requisito(s) só verificável(is) depois do grant`,
    };
  }
  return {
    status: 'verify-authorizations', label: 'Fontes encontradas', tone: 'good',
    detail: `${found.length}/${verifiable.length} Fontes obrigatórias · autorizações ainda precisam ser verificadas`,
  };
}

function safeSystemInterfaceUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    return url.protocol === 'https:' || localHttp ? url.href : null;
  } catch { return null; }
}

async function loadSystemInterfaceHealth(system) {
  const id = system.system_id;
  if (!id || state.systems.interfaceHealth[id]) return;
  state.systems.interfaceHealth[id] = { status: 'checking' };
  try {
    state.systems.interfaceHealth[id] = await getJson(`/api/systems/${encodeURIComponent(id)}/interface-health`);
  } catch {
    state.systems.interfaceHealth[id] = { status: 'unavailable', reason_code: 'interface-healthcheck-failed' };
  }
  if (state.view === 'systems' || state.view === 'system') render();
}

function ensureSystemInterfaceHealth(system) {
  if (!safeSystemInterfaceUrl(system?.interface_ref)) return;
  void loadSystemInterfaceHealth(system);
}

function ensureVisibleSystemInterfaceHealth() {
  if (state.view === 'systems') visibleSystems().forEach(ensureSystemInterfaceHealth);
  if (state.view === 'system' && state.workspace?.data) ensureSystemInterfaceHealth(state.workspace.data.system);
}

function systemLaunchAction(system) {
  const interfaceUrl = safeSystemInterfaceUrl(system.interface_ref);
  if (!interfaceUrl) {
    const invalid = Boolean(system.interface_ref);
    const missing = Boolean(system.interface_expected);
    return `<span class="system-interface-state ${invalid ? 'invalid' : 'missing'}" data-interface-health="${invalid ? 'invalid' : missing ? 'not-installed' : 'not-declared'}">${invalid ? 'Interface não suportada' : missing ? 'Aplicação não instalada' : 'Sem interface própria'}</span>`;
  }
  const health = state.systems.interfaceHealth[system.system_id];
  if (!health || health.status === 'checking') {
    return '<span class="system-interface-state checking" data-interface-health="checking"><i></i>Verificando aplicação…</span>';
  }
  if (health.status === 'unavailable') {
    const reason = health.reason_code === 'interface-timeout' ? 'A aplicação não respondeu a tempo' : 'A aplicação não respondeu agora';
    return `<span class="system-interface-state unavailable" data-interface-health="unavailable" title="${escapeHtml(reason)}">Aplicação indisponível</span>`;
  }
  if (health.status === 'not-installed') {
    return '<span class="system-interface-state missing" data-interface-health="not-installed">Aplicação não instalada</span>';
  }
  if (!['available', 'not-checkable'].includes(health.status)) {
    return '<span class="system-interface-state unavailable" data-interface-health="unavailable">Aplicação indisponível</span>';
  }
  const unverified = health.status === 'not-checkable';
  const launchLabel = system.experience?.primary_surface?.launch_label || 'Abrir aplicação';
  return `<a class="system-app-link${unverified ? ' is-unverified' : ' is-primary'}" data-interface-health="${escapeHtml(health.status)}" data-system-launch="${escapeHtml(system.system_id)}" href="${escapeHtml(interfaceUrl)}" target="_blank" rel="noopener noreferrer"${unverified ? ' title="Disponibilidade não verificada pelo Cockpit"' : ''}>${escapeHtml(launchLabel)} <span aria-hidden="true">${iconMarkup('external-link')}</span></a>`;
}

const FALLBACK_BUSINESS_FUNCTIONS = [
  { id: 'sales', label: 'Vendas' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'product', label: 'Produto' },
  { id: 'operations', label: 'Operações' },
  { id: 'community', label: 'Comunidade' },
  { id: 'data-technology', label: 'Dados & Tecnologia' },
];

const FALLBACK_OPERATING_AREAS = new Map([
  ['commercial', 'Comercial'],
  ['operations-technology', 'Operações & Tecnologia'],
  ['product-community', 'Produto & Comunidade'],
]);

function businessFunctions() {
  const declared = state.model?.system_taxonomy?.business_functions;
  return [{ id: 'all', label: 'Todos' }, ...(declared?.length ? declared : FALLBACK_BUSINESS_FUNCTIONS)];
}

function businessFunctionName(value) {
  return businessFunctions().find((item) => item.id === value)?.label || 'Não classificada';
}

function operatingAreaName(value) {
  return state.model?.system_taxonomy?.operating_areas.find((item) => item.id === value)?.label
    || state.model?.areas.find((item) => item.operating_area === value)?.name
    || FALLBACK_OPERATING_AREAS.get(value)
    || 'Geral';
}

function systemBusinessFunction(system) {
  return system.business_function || 'unclassified';
}

function systemInitials(system) {
  const words = String(system.name || system.system_id).replace(/^Sistema de\s+/i, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function systemIdentity(system, modifier = '') {
  const mark = system.experience?.presentation?.mark;
  if (!mark || mark.kind !== 'monogram') {
    return `<div class="system-identity${modifier ? ` ${modifier}` : ''}" data-identity="${identityForKey(system.system_id)}" aria-hidden="true"><span>${escapeHtml(systemInitials(system))}</span></div>`;
  }
  const accent = String(mark.accent || readDesignToken('--identity-default-accent'));
  const red = Number.parseInt(accent.slice(1, 3), 16);
  const green = Number.parseInt(accent.slice(3, 5), 16);
  const blue = Number.parseInt(accent.slice(5, 7), 16);
  const foreground = ((red * 299) + (green * 587) + (blue * 114)) / 1000 > 148 ? readDesignToken('--identity-ink-on-light') : readDesignToken('--identity-ink-on-dark');
  const size = readDesignNumber('--identity-size');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${readDesignNumber('--identity-radius')}" fill="${escapeHtml(accent)}"/><text x="${size / 2}" y="${size / 2}" fill="${escapeHtml(foreground)}" font-family="${escapeHtml(readDesignToken('--font'))}" font-size="${readDesignNumber('--identity-font-size')}" font-weight="${readDesignNumber('--identity-font-weight')}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(mark.text)}</text></svg>`;
  const source = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return `<div class="system-identity is-published${modifier ? ` ${modifier}` : ''}"><img src="${escapeHtml(source)}" alt="Marca de ${escapeHtml(system.name)}"></div>`;
}

function systemPublisher(system) {
  return system.experience?.publisher || null;
}

function publisherKindLabel(kind) {
  return kind === 'organization' ? 'organização' : kind === 'person' ? 'pessoa' : label(kind);
}

function operationalOwnerLabel(value) {
  if (!value) return 'Não declarado';
  return String(value).replace(/^role-/, '').replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function systemCard(system) {
  const configured = system.migration_stage === 'configured';
  const active = system.migration_stage === 'active';
  const stageLabel = { mapped: 'Mapeado', configured: 'Configurado', active: 'Ativo' }[system.migration_stage] || label(system.migration_stage);
  const operational = systemOperational(system);
  const preflight = systemPreflight(system);
  const businessFunction = systemBusinessFunction(system);
  const publisher = systemPublisher(system);
  const tagline = system.experience?.presentation?.tagline || null;
  return `<article class="system-launcher-card" data-kind="system" data-identity="${identityForKey(system.system_id)}" data-system-category="${escapeHtml(businessFunction)}">
    <div class="system-card-head">
      ${systemIdentity(system)}
      <div class="system-card-title"><p class="micro">${escapeHtml(businessFunctionName(businessFunction))} · v${escapeHtml(system.version)}</p><h3 title="${escapeHtml(system.name)}">${escapeHtml(system.name)}</h3></div>
      ${badge(system.migration_stage, active ? 'good' : configured ? 'neutral' : 'warn', stageLabel)}
    </div>
    ${tagline ? `<p class="system-tagline">${escapeHtml(tagline)}</p>` : ''}
    <p class="system-result">${escapeHtml(system.result)}</p>
    <div class="system-owner"><span class="system-owner-avatar" aria-hidden="true">${escapeHtml((publisher?.display_name || operationalOwnerLabel(system.operational_owner)).slice(0, 1))}</span><span><small>${publisher ? 'Publicado por' : 'Dono operacional'}</small><b>${escapeHtml(publisher?.display_name || operationalOwnerLabel(system.operational_owner))}</b></span></div>
    <div class="system-health" data-readiness="${preflight.status}">${badge(preflight.status, preflight.tone, preflight.label)}<span>${operational.pendingJudgments ? `${operational.pendingJudgments} para julgar` : 'Sem julgamento pendente'}</span></div>
    <div class="system-compact-stats">
      <span><b>${operational.lastRun ? fmtDate(operational.lastRun.completed_at, false) : 'Nunca'}</b><small>Último Run</small></span>
      <span><b>${operational.records.length}</b><small>Runs</small></span>
      <span><b>${system.source_refs.length}</b><small>Fontes</small></span>
    </div>
    <div class="system-compact-actions">
      <button type="button" data-open-system="${escapeHtml(system.system_id)}">Ver Sistema</button>
      ${systemLaunchAction(system)}
    </div>
  </article>`;
}

function renderSystems() {
  const available = visibleSystems();
  if (!available.length) return `<div class="section-heading"><div><p class="eyebrow">Resultados</p><h2>Sistemas</h2></div></div>${empty('Nenhum Sistema nesta área', 'O Console não cria verdade editorial: ele espera System Contracts reais.')}`;
  const query = state.systems.query.trim().toLocaleLowerCase('pt-BR');
  const systems = available.filter((system) => {
    const categoryMatch = state.systems.category === 'all' || systemBusinessFunction(system) === state.systems.category;
    const stageMatch = state.systems.stage === 'all' || system.migration_stage === state.systems.stage;
    const searchMatch = !query || `${system.name} ${system.result} ${system.experience?.presentation?.tagline || ''} ${system.experience?.publisher?.display_name || ''} ${operationalOwnerLabel(system.operational_owner)}`.toLocaleLowerCase('pt-BR').includes(query);
    return categoryMatch && stageMatch && searchMatch;
  }).sort((left, right) => {
    const weight = { active: 0, configured: 1, mapped: 2 };
    return (weight[left.migration_stage] ?? 3) - (weight[right.migration_stage] ?? 3)
      || left.name.localeCompare(right.name, 'pt-BR');
  });
  const categoryButtons = businessFunctions().map((category) => {
    const count = category.id === 'all' ? available.length : available.filter((system) => systemBusinessFunction(system) === category.id).length;
    return `<button type="button" class="system-filter${state.systems.category === category.id ? ' active' : ''}" data-system-category="${escapeHtml(category.id)}"${count ? '' : ' disabled'}>${escapeHtml(category.label)} <b>${count}</b></button>`;
  }).join('');
  const stageButtons = [['all', 'Todos'], ['active', 'Ativos'], ['configured', 'Configurados'], ['mapped', 'Mapeados']].map(([stage, copy]) => {
    const count = stage === 'all' ? available.length : available.filter((system) => system.migration_stage === stage).length;
    return `<button type="button" class="system-filter${state.systems.stage === stage ? ' active' : ''}" data-system-stage="${stage}"${count ? '' : ' disabled'}>${copy} <b>${count}</b></button>`;
  }).join('');
  const scopeSummary = state.operatingAreaFilter
    ? `${available.length} de ${state.model.systems.length} Sistemas na área ${operatingAreaName(state.operatingAreaFilter)}`
    : `${available.length} Sistemas neste Cérebro`;
  const visibleSummary = systems.length === available.length ? scopeSummary : `${systems.length} visíveis · ${scopeSummary}`;
  const lifecycle = ['active', 'configured', 'mapped'].map((stage) => {
    const count = available.filter((system) => system.migration_stage === stage).length;
    const name = { active: 'ativos', configured: 'configurados', mapped: 'mapeados' }[stage];
    return `${count} ${name}`;
  }).join(' · ');
  return `<div class="section-heading"><div><p class="eyebrow">Launcher</p><h2>Meus Sistemas</h2></div><p>Conheça o Sistema antes de abrir sua aplicação. Contratos, contexto, Runs e confiança continuam no Cockpit.</p></div>
    <div class="systems-launcher-toolbar"><label><span>Buscar Sistema</span><input type="search" data-system-search value="${escapeHtml(state.systems.query)}" placeholder="Nome, resultado, publisher ou responsável" autocomplete="off"></label><div class="systems-filter-stack"><div><span class="micro">Estágio</span><div class="systems-filter-row" aria-label="Filtrar por estágio">${stageButtons}</div></div><div><span class="micro">Função</span><div class="systems-filter-row" aria-label="Filtrar por função empresarial">${categoryButtons}</div></div></div></div>
    <div class="systems-results"><span>${escapeHtml(visibleSummary)}</span><small>${escapeHtml(lifecycle)} · identidade publicada pelo Experience Manifest; catálogo público entra na comunidade Vibe Makers.</small></div>
    <div class="systems-market-grid">${systems.map(systemCard).join('') || empty('Nenhum Sistema encontrado', 'Limpe a busca ou escolha outra função empresarial.')}</div>`;
}

const SKILL_ACRONYMS = new Set(['ads', 'cub', 'gtm', 'icp', 'ui', 'ux', 'vsl']);
const SKILL_LOWERCASE_WORDS = new Set(['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'para']);

function skillTitle(value) {
  return String(value || '').split('-').map((word, index) => (
    SKILL_ACRONYMS.has(word) ? word.toUpperCase()
      : index > 0 && SKILL_LOWERCASE_WORDS.has(word) ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
  )).join(' ');
}

function skillOriginLabel(skill) {
  if (skill.origins.length === 2) return 'Empresa + motor';
  return skill.origins[0] === 'company' ? 'Da empresa' : 'Do motor';
}

function skillStatusBadge(skill) {
  const status = skill.installation_status;
  const copy = status === 'available' ? 'Alinhada'
    : status === 'degraded' ? 'Sincronizar'
      : 'Só no motor';
  return badge(status, status === 'available' ? 'good' : status === 'degraded' ? 'warn' : 'neutral', copy);
}

function skillSystems(skill) {
  return skill.system_refs.map((ref) => systemByRef(ref)).filter(Boolean);
}

function skillCard(skill) {
  const systems = skillSystems(skill);
  return `<article class="skill-card" data-skill-status="${escapeHtml(skill.installation_status)}">
    <div class="skill-card-head"><div class="skill-mark" aria-hidden="true">/</div><div><p class="micro">${escapeHtml(skillOriginLabel(skill))}</p><h3>${escapeHtml(skillTitle(skill.name))}</h3></div>${skillStatusBadge(skill)}</div>
    <p class="skill-description">${escapeHtml(skill.description)}</p>
    <div class="skill-usage"><span>${systems.length ? `${systems.length} ${systems.length === 1 ? 'Sistema usa' : 'Sistemas usam'}` : 'Ainda sem uso declarado'}</span></div>
    <button type="button" class="skill-inspect" data-open-skill="${escapeHtml(skill.skill_id)}">Ver Skill</button>
  </article>`;
}

function executorCard(executor) {
  const ready = executor.auth_status === 'ready';
  return `<article class="skill-executor">
    <div><p class="micro">${escapeHtml(executor.binding_id)}</p><h3>${escapeHtml(label(executor.adapter))}</h3></div>
    ${badge(executor.auth_status, ready ? 'good' : executor.auth_status === 'authentication-required' ? 'warn' : 'bad')}
    <dl><div><dt>Modelo padrão</dt><dd><code>${escapeHtml(executor.default_model)}</code></dd></div><div><dt>Permissão</dt><dd>${escapeHtml(label(executor.permission_profile))}</dd></div><div><dt>Observado</dt><dd>${escapeHtml(fmtDate(executor.observed_at, false))}</dd></div></dl>
  </article>`;
}

function renderSkills() {
  const catalog = state.skills.data;
  if (!catalog) {
    if (state.skills.error) return empty('Catálogo de Skills indisponível', 'Atualize o Console para tentar recompilar as capacidades locais.');
    if (!state.skills.loading) void loadSkills();
    return '<div class="loading"><i></i><span>Compilando Skills e vínculos locais…</span></div>';
  }
  const all = catalog.skills || [];
  const query = state.skills.query.trim().toLocaleLowerCase('pt-BR');
  const visible = all.filter((skill) => {
    const originMatch = state.skills.origin === 'all' || skill.origins.includes(state.skills.origin);
    const statusMatch = state.skills.status === 'all' || skill.installation_status === state.skills.status;
    const linked = skill.system_refs.length > 0;
    const linkMatch = state.skills.link === 'all' || (state.skills.link === 'linked' ? linked : !linked);
    const searchHaystack = `${skill.skill_id} ${skill.name} ${skill.description} ${skillSystems(skill).map((system) => system.name).join(' ')}`.toLocaleLowerCase('pt-BR');
    return originMatch && statusMatch && linkMatch && (!query || searchHaystack.includes(query));
  });
  const counts = catalog.counts;
  const originFilters = [
    ['company', 'Nesta empresa', counts.company],
    ['engine', 'No motor', counts.engine],
    ['all', 'Todas', counts.unique],
  ].map(([value, copy, count]) => `<button type="button" class="skill-filter${state.skills.origin === value ? ' active' : ''}" data-skill-origin="${value}">${copy} <b>${count}</b></button>`).join('');
  const statusFilters = [
    ['all', 'Qualquer estado'],
    ['available', 'Alinhadas'],
    ['degraded', 'A sincronizar'],
    ['motor-only', 'Só no motor'],
  ].map(([value, copy]) => `<button type="button" class="skill-filter${state.skills.status === value ? ' active' : ''}" data-skill-status-filter="${value}">${copy}</button>`).join('');
  const linkFilters = [
    ['all', 'Todos os vínculos'], ['linked', 'Ligadas a Sistemas'], ['unlinked', 'Sem vínculo'],
  ].map(([value, copy]) => `<button type="button" class="skill-filter${state.skills.link === value ? ' active' : ''}" data-skill-link="${value}">${copy}</button>`).join('');
  const scopeNote = state.operatingAreaFilter
    ? `Skills atravessam áreas; o filtro ${operatingAreaName(state.operatingAreaFilter)} não esconde capacidades do Cérebro.`
    : 'Skills pertencem ao Cérebro inteiro; Sistemas apenas declaram quais delas consomem.';
  return `<div class="skills-hero">
      <div><h1>Skills</h1><p>Instrumentos executáveis que Sistemas e agentes podem usar. Abra uma Skill para entender quando usar, onde está instalada e quais Sistemas a declaram.</p></div>
      <div class="skills-summary"><strong>${counts.company}</strong><span>nesta empresa</span><i></i><strong>${counts.available}</strong><span>alinhadas</span>${counts.degraded ? `<i></i><strong class="attention">${counts.degraded}</strong><span>a sincronizar</span>` : ''}</div>
    </div>
    <div class="skills-boundary"><span>${counts.unique} capacidades encontradas</span><small>${escapeHtml(scopeNote)}</small></div>
    <div class="skills-toolbar"><label><span>Buscar Skill</span><input type="search" data-skill-search value="${escapeHtml(state.skills.query)}" placeholder="Nome, tarefa ou Sistema" autocomplete="off"></label><div class="skill-filter-group" aria-label="Origem">${originFilters}</div><div class="skill-filter-group" aria-label="Saúde">${statusFilters}</div><div class="skill-filter-group" aria-label="Vínculo">${linkFilters}</div></div>
    <div class="skills-results"><span>${visible.length} visíveis</span><small>Detalhes técnicos aparecem ao abrir uma Skill.</small></div>
    <div class="skills-grid">${visible.map(skillCard).join('') || empty('Nenhuma Skill encontrada', 'Limpe a busca ou escolha outro filtro.')}</div>
    <section class="skill-executors-section"><div class="section-heading"><div><p class="eyebrow">Execução relacionada</p><h2>Modelos não são Skills</h2></div><p>Bindings dizem onde uma capacidade pode executar. O modelo é declarado pelo provider; não representa qualidade ou produto instalado.</p></div><div class="skill-executors">${catalog.executors.map(executorCard).join('') || empty('Nenhum executor ligado', 'Skills continuam catalogadas, mas não há binding local de modelo.')}</div><div class="boundary-note"><b>Fronteira local</b>O Cockpit mostra adapter, política e autenticação. Credenciais, corpo da Skill, prompt e output não entram neste read model.</div></section>`;
}

function openSkill(skillId) {
  const skill = state.skills.data?.skills?.find((item) => item.skill_id === skillId);
  if (!skill) return;
  state.selectedRoutine = null;
  state.selectedJudgment = null;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = null;
  const systems = skillSystems(skill);
  const companyRuntime = skill.company
    ? skill.company.agent_runtime_present
      ? skill.company.agent_runtime_aligned ? 'Alinhado à fonte canônica' : 'Divergente da fonte canônica'
      : 'Runtime derivado ausente'
    : 'Não instalada nesta empresa';
  renderMarkup($('#drawer-content'), `<div class="drawer-head"><p class="eyebrow">Skill</p><h2>${escapeHtml(skillTitle(skill.name))}</h2>${skillStatusBadge(skill)}</div>
    <code class="skill-drawer-id">/${escapeHtml(skill.skill_id)}</code>
    <div class="boundary-note"><b>Capacidade, não aplicativo</b>Esta Skill encapsula julgamento executável. O resultado, os gates e a personalidade continuam pertencendo ao Sistema que a usa.</div>
    <section class="drawer-section"><h3>Quando usar</h3><p>${escapeHtml(skill.description)}</p></section>
    <section class="drawer-section"><h3>Instalação</h3><dl><div><dt>Origem</dt><dd>${escapeHtml(skillOriginLabel(skill))}</dd></div><div><dt>Fonte da empresa</dt><dd>${skill.company ? `<code>${escapeHtml(skill.company.canonical_ref)}</code>` : 'Não instalada'}</dd></div><div><dt>Runtime de agentes</dt><dd>${escapeHtml(companyRuntime)}</dd></div><div><dt>Pacote do motor</dt><dd>${skill.engine ? `<code>${escapeHtml(skill.engine.canonical_ref)}</code>` : 'Não publicada no motor'}</dd></div></dl></section>
    <section class="drawer-section"><h3>Sistemas que declaram · ${systems.length}</h3><div class="node-links">${systems.map((system) => entityLink('data-open-system', system.system_id, system.name, label(system.migration_stage), 'system')).join('') || '<p class="muted">Nenhum manifesto nomeia esta Skill. O Console não infere dependência pelo nome.</p>'}</div></section>
    <div class="boundary-note"><b>Reference-only</b>O corpo privado da Skill não é enviado ao navegador. Este inspetor recebe apenas metadata, estado dos runtimes e referências explícitas.</div>`);
  drawerController.open();
}

async function loadSkills() {
  if (state.skills.loading) return;
  state.skills.loading = true;
  state.skills.error = null;
  try {
    state.skills.data = await getJson('/api/skills');
  } catch (error) {
    state.skills.error = error.message;
  } finally {
    state.skills.loading = false;
    if (state.view === 'skills') render();
    if (typeof palette !== 'undefined' && palette.open) paletteRender();
  }
}

function renderSources() {
  return `<div class="section-heading"><div><p class="eyebrow">Casas de verdade</p><h2>Fontes</h2></div><p>Mapear não é conectar. A garantia mostrada depende de quem realmente possui a custódia.</p></div><div class="object-grid">${visibleSources().map((source) => `<article class="object-card" data-kind="source" data-open-source="${escapeHtml(source.source_id)}" role="button" tabindex="0"><div class="object-card-top">${badge(source.status, source.status === 'active' ? 'good' : 'neutral')}${badge(source.assurance, source.assurance === 'runtime-enforced' ? 'good' : 'neutral')}</div><p class="micro">${escapeHtml(source.type)}</p><h3>${escapeHtml(source.name)}</h3><p>Custódia: ${escapeHtml(label(source.custody))} · PII: ${escapeHtml(label(source.pii))}</p><div class="ref-list">${source.modes.map((mode) => `<code>${escapeHtml(mode)}</code>`).join('')}</div></article>`).join('') || empty('Nenhuma Fonte contratada', 'Fontes aparecem sem abrir ou copiar o conteúdo original.')}</div>`;
}

function experimentProgress(experiment) {
  const states = experiment.status === 'decided'
    ? ['done', 'done', experiment.run_count ? 'done' : 'gap', 'done', 'done', experiment.learning_status === 'linked' ? 'done' : 'gap']
    : experiment.status === 'running'
      ? ['done', 'done', 'active', 'active', 'pending', 'pending']
      : experiment.status === 'ready-for-read'
        ? ['done', 'done', experiment.run_count ? 'done' : 'gap', 'done', 'active', 'pending']
        : experiment.status === 'cancelled'
          ? ['done', 'done', 'failed', 'failed', 'failed', 'muted']
          : ['done', 'done', 'pending', 'pending', 'pending', 'pending'];
  const labels = ['Hipótese', 'Contrato', 'Execução', 'Medição', 'Martelo', 'Aprendizado'];
  return `<div class="experiment-mini-flow" aria-label="Progresso do experimento">${labels.map((item, index) => `<span class="${states[index]}"><i></i><small>${item}</small></span>`).join('')}</div>`;
}

function renderExperiments() {
  const experiments = visibleExperiments();
  const running = experiments.filter((item) => item.status === 'running').length;
  const ready = experiments.filter((item) => item.status === 'ready-for-read').length;
  const decided = experiments.filter((item) => item.status === 'decided').length;
  const unlinked = experiments.filter((item) => item.learning_status === 'unlinked').length;
  return `<div class="section-heading"><div><p class="eyebrow">Decisão antes do dado</p><h2>Experimentos</h2></div><p>Uma mudança controlada atravessa Sistemas, Runs, medição e martelo. Contrato congelado não se edita depois do dado.</p></div>
    <div class="experiment-kpis"><span><b>${running}</b> coletando</span><span><b>${ready}</b> prontos para leitura</span><span><b>${decided}</b> decididos</span><span class="${unlinked ? 'attention' : ''}"><b>${unlinked}</b> aprendizados sem vínculo</span></div>
    <div class="experiment-grid">${experiments.map((experiment) => `<article class="experiment-card" data-open-experiment="${escapeHtml(experiment.experiment_id)}" role="button" tabindex="0">
      <div class="experiment-card-head"><div><p class="micro">${escapeHtml(experiment.experiment_id)} · ${escapeHtml(experiment.system_ref)}</p><h3>${escapeHtml(experiment.name)}</h3></div>${badge(experiment.status, experiment.status === 'decided' ? 'good' : experiment.status === 'running' ? 'neutral' : experiment.status === 'ready-for-read' ? 'warn' : tone(experiment.status))}</div>
      ${experimentProgress(experiment)}
      <div class="experiment-card-stats"><span><b>${experiment.arm_count || '—'}</b> braços${experiment.arms_status === 'not-structured' ? ' não estruturados' : ''}</span><span><b>${experiment.run_count}</b> Runs ligados</span><span><b>${experiment.amendment_count}</b> emendas</span>${experiment.contract_gap_count ? `<span class="warn-text"><b>${experiment.contract_gap_count}</b> lacunas legadas</span>` : ''}</div>
      <div class="experiment-card-footer"><div><span>Métrica primária</span><code>${escapeHtml(experiment.primary_metric_ref)}</code></div><button data-open-experiment="${escapeHtml(experiment.experiment_id)}">Abrir contrato <b>→</b></button></div>
    </article>`).join('') || empty('Nenhum Experimento contratado', 'Congele um pré-registro ou importe um ledger existente para criar o primeiro objeto.')}</div>
    <div class="boundary-note"><b>Experimento ≠ execução</b>Um experimento pode produzir vários briefings, criativos e Runs em mais de um Sistema. Cada Run se liga por entity_ref; sem essa referência, o Console mostra a lacuna.</div>`;
}

function allReceipts() {
  return visibleRoutines().flatMap((routine) => routine.receipts.map((receipt) => ({ ...receipt, routine_name: routine.name, routine_id: routine.routine_id }))).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
}

function allCanvasExecutions() {
  const receipts = allReceipts().map((receipt) => ({
    selector_ref: receipt.receipt_id,
    run_id: receipt.run_id,
    label: receipt.routine_name,
    completed_at: receipt.completed_at,
    mode: state.model.run_records?.find((record) => record.run_id === receipt.run_id)?.mode || null,
  }));
  const receivedRunIds = new Set(receipts.map((receipt) => receipt.run_id));
  const standalone = (state.model.run_records || []).filter((record) => !receivedRunIds.has(record.run_id) && inActiveOperatingArea(systemOperatingArea(record.system_ref))).map((record) => ({
    selector_ref: record.run_record_ref,
    run_id: record.run_id,
    label: `${label(record.system_ref)}${record.experiment_ref ? ` · ${record.experiment_ref}` : ''}`,
    completed_at: record.completed_at,
    mode: record.mode,
  }));
  return [...receipts, ...standalone].sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at));
}

/* Runs Explorer — a linha do tempo única de TODAS as execuções: recibos de
   rotina + run records standalone do ledger, com a mesma gramática das outras
   superfícies (proveniência carimbada, lacuna visível, comparação A×B). */

async function loadRuns() {
  try {
    state.runs.data = await getJson('/api/runs');
  } catch (error) {
    state.runs.data = { error: error.message, runs: [] };
  }
  if (state.view === 'runs') render();
}

// Decisão humana resolvida: julgamento do recibo (quando existe) ganha do
// campo human_decision do Run Record — os dois são observados, o julgamento
// é o mais recente. Underscore do protocolo vira o mesmo vocabulário da casa.
function runDecision(entry) {
  if (entry.receipt_id) {
    const judgment = state.model.judgments.find((item) => item.receipt_id === entry.receipt_id)?.judgment;
    if (judgment && judgment.status !== 'unavailable') {
      return judgment.status === 'pending' ? 'pending' : (judgment.verdict || judgment.status);
    }
  }
  return entry.human_decision ? String(entry.human_decision).replaceAll('_', '-') : null;
}

function runsEntries() {
  return (state.runs.data?.runs || []).map((entry) => {
    const system = systemByRef(entry.system_ref);
    const routine = entry.routine_ref ? state.model.routines.find((item) => item.routine_id === entry.routine_ref) : null;
    return {
      ...entry,
      system,
      system_name: system?.name || entry.system_ref,
      operating_area: system?.operating_area || null,
      routine_name: routine?.name || entry.routine_ref,
      decision: runDecision(entry),
      when: entry.completed_at || entry.started_at || '',
    };
  });
}

function runsVisibleEntries() {
  const filters = state.runs.filters;
  const list = runsEntries().filter((entry) => inActiveOperatingArea(entry.operating_area)
    && (!filters.system || entry.system?.system_id === filters.system || entry.system_ref === filters.system)
    && (!filters.routine || entry.routine_ref === filters.routine || entry.routine_id === filters.routine)
    && (!filters.mode || (entry.mode || 'none') === filters.mode)
    && (!filters.status || entry.status === filters.status)
    && (!filters.decision || (entry.decision || 'none') === filters.decision)
    && (!filters.snapshot || (filters.snapshot === 'with' ? Boolean(entry.context) : !entry.context)));
  const { key, dir } = state.runs.sort;
  const value = (entry) => key === 'system' ? entry.system_name
    : key === 'mode' ? (entry.mode || '')
      : key === 'status' ? entry.status
        : key === 'decision' ? (entry.decision || '')
          : key === 'eval' ? String(entry.eval_passed ?? '')
            : entry.when;
  return list.sort((left, right) => {
    const order = String(value(left)).localeCompare(String(value(right)), 'pt-BR') * (dir === 'asc' ? 1 : -1);
    return order || String(right.when).localeCompare(String(left.when));
  });
}

function runsFilterBar(visible, total) {
  const filters = state.runs.filters;
  const entries = runsEntries().filter((entry) => inActiveOperatingArea(entry.operating_area));
  const options = (key, values, labelOf) => values.map((option) => `<option value="${escapeHtml(option)}"${filters[key] === option ? ' selected' : ''}>${escapeHtml(labelOf(option))}</option>`).join('');
  const distinct = (map) => [...new Set(entries.map(map).filter(Boolean))].sort();
  const systems = [...new Map(entries.filter((entry) => entry.system).map((entry) => [entry.system.system_id, entry.system_name])).entries()].sort((left, right) => left[1].localeCompare(right[1], 'pt-BR'));
  const active = Object.values(filters).some(Boolean);
  const routines = [...new Map(entries.filter((entry) => entry.routine_ref || entry.routine_id)
    .map((entry) => [entry.routine_ref || entry.routine_id, entry.routine_name || entry.routine_ref || entry.routine_id])).entries()]
    .sort((left, right) => String(left[1]).localeCompare(String(right[1]), 'pt-BR'));
  const routineCount = (id) => entries.filter((entry) => entry.routine_ref === id || entry.routine_id === id).length;
  return `<div class="runs-filterbar">
    <label>Sistema <select data-runs-filter="system"><option value="">todos</option>${systems.map(([id, name]) => `<option value="${escapeHtml(id)}"${filters.system === id ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
    <label>Rotina <select data-runs-filter="routine"><option value="">todas</option>${routines.map(([id, name]) => `<option value="${escapeHtml(id)}"${filters.routine === id ? ' selected' : ''}>${escapeHtml(name)} (${routineCount(id)})</option>`).join('')}</select></label>
    <label>Modo <select data-runs-filter="mode"><option value="">todos</option>${options('mode', [...distinct((entry) => entry.mode), ...(entries.some((entry) => !entry.mode) ? ['none'] : [])], (option) => option === 'none' ? 'sem modo' : label(option))}</select></label>
    <label>Status <select data-runs-filter="status"><option value="">todos</option>${options('status', distinct((entry) => entry.status), label)}</select></label>
    <label>Decisão <select data-runs-filter="decision"><option value="">todas</option>${options('decision', [...distinct((entry) => entry.decision), ...(entries.some((entry) => !entry.decision) ? ['none'] : [])], (option) => option === 'none' ? 'sem decisão' : label(option))}</select></label>
    <label>Snapshot <select data-runs-filter="snapshot"><option value="">todos</option><option value="with"${filters.snapshot === 'with' ? ' selected' : ''}>com contexto</option><option value="without"${filters.snapshot === 'without' ? ' selected' : ''}>sem snapshot</option></select></label>
    <span class="runs-count muted">${visible} de ${total} execuções${state.operatingAreaFilter ? ` · ${escapeHtml(operatingAreaName(state.operatingAreaFilter))}` : ''}</span>
    ${active ? '<button type="button" class="table-action" data-runs-clear>limpar filtros</button>' : ''}
  </div>`;
}

function runsTraceBadge(entry) {
  const trace = entry.trace || { status: 'none', events: 0 };
  if (trace.status === 'recorded') return badge('recorded', 'good', `Trace V1 · ${trace.events} ev.`);
  if (trace.status === 'reconstructed') return badge('reconstructed', 'warn', `Reconstruído · ${trace.events} ev.`);
  if (trace.status === 'unreadable') return `<span title="O arquivo de trace existe, mas falha na validação do protocolo atual — o Canvas reconstrói a partir do recibo.">${badge('unreadable', 'bad', 'Trace ilegível')}</span>`;
  return '<span class="muted">sem trace</span>';
}

function runsOriginCell(entry) {
  const source = entry.origin === 'routine-receipt'
    ? `<strong>${escapeHtml(entry.routine_name || entry.routine_ref || '—')}</strong><small>rotina · ${escapeHtml(label(entry.trigger || '—'))}</small>`
    : `<strong>${escapeHtml(entry.experiment_ref || 'Run Record')}</strong><small>${entry.experiment_ref ? 'experimento · ' : ''}ledger direto</small>`;
  return source;
}

function runsContextCell(entry) {
  if (!entry.context) return badge('context-not-recorded', 'neutral');
  const gaps = entry.context.gaps + entry.context.conflicts;
  const core = `${entry.context.sources} fonte(s)${gaps ? ` · <span class="gap-mark">${gaps} lacuna(s)</span>` : ''}`;
  return entry.receipt_id
    ? `<button class="table-action" data-open-context="${escapeHtml(entry.receipt_id)}">${core} →</button>`
    : core;
}

function runsChainCell(entry) {
  if (!entry.chain_id) return '<span class="muted">—</span>';
  return `<code>${escapeHtml(entry.chain_id)}</code>${entry.handoff_count ? `<small>${entry.handoff_count} handoff(s)</small>` : ''}`;
}

function runsSameSystem(a, b) {
  return a.system && b.system ? a.system === b.system : a.system_ref === b.system_ref;
}

function runsCompareSlot(visible) {
  const a = visible.find((entry) => entry.selector_ref === state.runs.cmpA);
  const b = visible.find((entry) => entry.selector_ref === state.runs.cmpB);
  if (!a || !b) return '<p class="muted">Escolha duas execuções acima.</p>';
  if (a.selector_ref === b.selector_ref) return '<p class="muted">Escolha duas execuções diferentes.</p>';
  if (!runsSameSystem(a, b)) {
    return `<div class="experiment-gap">Runs de sistemas diferentes (${escapeHtml(a.system_name)} × ${escapeHtml(b.system_name)}) não são comparáveis — comparar exige o mesmo contrato de sistema.</div>`;
  }
  if (!a.record || !b.record) {
    return '<div class="experiment-gap">Uma das execuções não tem Run Record no ledger — sem base estruturada para comparar. O recibo da rotina continua auditável na tabela.</div>';
  }
  return runCompareTable(a.record, b.record);
}

function runsCompareSection(visible) {
  if (visible.length < 2) return '<p class="section-help">Comparação disponível a partir de duas execuções visíveis.</p>';
  const valid = new Set(visible.map((entry) => entry.selector_ref));
  if (!valid.has(state.runs.cmpA) || !valid.has(state.runs.cmpB) || state.runs.cmpA === state.runs.cmpB) {
    // Default honesto: o par comparável mais recente (mesmo sistema, com record).
    const pair = visible.find((entry, index) => entry.record
      && visible.slice(index + 1).some((other) => other.record && runsSameSystem(other, entry)));
    const partner = pair ? visible.find((other) => other !== pair && other.record && runsSameSystem(other, pair)) : null;
    state.runs.cmpB = (pair || visible[0]).selector_ref;
    state.runs.cmpA = (partner || visible[1]).selector_ref;
  }
  const optionsFor = (selected) => visible.map((entry) => `<option value="${escapeHtml(entry.selector_ref)}"${entry.selector_ref === selected ? ' selected' : ''}>${escapeHtml(entry.system_name)} · ${fmtDate(entry.when)} · ${escapeHtml(entry.mode ? label(entry.mode) : label(entry.origin === 'routine-receipt' ? 'routine' : 'run'))}</option>`).join('');
  return `<section class="organ"><header class="organ-head"><div><h3>O que mudou entre duas runs</h3><p>comparável = mesmo sistema, com Run Record no ledger</p></div></header>
    <div class="ws-compare-pick"><label>A <select id="runs-cmp-a">${optionsFor(state.runs.cmpA)}</select></label>
    <label>B <select id="runs-cmp-b">${optionsFor(state.runs.cmpB)}</select></label></div>
    <div id="runs-compare">${runsCompareSlot(visible)}</div></section>`;
}

function runsKpis(visible) {
  const sevenDays = Date.now() - 7 * 86400000;
  const week = visible.filter((entry) => Date.parse(entry.when) >= sevenDays).length;
  const withContext = visible.filter((entry) => entry.context).length;
  const recorded = visible.filter((entry) => entry.trace?.status === 'recorded').length;
  const reconstructed = visible.filter((entry) => entry.trace?.status === 'reconstructed').length;
  const noTrace = visible.length - recorded - reconstructed;
  const evalFailed = visible.filter((entry) => entry.eval_passed === false).length;
  const rejected = visible.filter((entry) => ['rejected', 'changes-requested'].includes(entry.decision)).length;
  const pending = visible.filter((entry) => entry.decision === 'pending').length;
  return `<div class="experiment-kpis">
    <span><b>${visible.length}</b> execuções · ${week} nos últimos 7d</span>
    <span><b>${withContext}</b> com contexto registrado · ${visible.length - withContext} sem snapshot</span>
    <span><b>${recorded}</b> trace V1 · ${reconstructed} reconstruído(s) · ${noTrace} sem trace</span>
    <span class="${evalFailed ? 'attention' : ''}"><b>${evalFailed}</b> eval falhou</span>
    <span class="${rejected ? 'attention' : ''}"><b>${rejected}</b> rejeitada(s)/ajuste · ${pending} pendente(s) de martelo</span>
  </div>`;
}

function renderRuns() {
  if (!state.runs.data) {
    void loadRuns();
    return '<div class="loading"><i></i><span>Unificando recibos e ledger de runs…</span></div>';
  }
  if (state.runs.data.error) return empty('Execuções indisponíveis', label(state.runs.data.error));
  const total = runsEntries().filter((entry) => inActiveOperatingArea(entry.operating_area)).length;
  const visible = runsVisibleEntries();
  const issues = (state.runs.data.issues || []).map((issue) => `<div class="experiment-gap">${escapeHtml(label(issue.reason_code))} · <code>${escapeHtml(issue.ref)}</code></div>`).join('');
  const sortMark = (key) => state.runs.sort.key === key ? `<b>${state.runs.sort.dir === 'asc' ? '↑' : '↓'}</b>` : '';
  const rows = visible.map((entry) => `<tr>
    <td><strong>${fmtDate(entry.when)}</strong><small title="${escapeHtml(entry.run_id)}">${escapeHtml(entry.run_id.length > 22 ? `${entry.run_id.slice(0, 22)}…` : entry.run_id)}</small></td>
    <td><button type="button" class="table-action" data-open-system="${escapeHtml(entry.system?.system_id || entry.system_ref)}">${escapeHtml(entry.system_name)}</button><small>${entry.system_version ? `v${escapeHtml(entry.system_version)}` : 'versão não registrada'}</small></td>
    <td>${runsOriginCell(entry)}</td>
    <td>${entry.mode ? badge(entry.mode, entry.mode === 'live' ? 'good' : 'neutral') : '<span class="muted">—</span>'}</td>
    <td>${badge(entry.status)}</td>
    <td>${runsContextCell(entry)}</td>
    <td>${entry.eval_passed === true ? badge('evaluation-passed', 'good') : entry.eval_passed === false ? badge('evaluation-gate-failed', 'bad') : '<span class="muted">—</span>'}</td>
    <td>${entry.decision ? badge(entry.decision) : '<span class="muted">—</span>'}</td>
    <td>${runsChainCell(entry)}</td>
    <td>${runsTraceBadge(entry)}<button class="table-action" data-canvas-jump-run="${escapeHtml(entry.selector_ref)}">trace →</button></td>
  </tr>`).join('');
  return `<div class="section-heading"><div><p class="eyebrow">Rastro</p><h2>Execuções</h2></div><p>Recibos de rotina e Run Records do ledger na mesma linha do tempo. Tudo reference-only ${prov('observado')} — o conteúdo continua privado.</p></div>
    ${issues}
    ${runsKpis(visible)}
    ${runsFilterBar(visible.length, total)}
    <div class="table-wrap runs-table"><table><thead><tr>
      <th data-runs-sort="when">Quando${sortMark('when')}</th>
      <th data-runs-sort="system">Sistema${sortMark('system')}</th>
      <th>Rotina / experimento</th>
      <th data-runs-sort="mode">Modo${sortMark('mode')}</th>
      <th data-runs-sort="status">Status${sortMark('status')}</th>
      <th>Contexto</th>
      <th data-runs-sort="eval">Eval${sortMark('eval')}</th>
      <th data-runs-sort="decision">Decisão${sortMark('decision')}</th>
      <th>Cadeia</th>
      <th>Trace</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="10">${total ? 'Nenhuma execução passa nos filtros atuais.' : 'Nenhuma execução registrada ainda — recibo ou Run Record aparecem aqui.'}</td></tr>`}</tbody></table></div>
    ${runsCompareSection(visible)}`;
}

function renderGovernance() {
  const grants = state.model.routines.flatMap((routine) => routine.access.map((access) => ({ ...access, routine })));
  return `<div class="section-heading"><div><p class="eyebrow">Autoridade</p><h2>Governança de acesso</h2></div><p>Revogação bloqueia Runs futuros. Ela não apaga um contexto já consumido.</p></div><div class="object-grid">${grants.map(({ routine, ...access }) => {
    const grantId = access.grant_ref.replace(/^access-grant:/, '');
    const revoke = access.grant_status === 'granted' && access.revocation_effect === 'future-only'
      ? `<button class="secondary-action" data-revoke-grant="${escapeHtml(grantId)}">Revogar acesso futuro</button>` : '';
    return `<article class="object-card" data-kind="grant"><div class="object-card-top">${badge(access.grant_status, access.grant_status === 'granted' ? 'good' : 'bad')}${badge(access.assurance, access.assurance === 'runtime-enforced' ? 'good' : 'neutral')}</div><p class="micro">${escapeHtml(routine.name)}</p><h3>${escapeHtml(access.source_ref)}</h3><p>${escapeHtml(access.action)} · ${escapeHtml(access.requested_mode)}</p><div class="boundary-note"><b>Revogação</b>${escapeHtml(label(access.revocation_effect))}</div>${revoke}</article>`;
  }).join('') || empty('Nenhuma concessão declarada', 'A rotina pode existir sem grant quando trabalha apenas com instrução local.')}</div>`;
}

function renderHealth() {
  const rows = state.model.routines.map((routine) => ({ name: routine.name, reason: routine.health_reason_code, binding: routine.binding.auth_status }));
  return `<div class="section-heading"><div><p class="eyebrow">Readback</p><h2>Saúde operacional</h2></div><p>Estado derivado de arquivos canônicos, nunca de um painel editorial paralelo.</p></div><div class="health-list">${rows.map((row) => `<article><span class="health-dot ${tone(row.reason)}"></span><div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(label(row.reason))}</p></div><code>${escapeHtml(row.binding)}</code></article>`).join('')}${state.model.issues.map((issue) => `<article><span class="health-dot bad"></span><div><h3>${escapeHtml(label(issue.reason_code))}</h3><p>${escapeHtml(issue.ref)}</p></div></article>`).join('')}</div><div class="cache-note"><strong>Índice reconstruível</strong><p>Este V0 não mantém banco nem cache persistente. Cada atualização recompila contratos, bindings, estado e recibos locais.</p></div>`;
}

function renderVibeMakers() {
  const catalog = state.vibeMakers.data;
  if (!catalog) {
    if (state.vibeMakers.error) return empty('Vibe Makers indisponível', 'O catálogo local não pôde ser compilado. Atualize o Cockpit para tentar novamente.');
    if (!state.vibeMakers.loading) void loadVibeMakers();
    return '<div class="loading"><i></i><span>Compilando o catálogo local da comunidade Vibe Makers…</span></div>';
  }
  if (state.vibeMakers.selected) {
    const selected = catalog.systems.find((system) => system.system_id === state.vibeMakers.selected);
    if (selected) return renderVibeMakersDetail(selected);
    state.vibeMakers.selected = null;
  }
  return renderVibeMakersCatalog(catalog);
}

function vibeMakersStatus(system) {
  if (system.availability === 'validated') return badge('validated', 'good', 'Validado na rede');
  return badge('validation', 'warn', 'Acesso Vibe Makers · em validação');
}

function vibeMakersPublisher(system) {
  return system.experience?.publisher?.display_name || 'Publisher não publicado';
}

function vibeMakersValidationProgress(system) {
  if (system.availability !== 'validation') return '';
  const validation = system.validation;
  return `<div class="vibe-makers-proof-mini"><span><b>${validation.verified_real_cycles}/${validation.required_real_cycles}</b> ciclos reais</span><span><b>${validation.verified_distinct_member_brains}/${validation.required_distinct_member_brains}</b> Cérebros</span></div>`;
}

function vibeMakersCard(system) {
  const compatibility = system.compatibility;
  const compatibilityCopy = compatibility ? vibeMakersCompatibilityCopy(compatibility.status) : null;
  return `<article class="vibe-makers-card">
    <div class="vibe-makers-card-top">${systemIdentity(system)}${vibeMakersStatus(system)}</div>
    <div class="vibe-makers-card-meta"><span>${escapeHtml(system.release.channel)}</span><code>v${escapeHtml(system.release.version)}</code></div>
    <h3>${escapeHtml(system.name)}</h3>
    <p>${escapeHtml(system.result)}</p>
    <div class="vibe-makers-publisher"><span aria-hidden="true">◎</span><div><small>Publicado por</small><b>${escapeHtml(vibeMakersPublisher(system))}</b></div></div>
    ${vibeMakersValidationProgress(system)}
    ${compatibilityCopy ? `<div class="vibe-makers-compatibility-mini"><span class="${escapeHtml(compatibilityCopy.tone)}"></span><b>${escapeHtml(compatibilityCopy.label)}</b><small>${compatibility.counts.ready_roles}/${compatibility.counts.required_roles} papéis prontos</small></div>` : ''}
    <button type="button" class="vibe-makers-card-action" data-vibe-makers-open="${escapeHtml(system.system_id)}">Ver compatibilidade <span aria-hidden="true">→</span></button>
  </article>`;
}

function renderVibeMakersCatalog(catalog) {
  const query = state.vibeMakers.query.trim().toLocaleLowerCase('pt-BR');
  const visible = catalog.systems.filter((system) => {
    const filterMatch = state.vibeMakers.filter === 'all' || system.availability === state.vibeMakers.filter;
    const haystack = `${system.name} ${system.result} ${system.setpoint} ${vibeMakersPublisher(system)}`.toLocaleLowerCase('pt-BR');
    return filterMatch && (!query || haystack.includes(query));
  });
  const filters = [
    ['all', 'Todos', catalog.counts.visible],
    ['validated', 'Validados', catalog.counts.validated],
    ['validation', 'Em validação', catalog.counts.validation],
  ].map(([value, copy, count]) => `<button type="button" class="vibe-makers-filter${state.vibeMakers.filter === value ? ' active' : ''}" data-vibe-makers-filter="${value}">${copy} <b>${count}</b></button>`).join('');
  return `<section class="vibe-makers-catalog">
    <header class="vibe-makers-hero"><div><p class="eyebrow">Catálogo da comunidade</p><h2>Vibe Makers</h2><p>Membros têm acesso aos sistemas publicados na rede. Você implanta no seu cérebro, usa no trabalho real e ajuda a validar o que entra.</p></div><div class="vibe-makers-counts"><span><b>${catalog.counts.validated}</b><small>validados</small></span><span><b>${catalog.counts.validation}</b><small>com acesso antecipado</small></span></div></header>
    <div class="vibe-makers-boundary"><span>Circula</span><b>Protocolo · Capability · versão · prova agregada</b><span>Permanece local</span><b>Fontes · contexto · outputs · decisões</b></div>
    <div class="vibe-makers-toolbar"><label><span>Buscar no acervo</span><input type="search" data-vibe-makers-search value="${escapeHtml(state.vibeMakers.query)}" placeholder="Resultado, nome ou publisher" autocomplete="off"></label><div class="vibe-makers-filters" aria-label="Estado de publicação">${filters}</div></div>
    <div class="vibe-makers-results"><span>${visible.length} ${visible.length === 1 ? 'capacidade disponível' : 'capacidades disponíveis'}</span><small>O catálogo é local; instalar nunca envia seu contexto para a comunidade Vibe Makers.</small></div>
    <div class="vibe-makers-catalog-grid">${visible.map(vibeMakersCard).join('') || empty('Nenhum Sistema neste recorte', 'Altere a busca ou escolha outro estado de publicação.')}</div>
  </section>`;
}

function vibeMakersRequirementList(system) {
  const compatibilityByRole = new Map((system.compatibility?.roles || []).map((role) => [role.role, role]));
  const sources = system.requirements.source_roles.map((source) => {
    const role = compatibilityByRole.get(source.role);
    const stateCopy = role ? vibeMakersCompatibilityCopy(role.status).label : 'Não verificado';
    const binding = role?.current_binding?.source?.name;
    const viable = role?.candidates?.filter((candidate) => candidate.compatibility === 'semantic-approval-required') || [];
    const detail = binding || (viable.length ? `${viable.length} candidata(s) mecânica(s)` : source.examples.join(' ou '));
    return `<li><span>Fonte</span><b>${escapeHtml(source.label)}</b><small>${source.required ? 'Obrigatória' : 'Opcional'} · ${escapeHtml(stateCopy)} · ${escapeHtml(detail)}</small></li>`;
  }).join('');
  return `${sources}<li><span>Evento real</span><b>${escapeHtml(system.requirements.real_event)}</b><small>O primeiro valor precisa acontecer no trabalho real.</small></li><li><span>Cérebro hdoria</span><b>v${escapeHtml(system.release.minimum_brain_version)} ou superior</b><small>Compatibilidade mínima publicada pelo pacote.</small></li>`;
}

function vibeMakersCompatibilityCopy(status) {
  return {
    ready: { label: 'Pronto', tone: 'good', detail: 'Papéis aprovados e grants ativos.' },
    'not-required': { label: 'Pronto', tone: 'good', detail: 'Este Sistema não exige Fontes.' },
    'needs-mapping': { label: 'Mapeamento necessário', tone: 'warn', detail: 'Há candidatas locais; o dono ainda precisa confirmar a semântica.' },
    'awaiting-approval': { label: 'Aguardando aprovação', tone: 'warn', detail: 'O vínculo foi proposto, mas binding e grant ainda não estão aprovados.' },
    'missing-source': { label: 'Fonte ausente', tone: 'bad', detail: 'Ao menos um papel obrigatório não tem candidata mecânica local.' },
    incompatible: { label: 'Vínculo incompatível', tone: 'bad', detail: 'Um binding atual é ambíguo, inválido, revogado ou expirou.' },
    degraded: { label: 'Vínculo degradado', tone: 'warn', detail: 'A Fonte existe, mas o vínculo precisa ser revisto.' },
  }[status] || { label: 'Não verificado', tone: 'neutral', detail: 'O pacote precisa publicar um System Contract compatível.' };
}

function vibeMakersCompatibilityPanel(system) {
  const compatibility = system.compatibility;
  if (!compatibility) {
    return `<section class="vibe-makers-compatibility"><p class="eyebrow">Compatibilidade local</p><h3>Contrato insuficiente</h3><p>Este pacote precisa publicar o System Contract antes de comparar Fontes.</p></section>`;
  }
  const copy = vibeMakersCompatibilityCopy(compatibility.status);
  const roles = compatibility.roles.map((role) => {
    const roleCopy = vibeMakersCompatibilityCopy(role.status);
    const current = role.current_binding?.source?.name || null;
    const viable = role.candidates.filter((candidate) => candidate.compatibility === 'semantic-approval-required');
    const sourceLine = current ? `Vinculada a ${current}`
      : viable.length ? `Candidatas: ${viable.slice(0, 3).map((candidate) => candidate.name).join(' · ')}${viable.length > 3 ? ` · +${viable.length - 3}` : ''}; sem aprovação semântica`
        : 'Nenhuma Fonte local atende aos checks mecânicos';
    return `<li><span class="compatibility-dot ${escapeHtml(roleCopy.tone)}"></span><div><b>${escapeHtml(role.role)}</b><small>${escapeHtml(sourceLine)}</small></div><em>${escapeHtml(roleCopy.label)}</em></li>`;
  }).join('');
  return `<section class="vibe-makers-compatibility" data-compatibility-status="${escapeHtml(compatibility.status)}">
    <p class="eyebrow">Compatibilidade local</p>
    <div class="vibe-makers-compatibility-head"><h3>${escapeHtml(copy.label)}</h3><span class="compatibility-dot ${escapeHtml(copy.tone)}"></span></div>
    <p>${escapeHtml(copy.detail)}</p>
    <ul>${roles}</ul>
    <div class="vibe-makers-agent-command"><span>Codex / Claude Code</span><code>${escapeHtml(compatibility.agent_command)}</code><button type="button" data-vibe-makers-copy-command="${escapeHtml(compatibility.agent_command)}">Copiar comando</button></div>
    <small>O plano lê somente contratos e referências locais; conteúdo e credenciais não entram no diagnóstico. Conector ativo sem Source Contract ainda conta como Fonte ausente.</small>
  </section>`;
}

function vibeMakersInstallPanel(system) {
  const compatibility = system.compatibility;
  if (!compatibility) {
    return `<div class="vibe-makers-install-state"><button type="button" disabled>Verificação indisponível</button><p>Atualize o contrato do pacote antes de instalar.</p></div>`;
  }
  if (!compatibility.activation_ready) {
    const copy = vibeMakersCompatibilityCopy(compatibility.status);
    return `<div class="vibe-makers-install-state"><button type="button" data-vibe-makers-copy-command="${escapeHtml(compatibility.agent_command)}">Resolver com o agente</button><p>${escapeHtml(copy.detail)} O pacote ainda não será ativado.</p></div>`;
  }
  if (system.installation_status === 'installed') {
    return `<div class="vibe-makers-install-state is-installed"><span>Pronto para o primeiro run</span><b>Fontes aprovadas; o output real ainda precisa do julgamento da pessoa.</b></div>`;
  }
  if (system.install_action === 'approval-required') {
    return `<div class="vibe-makers-install-state"><button type="button" disabled>Acesso Vibe Makers</button><p>Compatibilidade local confirmada. Membros podem implantar este piloto com acompanhamento.</p></div>`;
  }
  return `<div class="vibe-makers-install-state"><button type="button" disabled>Pronto para instalar</button><p>A compatibilidade passou; a mutação de instalação continua no agente local com confirmação explícita.</p></div>`;
}

function renderVibeMakersDetail(system) {
  const validation = system.validation;
  const publisher = system.experience?.publisher;
  return `<section class="vibe-makers-detail">
    <button type="button" class="vibe-makers-back" data-vibe-makers-back>← Voltar ao catálogo</button>
    <header class="vibe-makers-detail-hero"><div class="vibe-makers-detail-identity">${systemIdentity(system, 'large')}<div><p class="micro">${escapeHtml(system.release.channel)} · v${escapeHtml(system.release.version)}</p><h2>${escapeHtml(system.name)}</h2><p>${escapeHtml(system.result)}</p></div></div><div class="vibe-makers-detail-state">${vibeMakersStatus(system)}<span>${escapeHtml(system.installation_status === 'installed' ? 'Instalado neste Cérebro' : 'Não instalado')}</span></div></header>
    <div class="vibe-makers-detail-layout"><main>
      <section class="vibe-makers-detail-section"><p class="eyebrow">Promessa contratada</p><h3>O que muda no trabalho</h3><dl><div><dt>Resultado</dt><dd>${escapeHtml(system.result)}</dd></div><div><dt>Primeiro valor</dt><dd>${escapeHtml(system.first_value)}</dd></div><div><dt>Régua</dt><dd>${escapeHtml(system.setpoint)}</dd></div></dl></section>
      ${vibeMakersCompatibilityPanel(system)}
      <section class="vibe-makers-detail-section"><p class="eyebrow">Antes de instalar</p><h3>O que este Sistema precisa</h3><ul class="vibe-makers-requirements">${vibeMakersRequirementList(system)}</ul></section>
      <section class="vibe-makers-detail-section"><p class="eyebrow">Autoridade e privacidade</p><h3>O que ele pode fazer</h3><div class="vibe-makers-permissions"><span><i>${system.privacy.connects_sources_automatically ? '×' : '✓'}</i>Não conecta Fontes sozinho</span><span><i>${system.privacy.writes_external_systems_automatically ? '×' : '✓'}</i>Não escreve no CRM sozinho</span><span><i>${system.privacy.requires_source_by_source_consent ? '✓' : '×'}</i>Consentimento Fonte a Fonte</span><span><i>${system.requirements.human_approval_before_external_write ? '✓' : '×'}</i>Aprovação humana antes de escrever fora</span></div></section>
    </main><aside>
      ${vibeMakersInstallPanel(system)}
      <section class="vibe-makers-proof"><p class="eyebrow">Prova da rede</p><h3>${system.availability === 'validated' ? 'Validação concluída' : 'Ainda em validação'}</h3><div><span><b>${validation.verified_real_cycles}</b><small>de ${validation.required_real_cycles} ciclos reais</small></span><span><b>${validation.verified_distinct_member_brains}</b><small>de ${validation.required_distinct_member_brains} Cérebros</small></span></div><ul><li class="${validation.requires_eval_pass ? '' : 'muted'}">Eval precisa passar</li><li class="${validation.requires_repeat_use ? '' : 'muted'}">Uso repetido é obrigatório</li><li class="${validation.requires_human_approval ? '' : 'muted'}">Julgamento humano é obrigatório</li></ul></section>
      <section class="vibe-makers-publisher-card"><p class="eyebrow">Publicação</p><h3>${escapeHtml(publisher?.display_name || 'Publisher não publicado')}</h3><p>${publisher ? `Identidade declarada por ${escapeHtml(publisherKindLabel(publisher.kind))} no Experience Manifest.` : 'O pacote ainda não publicou um Experience Manifest. O Cockpit usa uma identidade neutra e não inventa autoria.'}</p><code>${escapeHtml(system.package_ref)}</code></section>
    </aside></div>
    <div class="boundary-note"><b>Catálogo ≠ Cérebro compartilhado</b>A comunidade Vibe Makers distribui contratos, capacidade e atualizações. Seu contexto, outputs e julgamentos permanecem nesta empresa.</div>
  </section>`;
}

async function loadVibeMakers() {
  if (state.vibeMakers.loading) return;
  state.vibeMakers.loading = true;
  state.vibeMakers.error = null;
  try {
    state.vibeMakers.data = await getJson('/api/vibe-makers');
  } catch (error) {
    state.vibeMakers.error = error.message;
  } finally {
    state.vibeMakers.loading = false;
    if (state.view === 'vibe-makers') render();
    if (typeof palette !== 'undefined' && palette.open) paletteRender();
  }
}

/* --- Ferramentas: o cérebro só pergunta ao Claude Code quais conectores estão ligados.
   Login, token e dados ficam na conta do Claude; nada disto lê e-mail, agenda ou tarefa. */
const toolStatusCopy = {
  connected: ['good', 'Conectado'],
  'needs-auth': ['warn', 'Falta autorizar'],
  failed: ['bad', 'Falhou ao conectar'],
  'not-enabled': ['warn', 'Não ligado'],
  unknown: ['warn', 'Não verificado'],
};

const toolProbeNotice = {
  'claude-missing': ['O Claude Code não foi encontrado', 'Esta máquina não tem o comando claude. Instale o Claude Code e clique em Verificar de novo.'],
  timeout: ['A verificação não terminou', 'O Claude Code demorou mais que o limite para responder. Clique em Verificar de novo.'],
  failed: ['A verificação não terminou', 'O Claude Code não respondeu como esperado. Clique em Verificar de novo.'],
};

function toolCard(tool, connectUrl) {
  const [tone, copy] = toolStatusCopy[tool.status] || toolStatusCopy.unknown;
  const connected = tool.status === 'connected';
  const label = connected ? 'Revisar no Claude' : 'Ligar no Claude';
  const steps = connected ? '' : `<ol class="tool-steps">${tool.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
  return `<article class="tool-card">
    <div class="tool-card-top"><h3>${escapeHtml(tool.name)}</h3>${badge(tool.status, tone, copy)}</div>
    <p>${escapeHtml(tool.purpose)}</p>
    ${steps}
    ${tool.server_url && !connected ? `<p class="tool-server">Endereço do conector <code>${escapeHtml(tool.server_url)}</code></p>` : ''}
    <a class="action" href="${escapeHtml(connectUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>
  </article>`;
}

function toolsCheckedAt(checkedAt) {
  const time = new Date(checkedAt);
  if (Number.isNaN(time.getTime())) return '';
  return `Verificado às ${time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function renderTools() {
  const data = state.tools.data;
  if (!data) {
    if (state.tools.error) return `${empty('Não foi possível verificar', 'O Console não conseguiu consultar o Claude Code. Tente de novo.')}<p class="tools-retry"><button type="button" class="action" data-tools-refresh>Tentar de novo</button></p>`;
    if (!state.tools.loading) void loadTools(false);
    return '<div class="loading"><i></i><span>Verificando as ferramentas no Claude. Isso pode levar até 45 segundos.</span></div>';
  }
  const notice = toolProbeNotice[data.probe_state];
  const noticeMarkup = notice ? `<div class="boundary-note tool-notice"><b>${escapeHtml(notice[0])}</b>${escapeHtml(notice[1])}</div>` : '';
  const busy = state.tools.loading;
  return `<section class="tools-screen">
    <div class="tools-toolbar"><span class="tools-checked">${escapeHtml(toolsCheckedAt(data.checked_at))}</span><button type="button" class="action" data-tools-refresh ${busy ? 'disabled' : ''}>${busy ? 'Verificando…' : 'Verificar de novo'}</button></div>
    <ul class="tools-facts">
      <li>O login fica na sua conta do Claude.</li>
      <li>O cérebro não guarda senha nem token.</li>
      <li>A verificação pergunta ao Claude Code quais conectores estão ligados. Ela não lê seus e-mails, eventos ou tarefas.</li>
    </ul>
    ${noticeMarkup}
    <div class="tools-grid">${data.tools.map((tool) => toolCard(tool, data.connect_url)).join('')}</div>
    <p class="section-help">Quem entra no Claude Code com chave de API não vê os conectores do claude.ai.</p>
  </section>`;
}

async function loadTools(refresh) {
  if (state.tools.loading) return;
  state.tools.loading = true;
  state.tools.error = null;
  if (refresh) render();
  let failed = false;
  try {
    state.tools.data = await getJson(refresh ? '/api/connections/tools?refresh=1' : '/api/connections/tools');
  } catch (error) {
    failed = true;
    if (!state.tools.data) state.tools.error = error.message;
  } finally {
    state.tools.loading = false;
    if (state.view === 'tools') render();
  }
  if (failed && state.tools.data) toast('Não foi possível verificar agora. Mostrando o último resultado.', 'bad');
}

/* --- Decision Case: o Console prepara o caso, o humano dá o martelo ---
   Nenhum botão desta view decide sozinho. Preparar e simular não escrevem nada;
   aplicar exige o digest do diff que a pessoa acabou de ler; reverter guarda cópia
   privada e para se alguém editou a nota depois do martelo. */

const CASE_VERDICTS = [
  ['decided', 'Decidido', 'Vale a partir do registro.'],
  ['dropped', 'Descartado', 'O item morre e não volta sem caso novo.'],
  ['deferred', 'Adiado', 'Com data explícita de revisão — sem terceira opção silenciosa.'],
];
const CASE_ROLLBACK_REASONS = [
  ['wrong-verdict', 'Veredito errado'],
  ['wrong-evidence', 'Evidência errada'],
  ['duplicate', 'Duplicado'],
  ['superseded', 'Superado por decisão nova'],
  ['mistake', 'Registro por engano'],
];

function emptyCaseForm() {
  return { verdict: 'decided', theme: 'metodo', review_on: '', title: '', decision_text: '', evidence: [], authored: false };
}

function caseProvenance(provenance) {
  const map = { observed: ['observado', 'good'], declared: ['declarado', 'neutral'], inferred: ['inferido', 'warn'] };
  const [text, kind] = map[provenance] || [provenance, 'neutral'];
  return `<span class="badge ${kind}"><i></i>${escapeHtml(text)}</span>`;
}

function caseStateBadge(state) {
  if (state.status === 'applied') return badge('applied', 'good', 'Registrado no vault');
  if (state.status === 'rolled-back') return badge('rolled-back', 'warn', 'Revertido');
  return badge('pending', 'warn', 'Espera martelo');
}

function caseDiffBlock(diff) {
  return `<pre class="case-diff">${diff.split('\n').map((line) => {
    const kind = line.startsWith('+++') || line.startsWith('---') ? 'meta'
      : line.startsWith('@@') ? 'hunk'
        : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
    return `<span class="${kind}">${escapeHtml(line) || '&nbsp;'}</span>`;
  }).join('\n')}</pre>`;
}

function caseHistory(state) {
  if (!state.history.length) return '';
  return `<section class="drawer-section"><h3>Histórico do caso</h3><div class="ref-list vertical">${state.history.map((event) => `<div class="case-event">${badge(event.event, event.event === 'applied' ? 'good' : 'warn', event.event === 'applied' ? 'Registrado' : 'Revertido')}<span>${fmtDate(event.recorded_at)} · <code>${escapeHtml(event.actor_ref)}</code>${event.reason_code ? ` · ${escapeHtml(label(event.reason_code))}` : ''}</span><code>${escapeHtml(event.event_ref)}</code></div>`).join('')}</div></section>`;
}

function caseList() {
  const data = state.cases.list;
  if (!data) return '<p class="muted">Carregando a fila de casos…</p>';
  if (!data.available) {
    return empty('Fila de decisão indisponível', 'O motor do vault (gera_fila_decisao.py) ainda não materializou `.automacao/_FILA-DECISAO.json`. O Console mostra a verdade; não inventa fila.');
  }
  if (!data.cases.length) return empty('Nenhum item espera martelo', 'Fila vazia — nada para decidir agora.');
  const rows = data.cases.map((item) => `<article class="case-row" data-case-open="${escapeHtml(item.case_id)}" role="button" tabindex="0">
      <div class="case-row-top">${caseStateBadge(item.state)}<span class="decision-age${item.age_days >= 30 ? ' overdue' : item.age_days >= 7 ? ' late' : ''}">${item.age_days}d</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="micro">${escapeHtml(decisionCategory(item.category))} · na fila desde ${escapeHtml(item.first_seen)}</p>
      ${item.state.canonical_path ? `<code>${escapeHtml(item.state.canonical_path)}</code>` : ''}
    </article>`).join('');
  return `<div class="case-kpis">
      <div><b>${data.open_count}</b><span>abertos</span></div>
      <div><b>${data.applied_count}</b><span>com martelo registrado</span></div>
      <div><b>${data.decided_total}</b><span>já saíram da fila</span></div>
      <div><b>${data.house_ready ? 'pronta' : 'ausente'}</b><span>casa canônica</span></div>
    </div>
    <div class="case-grid">${rows}</div>
    <div class="boundary-note"><b>O Console não decide</b>Ele reúne o item, resolve a evidência e mostra o diff exato. A decisão é sua, o texto é seu, e o registro só acontece depois de você confirmar o diff que leu.</div>`;
}

function caseEvidenceRow(entry, checked) {
  return `<label class="case-evidence">
    <input type="checkbox" data-case-field="evidence" value="${escapeHtml(entry.ref)}"${checked ? ' checked' : ''}>
    <span class="case-evidence-body">
      <code>${escapeHtml(entry.ref)}</code>
      <small>${escapeHtml(entry.summary)}${entry.path ? ` · <code>${escapeHtml(entry.path)}</code>` : ''}</small>
    </span>
    ${caseProvenance(entry.provenance)}
  </label>`;
}

function casePreviewBlock() {
  const preview = state.cases.preview;
  if (!preview) {
    return `<div class="boundary-note"><b>Nada foi escrito ainda</b>Simular monta a nota inteira e devolve o diff. Enquanto você não confirmar esse diff, o vault não é tocado.</div>`;
  }
  return `<section class="case-preview">
    <div class="subheading"><h3>Diff exato · o que vai para o vault</h3><span>${preview.canonical_write.bytes} bytes</span></div>
    <p class="case-path"><span>arquivo novo</span><code>${escapeHtml(preview.canonical_write.path)}</code></p>
    ${caseDiffBlock(preview.diff)}
    <div class="case-preview-meta">
      <span>plano <code>${escapeHtml(preview.plan_digest.slice(0, 19))}…</code></span>
      <span>vale até ${fmtDate(preview.expires_at)}</span>
      <span>${preview.evidence.length} evidência(s)</span>
    </div>
    <div class="case-actions">
      <button class="action primary" data-case-apply>Confirmar este diff e registrar</button>
      <button class="action" data-case-discard>Descartar simulação</button>
    </div>
    <div class="boundary-note"><b>Confirmação é do diff, não do botão</b>Registrar exige o digest deste plano. Se você mudar qualquer campo, esta simulação morre e é preciso simular de novo — o que se escreve é byte a byte o que está acima.</div>
  </section>`;
}

function caseAppliedBlock(detail) {
  const { state: caseState } = detail;
  const path = caseState.canonical_path;
  return `<section class="case-preview applied">
    <div class="subheading"><h3>Martelo registrado</h3><span>${escapeHtml(caseState.last_event.actor_ref)}</span></div>
    <p class="case-path"><span>fonte canônica</span><code>${escapeHtml(path)}</code></p>
    <div class="case-preview-meta">
      <span>${fmtDate(caseState.last_event.recorded_at)}</span>
      <span>veredito ${escapeHtml(label(caseState.last_event.verdict))}</span>
      <span>recibo <code>${escapeHtml(caseState.applied_ref)}</code></span>
    </div>
    <div class="case-actions">
      <label class="case-inline-field"><span>Motivo da reversão</span><select data-case-field="rollback_reason">${CASE_ROLLBACK_REASONS.map(([value, text]) => `<option value="${value}">${escapeHtml(text)}</option>`).join('')}</select></label>
      <button class="action danger" data-case-rollback>Reverter registro</button>
    </div>
    <div class="boundary-note"><b>Reverter apaga o registro, não o efeito</b>A nota sai do vault, uma cópia privada fica em <code>.cerebro/runtime/decisions/</code> e um recibo de reversão entra no histórico. O que a decisão causou fora do cérebro continua valendo.</div>
  </section>`;
}

function caseForm(detail) {
  const form = state.cases.form;
  const selected = new Set(form.evidence);
  const candidates = detail.evidence_candidates;
  return `<section class="case-form">
    <div class="subheading"><h3>Seu martelo</h3><span>autoria humana obrigatória</span></div>
    <div class="case-verdicts">${CASE_VERDICTS.map(([value, text, hint]) => `<button class="case-verdict${form.verdict === value ? ' active' : ''}" data-case-verdict="${value}"><b>${escapeHtml(text)}</b><small>${escapeHtml(hint)}</small></button>`).join('')}</div>
    ${form.verdict === 'deferred' ? `<label class="case-field"><span>Revisar em (data explícita, obrigatória)</span><input type="date" data-case-field="review_on" value="${escapeHtml(form.review_on)}"></label>` : ''}
    <label class="case-field"><span>Título da decisão · vira o nome do arquivo</span><input type="text" data-case-field="title" maxlength="120" value="${escapeHtml(form.title)}" placeholder="O que ficou decidido, em uma linha"></label>
    <label class="case-field"><span>Tema</span><select data-case-field="theme">${detail.canonical.themes.map((theme) => `<option value="${escapeHtml(theme)}"${form.theme === theme ? ' selected' : ''}>${escapeHtml(theme)}</option>`).join('')}</select></label>
    <label class="case-field"><span>A decisão, nas suas palavras · verbatim, mínimo ${detail.draft.min_chars} caracteres</span><textarea data-case-field="decision_text" rows="7" maxlength="${detail.draft.max_chars}" placeholder="${escapeHtml(detail.draft.hint)}">${escapeHtml(form.decision_text)}</textarea></label>
    <p class="case-counter">${form.decision_text.trim().length}/${detail.draft.max_chars} · o Console não escreve esta parte por você</p>
    <div class="subheading"><h3>Evidência</h3><span>${selected.size} escolhida(s)</span></div>
    <div class="case-evidence-list">${candidates.length ? candidates.map((entry) => caseEvidenceRow(entry, selected.has(entry.ref))).join('') : '<p class="muted">Nenhum candidato resolvível neste cérebro.</p>'}</div>
    <p class="case-hint">Referência que não abre no disco derruba o caso. O item da fila sozinho não basta: escolha pelo menos uma evidência além dele.</p>
    <label class="case-authorship">
      <input type="checkbox" data-case-field="authored"${form.authored ? ' checked' : ''}>
      <span><b>Este texto é meu.</b> Eu li a evidência e escrevi a decisão acima com as minhas palavras — não é rascunho de IA colado. O Console local não verifica identidade; esta declaração assina o recibo junto com a referência de quem aprova.</span>
    </label>
    <div class="case-actions">
      <button class="action primary" data-case-preview>Simular e ver o diff</button>
      <button class="action" data-case-back>Voltar para a fila</button>
    </div>
  </section>`;
}

function caseDetail() {
  const detail = state.cases.detail;
  if (!detail) return '<p class="muted">Abrindo o caso…</p>';
  const applied = detail.state.status === 'applied';
  return `<div class="case-detail">
    <div class="case-detail-head">
      <button class="action" data-case-back>← Fila de casos</button>
      ${caseStateBadge(detail.state)}
      <code>${escapeHtml(detail.case_ref)}</code>
    </div>
    <article class="case-item">
      <p class="micro">${escapeHtml(decisionCategory(detail.item.category))} · na fila desde ${escapeHtml(detail.item.first_seen)} (${detail.item.age_days}d)</p>
      <h2>${escapeHtml(detail.item.title)}</h2>
      <code>${escapeHtml(detail.queue_ref)}</code>
    </article>
    <div class="boundary-note"><b>${escapeHtml(detail.authorship.rule)}</b>${detail.canonical.house_ready ? `A decisão vai virar um arquivo em <code>${escapeHtml(detail.canonical.house)}</code> (${escapeHtml(detail.canonical.filename_pattern)}), com <code>type: Decision</code> e <code>community_shareable: false</code>.` : 'A casa canônica das decisões não existe neste cérebro — o caso pode ser preparado, mas não registrado.'}</div>
    ${applied ? caseAppliedBlock(detail) : `${caseForm(detail)}${casePreviewBlock()}`}
    ${caseHistory(detail.state)}
  </div>`;
}

function renderCases() {
  return `<div class="section-heading"><div><p class="eyebrow">Martelo humano na Fonte canônica</p><h2>Decisões</h2></div><p>O Console prepara o caso — item, evidência com proveniência e o diff exato. Quem decide é você; o registro vai para o vault com recibo e reversão.</p></div>
    ${state.cases.detail ? caseDetail() : caseList()}`;
}

async function loadCases({ renderResult = true } = {}) {
  try {
    state.cases.list = await getJson('/api/decision-cases');
  } catch {
    state.cases.list = { available: false, house_ready: false, cases: [], open_count: 0, applied_count: 0, decided_total: 0 };
  }
  if (renderResult && state.view === 'cases') render();
}

async function openCase(caseId) {
  try {
    const detail = await getJson(`/api/decision-cases/${caseId}`);
    state.cases.detail = detail;
    state.cases.preview = null;
    state.cases.form = emptyCaseForm();
    // Evidência do próprio item já entra marcada; o resto é escolha de quem decide.
    state.cases.form.evidence = detail.evidence_candidates
      .filter((entry) => entry.kind === 'decision-queue')
      .map((entry) => entry.ref);
    state.view = 'cases';
    render();
  } catch (error) {
    toast(label(error.message), 'bad');
  }
}

function casePayload() {
  const form = state.cases.form;
  return {
    verdict: form.verdict,
    theme: form.theme,
    title: form.title.trim(),
    decision_text: form.decision_text.trim(),
    evidence_refs: form.evidence,
    authored_by_human: form.authored === true,
    ...(form.verdict === 'deferred' ? { review_on: form.review_on } : {}),
  };
}

async function previewCase() {
  if (state.busy || !state.cases.detail) return;
  const approval = await askConfirm({
    title: 'Simular o registro da decisão',
    body: 'Simular não escreve nada: monta a nota inteira e devolve o diff para você conferir antes de qualquer coisa.',
    confirmLabel: 'Simular',
    fields: [APPROVED_BY_FIELD],
  });
  if (!approval?.approvedBy) return;
  state.cases.actor = approval.approvedBy;
  state.busy = true;
  try {
    state.cases.preview = await mutate(`/api/decision-cases/${state.cases.detail.case_id}/preview`, {
      ...casePayload(), approved_by: approval.approvedBy,
    });
    toast('Diff pronto. Nada foi escrito no vault ainda.');
  } catch (error) {
    state.cases.preview = null;
    toast(label(error.message), 'bad');
  } finally {
    state.busy = false;
    render();
  }
}

async function applyCase() {
  const preview = state.cases.preview;
  if (state.busy || !preview) return;
  const approval = await askConfirm({
    title: 'Registrar o martelo na fonte canônica',
    body: `Isto cria ${preview.canonical_write.path} no vault, exatamente como no diff que você acabou de ler.\nO recibo guarda autoria, evidência e impressões — nunca o texto da decisão.\nNenhuma ação externa será executada, e o registro é reversível.`,
    confirmLabel: 'Registrar decisão',
    fields: [{ ...APPROVED_BY_FIELD, value: state.cases.actor || APPROVED_BY_FIELD.value }],
  });
  if (!approval?.approvedBy) return;
  state.busy = true;
  try {
    const result = await mutate(`/api/decision-cases/${state.cases.detail.case_id}/apply`, {
      ...casePayload(),
      approved_by: approval.approvedBy,
      plan_digest: preview.plan_digest,
      decided_at: preview.decided_at,
    });
    toast(result.status === 'already-applied'
      ? 'Este caso já tinha martelo — nada foi escrito de novo.'
      : `Decisão registrada em ${result.canonical_write.path}.`);
    state.cases.preview = null;
    await loadCases();
    await openCase(state.cases.detail.case_id);
  } catch (error) {
    toast(label(error.message), 'bad');
    render();
  } finally {
    state.busy = false;
  }
}

async function rollbackCase() {
  if (state.busy || !state.cases.detail) return;
  const reason = document.querySelector('[data-case-field="rollback_reason"]')?.value || 'mistake';
  const approval = await askConfirm({
    title: 'Reverter o registro da decisão',
    body: 'A nota sai do vault e uma cópia privada fica no runtime, com recibo de reversão.\nSe alguém editou a nota depois do martelo, a reversão para e nada é apagado.\nReverter o registro não desfaz o que a decisão causou fora daqui.',
    confirmLabel: 'Reverter',
    tone: 'danger',
    fields: [{ ...APPROVED_BY_FIELD, value: state.cases.actor || APPROVED_BY_FIELD.value }],
  });
  if (!approval?.approvedBy) return;
  state.busy = true;
  try {
    const result = await mutate(`/api/decision-cases/${state.cases.detail.case_id}/rollback`, {
      approved_by: approval.approvedBy, reason_code: reason,
    });
    toast(result.status === 'rolled-back' ? 'Registro revertido. Cópia privada guardada.' : 'Nada a reverter neste caso.');
    await loadCases();
    await openCase(state.cases.detail.case_id);
  } catch (error) {
    toast(label(error.message), 'bad');
    render();
  } finally {
    state.busy = false;
  }
}

/* --- Procedimentos — cada SOP do vault desenhado como fluxo vertical: cartões
   numerados, papel de quem faz, decisão com ramos clicáveis e critério de pronto.
   Tudo em HTML/CSS por classe; a CSP do Console proíbe estilo inline. --- */

function procedureStepId(flow, n) {
  return `sop-${flow.id}-${n}`;
}

function procedureBranch(flow, branch) {
  const exists = flow.steps.some((step) => step.n === branch.target);
  const copy = `Se ${escapeHtml(branch.condition)} <b>→ passo ${branch.target}</b>`;
  return exists
    ? `<button type="button" class="sop-branch" data-sop-target="${escapeHtml(procedureStepId(flow, branch.target))}">${copy}</button>`
    : `<span class="sop-branch is-missing" title="A nota aponta para um passo que não existe neste fluxo">${copy}</span>`;
}

function procedureStep(flow, step) {
  const decision = step.branches.length > 0;
  return `<li class="sop-step${decision ? ' is-decision' : ''}" id="${escapeHtml(procedureStepId(flow, step.n))}">
    <span class="sop-step-mark" aria-hidden="true">${step.n}</span>
    <div class="sop-step-body">
      ${step.role ? `<span class="sop-role">${escapeHtml(step.role)}</span>` : ''}
      <p><span class="sop-step-n">Passo ${step.n}.</span> ${escapeHtml(step.text)}</p>
      ${step.details.length ? `<ul class="sop-step-details">${step.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>` : ''}
      ${decision ? `<div class="sop-branches" aria-label="Ramos de decisão">${step.branches.map((branch) => procedureBranch(flow, branch)).join('')}</div>` : ''}
    </div>
  </li>`;
}

function procedureFlow(flow) {
  return `<section class="sop-flow">
    <header><h3>${escapeHtml(flow.title)}</h3><span>${flow.steps.length} passo(s)</span></header>
    <ol class="sop-steps">${flow.steps.map((step) => procedureStep(flow, step)).join('')}</ol>
  </section>`;
}

function procedureDetail(procedure) {
  if (!procedure) return empty('Nenhum procedimento selecionado', 'Escolha um procedimento na lista para ver o fluxo.');
  if (!procedure.title) {
    return empty('Procedimento privado', `${procedure.step_count} passo(s) em ${procedure.flow_count} fluxo(s). Revele os privados para abrir o fluxo nesta tela.`);
  }
  const meta = [
    procedure.path ? `<code>${escapeHtml(procedure.path)}</code>` : '',
    procedure.status ? badge(procedure.status, 'neutral', procedure.status) : '',
    procedure.updated ? `<span class="sop-updated">atualizado em ${escapeHtml(fmtDate(procedure.updated, false))}</span>` : '',
    ...procedure.sistema_refs.map((ref) => `<span class="sop-system" data-sop-system="${escapeHtml(ref.slug)}">Sistema · ${escapeHtml(ref.title)}</span>`),
  ].filter(Boolean).join('');
  return `<div class="sop-head"><p class="eyebrow">Procedimento</p><h2>${escapeHtml(procedure.title)}</h2><div class="sop-head-meta">${meta}</div></div>
    ${procedure.flows.map(procedureFlow).join('') || empty('Nenhum passo numerado', 'A nota existe, mas não tem lista numerada em nenhuma seção.')}
    ${procedure.done.length
      ? `<section class="sop-done"><p class="micro">Critério de pronto</p><ul>${procedure.done.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
      : '<p class="section-help">Esta nota não declara critério de pronto. Sem ele, o fluxo não diz quando parou.</p>'}`;
}

function procedureItem(procedure, selectedId) {
  return `<button type="button" class="sop-item${procedure.id === selectedId ? ' active' : ''}${procedure.title ? '' : ' is-private'}" data-procedure="${escapeHtml(procedure.id)}">
    <strong>${escapeHtml(procedure.title || 'Procedimento privado')}</strong>
    <small>${procedure.flow_count} fluxo(s) · ${procedure.step_count} passo(s)</small>
  </button>`;
}

// Seleção: a escolha da pessoa vale; sem escolha, o primeiro procedimento legível.
function selectedProcedure(list) {
  return list.find((item) => item.id === state.procedures.selected)
    || list.find((item) => item.flows.length)
    || list[0] || null;
}

function renderProcedures() {
  const model = state.procedures.data;
  if (!model) {
    if (state.procedures.error) return empty('Procedimentos indisponíveis', 'Atualize o Console para tentar ler os procedimentos do vault.');
    if (state.procedures.loaded) return empty('Procedimentos não declarados', 'Este Cérebro não declara pasta de procedimentos no layout do vault.');
    if (!state.procedures.loading) void loadProcedures();
    return '<div class="loading"><i></i><span>Lendo os procedimentos do vault…</span></div>';
  }
  const list = model.procedures || [];
  if (!list.length) return empty('Nenhum procedimento no vault', `A pasta ${model.folder}/ não tem nota de procedimento.`);
  const selected = selectedProcedure(list);
  const hidden = list.filter((item) => item.private).length;
  const toggle = hidden
    ? `<button type="button" class="sop-reveal" data-sop-reveal="${state.procedures.reveal ? '0' : '1'}">${state.procedures.reveal ? 'Esconder' : 'Revelar'} ${hidden} privado(s)</button>`
    : '';
  return `<div class="section-heading"><div><p class="eyebrow">Como o trabalho acontece</p><h2>Procedimentos</h2></div><p>Passos numerados, papel de quem faz, decisão com ramo e critério de pronto — lidos direto das notas do vault.</p></div>
    <div class="sop-boundary"><span>${model.counts.procedures} procedimento(s) · ${model.counts.flows} fluxo(s) · ${model.counts.steps} passo(s)</span><small>Leitura de ${escapeHtml(model.folder)}/ — o Console nunca escreve na nota.</small></div>
    <div class="sop-layout">
      <aside class="sop-list" aria-label="Procedimentos do vault">${list.map((item) => procedureItem(item, selected?.id)).join('')}${toggle}</aside>
      <div class="sop-detail">${procedureDetail(selected)}</div>
    </div>`;
}

// Rolar até o passo-alvo do ramo e destacá-lo por classe (nunca por estilo inline).
function focusProcedureStep(id) {
  const step = document.getElementById(id);
  if (!step) return;
  document.querySelectorAll('.sop-step.is-target').forEach((element) => element.classList.remove('is-target'));
  step.classList.add('is-target');
  step.scrollIntoView({ behavior: 'smooth', block: 'center' });
  clearTimeout(focusProcedureStep.timer);
  focusProcedureStep.timer = setTimeout(() => step.classList.remove('is-target'), readDesignNumber('--duration-procedure-highlight'));
}

async function loadProcedures() {
  if (state.procedures.loading) return;
  state.procedures.loading = true;
  state.procedures.error = null;
  try {
    const model = await getJson(`/api/procedures${state.procedures.reveal ? '?reveal=1' : ''}`);
    state.procedures.available = Boolean(model.available);
    state.procedures.data = model.available ? model : null;
  } catch (error) {
    state.procedures.error = error.message;
    // Leitura que falhou não deixa o retrato velho na tela: o erro é o estado agora.
    state.procedures.data = null;
  } finally {
    state.procedures.loading = false;
    state.procedures.loaded = true;
    if (state.view === 'procedures') render();
  }
}

function renderHermes() {
  const hermes = state.model.hermes;
  if (!hermes) return empty('Telegram indisponível', 'O console não recebeu o estado do Hermes.');
  if (!state.hermesTarget.loaded && !state.hermesTarget.loading) void loadHermesTarget();
  const targetSection = renderHermesTarget(hermes);
  const heading = '<div class="section-heading"><div><p class="eyebrow">TELEGRAM</p><h2>Levar o cérebro para o Telegram</h2></div><p>Preparar o Hermes, conectar o bot e confirmar a sua conta. O token fica no arquivo local do Hermes.</p></div>';
  const remoteChoice = (state.hermesTarget.choice || hermes.target?.kind) === 'remote';
  if (remoteChoice) {
    const remoteBody = hermes.target?.kind === 'remote' ? renderHermesRemote(hermes.target) : '<section class="hermes-card"><p class="section-help">Salve a outra máquina para ver o estado dela.</p></section>';
    return `${heading}${targetSection}${remoteBody}`;
  }
  const activation = hermes.activation || { phase: 'prepare', action: { status: 'idle', progress: 0 }, bot: {} };
  const action = activation.action || {};
  const busy = ['running', 'awaiting-confirmation'].includes(action.status);
  const preparing = action.status === 'running' && ['prepare', 'codex-login'].includes(action.kind);
  const identifying = activation.phase === 'identify-owner' && action.kind === 'telegram-owner';
  const finalizing = activation.phase === 'finalizing';
  const brainReady = hermes.installed && hermes.project_bound && hermes.skills_trusted && hermes.codex_authenticated;
  const telegramReady = hermes.telegram.token_configured && hermes.telegram.allowlist_configured && hermes.telegram.allow_all_disabled;
  const ready = activation.phase === 'ready' && brainReady && telegramReady && hermes.gateway.running;
  const botUsername = activation.bot?.username;
  const connected = brainReady && telegramReady && hermes.gateway.installed && !identifying && !finalizing;
  const stalled = connected && !ready;
  const currentStep = ready ? 'Pronto para conversar.' : identifying ? 'Etapa atual: confirmar a conta no Telegram.' : finalizing || stalled ? 'Etapa atual: iniciar o gateway.' : brainReady ? 'Etapa atual: conectar o bot.' : 'Etapa atual: preparar e autorizar o agente.';
  const progress = action.status === 'running' ? `<div class="activation-progress"><div><span>${Math.max(1, action.progress || 1)}%</span><b>${action.kind === 'codex-login' ? 'Aguardando autorização…' : finalizing ? 'Ligando o Telegram…' : 'Preparando…'}</b></div></div>` : '';
  const oauth = action.kind === 'codex-login' && (action.verification_url || action.user_code) ? `<div class="oauth-card"><p class="micro">AUTORIZAÇÃO</p>${action.user_code ? `<strong>${escapeHtml(action.user_code)}</strong>` : ''}${action.verification_url ? `<a class="action primary" href="${escapeHtml(action.verification_url)}" target="_blank" rel="noreferrer">Abrir autorização</a>` : ''}</div>` : '';
  const prepareAction = !hermes.installed || !hermes.project_bound || !hermes.skills_trusted
    ? `<button class="action primary" data-activation-action="prepare" ${busy ? 'disabled' : ''}>Preparar o Hermes</button>`
    : !hermes.codex_authenticated
      ? `<button class="action primary" data-activation-action="codex" ${busy ? 'disabled' : ''}>Autorizar o agente</button>`
      : '';
  const botForm = brainReady && !connected && !identifying && !finalizing ? `<form id="telegram-activation-form" class="telegram-form"><label>Token do BotFather<input id="telegram-token" type="password" autocomplete="off" spellcheck="false" maxlength="256" required></label><button class="action primary" type="submit" ${busy ? 'disabled' : ''}>Conectar o bot</button></form>` : '';
  const identifyBody = identifying ? `<div>${activation.bot?.owner_candidate_display ? `<p>Esta conta é você?</p><strong>${escapeHtml(activation.bot.owner_candidate_display)}</strong><button class="action primary" data-activation-action="owner-confirm" data-action-id="${escapeHtml(action.id)}">Sou eu</button><button class="action" data-activation-action="owner-reject" data-action-id="${escapeHtml(action.id)}">Não sou eu</button>` : `<p>Envie /start para o bot e confirme a conta.</p><button class="action" data-activation-action="cancel" data-action-id="${escapeHtml(action.id)}">Cancelar</button>`}</div>` : '';
  const errorBox = action.status === 'error' ? `<div class="activation-error"><b>${escapeHtml(friendlyFailure(action.error_code, 'Não foi possível concluir esta etapa.'))}</b>${detailDisclosure(`<code>${escapeHtml(action.error_code)}</code>`, { label: 'Ver diagnóstico' })}</div>` : '';
  const steps = [
    hermesStep(1, 'Preparar', brainReady ? 'done' : 'current', 'Instala o Hermes, liga ao cérebro e autoriza o agente.', `${prepareAction}${preparing ? progress : ''}${oauth}`),
    hermesStep(2, 'Conectar o bot', connected ? 'done' : brainReady ? 'current' : 'locked', connected ? 'Bot conectado. Só a conta confirmada conversa.' : brainReady ? 'Crie o bot no BotFather e cole o token.' : 'Disponível depois de preparar o Hermes e autorizar o agente na etapa 1.', `${botForm}${identifyBody}${finalizing ? progress : ''}`),
    hermesStep(3, 'Conversar', ready ? 'done' : stalled ? 'current' : 'locked', ready ? 'O cérebro responde no Telegram.' : stalled ? 'O gateway está parado. Reinicie para conversar.' : 'Disponível depois de conectar o bot, confirmar a sua conta e iniciar o gateway.', ready && botUsername ? `<a class="action primary" href="https://t.me/${escapeHtml(botUsername)}" target="_blank" rel="noreferrer">Abrir conversa</a>` : stalled ? '<button class="action primary" data-hermes-action="gateway-restart">Reiniciar gateway</button>' : ''),
  ];
  const maintenance = hermes.installed ? `<footer class="hermes-maintenance"><span>Manutenção</span><button class="action" data-hermes-action="doctor">Rodar diagnóstico</button>${hermes.gateway.installed && !stalled ? '<button class="action" data-hermes-action="gateway-restart">Reiniciar gateway</button>' : ''}</footer>` : '';
  return `${heading}${targetSection}
    <section class="hermes-card" aria-labelledby="hermes-steps-title">
      <header class="hermes-card-head"><h3 id="hermes-steps-title">Ativação nesta máquina</h3><p class="telegram-current" role="status">${currentStep}</p></header>
      ${errorBox}
      <ol class="hermes-steps">${steps.join('')}</ol>
      ${maintenance}
    </section>`;
}

const HERMES_STEP_STATES = {
  done: ['good', 'Feito'],
  current: ['', 'Agora'],
  locked: ['', 'Depois'],
};

function hermesStep(number, title, status, text, body) {
  const [tone, stateLabel] = HERMES_STEP_STATES[status];
  const marker = status === 'done' ? '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : number;
  return `<li class="hermes-step is-${status}" ${status === 'current' ? 'aria-current="step"' : ''}>
    <span class="hermes-step-marker" aria-hidden="true">${marker}</span>
    <div class="hermes-step-body">
      <div class="hermes-step-head"><h4>${title}</h4>${badge(status, tone, stateLabel)}</div>
      <p>${text}</p>${body ? `<div class="hermes-step-actions">${body}</div>` : ''}
    </div>
  </li>`;
}

async function loadHermesTarget({ notify = false } = {}) {
  const picker = state.hermesTarget;
  if (picker.loading) return;
  picker.loading = true;
  try {
    const result = await getJson('/api/integrations/hermes/target');
    picker.ssh_hosts = Array.isArray(result.ssh_hosts) ? result.ssh_hosts : [];
    picker.default_brain_path = result.default_brain_path || '';
    if (notify) toast('Lista atualizada.');
  } catch {
    if (notify) toast('Não foi possível atualizar a lista.', 'bad');
    picker.ssh_hosts = [];
  } finally {
    picker.loading = false;
    picker.loaded = true;
    if (state.view === 'hermes') render();
  }
}

function hermesRemoteUnreachableCopy(reason, host) {
  if (reason === 'ssh-command-failed' || reason === 'remote-output-invalid') return 'O SSH conectou, mas a leitura do estado falhou.';
  return `Não foi possível acessar ${escapeHtml(host)} por SSH.`;
}

function hermesTargetDraft(saved) {
  const picker = state.hermesTarget;
  return picker.draft || {
    host: saved.host || '',
    profile: saved.profile || 'cerebro',
    brain_path: saved.brain_path || picker.default_brain_path,
  };
}

const HERMES_OTHER_HOST = '__other__';

const HERMES_SSH_RESULTS = {
  ok: ['good', 'Conexão funcionando.'],
  'auth-required': ['bad', 'A máquina respondeu, mas não aceitou sua chave. Veja o passo 3 da ajuda.'],
  'host-key-unconfirmed': ['warn', 'Falta confirmar a máquina na primeira conexão. Veja o passo 5 da ajuda.'],
  'host-key-changed': ['bad', 'A identidade da máquina mudou desde a última conexão. Confirme com quem administra a máquina antes de continuar.'],
  'host-unknown': ['bad', 'Esse nome não foi encontrado. Confira o apelido no passo 4 da ajuda.'],
  offline: ['bad', 'A máquina não respondeu. Confira se ela está ligada e na mesma rede ou no Tailscale (passo 2).'],
  refused: ['bad', 'A máquina recusou a conexão. Pode ser um bloqueio de segurança dela. Tente de novo em alguns minutos ou fale com quem administra a máquina.'],
  'ssh-missing': ['bad', 'Este computador não tem o programa ssh. Instale o cliente OpenSSH e tente de novo.'],
  timeout: ['bad', 'A máquina demorou demais para responder. Confira a rede e tente de novo (passo 2 da ajuda).'],
  failed: ['bad', 'A conexão falhou por um motivo não identificado. Rode o comando do passo 5 no Terminal para ver a mensagem.'],
};

function hermesSshResultBadge(code) {
  const [tone, text] = HERMES_SSH_RESULTS[code] || HERMES_SSH_RESULTS.failed;
  return badge(code, tone, text);
}

function hermesCopyButton(text, copied = 'Comando copiado.') {
  return `<button type="button" class="action hermes-copy" data-copy-ref="${escapeHtml(text)}" data-copy-label="${copied}">Copiar</button>`;
}

function hermesCommand(text) {
  return `<code>${escapeHtml(text)}</code> ${hermesCopyButton(text)}`;
}

function hermesSshHelp(open) {
  const sshConfig = 'Host servidor-casa\n  HostName endereco-da-maquina\n  User usuario';
  return `<details class="hermes-ssh-help" ${open ? 'open' : ''}><summary>Como preparar a outra máquina</summary>
    <ol>
      <li>Na outra máquina, ligue o acesso remoto. Mac: Ajustes do Sistema > Geral > Compartilhamento > Login Remoto. Linux: instale o servidor SSH. O comando abaixo vale para Debian e Ubuntu. ${hermesCommand('sudo apt install openssh-server')} Depois ligue o serviço: ${hermesCommand('sudo systemctl enable --now ssh')}</li>
      <li>As duas máquinas precisam se enxergar: mesma rede, ou as duas no Tailscale (<a href="https://tailscale.com" target="_blank" rel="noopener noreferrer">tailscale.com</a>).</li>
      <li>Nesta máquina, crie uma chave e envie para a outra. ${hermesCommand('ssh-keygen -t ed25519')} ${hermesCommand('ssh-copy-id usuario@endereco-da-maquina')} O usuário e o endereço são os da outra máquina. No Tailscale, o endereço aparece no app.</li>
      <li>Dê um apelido à máquina no arquivo <code>~/.ssh/config</code>. Digite só o apelido aqui, sem usuario@.<pre><code>${escapeHtml(sshConfig)}</code></pre>${hermesCopyButton(sshConfig, 'Texto copiado.')}</li>
      <li>Abra o Terminal e rode ${hermesCommand('ssh servidor-casa')} uma vez para confirmar a máquina. Responda yes se pedir.</li>
      <li>Volte aqui, atualize a lista e clique em Testar conexão. <button type="button" class="action" data-hermes-hosts-refresh>Atualizar lista</button></li>
    </ol>
    <p class="section-help">O Console só usa a chave que já está nesta máquina. Ele não guarda senha.</p>
  </details>`;
}

function renderHermesTarget(hermes) {
  const saved = hermes.target || { kind: 'local' };
  const picker = state.hermesTarget;
  const choice = picker.choice || saved.kind;
  const locked = picker.saving || ['running', 'awaiting-confirmation'].includes(hermes.activation?.action?.status);
  const radio = (value, text, hint) => `<label class="hermes-target-option"><input type="radio" name="hermes-target-kind" value="${value}" data-hermes-target-choice ${choice === value ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><b>${text}</b><small>${hint}</small></span></label>`;
  let form = '';
  if (choice === 'remote') {
    const draft = hermesTargetDraft(saved);
    const hosts = picker.ssh_hosts;
    const typing = !hosts.length || picker.other || (draft.host !== '' && !hosts.includes(draft.host));
    const select = hosts.length
      ? `<label>Máquina (host do SSH)<select data-hermes-host-select required><option value="" ${!typing && !draft.host ? 'selected' : ''}>Escolha a máquina</option>${hosts.map((host) => `<option value="${escapeHtml(host)}" ${!typing && host === draft.host ? 'selected' : ''}>${escapeHtml(host)}</option>`).join('')}<option value="${HERMES_OTHER_HOST}" ${typing ? 'selected' : ''}>Outra máquina (digitar)</option></select></label>`
      : '';
    const typed = typing
      ? `<label>${hosts.length ? 'Apelido da outra máquina' : 'Máquina (host do SSH)'}<input type="text" data-hermes-target-field="host" value="${escapeHtml(draft.host)}" maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{0,63}" title="Use letras, números, ponto, hífen ou sublinhado. Sem usuario@." autocomplete="off" spellcheck="false" placeholder="apelido do ~/.ssh/config" required><small>Digite só o apelido, sem usuario@. O passo 4 da ajuda mostra como criar um.</small></label>`
      : '';
    const test = picker.test;
    const testing = test.running;
    const result = !testing && test.code && test.host === draft.host.trim() ? `<p class="hermes-ssh-result" role="status">${hermesSshResultBadge(test.code)}</p>` : '';
    const hostField = `<div class="hermes-host-field"><div class="hermes-host-row">${select}${typed}<div class="hermes-ssh-test"><button type="button" class="action" data-hermes-ssh-test ${testing ? 'disabled' : ''}>${testing ? 'Testando…' : 'Testar conexão'}</button></div></div>${testing ? '<span class="section-help">O teste leva até 15 segundos.</span>' : ''}${result}${hermesSshHelp(picker.helpOpen)}</div>`;
    form = `<form id="hermes-target-form" class="hermes-target-form">
      ${hostField}
      <div class="hermes-target-pair"><label>Perfil do Hermes<input type="text" data-hermes-target-field="profile" value="${escapeHtml(draft.profile)}" maxlength="32" autocomplete="off" spellcheck="false" required><small>Nome do perfil que o cérebro vai usar na outra máquina.</small></label>
      <label>Pasta do cérebro na máquina<input type="text" data-hermes-target-field="brain_path" value="${escapeHtml(draft.brain_path)}" maxlength="202" autocomplete="off" spellcheck="false" required><small>Onde o vault fica clonado na outra máquina.</small></label></div>
      <p class="section-help">A outra máquina precisa estar acessível por SSH sem senha (chave), como nos hosts do Tailscale.</p>
      <button class="action primary" type="submit" ${locked ? 'disabled' : ''}>${picker.saving ? 'Salvando…' : 'Salvar'}</button>
    </form>`;
  }
  const lockedNote = locked && !picker.saving ? '<p class="section-help">Espere a etapa em andamento terminar para trocar de máquina.</p>' : '';
  return `<section class="hermes-card hermes-target"><header class="hermes-card-head"><h3 id="hermes-target-title">Onde o Hermes vai rodar?</h3></header>
    <div class="hermes-target-choices" role="radiogroup" aria-labelledby="hermes-target-title">${radio('local', 'Nesta máquina', 'O Hermes e o token ficam neste computador.')}${radio('remote', 'Em outra máquina', 'Um servidor ou outro Mac, acessado por SSH.')}</div>
    ${lockedNote}${form}</section>`;
}

function renderHermesRemote(target) {
  const remote = state.hermesRemote;
  const same = remote.data?.target
    && remote.data.target.host === target.host
    && remote.data.target.profile === target.profile
    && remote.data.target.brain_path === target.brain_path;
  const data = same ? remote.data : null;
  const retry = (text) => `<p class="tools-retry"><button type="button" class="action" data-hermes-remote-refresh ${remote.loading ? 'disabled' : ''}>${text}</button></p>`;
  if (!data) {
    if (remote.error) return `<section class="hermes-card"><header class="hermes-card-head"><h3>Estado na outra máquina</h3></header>${empty('Não foi possível verificar', 'O Console não conseguiu ler o estado da outra máquina. Tente de novo.')}${retry('Tentar de novo')}</section>`;
    if (!remote.loading) void loadHermesRemote(false);
    return '<section class="hermes-card"><header class="hermes-card-head"><h3>Estado na outra máquina</h3></header><div class="loading"><i></i><span>Verificando a outra máquina por SSH. Isso pode levar até 30 segundos.</span></div></section>';
  }
  const toolbar = `<div class="tools-toolbar"><span class="tools-checked">${escapeHtml(toolsCheckedAt(data.checked_at))}</span><button type="button" class="action" data-hermes-remote-refresh ${remote.loading ? 'disabled' : ''}>${remote.loading ? 'Verificando…' : 'Verificar de novo'}</button></div>${remote.loading ? '<p class="section-help">A verificação pode levar até 30 segundos.</p>' : ''}`;
  if (!data.reachable) {
    return `<section class="hermes-card"><header class="hermes-card-head"><h3>Estado na outra máquina</h3>${toolbar}</header><div class="activation-error"><b>${hermesRemoteUnreachableCopy(data.reason_code, target.host)}</b>${data.reason_code ? detailDisclosure(`<code>${escapeHtml(data.reason_code)}</code>`, { label: 'Ver diagnóstico' }) : ''}</div></section>`;
  }
  const item = (done, text) => `<li><span>${text}</span>${done ? badge('completed', 'good', 'Ok') : badge('pending', 'warn', 'Pendente')}</li>`;
  const telegramReady = data.telegram.token_configured && data.telegram.allowlist_configured && data.telegram.allow_all_disabled;
  return `<section class="hermes-card"><header class="hermes-card-head"><h3>Estado na outra máquina</h3>${toolbar}</header>
    <ul class="hermes-checklist">
      ${item(true, `Acesso por SSH (${escapeHtml(target.host)})`)}
      ${item(data.installed, `Hermes instalado${data.version ? ` (${escapeHtml(data.version)})` : ''}`)}
      ${item(data.profile_exists, `Perfil ${escapeHtml(target.profile)} existe`)}
      ${item(data.brain_exists && data.brain_is_git, 'Cérebro clonado na pasta')}
      ${item(data.project_bound && data.skills_trusted, 'Projeto vinculado ao cérebro')}
      ${item(data.codex_authenticated, 'Login do modelo (Codex)')}
      ${item(telegramReady, 'Bot do Telegram configurado')}
      ${item(data.gateway.running, 'Gateway rodando')}
    </ul>
    <p class="section-help">A preparação remota ainda não está disponível nesta versão. Esta tela só lê o estado da outra máquina.</p></section>`;
}

async function performHermesAction(action) {
  if (state.busy) return;
  const routes = {
    doctor: '/api/integrations/hermes/doctor',
    'gateway-restart': '/api/integrations/hermes/gateway/restart',
    disconnect: '/api/integrations/hermes/telegram/disconnect',
  };
  if (!routes[action]) return;
  state.busy = true;
  try {
    const result = await mutate(routes[action], {});
    toast(action === 'doctor' ? `Diagnóstico: ${label(result.status)}.` : 'Hermes atualizado.');
    await loadModel();
  } catch (error) {
    toast(label(error.message), 'bad');
  } finally {
    state.busy = false;
  }
}

function scheduleActivationPoll(delay = 800) {
  clearTimeout(state.activationTimer);
  const status = state.model?.hermes?.activation?.action?.status;
  if (!['running', 'awaiting-confirmation'].includes(status)) return;
  state.activationTimer = setTimeout(pollActivation, delay);
}

async function pollActivation() {
  try {
    const activation = await getJson('/api/integrations/hermes/activation');
    if (!state.model?.hermes) return;
    const changed = JSON.stringify(state.model.hermes.activation) !== JSON.stringify(activation);
    state.model.hermes.activation = activation;
    if (state.view === 'hermes' && changed) render();
    if (['running', 'awaiting-confirmation'].includes(activation.action.status)) scheduleActivationPoll(900);
    else await loadModel();
  } catch (error) {
    toast(label(error.message), 'bad');
    scheduleActivationPoll(2000);
  }
}

async function performActivationAction(actionName, actionId = '') {
  if (state.busy) return;
  const routes = {
    prepare: '/api/integrations/hermes/activation/prepare/start',
    codex: '/api/integrations/hermes/activation/codex/start',
    'owner-confirm': '/api/integrations/hermes/activation/owner/confirm',
    'owner-reject': '/api/integrations/hermes/activation/owner/reject',
    cancel: '/api/integrations/hermes/activation/cancel',
  };
  if (!routes[actionName]) return;
  state.busy = true;
  try {
    const result = await mutate(routes[actionName], actionId ? { action_id: actionId } : {});
    if (state.model.hermes) state.model.hermes.activation = result;
    render();
    scheduleActivationPoll(250);
  } catch (error) {
    toast(label(error.message), 'bad');
    await loadModel();
  } finally {
    state.busy = false;
  }
}

async function connectTelegram(form) {
  if (state.busy) return;
  const token = form.querySelector('#telegram-token')?.value.trim() || '';
  if (!token) {
    toast('Cole o token do BotFather.', 'bad');
    return;
  }
  form.reset();
  state.busy = true;
  try {
    const result = await mutate('/api/integrations/hermes/activation/telegram/start', { token });
    if (state.model.hermes) state.model.hermes.activation = result;
    render();
    scheduleActivationPoll(250);
  } catch (error) {
    toast(label(error.message), 'bad');
    await loadModel();
  } finally {
    state.busy = false;
  }
}

async function loadHermesRemote(refresh) {
  const remote = state.hermesRemote;
  if (remote.loading) return;
  remote.loading = true;
  remote.error = null;
  if (refresh) render();
  let failed = false;
  try {
    remote.data = await getJson(refresh ? '/api/integrations/hermes/remote-status?refresh=1' : '/api/integrations/hermes/remote-status');
  } catch (error) {
    failed = true;
    if (!remote.data) remote.error = error.message;
  } finally {
    remote.loading = false;
    if (state.view === 'hermes') render();
  }
  if (failed && remote.data) toast('Não foi possível verificar agora. Mostrando o último resultado.', 'bad');
}

async function testHermesSsh() {
  const picker = state.hermesTarget;
  if (picker.test.running) return;
  const saved = state.model?.hermes?.target || { kind: 'local' };
  const host = hermesTargetDraft(saved).host.trim();
  if (!host) {
    toast('Escolha a máquina.', 'bad');
    return;
  }
  picker.test = { running: true, host, code: null };
  render();
  try {
    const result = await mutate('/api/integrations/hermes/ssh-test', { host });
    picker.test = { running: false, host, code: result.reason_code };
  } catch (error) {
    picker.test = { running: false, host, code: null };
    toast(label(error.message), 'bad');
  } finally {
    render();
  }
}

async function saveHermesTarget(target) {
  const picker = state.hermesTarget;
  if (picker.saving) return;
  picker.saving = true;
  render();
  try {
    await mutate('/api/integrations/hermes/target', target);
    state.hermesRemote = { data: null, loading: false, error: null };
    picker.choice = null;
    picker.draft = null;
    picker.other = false;
    picker.saving = false;
    await loadModel();
    toast(target.kind === 'local' ? 'O Hermes vai rodar nesta máquina.' : 'Destino do Hermes salvo.');
  } catch (error) {
    toast(label(error.message), 'bad');
  } finally {
    picker.saving = false;
    render();
  }
}

function chooseHermesTarget(kind) {
  const picker = state.hermesTarget;
  const saved = state.model?.hermes?.target || { kind: 'local' };
  picker.other = false;
  picker.test = { running: false, host: '', code: null };
  if (kind === 'remote') {
    picker.choice = 'remote';
    picker.draft = null;
    render();
    return;
  }
  if (saved.kind === 'local') {
    picker.choice = null;
    picker.draft = null;
    render();
    return;
  }
  void saveHermesTarget({ kind: 'local' });
}

function submitHermesTarget() {
  const saved = state.model?.hermes?.target || { kind: 'local' };
  const draft = hermesTargetDraft(saved);
  if (!draft.host.trim()) {
    toast('Escolha a máquina.', 'bad');
    return;
  }
  void saveHermesTarget({ kind: 'remote', host: draft.host.trim(), profile: draft.profile.trim(), brain_path: draft.brain_path.trim() });
}

document.addEventListener('change', (event) => {
  const taskBox = event.target.closest('[data-task-toggle]');
  if (taskBox) { void toggleTask(taskBox.dataset.taskRef, Number(taskBox.dataset.taskLine), taskBox.checked); return; }
  const choice = event.target.closest('[data-hermes-target-choice]');
  if (choice && choice.checked) chooseHermesTarget(choice.value);
  const hostSelect = event.target.closest('[data-hermes-host-select]');
  if (hostSelect) {
    const picker = state.hermesTarget;
    const saved = state.model?.hermes?.target || { kind: 'local' };
    const other = hostSelect.value === HERMES_OTHER_HOST;
    picker.other = other;
    picker.draft = { ...hermesTargetDraft(saved), host: other ? '' : hostSelect.value };
    render();
  }
});

document.addEventListener('toggle', (event) => {
  if (event.target.matches?.('.hermes-ssh-help')) state.hermesTarget.helpOpen = event.target.open;
}, true);

document.addEventListener('input', (event) => {
  const field = event.target.closest('[data-hermes-target-field]');
  if (!field) return;
  const saved = state.model?.hermes?.target || { kind: 'local' };
  const picker = state.hermesTarget;
  picker.draft = { ...hermesTargetDraft(saved), [field.dataset.hermesTargetField]: field.value };
  if (field.dataset.hermesTargetField === 'host' && picker.test.code && picker.test.host !== field.value.trim()) {
    picker.test = { running: false, host: '', code: null };
    document.querySelector('.hermes-ssh-result')?.remove();
  }
});

document.addEventListener('submit', (event) => {
  if (!event.target.matches('#hermes-target-form')) return;
  event.preventDefault();
  submitHermesTarget();
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-hermes-remote-refresh]')) void loadHermesRemote(true);
  if (event.target.closest('[data-hermes-ssh-test]')) void testHermesSsh();
  if (event.target.closest('[data-hermes-hosts-refresh]')) void loadHermesTarget({ notify: true });
});

const renderers = { activation: renderActivation, compatibility: renderCompatibility, today: renderToday, tasks: renderTasks, anatomy: renderAnatomy, system: renderSystemWorkspace, canvas: renderCanvas, areas: renderAreas, area: renderAreaWorkspace, files: renderFiles, metrics: renderMetrics, notices: renderOperationalInbox, systems: renderSystems, skills: renderSkills, procedures: renderProcedures, sources: renderSources, experiments: renderExperiments, routines: renderRoutines, judgments: renderJudgments, cases: renderCases, runs: renderRuns, governance: renderGovernance, health: renderHealth, 'vibe-makers': renderVibeMakers, tools: renderTools, hermes: renderHermes };
const titles = {
  activation: ['Primeira Missão', 'Ative o Cérebro pelo uso, começando com um trabalho real.'],
  compatibility: ['Compatibilidade do protocolo', 'Migração e aderência ao protocolo — não é um placar de saúde do cérebro.'],
  today: ['Hoje', 'O que pede julgamento e o que já está pronto para trabalhar.'],
  tasks: ['Tarefas', 'Checkboxes das suas notas. Marcar aqui grava na própria nota.'],
  anatomy: ['Arquitetura', 'O que a empresa sabe, de onde vem e como continua vivo.'],
  system: ['Sistema', 'Como este sistema pensa, executa, é julgado e aprende.'],
  canvas: ['Canvas Operacional', 'Mapa do Cérebro, contrato do Sistema e Execution Trace do Run.'],
  area: ['Área', 'Nota, arquivos relacionados e Sistemas desta área.'],
  files: ['Cérebro', 'Notas, pessoas e referências do seu cérebro.'],
  metrics: ['Indicadores', 'Definições e leituras existentes do negócio.'],
  notices: ['Avisos', 'Falhas, bloqueios e decisões pendentes nas referências locais.'],
  areas: ['Mapa / Áreas', 'A empresa plural, sem transformar navegação em casa da verdade.'],
  systems: ['Sistemas', 'Resultados executáveis ligados ao contexto real do negócio.'],
  skills: ['Skills', 'Capacidades executáveis disponíveis nesta empresa e no motor deste cérebro.'],
  procedures: ['Procedimentos', 'Cada procedimento do vault desenhado como fluxo: passos, papel, decisões e critério de pronto.'],
  sources: ['Fontes', 'Casas de verdade, autoridade, frescor e garantia de acesso.'],
  experiments: ['Experimentos', 'Hipótese, execução, medição, martelo e aprendizado ligados ao Sistema.'],
  routines: ['Rotinas', 'Quando o cérebro trabalha, com qual contexto e quem precisa decidir.'],
  judgments: ['Julgamento', 'Leia as entregas, confira a versão e registre sua avaliação.'],
  cases: ['Decisões', 'Decision Case: caso preparado pelo Console, martelo humano registrado na fonte canônica.'],
  runs: ['Execuções', 'Todas as execuções — recibos de rotina e Run Records do ledger, com contexto, eval, decisão e trace.'],
  governance: ['Governança', 'Quem pode acessar o quê e qual controle existe de verdade.'],
  health: ['Saúde', 'Conflitos e degradações derivados do estado canônico.'],
  'vibe-makers': ['Vibe Makers', 'A rede distribui capacidade; o contexto da empresa não circula.'],
  tools: ['Ferramentas', 'Ligar Gmail, agenda e tarefas pela sua conta do Claude, sem senha no cérebro.'],
  hermes: ['Telegram', 'Levar o cérebro para uma conversa privada no Telegram, com o token guardado só na máquina onde o Hermes roda.'],
};

// A que pergunta do operador cada view responde — vira o eyebrow da topbar.
const viewGroups = {
  activation: 'Ativação',
  today: 'Operação', notices: 'Operação', judgments: 'Operação', cases: 'Operação', routines: 'Operação', runs: 'Operação',
  anatomy: 'Cérebro', skills: 'Cérebro', procedures: 'Cérebro',
  system: 'Sistemas', systems: 'Sistemas',
  files: 'Contexto', metrics: 'Negócio', area: 'Estrutura', canvas: 'Estrutura', areas: 'Estrutura', sources: 'Estrutura', experiments: 'Estrutura',
  compatibility: 'Confiança', governance: 'Confiança', health: 'Confiança',
  'vibe-makers': 'Rede',
  tools: 'Conexões',
  hermes: 'Telegram',
};

/* Contexto de Área — o switcher filtra a jornada inteira (padrão Linear:
   você "entra" numa área e todas as superfícies respondem). */
// Um sistema tem dois nomes no protocolo: o id de portfólio e o id do contrato.
// Rotinas, julgamentos e run records referenciam o contrato — casar com ambos.
function systemByRef(ref) {
  return state.model?.systems.find((system) => system.system_id === ref || system.contract_id === ref) || null;
}
function refMatchesSystem(ref, system) {
  return ref === system.system_id || ref === system.contract_id;
}
function systemOperatingArea(systemId) {
  return systemByRef(systemId)?.operating_area || null;
}
function inActiveOperatingArea(operatingArea) {
  return !state.operatingAreaFilter || operatingArea === state.operatingAreaFilter;
}
function visibleSystems() {
  return state.model.systems.filter((system) => inActiveOperatingArea(system.operating_area));
}
function visibleSources() {
  if (!state.operatingAreaFilter) return state.model.sources;
  const used = new Set(visibleSystems().flatMap((system) => system.source_refs.map((ref) => sourceRefId(ref))));
  return state.model.sources.filter((source) => used.has(source.source_id));
}
function visibleRoutines() {
  return state.model.routines.filter((routine) => inActiveOperatingArea(systemOperatingArea(routine.system_ref)));
}
function visibleExperiments() {
  return (state.model.experiments || []).filter((experiment) => inActiveOperatingArea(systemOperatingArea(experiment.system_ref)));
}
function visibleJudgments() {
  return state.model.judgments.filter((item) => inActiveOperatingArea(systemOperatingArea(item.system_ref)));
}

function renderAreaSwitcher() {
  if (!state.model) return;
  const host = $('#area-switcher');
  if (host) renderMarkup(host, `<p class="nav-group">Áreas responsáveis</p>
    <button type="button" class="area-pill${state.operatingAreaFilter ? '' : ' active'}" title="Toda a empresa" aria-label="Toda a empresa" data-identity="indigo" aria-pressed="${!state.operatingAreaFilter}" data-operating-area-filter=""><i class="area-identity" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-areas"/></svg></i><span>Toda a empresa</span></button>
    ${state.model.areas.map((area) => `<button type="button" class="area-pill${state.operatingAreaFilter === area.operating_area ? ' active' : ''}" title="${escapeHtml(area.name)}" aria-label="${escapeHtml(area.name)}" data-identity="${identityForKey(area.operating_area)}" aria-pressed="${state.operatingAreaFilter === area.operating_area}" data-operating-area-filter="${escapeHtml(area.operating_area)}"><i class="area-identity" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="#i-areas"/></svg></i><span>${escapeHtml(area.name)}</span><b>${area.system_refs.length}</b></button>`).join('')}`);
  const mobile = $('#mobile-area-switcher');
  if (mobile) renderMarkup(mobile, `<label for="mobile-operating-area">Área responsável</label><select id="mobile-operating-area"><option value=""${state.operatingAreaFilter ? '' : ' selected'}>Toda a empresa</option>${state.model.areas.map((area) => `<option value="${escapeHtml(area.operating_area)}"${state.operatingAreaFilter === area.operating_area ? ' selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}</select>`);
}

function setOperatingAreaFilter(value, { openWorkspace = true } = {}) {
  closeDrawer();
  state.operatingAreaFilter = value;
  if (openWorkspace) state.view = value ? 'area' : 'areas';
  try { localStorage.setItem('cb-operating-area', value); } catch { /* preferência local */ }
  if (state.canvas.scope === 'system' && state.canvas.ref && !inActiveOperatingArea(systemOperatingArea(state.canvas.ref))) state.canvas.ref = null;
  if (state.canvas.scope === 'run') state.canvas.ref = null;
  state.canvas.positions = null;
  render();
}

// Views irmãs viram abas dentro da mesma superfície.
const tabGroups = [
  ['judgments', 'cases', 'routines', 'runs'],
  ['areas', 'area', 'sources', 'experiments'],
  ['compatibility', 'governance', 'health'],
];
const tabCounts = { judgments: 'judgments', routines: 'routines', systems: 'systems', skills: 'skills', sources: 'sources', areas: 'areas', experiments: 'experiments' };

function tabstrip() {
  const group = tabGroups.find((views) => views.includes(state.view));
  if (!group) return '';
  return `<div class="tabstrip" role="tablist">${group.map((view) => {
    if (view === 'area' && !state.operatingAreaFilter) return '';
    const countKey = tabCounts[view];
    const filtered = { judgments: () => visibleJudgments().filter((item) => !item.imported && item.judgment.status === 'pending').length, routines: () => visibleRoutines().length, systems: () => visibleSystems().length, sources: () => visibleSources().length, experiments: () => visibleExperiments().length };
    const count = countKey ? (filtered[countKey] ? filtered[countKey]() : state.model.counts[countKey] ?? 0) : null;
    return `<button role="tab" data-view="${view}" class="${view === state.view ? 'active' : ''}">${titles[view][0]}${count ? `<b>${count}</b>` : ''}</button>`;
  }).join('')}</div>`;
}

function updateNavigation() {
  document.querySelectorAll('[data-view]').forEach((element) => {
    const views = (element.dataset.views || (element.dataset.view === 'systems' ? 'systems,system' : element.dataset.view)).split(',');
    const active = views.includes(state.view);
    element.classList.toggle('active', active);
    if (active && element.closest('#navigation, #breadcrumb-pages')) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
    if (element.getAttribute?.('role') === 'tab') element.setAttribute('aria-selected', String(active));
  });
}

function render() {
  if (!state.model) return;
  syncLocalViewContext();
  let [title, subtitle] = titles[state.view];
  if (state.view === 'area') title = state.model.areas.find((area) => area.operating_area === state.operatingAreaFilter)?.name || title;
  if (state.view === 'system' && state.workspace?.data) title = state.workspace.data.system.name;
  if (state.view === 'today' && state.vaultToday) subtitle = 'Foco, daily, projetos parados e inbox, lidos direto do vault.';
  document.body.dataset.currentView = state.view;
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  // Navigation active state is refreshed below; derive the section from the target view.
  const nav = [...document.querySelectorAll('#navigation [data-view]')].find((item) => (item.dataset.views || item.dataset.view).split(',').includes(state.view));
  $('#breadcrumb-section').textContent = nav?.closest('.nav-section')?.querySelector('.nav-group')?.textContent || 'Cérebro';
  $('#breadcrumb-section').setAttribute('aria-label', `Navegar em ${$('#breadcrumb-section').textContent}`);
  const sectionPages = nav?.closest('.nav-section')?.querySelectorAll('[data-view]') || [];
  renderMarkup($('#breadcrumb-pages'), [...sectionPages].filter(item => item.dataset.view === 'procedures' ? state.procedures.available : !item.hidden).map(item => `<button type="button" data-view="${escapeHtml(item.dataset.view)}" data-views="${escapeHtml(item.dataset.views || item.dataset.view)}"${item === nav ? ' aria-current="page"' : ''}>${escapeHtml(item.getAttribute('aria-label') || titles[item.dataset.view]?.[0] || item.textContent)}</button>`).join(''));
  $('#breadcrumb-title').textContent = title;
  const pageContext = `${state.view}:${state.operatingAreaFilter}:${state.workspace?.ref || ''}`;
  if (state.renderedPageContext !== pageContext) {
    $('#page-scroll').scrollTop = 0;
    state.renderedPageContext = pageContext;
  }
  const journey = $('#journey');
  if (journey) renderMarkup(journey, ['area', 'files', 'metrics', 'notices', 'skills', 'tasks'].includes(state.view) ? '' : renderJourneyCue(state.view, state.model));
  renderAreaSwitcher();
  const hidesSummary = ['activation', 'canvas', 'system', 'systems', 'skills', 'vibe-makers', 'tools', 'hermes', 'area', 'areas', 'files', 'metrics', 'notices', 'tasks'].includes(state.view) || state.view === 'anatomy';
  renderMarkup($('#summary'), hidesSummary ? '' : state.vaultToday ? vaultSummaryCards(state.vaultToday) : summaryCards());
  if (replay.playing) stopTraceReplay(false);
  if (state.canvas.controller) { state.canvas.controller.destroy(); state.canvas.controller = null; }
  if (state.canvas.stopParticles) { state.canvas.stopParticles(); state.canvas.stopParticles = null; }
  $('#content').setAttribute('aria-live', state.view === 'files' ? 'off' : 'polite');
  if (state.view === 'files' && state.library) {
    if (!$('#library-mount')) renderMarkup($('#content'), '<div id="library-mount"><p role="status">Abrindo notas do cérebro…</p></div>');
    void mountLibraryView();
  } else {
    disposeLibraryView();
    renderMarkup($('#content'), tabstrip() + renderers[state.view]());
  }
  $('#updated-at').textContent = `Estado local · ${fmtDate(state.model.generated_at)}`;
  document.querySelectorAll('[data-count]').forEach((element) => {
    const value = state.model.counts[element.dataset.count] ?? 0;
    element.textContent = value;
    element.dataset.zero = String(!value);
  });
  const taskCount = $('[data-task-count]');
  if (taskCount) {
    const open = state.tasks.data?.counts?.open;
    taskCount.hidden = open == null;
    taskCount.textContent = open ?? '';
    taskCount.dataset.zero = String(!open);
  }
  const inboxCount = $('[data-inbox-count]');
  if (inboxCount) {
    inboxCount.hidden = !state.inbox.data || state.inbox.error;
    inboxCount.textContent = state.inbox.data?.counts.unread ?? '';
    inboxCount.dataset.zero = String(!state.inbox.data?.counts.unread);
  }
  updateNavigation();
  // Procedimentos só existe em modo vault: fora dele o botão da nav nem aparece.
  const procedureNav = $('#navigation [data-view="procedures"]');
  if (procedureNav) procedureNav.hidden = !state.procedures.available;
  if (state.view === 'anatomy') {
    const strip = $('.brain-mode-switch');
    const activeMode = strip?.querySelector('button.active');
    if (strip && activeMode && strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft = activeMode.offsetLeft - ((strip.clientWidth - activeMode.offsetWidth) / 2);
    }
  }
  ensureVisibleSystemInterfaceHealth();
  if (state.view === 'canvas') void mountCanvasView();
}

function canvasEndpoint() {
  if (state.canvas.scope === 'brain') return '/api/graphs/brain';
  if (state.canvas.scope === 'system') return `/api/graphs/systems/${state.canvas.ref}`;
  if (String(state.canvas.ref).startsWith('run-record:')) {
    return `/api/graphs/run-records/${String(state.canvas.ref).slice('run-record:'.length)}`;
  }
  return `/api/graphs/runs/${state.canvas.ref}`;
}

function safeCanvasExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowedHosts = new Set([
      'app.clickup.com', 'drive.google.com', 'docs.google.com',
      'business.facebook.com', 'adsmanager.facebook.com', 'www.facebook.com', 'facebook.com',
    ]);
    return url.protocol === 'https:' && allowedHosts.has(url.hostname) ? url.href : null;
  } catch { return null; }
}

function externalProvider(value) {
  const hostname = new URL(value).hostname;
  if (hostname === 'app.clickup.com') return 'ClickUp';
  if (hostname === 'drive.google.com' || hostname === 'docs.google.com') return 'Drive';
  return 'Meta';
}

// Proveniência acionável: URL abre na origem; ref/caminho copia com um clique.
function detailScalar(value) {
  const text = String(value ?? '');
  if (/^https?:\/\//.test(text)) {
    const url = safeCanvasExternalUrl(text);
    if (url) return `<a class="copy-ref" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)} <b>${iconMarkup('external-link')}</b></a>`;
  }
  if (/^[\w.@-]+[/:][\w./:@ -]+$/.test(text) && text.length > 6) {
    return `<button type="button" class="copy-ref" data-copy-ref="${escapeHtml(text)}" title="Copiar">${escapeHtml(text)} <b>${iconMarkup('copy')}</b></button>`;
  }
  return escapeHtml(text);
}

function canvasDetailValue(value) {
  if (Array.isArray(value)) {
    return value.length
      ? `<ul class="canvas-detail-list">${value.map((item) => `<li>${typeof item === 'object' ? escapeHtml(JSON.stringify(item)) : detailScalar(item)}</li>`).join('')}</ul>`
      : '<span class="muted">nenhum</span>';
  }
  if (value && typeof value === 'object') return `<pre class="canvas-detail-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  return detailScalar(value);
}

// Vizinhos do nó — navegar o grafo de conexão em conexão, sem caçar no mapa.
function nodeConnections(node) {
  const graph = state.canvas.graph;
  if (!graph) return '';
  const seen = new Set([node.id]);
  const neighbors = [];
  for (const edge of graph.edges) {
    const otherId = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
    if (!otherId || seen.has(otherId)) continue;
    const other = graph.nodes.find((item) => item.id === otherId);
    if (!other) continue;
    seen.add(otherId);
    neighbors.push({ other, relation: edge.relation });
  }
  if (!neighbors.length) return '';
  neighbors.sort((left, right) => left.other.kind.localeCompare(right.other.kind));
  return `<div class="knowledge-block"><p class="micro">CONEXÕES · ${neighbors.length}</p><div class="node-links">${neighbors.map(({ other, relation }) => `<button type="button" class="node-link" data-canvas-inspect-node="${escapeHtml(other.id)}" data-node-kind="${escapeHtml(other.kind)}"><i></i><strong>${escapeHtml(other.label)}</strong><small>${escapeHtml(label(other.kind))}${relation ? ` · ${escapeHtml(relation)}` : ''}</small></button>`).join('')}</div></div>`;
}

function canvasInspector(node) {
  const inspector = $('#canvas-inspector');
  if (!inspector) return;
  const externalUrl = safeCanvasExternalUrl(node.details?.external_url);
  const details = Object.entries(node.details || {}).filter(([key, value]) => key !== 'external_url' && value !== null && value !== undefined);
  renderMarkup(inspector, `<p class="micro">${escapeHtml(label(node.kind))} · ${escapeHtml(label(node.state))}</p><h3>${escapeHtml(node.label)}</h3><div class="canvas-inspector-state">${badge(node.state, tone(node.state))}${node.actual ? '<span>objeto observado</span>' : '<span>contrato</span>'}</div>${externalUrl ? `<a class="canvas-open-link" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">Abrir no ${escapeHtml(externalProvider(externalUrl))} <b>${iconMarkup('external-link')}</b></a>` : ''}${nodeConnections(node)}<dl>${details.map(([key, value]) => `<div><dt>${escapeHtml(key.replaceAll('_', ' '))}</dt><dd>${canvasDetailValue(value)}</dd></div>`).join('')}</dl>`);
}

function canvasList(graph) {
  return `<table><thead><tr><th>Objeto</th><th>Tipo</th><th>Estado</th><th>Rastro</th></tr></thead><tbody>${graph.nodes.map((node) => `<tr><td><button class="table-action" data-canvas-inspect-node="${escapeHtml(node.id)}">${escapeHtml(node.label)} →</button></td><td>${escapeHtml(label(node.kind))}</td><td>${escapeHtml(label(node.state))}</td><td>${node.actual ? 'Observado' : 'Contrato'}</td></tr>`).join('')}</tbody></table>`;
}

// Enxame determinístico de partículas orbitando o centro — o núcleo vivo do
// Cérebro. Nenhum dado envolvido: é ambiente, e respeita reduced-motion.
function startParticles() {
  const canvas = $('#canvas-particles');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const design = Object.fromEntries([
    'dpr-max', 'count-low', 'count', 'turns', 'inner-radius-min', 'inner-radius-range',
    'outer-radius-min', 'outer-radius-range', 'motion-base', 'motion-step', 'size-base',
    'size-step', 'alpha-base', 'alpha-step', 'center-y', 'ellipse-ratio', 'orbit-motion',
    'orbit-dash', 'orbit-gap', 'orbit-inner-radius', 'orbit-outer-radius',
    'inner-alpha-max', 'inner-alpha-boost',
  ].map(name => [name, readDesignNumber(`--particles-${name}`)]));
  const dpr = Math.min(window.devicePixelRatio || 1, design['dpr-max']);
  const resize = () => { canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; };
  resize();
  const lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || navigator.connection?.saveData;
  const TOTAL = lowPower ? design['count-low'] : design.count;
  const particles = Array.from({ length: TOTAL }, (_, index) => ({
    angle: (index / TOTAL) * Math.PI * 2 * design.turns,
    radius: index % 3 ? design['inner-radius-min'] + ((index * 17) % 80) / 80 * design['inner-radius-range'] : design['outer-radius-min'] + ((index * 37) % 100) / 100 * design['outer-radius-range'],
    speed: design['motion-base'] + ((index % 9) * design['motion-step']),
    size: design['size-base'] + (index % 4) * design['size-step'],
    colorToken: index % 9 === 0 ? '--particles-primary-color' : index % 13 === 0 ? '--particles-secondary-color' : '--particles-neutral-color',
    alpha: design['alpha-base'] + (index % 5) * design['alpha-step'],
  }));
  let colors;
  const syncColors = () => { colors = Object.fromEntries(['--particles-primary-color', '--particles-secondary-color', '--particles-neutral-color', '--particles-orbit-color'].map(name => [name, readDesignToken(name)])); };
  syncColors();
  window.addEventListener('cerebro:theme-change', syncColors);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  const draw = (time) => {
    if (canvas.width !== canvas.clientWidth * dpr || canvas.height !== canvas.clientHeight * dpr) resize();
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const centerX = width / 2;
    const centerY = height * design['center-y'];
    const scale = Math.min(width, height);
    for (const [ringIndex, ringRadius] of [[0, design['orbit-inner-radius']], [1, design['orbit-outer-radius']]]) {
      context.beginPath();
      context.setLineDash([design['orbit-dash'] * dpr, design['orbit-gap'] * dpr]);
      context.lineDashOffset = (time * design['orbit-motion'] * (ringIndex ? -1 : 1)) % 1000;
      context.ellipse(centerX, centerY, ringRadius * scale, ringRadius * scale * design['ellipse-ratio'], 0, 0, Math.PI * 2);
      context.strokeStyle = colors['--particles-orbit-color'];
      context.lineWidth = dpr;
      context.stroke();
    }
    context.setLineDash([]);
    for (const particle of particles) {
      const angle = particle.angle + time * particle.speed;
      const x = centerX + Math.cos(angle) * particle.radius * scale;
      const y = centerY + Math.sin(angle) * particle.radius * scale * design['ellipse-ratio'];
      context.beginPath();
      context.arc(x, y, particle.size * dpr, 0, Math.PI * 2);
      context.fillStyle = colors[particle.colorToken];
      context.globalAlpha = particle.radius < design['orbit-inner-radius'] ? Math.min(design['inner-alpha-max'], particle.alpha + design['inner-alpha-boost']) : particle.alpha;
      context.fill();
      context.globalAlpha = 1;
    }
    if (!reduced) frame = requestAnimationFrame(draw);
  };
  const syncVisibility = () => {
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!reduced && !frame) {
      frame = requestAnimationFrame(draw);
    }
  };
  if (reduced) draw(0); else frame = requestAnimationFrame(draw);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncVisibility);
  state.canvas.stopParticles = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('cerebro:theme-change', syncColors);
    document.removeEventListener('visibilitychange', syncVisibility);
  };
}

// DIRECTORY do conhecimento — como o cérebro está distribuído e o que é mais
// linkado. Índice derivado do fosso (01-nucleo-privado), calculado pelo server.
// Nota privada chega sem título e sem caminho: o rótulo é neutro e só o domínio
// (a pasta) dá contexto. Com o título escondido não há o que copiar, então a linha
// deixa de ser botão.
function knowledgeNoteRow(note) {
  if (note.private && !note.title) {
    return `<span class="knowledge-note is-private"><strong>Nota privada</strong><small>${escapeHtml(note.domain)} · ${note.count}←</small></span>`;
  }
  return `<button type="button" class="knowledge-note${note.private ? ' is-private' : ''}" data-copy-ref="${escapeHtml(note.path)}" title="Copiar caminho"><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(note.domain)} · ${note.count}←</small></button>`;
}

async function renderKnowledgePanel() {
  try {
    const knowledge = await getJson(`/api/knowledge${state.knowledge.reveal ? '?reveal=1' : ''}`);
    const inspector = $('#canvas-inspector');
    if (!inspector || state.view !== 'canvas' || state.canvas.scope !== 'brain') return;
    const maxDomain = Math.max(1, ...knowledge.domains.map((domain) => domain.count));
    // Largura da barra em degraus de 5% via classe: a CSP do Console proíbe style inline.
    const bar = (count) => `w-${String(Math.max(1, Math.round((count / maxDomain) * 20)) * 5).padStart(3, '0')}`;
    const privateNotes = knowledge.most_linked.filter((note) => note.private).length;
    const toggle = privateNotes
      ? `<button type="button" class="knowledge-reveal" data-knowledge-reveal="${state.knowledge.reveal ? '0' : '1'}">${state.knowledge.reveal ? 'Esconder' : 'Revelar'} ${privateNotes} título(s) privado(s)</button>`
      : '';
    renderMarkup(inspector, `<p class="micro">Memória semântica · Diagnóstico</p><h3>Notas e conexões</h3>
      <div class="canvas-inspector-state"><span>${knowledge.total_notes} notas · raiz de conhecimento</span></div>
      <div class="knowledge-block"><p class="micro">Domínios</p>${knowledge.domains.map((domain) => `<div class="knowledge-domain"><span>${escapeHtml(domain.name)}</span><i class="${bar(domain.count)}"></i><b>${domain.count}</b></div>`).join('')}</div>
      <div class="knowledge-block"><p class="micro">Mais linkadas</p>${knowledge.most_linked.map(knowledgeNoteRow).join('') || '<p class="muted">Nenhum wikilink encontrado.</p>'}${toggle}</div>
      <p class="section-help">Diagnóstico secundário da memória — o cérebro começa pelos resultados que sabe produzir, não pela contagem de notas.</p>`);
  } catch { /* painel opcional — o Canvas funciona sem ele */ }
}

/* Drawers de Sistema e Fonte — os objetos estruturais também abrem, e tudo
   se cruza: fonte ↔ sistemas ↔ rotinas ↔ experimentos, em cadeia. */

function showDrawerShell(content) {
  state.selectedRoutine = null;
  state.selectedJudgment = null;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = null;
  renderMarkup($('#drawer-content'), content);
  drawerController.open();
}

function entityLink(attribute, ref, title, hint, kind) {
  return `<button type="button" class="node-link" ${attribute}="${escapeHtml(ref)}" data-node-kind="${escapeHtml(kind)}"><i></i><strong>${escapeHtml(title)}</strong><small>${escapeHtml(hint)}</small></button>`;
}

// source_refs pode vir como string ou objeto {source_id, role, ...} conforme o contrato
function sourceRefId(ref) {
  return typeof ref === 'string' ? ref : ref?.source_id || ref?.ref || ref?.role || '';
}

function openSourceDrawer(sourceId) {
  const source = state.model.sources.find((item) => item.source_id === sourceId);
  if (!source) return;
  const systems = state.model.systems.filter((system) => system.source_refs.some((ref) => sourceRefId(ref) === source.source_id));
  const grants = state.model.routines.flatMap((routine) => routine.access
    .filter((access) => access.source_ref === source.source_id)
    .map((access) => ({ routine, access })));
  showDrawerShell(`<div class="drawer-head"><p class="micro">FONTE · ${escapeHtml(source.type || 'casa de verdade')}</p><h2>${escapeHtml(source.name)}</h2>
      <div class="judgment-badges">${badge(source.status, source.status === 'active' ? 'good' : 'neutral')}${badge(source.assurance, source.assurance === 'runtime-enforced' ? 'good' : 'neutral')}</div></div>
    <div class="drawer-section"><h3>Contrato</h3><dl>
      <div><dt>Custódia</dt><dd>${escapeHtml(label(source.custody))}</dd></div>
      <div><dt>PII</dt><dd>${escapeHtml(label(source.pii))}</dd></div>
      <div><dt>Modos</dt><dd>${source.modes.map((mode) => `<code>${escapeHtml(mode)}</code>`).join(' ')}</dd></div>
      <div><dt>Ref</dt><dd><code>${escapeHtml(source.source_id)}</code></dd></div>
    </dl></div>
    <div class="drawer-section"><h3>Sistemas que usam · ${systems.length}</h3><div class="node-links">${systems.map((system) => entityLink('data-open-system', system.system_id, system.name, label(system.migration_stage), 'system')).join('') || '<p class="muted">Nenhum sistema declara esta fonte.</p>'}</div></div>
    ${grants.length ? `<div class="drawer-section"><h3>Acessos concedidos · ${grants.length}</h3><div class="node-links">${grants.map(({ routine, access }) => entityLink('data-open-routine', routine.routine_id, routine.name, `${label(access.assurance)} · ${label(access.revocation_effect)}`, 'routine')).join('')}</div></div>` : ''}
    <div class="drawer-section"><button class="action primary" data-focus-brain-node="source:${escapeHtml(source.source_id)}">Ver no mandala →</button></div>`);
}

/* Replay do Execution Trace — reproduz o run evento a evento sobre o mapa.
   Só coreografa o que o ledger registrou; estados finais voltam ao real no fim. */
const replay = { playing: false, timer: 0 };

function traceReplayEvents(graph = state.canvas.graph) {
  return (graph?.trace_timeline || []).filter((event) => event.node_id);
}

function syncTraceReplayAvailability(graph) {
  const button = $('[data-canvas-replay]');
  const status = $('#replay-availability');
  if (!button) return;
  const replayEvents = traceReplayEvents(graph).length;
  button.disabled = replayEvents === 0;
  button.textContent = '▶ Reproduzir trace';
  button.title = replayEvents
    ? `Reproduzir ${replayEvents} eventos observados deste trace`
    : 'Run anterior à instrumentação detalhada — resultado preservado, replay visual indisponível';
  if (status) {
    status.textContent = replayEvents
      ? `${replayEvents} eventos registrados`
      : 'Resultado preservado · replay visual indisponível neste Run';
    status.classList.toggle('unavailable', replayEvents === 0);
  }
}

function stopTraceReplay(restore = true) {
  clearTimeout(replay.timer);
  replay.playing = false;
  const ticker = $('#replay-ticker');
  if (ticker) { disposeMarkup(ticker); ticker.remove(); }
  const button = $('[data-canvas-replay]');
  if (button) button.textContent = '▶ Reproduzir trace';
  if (!restore) return;
  for (const element of document.querySelectorAll('#operational-canvas .brain-node')) {
    if (element.dataset.replayClass) {
      element.className = element.dataset.replayClass;
      delete element.dataset.replayClass;
    }
  }
}

function playTraceReplay() {
  const timeline = traceReplayEvents();
  if (!timeline.length) { toast('Este run não tem trace com eventos para reproduzir.', 'bad'); return; }
  if (replay.playing) { stopTraceReplay(); return; }
  replay.playing = true;
  const button = $('[data-canvas-replay]');
  if (button) button.textContent = '⏹ Parar';
  const pane = document.querySelector('.canvas-viewport');
  const ticker = document.createElement('div');
  ticker.id = 'replay-ticker';
  ticker.className = 'replay-ticker';
  pane?.appendChild(ticker);
  const nodes = [...document.querySelectorAll('#operational-canvas .brain-node')];
  for (const element of nodes) {
    element.dataset.replayClass = element.className;
    element.className = element.className
      .replace(/brain-node--state-[\w-]+/g, 'brain-node--state-declared')
      .replace(/\bis-focused\b|\bis-neighbor\b/g, '');
    element.classList.add('is-awaiting');
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepMs = reduced ? 0 : readDesignNumber('--duration-trace-step');
  let index = 0;
  let previous = null;
  const step = () => {
    if (!replay.playing) return;
    if (index >= timeline.length) {
      renderMarkup(ticker, `<b>✓</b> trace completo · ${timeline.length} eventos`);
      replay.timer = setTimeout(() => stopTraceReplay(), reduced ? 0 : readDesignNumber('--duration-trace-finish'));
      return;
    }
    const event = timeline[index];
    const element = document.querySelector(`#operational-canvas .brain-node[data-node-id="${CSS.escape(event.node_id)}"]`);
    if (element) {
      element.classList.remove('is-awaiting');
      element.className = element.className.replace(/brain-node--state-[\w-]+/g, `brain-node--state-${event.state}`);
      previous?.classList.remove('is-focused');
      element.classList.add('is-focused');
      previous = element;
    }
    renderMarkup(ticker, `<b>${index + 1}/${timeline.length}</b> ${escapeHtml(event.step_id)} · ${escapeHtml(label(event.state))} · t+${fmtDuration(event.elapsed_ms)}`);
    index += 1;
    replay.timer = setTimeout(step, stepMs);
  };
  step();
}

// Troca rápida de referência (‹ › no pill, ← → no teclado)
function defaultCanvasSystemRef() {
  const systems = visibleSystems();
  return systems.find((item) => item.migration_stage === 'active')?.system_id
    || systems[0]?.system_id
    || null;
}

function cycleCanvasRef(step) {
  if (state.canvas.scope === 'brain') return;
  const options = state.canvas.scope === 'system'
    ? visibleSystems().map((system) => system.system_id)
    : allCanvasExecutions().map((execution) => execution.selector_ref);
  if (!options.length) return;
  const index = Math.max(0, options.indexOf(state.canvas.ref));
  state.canvas.ref = options[(index + step + options.length) % options.length];
  state.canvas.positions = null;
  render();
}

async function mountCanvasView() {
  startParticles();
  if (state.canvas.scope === 'system' && !state.canvas.ref) state.canvas.ref = defaultCanvasSystemRef();
  if (state.canvas.scope === 'run' && !state.canvas.ref) state.canvas.ref = allCanvasExecutions()[0]?.selector_ref;
  const container = $('#operational-canvas');
  if (!container || (state.canvas.scope !== 'brain' && !state.canvas.ref)) {
    if (container) renderMarkup(container, empty('Nada para desenhar', 'Ainda não existe objeto real nesta escala.'));
    return;
  }
  try {
    const [graph, { mountOperationalCanvas }] = await Promise.all([
      getJson(canvasEndpoint()),
      loadOperationalCanvas(),
    ]);
    if (state.view !== 'canvas') return;
    state.canvas.graph = graph;
    state.canvas.positions = null;
    syncTraceReplayAvailability(graph);
    const timingPanel = $('#run-timing');
    if (timingPanel && graph.graph_type === 'run') {
      renderMarkup(timingPanel, runTimingPanel(graph));
      timingPanel.hidden = false;
    }
    renderMarkup($('#canvas-origin'), graph.trace_origin
      ? `<span>${graph.run?.mode ? escapeHtml(label(graph.run.mode).toUpperCase()) : graph.trace_origin === 'recorded' ? 'TRACE V1' : 'TRACE RECONSTRUÍDO'}</span><b>${escapeHtml(graph.run?.chain_id ? `${graph.run.chain_id} · ${graph.trace_events} eventos` : graph.trace_origin === 'recorded' ? `${graph.trace_events} eventos` : 'granularidade limitada')}</b>`
      : `<span>Contrato</span><b>${graph.nodes.length} nós · ${graph.edges.length} arestas</b>`);
    renderMarkup($('#canvas-list'), canvasList(graph));
    const pendingFocus = state.canvas.pendingFocus;
    state.canvas.pendingFocus = null;
    if (state.canvas.scope === 'brain' && !pendingFocus && state.operatingAreaFilter) {
      const areaNode = graph.nodes.find((item) => item.kind === 'area' && item.id === `area:${state.operatingAreaFilter}`);
      if (areaNode) state.canvas.pendingFocus = areaNode.id;
    }
    const areaPendingFocus = state.canvas.pendingFocus;
    if (state.canvas.scope === 'brain' && !pendingFocus && !areaPendingFocus) void renderKnowledgePanel();
    if (areaPendingFocus) {
      const areaTarget = graph.nodes.find((item) => item.id === areaPendingFocus);
      if (areaTarget) canvasInspector(areaTarget);
    }
    if (pendingFocus) {
      const focusTarget = graph.nodes.find((item) => item.id === pendingFocus);
      if (focusTarget) canvasInspector(focusTarget);
    }
    state.canvas.controller = await mountOperationalCanvas({
      container,
      model: graph,
      editable: state.canvas.editable,
      focusNodeId: pendingFocus || areaPendingFocus || null,
      onInspect: canvasInspector,
      onLayoutChange: (positions) => {
        state.canvas.positions = positions;
        const save = $('[data-canvas-save]');
        if (save) save.disabled = false;
      },
    });
  } catch (error) {
    renderMarkup(container, empty('Canvas indisponível', label(error.message)));
    toast(label(error.message), 'bad');
  }
}

/* Dialog de confirmação da casa — substitui window.prompt/confirm.
   Junta aviso institucional + campos de aprovação num único passo. */
const APPROVED_BY_FIELD = { key: 'approvedBy', label: 'Quem aprova · referência sem dado pessoal', value: 'role-founder' };

function askConfirm(config) { return askConfirmation(config); }

function renderDeliveryApplicationSlot(slot = state.deliveryApplication?.get()) {
  const host = $('#delivery-application-slot');
  if (host && slot?.receiptId === state.selectedJudgment) renderMarkup(host, deliveryApplicationMarkup(slot, { escapeHtml, renderReviewMarkdown, fmtDate, label }));
}

state.deliveryApplication = createDeliveryApplicationController({
  selectedReceipt: () => state.selectedJudgment,
  isBusy: () => state.busy,
  setBusy: (value) => { state.busy = value; },
  mutate, askConfirm, paint: renderDeliveryApplicationSlot, toast, label,
  readState: (receiptId) => getJson(`/api/runs/${receiptId}/application`),
  refresh: async (receiptId, selection) => {
    const draft = $('#judgment-note')?.value || '';
    const review = state.judgmentReview;
    await loadModel();
    if (state.selectedJudgment === receiptId && state.judgmentReview === review && state.deliveryApplication.get() === selection) await openJudgment(receiptId, { draft });
  },
});


async function saveCanvasLayout() {
  if (!state.canvas.graph || !state.canvas.positions) return;
  const approval = await askConfirm({
    title: 'Salvar layout do mapa',
    body: 'Salva somente as posições dos nós nesta máquina. A topologia e os contratos não serão alterados.',
    confirmLabel: 'Salvar posições',
    fields: [APPROVED_BY_FIELD],
  });
  if (!approval?.approvedBy) return;
  const approvedBy = approval.approvedBy;
  try {
    const result = await mutate(`/api/graphs/layouts/${state.canvas.graph.layout.key}`, {
      approved_by: approvedBy,
      positions: state.canvas.positions,
    }, 'PUT');
    toast(`Layout salvo · ${result.node_count} posições · topologia intacta.`);
    state.canvas.positions = null;
    const save = $('[data-canvas-save]');
    if (save) save.disabled = true;
  } catch (error) { toast(label(error.message), 'bad'); }
}

function drawerActions(routine) {
  const buttons = [];
  if (routine.actions.can_confirm_legacy_pause) buttons.push('<button class="action warn" data-routine-action="confirm-legacy-pause">Registrar pausa antiga</button>');
  if (routine.actions.can_verify) buttons.push('<button class="action" data-routine-action="verify">Verificar execução</button>');
  if (routine.actions.can_run) buttons.push('<button class="action primary" data-routine-action="run">Rodar agora</button>');
  if (routine.actions.can_activate) buttons.push('<button class="action primary" data-routine-action="activate">Ativar agenda</button>');
  if (routine.actions.can_pause) buttons.push('<button class="action" data-routine-action="pause">Pausar</button>');
  if (routine.actions.can_resume) buttons.push('<button class="action primary" data-routine-action="resume">Retomar</button>');
  return buttons.join('');
}

function openDrawer(routineId) {
  const routine = state.model.routines.find((item) => item.routine_id === routineId);
  if (!routine) return;
  state.selectedRoutine = routineId;
  state.routineDrawerVersion++;
  state.selectedJudgment = null;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = null;
  const access = routine.access.map((item) => `<div class="access-item"><div><strong>${escapeHtml(item.source_ref)}</strong><span>${escapeHtml(item.action)} · ${escapeHtml(item.requested_mode)}</span></div>${badge(item.assurance, item.assurance === 'runtime-enforced' ? 'good' : 'neutral')}<small>${escapeHtml(label(item.revocation_effect))}</small></div>`).join('') || '<p class="muted">Sem Access Grants declarados.</p>';
  const receipts = routine.receipts.map((receipt) => `<div class="receipt-item"><span class="timeline-dot ${tone(receipt.status)}"></span><div><strong>${escapeHtml(label(receipt.status))} · ${escapeHtml(receipt.trigger)}</strong><span>${fmtDate(receipt.completed_at)} · ${escapeHtml(receipt.reason_code)}</span><code>${escapeHtml(receipt.receipt_ref)}</code>${receipt.output_ref ? `<code>output: ${escapeHtml(receipt.output_ref)}</code>` : ''}</div></div>`).join('') || '<p class="muted">Nenhuma execução registrada.</p>';
  const migration = routine.migration ? `<div class="migration-box ${routine.migration.status === 'awaiting-legacy-pause' ? 'attention' : ''}"><p class="micro">Migração de agenda</p><strong>${escapeHtml(label(routine.migration.status))}</strong><p>${escapeHtml(routine.migration.source.schedule_summary)}</p><small>Fonte: ${escapeHtml(routine.migration.source.kind)} · o Console não pausa esse fornecedor sozinho.</small></div>` : '';
  renderMarkup($('#drawer-content'), `<div class="drawer-head"><p class="eyebrow">ROTINA · v${escapeHtml(routine.version)}</p><h2>${escapeHtml(routine.name)}</h2>${badge(routine.health_reason_code)}</div>${migration}
    <section class="drawer-section"><h3>Contrato operacional</h3><dl><div><dt>Agenda</dt><dd>${escapeHtml(routine.schedule)}</dd></div>${routine.preparation ? `<div><dt>Preparação</dt><dd>${escapeHtml(routine.preparation.executable || 'binding ausente')} → <code>${escapeHtml(routine.preparation.output_ref)}</code></dd></div>` : ''}<div><dt>Executor</dt><dd>${escapeHtml(routine.binding.adapter)} · ${escapeHtml(routine.binding.requested_model)}</dd></div><div><dt>Modelo</dt><dd>Solicitado, não verificado pelo provider</dd></div><div><dt>Permissão</dt><dd>${escapeHtml(routine.permission_mode)}</dd></div><div><dt>Prompt ref.</dt><dd><code>${escapeHtml(routine.prompt_ref)}</code></dd></div><div><dt>Destino</dt><dd><code>${escapeHtml(routine.destination.kind)}:${escapeHtml(routine.destination.ref)}</code></dd></div></dl></section>
    ${routine.permission_mode === 'read-only' && routine.destination.kind === 'runtime-output' ? '<section class="drawer-section"><h3>Entrega para revisão</h3><p>O agente trabalha em modo de leitura. O Console salva o relatório em um arquivo privado separado. Aprovar avalia a qualidade da entrega; aplicar o conteúdo ao vault é uma ação separada.</p></section>' : ''}
    ${routinePreflightMarkup(routine, { escapeHtml, fmtDate, label })}
    <section class="drawer-section"><h3>Contexto e garantia</h3><p class="section-help">A interface mostra referências e a garantia real. Ela não abre o conteúdo da Fonte.</p>${access}</section>
    <section class="drawer-section"><h3>Fronteira do provider</h3><div class="boundary-note"><b>${routine.receipts.some((receipt) => receipt.content_shared_with_provider) ? 'Já houve envio ao provider' : 'Nenhum envio registrado'}</b>Ao executar, o conteúdo necessário é enviado ao provider pelo ${escapeHtml(routine.binding.adapter)}. Não vai para a comunidade. Prompt e output não entram no recibo.</div></section>
    <section class="drawer-section"><h3>Recibos recentes</h3><div class="timeline">${receipts}</div></section>
    <div class="drawer-actions">${drawerActions(routine)}</div>`);
  drawerController.open();
}

function closeDrawer({ force = false, preserveLibrarySelection = false } = {}) {
  const active = activeNoteWorkspace();
  const note = state.noteWorkspace;
  if (active && active !== note) {
    if (!force && (active.getState().busy || active.getState().dirty)) {
      if (!active.getState().busy) void active.requestLeave().then(allowed => { if (allowed && activeNoteWorkspace() === active) closeDrawer({ force: true }); });
      return false;
    }
    if (preserveLibrarySelection || state.view !== 'files') disposeLibraryView();
    else void state.library.controller.closeNote({ force: true });
  }
  if (note && !force) {
    const snapshot = note.getState();
    if (snapshot.busy) return false;
    if (snapshot.dirty) {
      void note.requestLeave().then(allowed => { if (allowed && state.noteWorkspace === note) closeDrawer({ force: true }); });
      return false;
    }
  }
  state.noteWorkspace = null;
  note?.dispose();
  document.body.classList.remove('note-workspace-open');
  state.localFileRequest = (state.localFileRequest || 0) + 1;
  state.selectedLocalFile = null;
  drawerController.close();
  state.selectedRoutine = null;
  state.selectedJudgment = null;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = null;
}

function experimentPipeline(detail) {
  return `<div class="experiment-pipeline">${detail.pipeline.map((item, index) => `<div class="experiment-step ${escapeHtml(item.state)}"><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(label(item.state))} · ${escapeHtml(item.detail)}</small></div></div>`).join('<b>→</b>')}</div>`;
}

async function openExperiment(experimentId) {
  state.selectedRoutine = null;
  state.selectedJudgment = null;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = experimentId;
  renderMarkup($('#drawer-content'), '<div class="loading"><i></i><span>Abrindo contrato privado local…</span></div>');
  drawerController.open();
  try {
    const detail = await getJson(`/api/experiments/${experimentId}`);
    if (state.selectedExperiment !== experimentId) return;
    const contract = detail.contract;
    const experimentState = detail.state;
    const arms = contract.arms.length ? contract.arms.map((arm) => `<article><span>${escapeHtml(label(arm.role))}</span><strong>${escapeHtml(arm.label || arm.arm_id)}</strong><code>${escapeHtml(arm.arm_id)}</code></article>`).join('') : '<div class="experiment-gap">Braços não estruturados no ledger de origem. O Console não inferiu controle e variação pela descrição.</div>';
    const amendments = experimentState?.amendments.length ? experimentState.amendments.map((item) => `<div class="receipt-item"><span class="timeline-dot warn"></span><div><strong>${escapeHtml(item.amendment_id)}</strong><span>${fmtDate(item.on, false)} · ${item.change_count} mudança(s)</span><p class="judgment-note">${escapeHtml(item.reason)}</p></div></div>`).join('') : '<p class="muted">Nenhuma emenda registrada.</p>';
    const runs = experimentState?.run_refs.length ? experimentState.run_refs.map((ref) => `<code>${escapeHtml(ref)}</code>`).join('') : '<div class="experiment-gap">Nenhum Run Record contém entity_ref deste experimento.</div>';
    const verdict = experimentState?.verdict.status === 'recorded' ? `<pre class="private-output">${escapeHtml(experimentState.verdict.summary)}</pre>` : `<div class="experiment-gap">${escapeHtml(label(experimentState?.verdict.status || 'pending'))}. O martelo continua humano.</div>`;
    const learning = experimentState?.learning.status === 'linked'
      ? `<code>${escapeHtml(experimentState.learning.ref)}</code>`
      : `<div class="experiment-gap">${experimentState?.learning.status === 'unlinked' ? 'Há decisão, mas nenhuma mudança versionada do Sistema foi ligada a ela.' : 'O aprendizado ainda não chegou à próxima execução.'}</div>`;
    renderMarkup($('#drawer-content'), `<div class="drawer-head"><p class="eyebrow">EXPERIMENTO · ${escapeHtml(contract.experiment_id)}</p><h2>${escapeHtml(contract.name)}</h2>${badge(experimentState?.status || 'queued')}</div>
      <div class="boundary-note"><b>Leitura local explícita</b>Hipótese, régua e veredito não entraram no resumo do Console. Abrir não executou modelo nem ação externa.</div>
      <section class="drawer-section experiment-flow-section"><h3>Ciclo completo</h3>${experimentPipeline(detail)}</section>
      <section class="drawer-section"><div class="output-heading"><h3>Pré-registro congelado</h3><span>${escapeHtml(contract.freeze.kind)}</span></div>${contract.gaps.length ? `<div class="experiment-gap">Contrato legado incompleto: ${contract.gaps.map(label).map(escapeHtml).join(' · ')}</div>` : ''}<dl><div><dt>Hipótese</dt><dd>${escapeHtml(contract.hypothesis)}</dd></div><div><dt>Mudança única</dt><dd>${escapeHtml(contract.change)}</dd></div><div><dt>Condições</dt><dd>${escapeHtml(contract.preconditions || 'não estruturadas')}</dd></div><div><dt>Regra de decisão</dt><dd>${escapeHtml(contract.decision_rule || 'não estruturada no legado')}</dd></div></dl></section>
      <section class="drawer-section"><h3>Braços</h3><div class="experiment-arms">${arms}</div></section>
      <section class="drawer-section"><h3>Medição</h3><dl><div><dt>Primária</dt><dd><code>${escapeHtml(contract.primary_metric.metric_id)}</code><br>${escapeHtml(contract.primary_metric.definition)}</dd></div><div><dt>Guardrails</dt><dd>${escapeHtml(contract.guardrails.rule || 'não estruturados no legado')}</dd></div><div><dt>Janela</dt><dd>${fmtDate(contract.window.started_on, false)} → ${fmtDate(contract.window.read_on, false)}</dd></div></dl></section>
      <section class="drawer-section"><div class="output-heading"><h3>Sistemas envolvidos</h3><button class="table-action" data-open-experiment-system="${escapeHtml(contract.system_ref)}">Abrir no Canvas →</button></div><div class="experiment-system-map"><span><b>Palco</b><code>${escapeHtml(contract.system_ref)}</code></span><span><b>Leitura</b>${contract.measurement_system_refs.map((ref) => `<code>${escapeHtml(ref)}</code>`).join('')}</span></div></section>
      <section class="drawer-section"><h3>Runs ligados</h3><div class="ref-list">${runs}</div></section>
      <section class="drawer-section"><h3>Emendas append-only</h3><div class="timeline">${amendments}</div></section>
      <section class="drawer-section"><h3>Martelo humano</h3>${verdict}</section>
      <section class="drawer-section"><h3>Mudança na próxima execução</h3>${learning}</section>`);
  } catch (error) {
    if (state.selectedExperiment !== experimentId) return;
    renderMarkup($('#drawer-content'), empty('Experimento indisponível', label(error.message)));
    toast(label(error.message), 'bad');
  }
}

function judgmentHistory(history) {
  return history.slice().reverse().map((item) => `<div class="receipt-item"><span class="timeline-dot ${tone(item.verdict)}"></span><div><strong>${escapeHtml(label(item.verdict))}${item.action_intent === 'propose-action' ? ' · intenção de ação' : ''}</strong><span>${fmtDate(item.decided_at)} · ${escapeHtml(item.actor_ref)}</span>${item.note ? `<p class="judgment-note">${escapeHtml(item.note)}</p>` : ''}${item.reviewed_version ? `<p class="muted">Versão avaliada: ${escapeHtml(item.reviewed_version.sha256.slice(0, 12))} · qualidade do relatório</p>` : '<p class="muted">Versão do conteúdo não registrada nesta revisão antiga.</p>'}<code>${escapeHtml(item.judgment_id)}</code></div></div>`).join('') || '<p class="muted">Ainda não julgado.</p>';
}

function correctionSection(detail) {
  const correction = detail.correction;
  if (!correction) return '';
  const learning = correction.learning_candidate;
  const verdict = correction.resulting_judgment?.verdict;
  return `<section class="drawer-section"><h3>Linhas de correção</h3>
    <div class="correction-proof" aria-label="Estado comprovado da correção">
      <span>${badge('recorded', 'good', 'Correção registrada')}<small>há Judgment Receipt</small></span>
      <b>→</b>
      <span>${badge(correction.status === 'completed' ? 'applied' : correction.status, correction.status === 'completed' ? 'good' : 'warn', correction.status === 'completed' ? 'Aplicada em novo Run' : label(correction.status))}<small>${escapeHtml(correction.role === 'candidate' ? 'este é o resultado corrigido' : 'há um resultado corrigido ligado')}</small></span>
      <b>→</b>
      <span>${verdict ? badge(verdict, tone(verdict), verdict === 'approved' ? 'Resultado aprovado' : label(verdict)) : badge('pending', 'warn', 'Aguardando julgamento')}<small>aprovação é independente da reexecução</small></span>
    </div>
    <div class="correction-lineage"><div><span>Baseline</span><code>${escapeHtml(correction.baseline_receipt_ref)}</code></div><b>→</b><div><span>Novo Run</span><code>${escapeHtml(correction.resulting_receipt_ref)}</code></div></div>
    <p class="section-help">O recibo aponta para o julgamento que originou a correção; não copia a nota nem os outputs.</p>
    ${learning ? `<div class="learning-candidate"><div>${badge('candidate', 'neutral')}<strong>${learning.occurrences}/${learning.promotion_threshold}</strong></div><p>Ainda exige casos comparáveis, replay e novo martelo para mudar o Sistema.</p><code>${escapeHtml(learning.candidate_ref)}</code></div>` : ''}
    <div id="comparison-slot"></div>
  </section>`;
}

function verdictGuide() {
  return `<ul class="verdict-guide">
    <li><b>Aprovar relatório</b> confirma a qualidade desta versão. As tarefas citadas mantêm seus próprios estados.</li>
    <li><b>Pedir ajuste</b> registra o que precisa ser corrigido. Reexecutar é uma ação separada.</li>
    <li><b>Rejeitar</b> registra que esta entrega não foi aceita, com o motivo.</li>
    <li><b>Propor ação</b> registra intenção local, sem executar.</li>
  </ul>`;
}

/* Julgar é local e reversível; reexecutar atravessa a fronteira do provider.
   As duas coisas moram em zonas separadas para o gesto não confundi-las. */
function judgmentZones(detail) {
  if (!detail.review?.can_judge) return '<div class="boundary-note"><b>Revisão indisponível para esta versão</b>É necessário conferir a entrega original antes de registrar uma aprovação.</div>';
  const actions = detail.correction_actions || {};
  const history = detail.judgment?.history || [];
  const current = history.length ? history[history.length - 1] : null;
  const sameVersion = current?.reviewed_version?.sha256 === detail.review.content_sha256;
  const rerunReady = Boolean(actions.can_rerun_with_correction);
  const judge = `<div class="zone judge-zone">
    <p class="zone-label">Julgar · registra decisão local, nada sai desta máquina</p>
    <div class="drawer-actions judgment-actions">
      <button class="action${rerunReady ? '' : ' primary'}" data-judgment-action="approve">Aprovar relatório</button>
      <button class="action warn" data-judgment-action="changes">Pedir ajuste</button>
      <button class="action" data-judgment-action="reject">Rejeitar</button>
      <button class="action" data-judgment-action="propose-action">Propor ação</button>
    </div>
    ${rerunReady ? '<p class="zone-help">Registrar outro veredito substitui o julgamento atual e descarta a reexecução pendente.</p>' : ''}
  </div>`;
  const buttons = [];
  if (rerunReady) buttons.push('<button class="action primary" data-correction-action="rerun">Reexecutar com correção<small>envia sua nota ao provider · consome assinatura</small></button>');
  if (actions.can_compare) buttons.push('<button class="action" data-correction-action="compare">Comparar runs<small>abre baseline e candidato lado a lado</small></button>');
  if (actions.can_create_learning_candidate) buttons.push('<button class="action" data-correction-action="learn">Criar candidato 1/3<small>ainda exige replay e novo martelo</small></button>');
  const stateLine = current && !sameVersion
    ? '<div class="judgment-state"><div><strong>Esta versão ainda não foi avaliada</strong><span>A avaliação anterior permanece no histórico, vinculada à versão que foi revisada.</span></div></div>'
    : current
    ? `<div class="judgment-state"><span class="timeline-dot ${tone(current.verdict)}"></span><div><strong>Julgamento atual: ${escapeHtml(label(current.verdict))}</strong><span>${fmtDate(current.decided_at)} · ${escapeHtml(current.actor_ref)}${rerunReady ? ' · 1 reexecução disponível' : ''}</span></div></div>`
    : '<div class="judgment-state"><span class="timeline-dot warn"></span><div><strong>Ainda não julgado</strong><span>Nenhum veredito registrado para este resultado.</span></div></div>';
  if (!buttons.length) return `<div class="zone quiet">${stateLine}</div>${judge}`;
  return `<div class="zone act-zone">
    <p class="zone-label">Agir sobre este julgamento · executa e atravessa a fronteira do provider</p>
    ${stateLine}
    <div class="drawer-actions">${buttons.join('')}</div>
  </div>${judge}`;
}

function contextMarkup(context) {
  const snapshot = context.context_snapshot;
  const accesses = snapshot.accesses.map((access) => `<article class="context-access"><div class="object-card-top">${badge(access.assurance, access.assurance === 'runtime-enforced' ? 'good' : 'neutral')}<code>${escapeHtml(access.source_ref.role)}</code></div><h3>${escapeHtml(access.source_ref.id)}</h3><dl><div><dt>Seleção</dt><dd>${escapeHtml(access.query)}</dd></div><div><dt>Janela</dt><dd>${escapeHtml(access.window)}</dd></div><div><dt>Frescor</dt><dd>${escapeHtml(access.freshness_marker || 'não informado')}</dd></div></dl><div class="ref-list">${access.selected_refs.map((ref) => `<code>${escapeHtml(ref)}</code>`).join('')}</div></article>`).join('');
  const gaps = snapshot.gaps.length
    ? `<div class="context-gaps"><p class="micro">Lacunas</p>${snapshot.gaps.map((gap) => `<code>${escapeHtml(gap.source_role)} · ${escapeHtml(gap.reason_code)}</code>`).join('')}</div>`
    : '<p class="good-note">Nenhuma lacuna de Fonte registrada.</p>';
  return `<div class="context-summary"><span><b>${snapshot.accesses.length}</b> fontes selecionadas</span><span><b>${snapshot.gaps.length}</b> lacunas</span><span><b>v${escapeHtml(snapshot.retrieval_version)}</b> retrieval</span></div><div class="context-grid">${accesses}</div>${gaps}<div class="boundary-note"><b>Snapshot reference-only</b>O ledger guarda hash, ponteiros, filtros, janela, frescor e garantia. A seleção é auditada; somente uma garantia runtime-enforced provaria bloqueio preventivo. O artefato privado não foi aberto nesta tela.</div>`;
}

async function loadContext(receiptId, slot, { current = () => true } = {}) {
  try {
    const context = await getJson(`/api/runs/${receiptId}/context`);
    if (!current() || slot?.isConnected === false) return;
    renderMarkup(slot, contextMarkup(context));
  } catch (error) {
    if (!current() || slot?.isConnected === false) return;
    renderMarkup(slot, empty('Contexto indisponível', label(error.message)));
    toast(label(error.message), 'bad');
  }
}

async function openContextDrawer(receiptId) {
  state.selectedRoutine = null;
  state.selectedJudgment = receiptId;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = null;
  renderMarkup($('#drawer-content'), '<div class="drawer-head"><p class="eyebrow">Run record v2</p><h2>Contexto selecionado</h2></div><div id="context-slot"><p class="muted">Lendo referências locais…</p></div>');
  drawerController.open();
  await loadContext(receiptId, $('#context-slot'));
}

function judgmentVersionMarkup(review) {
  if (!review) return '<div class="boundary-note"><b>Versão indisponível</b>Reabra a entrega antes de registrar uma decisão.</div>';
  const imported = review.origin !== 'native';
  const title = review.version_state === 'changed' ? 'A nota mudou desde a importação'
    : review.version_state === 'unavailable' ? 'A entrega original não está disponível'
      : imported ? 'Conteúdo confere com a versão importada' : 'Versão da entrega aberta para revisão';
  const explanation = review.version_state === 'changed'
    ? 'O texto abaixo é a nota atual. A versão histórica não foi recuperada; nenhuma aprovação será registrada sobre ela.'
    : review.version_state === 'unavailable'
      ? 'Não há conteúdo original verificável para julgar. O registro permanece disponível no histórico.'
      : 'A decisão ficará vinculada a esta versão do conteúdo. Aprovar confirma a qualidade do relatório; as tarefas citadas mantêm seus próprios estados.';
  return `<div class="boundary-note review-version${review.can_judge ? '' : ' review-blocked'}"><b>${title}</b><p>${explanation}</p>
    ${review.source_ref ? `<span class="review-source">Origem: <code>${escapeHtml(review.source_ref)}</code></span>` : ''}
    ${review.content_sha256 ? `<details class="review-metadata"><summary>Identificar esta versão · ${escapeHtml(review.content_sha256.slice(0, 12))}</summary><code>${escapeHtml(review.content_sha256)}</code></details>` : ''}</div>`;
}

async function openJudgment(receiptId, { draft = '' } = {}) {
  state.selectedRoutine = null;
  state.selectedJudgment = receiptId;
  state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
  state.selectedExperiment = null;
  const request = state.judgmentRequest;
  renderMarkup($('#drawer-content'), '<div class="loading"><i></i><span>Abrindo entrega local…</span></div>');
  drawerController.open();
  try {
    const detail = await getJson(`/api/runs/${receiptId}/output`);
    if (state.selectedJudgment !== receiptId || state.judgmentRequest !== request) return;
    const current = detail.judgment.summary;
    const review = detail.review;
    state.judgmentReview = review ? { ...review, receiptId } : null;
    const application = state.deliveryApplication.open(receiptId, detail.application || { eligible: false, reason_code: 'delivery-application-unavailable', state: { status: 'not-applied' } });
    const item = state.model.judgments.find((entry) => entry.receipt_id === receiptId);
    const name = item?.routine_name || detail.receipt.routine_id;
    const imported = review && review.origin !== 'native';
    const previousReview = detail.judgment.current;
    const otherVersion = previousReview && previousReview.reviewed_version?.sha256 !== review?.content_sha256;
    renderMarkup($('#drawer-content'), `<div class="drawer-head"><h2>${escapeHtml(name)}</h2>${otherVersion ? badge('pending', 'warn', 'Esta versão ainda não foi avaliada') : badge(imported && current.status === 'pending' ? 'imported' : current.status === 'pending' ? 'pending' : current.verdict, imported && current.status === 'pending' ? 'neutral' : tone(current.verdict || current.status))}</div>
      ${judgmentVersionMarkup(review)}
      <div class="proof-split output-only">
        <section class="drawer-section proof-result"><div class="output-heading"><h3>${review?.version_state === 'changed' ? 'Nota atual para consulta' : 'Conteúdo da entrega'}</h3><span>${fmtDate(detail.receipt.completed_at)}</span></div>
          ${detail.output.content ? `<article class="review-document">${renderReviewMarkdown(detail.output.content)}</article><details class="review-metadata"><summary>Ver Markdown original</summary><pre class="private-output">${escapeHtml(detail.output.content)}</pre></details>` : '<p class="muted">O conteúdo não foi disponibilizado para leitura.</p>'}</section>
      </div>
      ${detail.context_available ? '<details class="review-metadata review-origins"><summary>Origens usadas</summary><div id="context-slot"><p class="muted">Lendo as origens registradas…</p></div></details>' : ''}
      ${correctionSection(detail)}
      ${review?.can_judge ? `<section class="drawer-section"><h3>Sua avaliação desta versão</h3><p class="section-help">Você avalia a qualidade do relatório. Pedir ajuste, rejeitar ou propor ação exige explicar por quê.</p>${verdictGuide()}<label for="judgment-note">Comentário da revisão</label><textarea id="judgment-note" maxlength="2000" placeholder="O relatório está fiel ao que aconteceu? O que precisa ser corrigido?">${escapeHtml(draft)}</textarea></section>` : ''}
      <div id="judgment-feedback" role="status" aria-live="polite"></div>
      <section class="drawer-section"><h3>Revisões registradas</h3><div class="timeline">${judgmentHistory(detail.judgment.history)}</div></section>
      <div class="boundary-note action-boundary"><b>Escopo da decisão</b>A aprovação registra sua avaliação do relatório. Alterações em notas, criação de tarefas e mensagens exigem uma autorização própria.</div>
      ${judgmentZones(detail)}
      <div id="delivery-application-slot">${deliveryApplicationMarkup(application, { escapeHtml, renderReviewMarkdown, fmtDate, label })}</div>`);
    state.rerunPending = Boolean(detail.correction_actions?.can_rerun_with_correction);
    if (detail.context_available) await loadContext(receiptId, $('#context-slot'), { current: () => state.selectedJudgment === receiptId && state.judgmentRequest === request });
  } catch (error) {
    if (state.selectedJudgment !== receiptId || state.judgmentRequest !== request) return;
    state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
    const fallbackRequest = state.judgmentRequest;
    try {
      const meta = await getJson(`/api/runs/${receiptId}/application`);
      if (state.selectedJudgment !== receiptId || state.judgmentRequest !== fallbackRequest) return;
      if (meta.state?.status === 'applied' || meta.state?.recovery_required) {
        const application = state.deliveryApplication.open(receiptId, meta);
        renderMarkup($('#drawer-content'), `${empty('Entrega indisponível', label(error.message))}<div id="delivery-application-slot">${deliveryApplicationMarkup(application, { escapeHtml, renderReviewMarkdown, fmtDate, label })}</div>`);
        return;
      }
    } catch { /* The original output error remains the recoverable explanation. */ }
    if (state.selectedJudgment !== receiptId || state.judgmentRequest !== fallbackRequest) return;
    renderMarkup($('#drawer-content'), empty('Entrega indisponível', label(error.message)));
    toast(label(error.message), 'bad');
  }
}

async function performJudgment(action) {
  if (state.busy || !state.selectedJudgment) return;
  const review = state.judgmentReview;
  if (!review?.can_judge || review.receiptId !== state.selectedJudgment) { toast('Abra e leia uma entrega com versão verificável antes de julgar.', 'bad'); return; }
  const note = $('#judgment-note')?.value.trim() || '';
  const payload = action === 'approve' ? { verdict: 'approved', action_intent: 'none' }
    : action === 'changes' ? { verdict: 'changes-requested', action_intent: 'none' }
      : action === 'reject' ? { verdict: 'rejected', action_intent: 'none' }
        : { verdict: 'approved', action_intent: 'propose-action' };
  if ((payload.verdict !== 'approved' || payload.action_intent === 'propose-action') && !note) {
    toast('Explique o motivo antes de registrar.', 'bad');
    return;
  }
  const approval = await askConfirm({
    title: payload.action_intent === 'propose-action' ? 'Registrar intenção de ação' : `Registrar julgamento · ${label(payload.verdict)}`,
    body: `${payload.action_intent === 'propose-action'
      ? 'A intenção fica local. Nenhuma ação externa será executada.'
      : `Sua decisão avalia a qualidade do relatório, versão ${review.content_sha256.slice(0, 12)}. As tarefas citadas mantêm seus próprios estados. O histórico anterior será preservado.`}${state.rerunPending && !(payload.verdict === 'changes-requested' && payload.action_intent === 'none')
      ? ' ATENÇÃO: existe uma reexecução com correção ainda não usada. Registrar outro veredito torna o julgamento atual antigo e a reexecução deixa de ser oferecida.'
      : ''}`,
    confirmLabel: 'Registrar avaliação',
    fields: [APPROVED_BY_FIELD],
  });
  if (!approval?.approvedBy) return;
  if (state.judgmentReview !== review || state.selectedJudgment !== review.receiptId) return;
  const approvedBy = approval.approvedBy;
  state.busy = true;
  document.querySelectorAll('[data-judgment-action]').forEach((button) => { button.disabled = true; });
  try {
    const receiptId = review.receiptId;
    const result = await mutate(`/api/runs/${receiptId}/judgments`, {
      ...payload,
      note,
      reviewed_sha256: review.content_sha256,
      approved_by: approvedBy,
    });
    toast(`${label(result.summary.verdict)} registrado. Nenhuma ação externa executada.`);
    await loadModel();
    if (state.selectedJudgment === receiptId && state.judgmentReview === review) await openJudgment(receiptId);
  } catch (error) {
    toast(label(error.message), 'bad');
    if (state.selectedJudgment === review.receiptId && state.judgmentReview === review
      && /judgment-reviewed-version-stale|judgment-evidence-changed|judgment-evidence-unavailable/.test(error.message)) {
      state.judgmentReview = null;
  state.judgmentRequest = (state.judgmentRequest || 0) + 1;
  state.deliveryApplication?.clear();
      const feedback = $('#judgment-feedback');
      if (feedback) renderMarkup(feedback, `<div class="boundary-note review-blocked"><b>A versão precisa ser conferida novamente</b><p>${escapeHtml(label(error.message))}</p><button class="action" data-judgment-reload="${escapeHtml(review.receiptId)}">Reabrir entrega</button></div>`);
    }
  } finally {
    state.busy = false;
    if (state.judgmentReview?.can_judge) document.querySelectorAll('[data-judgment-action]').forEach((button) => { button.disabled = false; });
  }
}

async function performCorrectionAction(action) {
  if (state.busy || !state.selectedJudgment) return;
  if (action === 'compare') {
    try {
      const comparison = await getJson(`/api/runs/${state.selectedJudgment}/comparison`);
      const slot = $('#comparison-slot');
      if (!slot) return;
      renderMarkup(slot, `<div class="comparison-grid"><article><p class="micro">Baseline</p><pre class="private-output">${escapeHtml(comparison.baseline.output.content)}</pre></article><article><p class="micro">Novo Run</p><pre class="private-output">${escapeHtml(comparison.candidate.output.content)}</pre></article></div>
        <div class="boundary-note"><b>Comparação local</b>Abrir esta comparação não chamou modelo e não colocou os outputs no read model.</div>`);
    } catch (error) {
      toast(label(error.message), 'bad');
    }
    return;
  }
  const approval = await askConfirm(action === 'rerun' ? {
    title: 'Reexecutar com a correção humana',
    body: 'A nota privada será enviada ao provider configurado e pode consumir sua assinatura. Não vai para a comunidade, Git, logs ou recibos. Nenhuma ação externa será executada.',
    confirmLabel: 'Reexecutar',
    fields: [APPROVED_BY_FIELD],
  } : {
    title: 'Criar candidato de aprendizado 1/3',
    body: 'Isso não altera o motor. Ainda serão necessários três casos comparáveis, replay e novo martelo humano.',
    confirmLabel: 'Criar candidato',
    fields: [APPROVED_BY_FIELD],
  });
  if (!approval?.approvedBy) return;
  const approvedBy = approval.approvedBy;
  state.busy = true;
  document.querySelectorAll('[data-correction-action], [data-judgment-action]').forEach((button) => { button.disabled = true; });
  try {
    if (action === 'rerun') {
      const result = await mutate(`/api/runs/${state.selectedJudgment}/rerun-with-correction`, { approved_by: approvedBy });
      toast(`${label(result.status)} · novo output voltou para julgamento.`);
      const nextReceiptId = result.resulting_receipt_ref.replace('routine-receipt:', '');
      await loadModel();
      await openJudgment(nextReceiptId);
    } else {
      const result = await mutate(`/api/runs/${state.selectedJudgment}/learning-candidates`, { approved_by: approvedBy });
      toast(`Candidato ${result.occurrences}/${result.promotion_threshold} criado. Motor não alterado.`);
      const receiptId = state.selectedJudgment;
      await loadModel();
      await openJudgment(receiptId);
    }
  } catch (error) {
    toast(label(error.message), 'bad');
  } finally {
    state.busy = false;
  }
}

async function revokeGrant(grantId) {
  if (state.busy) return;
  const approval = await askConfirm({
    title: 'Revogar acesso para Runs futuros',
    body: 'Isso não apaga outputs, recibos ou artefatos já consumidos. Nenhuma ação externa será executada.',
    confirmLabel: 'Revogar',
    tone: 'warn',
    fields: [APPROVED_BY_FIELD],
  });
  if (!approval?.approvedBy) return;
  const approvedBy = approval.approvedBy;
  state.busy = true;
  try {
    const result = await mutate(`/api/grants/${grantId}/revoke`, { approved_by: approvedBy });
    toast(`${label(result.status)} · próximos Runs serão bloqueados.`);
    await loadModel();
  } catch (error) {
    toast(label(error.message), 'bad');
  } finally {
    state.busy = false;
  }
}

async function performAction(action) {
  if (state.busy || !state.selectedRoutine) return;
  const routine = state.model.routines.find((item) => item.routine_id === state.selectedRoutine);
  const routineId = routine.routine_id, drawerVersion = state.routineDrawerVersion;
  let approvedBy = '';
  let evidenceRef = '';
  if (action === 'verify') {
    // Explicit inspection checks session status; it never invokes the model.
  } else if (action === 'run') {
    const approval = await askConfirm({
      title: `Rodar “${routine.name}” agora`,
      body: routine.permission_mode === 'read-only' && routine.destination.kind === 'runtime-output'
        ? `Gera uma entrega privada para revisão usando ${routine.binding.adapter}, em modo de leitura. O resultado fica separado das notas do vault. Pode consumir sua assinatura. Não ativa a agenda.`
        : `Isso usa a sessão ${routine.binding.adapter}, pode consumir sua assinatura e tem permissão ${routine.permission_mode}. A rotina pode gravar no destino configurado antes da avaliação do resultado. Não ativa a agenda.`,
      confirmLabel: 'Rodar agora',
    });
    if (!approval) return;
  } else if (action === 'confirm-legacy-pause') {
    const approval = await askConfirm({
      title: 'Registrar pausa da agenda antiga',
      body: 'Confirme somente depois de pausar a agenda no fornecedor antigo. O Console registra o readback; ele não pausa o Claude por você.',
      confirmLabel: 'Registrar readback',
      tone: 'warn',
      fields: [APPROVED_BY_FIELD, { key: 'evidenceRef', label: 'Referência opaca da evidência de pausa', value: 'readback:legacy-schedule-paused' }],
    });
    if (!approval?.approvedBy || !approval.evidenceRef) return;
    approvedBy = approval.approvedBy;
    evidenceRef = approval.evidenceRef;
  } else if (action === 'activate') {
    evidenceRef = routine.actions.activation_evidence_ref;
    if (!evidenceRef) return;
    const approval = await askConfirm({
      title: 'Ativar agenda desta rotina',
      body: 'O relógio liga usando o último replay manual concluído e aprovado.',
      confirmLabel: 'Ativar agenda',
      fields: [APPROVED_BY_FIELD],
    });
    if (!approval?.approvedBy) return;
    approvedBy = approval.approvedBy;
  } else {
    const approval = await askConfirm({
      title: `${action === 'pause' ? 'Pausar' : 'Retomar'} esta rotina`,
      body: action === 'pause'
        ? 'Execuções futuras serão bloqueadas. Efeitos externos já consumados permanecem.'
        : 'O relógio volta a valer a partir de agora.',
      confirmLabel: action === 'pause' ? 'Pausar' : 'Retomar',
      fields: [APPROVED_BY_FIELD],
    });
    if (!approval?.approvedBy) return;
    approvedBy = approval.approvedBy;
  }
  if (state.selectedRoutine !== routineId || state.routineDrawerVersion !== drawerVersion) return;
  state.busy = true;
  document.querySelectorAll('[data-routine-action]').forEach((button) => { button.disabled = true; });
  try {
    const payload = ['run', 'verify'].includes(action) ? {} : { approved_by: approvedBy, ...(evidenceRef ? { evidence_ref: evidenceRef } : {}) };
    const endpoint = action === 'verify' ? `/api/routines/${routineId}/preflight/verify` : `/api/routines/${routineId}/${action}`;
    const result = await mutate(endpoint, payload);
    toast(action === 'verify' ? (result.can_run ? 'Requisitos conferidos. A rotina pode ser executada.' : 'Conferência concluída. Veja os requisitos pendentes.') : action === 'run' ? `${label(result.status)} · ${label(result.reason_code)}` : 'Estado canônico atualizado.');
    await loadModel();
    if (state.selectedRoutine === routineId && state.routineDrawerVersion === drawerVersion) openDrawer(routineId);
  } catch (error) {
    toast(label(error.message), 'bad');
  } finally {
    state.busy = false;
    if (state.selectedRoutine === routineId) document.querySelectorAll('[data-routine-action]').forEach((button) => { button.disabled = false; });
  }
}

async function loadModel() {
  const [model, decisions, vaultToday, procedures, insights] = await Promise.all([
    getJson('/api/console'),
    getJson('/api/decisions').catch(() => null),
    getJson('/api/vault-today').catch(() => null),
    getJson('/api/procedures').catch(() => null),
    getJson('/api/vault-insights').catch(() => null),
    loadCases({ renderResult: false }),
  ]);
  state.vaultToday = vaultToday?.available ? vaultToday : null;
  state.vaultInsights = insights?.available ? insights : null;
  state.procedures.available = Boolean(procedures?.available);
  state.procedures.data = procedures?.available ? procedures : null;
  state.procedures.loaded = true;
  state.procedures.selected = null;
  if (state.view === 'procedures' && !state.procedures.available) state.view = 'today';
  state.model = model;
  // The area preference belongs to this catalog, which may change with the data root.
  if (state.operatingAreaFilter && Array.isArray(model.areas) && !model.areas.some((area) => area.operating_area === state.operatingAreaFilter)) {
    state.operatingAreaFilter = '';
    try { localStorage.setItem('cb-operating-area', ''); } catch { /* preferência local */ }
    if (state.view === 'area') state.view = 'areas';
  }
  if (!state.initialRouteResolved || (state.view === 'activation' && model.activation.complete)) {
    state.view = model.activation.complete ? 'today' : 'activation';
    state.initialRouteResolved = true;
  }
  state.decisions = decisions;
  state.anatomy = null;
  state.brainGraph = null;
  state.skills.data = null;
  state.skills.error = null;
  state.vibeMakers.data = null;
  state.vibeMakers.error = null;
  state.vibeMakers.selected = null;
  state.runs.data = null;
  state.localViewContext = '';
  render();
  scheduleActivationPoll();
}

/* Formulário do Decision Case: o estado mora em state.cases.form, nunca só no DOM.
   Mexer em qualquer campo mata a simulação anterior — o diff confirmado tem que ser
   o diff do texto atual, sem exceção. */
function invalidateCasePreview() {
  if (!state.cases.preview) return false;
  state.cases.preview = null;
  toast('Campo alterado: a simulação anterior não vale mais.', 'warn');
  return true;
}

document.addEventListener('input', (event) => {
  const brainSearch = event.target.closest('[data-brain-map-search]');
  if (brainSearch) {
    state.brain.query = brainSearch.value;
    render();
    const restored = $('[data-brain-map-search]');
    restored?.focus();
    restored?.setSelectionRange(state.brain.query.length, state.brain.query.length);
    return;
  }
  const systemSearch = event.target.closest('[data-system-search]');
  if (systemSearch) {
    state.systems.query = systemSearch.value;
    render();
    const restored = $('[data-system-search]');
    restored?.focus();
    restored?.setSelectionRange(state.systems.query.length, state.systems.query.length);
    return;
  }
  const skillSearch = event.target.closest('[data-skill-search]');
  if (skillSearch) {
    state.skills.query = skillSearch.value;
    render();
    const restored = $('[data-skill-search]');
    restored?.focus();
    restored?.setSelectionRange(state.skills.query.length, state.skills.query.length);
    return;
  }
  const vibeMakersSearch = event.target.closest('[data-vibe-makers-search]');
  if (vibeMakersSearch) {
    state.vibeMakers.query = vibeMakersSearch.value;
    render();
    const restored = $('[data-vibe-makers-search]');
    restored?.focus();
    restored?.setSelectionRange(state.vibeMakers.query.length, state.vibeMakers.query.length);
    return;
  }
  const field = event.target.closest('[data-case-field]');
  if (!field || !state.cases.form) return;
  const key = field.dataset.caseField;
  if (key === 'evidence' || key === 'rollback_reason' || key === 'authored') return;
  state.cases.form[key] = field.value;
  const counter = document.querySelector('.case-counter');
  if (counter && key === 'decision_text') {
    counter.textContent = `${field.value.trim().length}/${state.cases.detail.draft.max_chars} · o Console não escreve esta parte por você`;
  }
  if (invalidateCasePreview()) render();
});

document.addEventListener('change', (event) => {
  const deliveryField = event.target.closest('[data-delivery-field]');
  if (deliveryField) { state.deliveryApplication?.setField(deliveryField.dataset.deliveryField, deliveryField.value); renderDeliveryApplicationSlot(); return; }
  const unread = event.target.closest('[data-inbox-unread]');
  if (unread) {
    state.inbox.unread = unread.checked;
    state.inbox.offset = 0;
    state.inbox.loaded = false; state.inbox.loading = false; state.inbox.request++;
    render();
    $('[data-inbox-unread]')?.focus();
    return;
  }
  const filter = event.target.closest('[data-metric-filter]');
  if (filter && ['system', 'workflow'].includes(filter.dataset.metricFilter)) {
    state.metrics[filter.dataset.metricFilter] = filter.value;
    state.metrics.loaded = false; state.metrics.loading = false; state.metrics.request++;
    render();
    $(`[data-metric-filter="${filter.dataset.metricFilter}"]`)?.focus();
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-local-file-search]');
  if (!form) return;
  event.preventDefault();
  state.files.query = form.elements.q.value.trim();
  state.files.type = form.elements.type.value.trim();
  state.files.offset = 0;
  state.files.loaded = false;
  state.files.loading = false;
  state.files.request++;
  setOperatingAreaFilter(form.elements.area.value, { openWorkspace: false });
});

document.addEventListener('change', (event) => {
  const field = event.target.closest('[data-case-field]');
  if (!field || !state.cases.form) return;
  if (field.dataset.caseField === 'authored') {
    state.cases.form.authored = field.checked;
    invalidateCasePreview();
    render(); // sem re-render, o diff antigo e o botão de registrar ficariam na tela com preview já morto
    return;
  }
  if (field.dataset.caseField === 'evidence') {
    const refs = new Set(state.cases.form.evidence);
    if (field.checked) refs.add(field.value); else refs.delete(field.value);
    state.cases.form.evidence = [...refs];
    invalidateCasePreview();
    render();
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.matches('#telegram-activation-form')) {
    event.preventDefault();
    void connectTelegram(event.target);
  }
});

document.addEventListener('click', (event) => {
  const breadcrumb = $('#breadcrumb-navigation');
  if (breadcrumb?.open && !breadcrumb.contains(event.target)) breadcrumb.open = false;
  const deliveryAction = event.target.closest('[data-delivery-action]');
  if (deliveryAction) { void state.deliveryApplication?.perform(deliveryAction.dataset.deliveryAction); return; }
  const judgmentReload = event.target.closest('[data-judgment-reload]');
  if (judgmentReload) { void openJudgment(judgmentReload.dataset.judgmentReload, { draft: $('#judgment-note')?.value || '' }); return; }
  const judgmentTab = event.target.closest('[data-judgment-tab]');
  if (judgmentTab) { state.judgmentTab = judgmentTab.dataset.judgmentTab === 'imported' ? 'imported' : 'active'; render(); return; }
  const hermesAction = event.target.closest('[data-hermes-action]');
  if (hermesAction) { void performHermesAction(hermesAction.dataset.hermesAction); return; }
  const activationAction = event.target.closest('[data-activation-action]');
  if (activationAction) {
    void performActivationAction(activationAction.dataset.activationAction, activationAction.dataset.actionId || '');
    return;
  }
  const caseOpen = event.target.closest('[data-case-open]');
  if (caseOpen) { void openCase(caseOpen.dataset.caseOpen); return; }
  const caseVerdict = event.target.closest('[data-case-verdict]');
  if (caseVerdict && state.cases.form) {
    state.cases.form.verdict = caseVerdict.dataset.caseVerdict;
    if (state.cases.form.verdict !== 'deferred') state.cases.form.review_on = '';
    invalidateCasePreview();
    render();
    return;
  }
  if (event.target.closest('[data-case-back]')) {
    state.cases.detail = null; state.cases.preview = null; state.cases.form = null;
    void loadCases();
    render();
    return;
  }
  if (event.target.closest('[data-case-discard]')) { state.cases.preview = null; render(); return; }
  if (event.target.closest('[data-case-preview]')) { void previewCase(); return; }
  if (event.target.closest('[data-case-apply]')) { void applyCase(); return; }
  if (event.target.closest('[data-case-rollback]')) { void rollbackCase(); return; }
  const systemCategory = event.target.closest('.system-filter[data-system-category]');
  if (systemCategory) {
    state.systems.category = systemCategory.dataset.systemCategory;
    render();
    return;
  }
  const systemStage = event.target.closest('.system-filter[data-system-stage]');
  if (systemStage) {
    state.systems.stage = systemStage.dataset.systemStage;
    render();
    return;
  }
  const skillOrigin = event.target.closest('[data-skill-origin]');
  if (skillOrigin) { state.skills.origin = skillOrigin.dataset.skillOrigin; render(); return; }
  const skillStatus = event.target.closest('[data-skill-status-filter]');
  if (skillStatus) { state.skills.status = skillStatus.dataset.skillStatusFilter; render(); return; }
  const skillLink = event.target.closest('[data-skill-link]');
  if (skillLink) { state.skills.link = skillLink.dataset.skillLink; render(); return; }
  const skillOpen = event.target.closest('[data-open-skill]');
  if (skillOpen) { openSkill(skillOpen.dataset.openSkill); return; }
  if (event.target.closest('[data-tools-refresh]')) { void loadTools(true); return; }
  const vibeMakersFilter = event.target.closest('[data-vibe-makers-filter]');
  if (vibeMakersFilter) { state.vibeMakers.filter = vibeMakersFilter.dataset.vibeMakersFilter; render(); return; }
  const vibeMakersOpen = event.target.closest('[data-vibe-makers-open]');
  if (vibeMakersOpen) { state.vibeMakers.selected = vibeMakersOpen.dataset.vibeMakersOpen; render(); return; }
  if (event.target.closest('[data-vibe-makers-back]')) { state.vibeMakers.selected = null; render(); return; }
  const vibeMakersCommand = event.target.closest('[data-vibe-makers-copy-command]');
  if (vibeMakersCommand) {
    navigator.clipboard?.writeText(vibeMakersCommand.dataset.vibeMakersCopyCommand).then(
      () => toast('Comando do diagnóstico copiado.'),
      () => toast('Não foi possível copiar o comando.', 'bad'),
    );
    return;
  }
  // Abrir o SOP ligado a um Sistema na tela Procedimentos, já selecionado.
  const openProcedure = event.target.closest('[data-open-procedure]');
  if (openProcedure) {
    state.procedures.selected = openProcedure.dataset.openProcedure;
    state.view = 'procedures';
    closeDrawer();
    render();
    return;
  }
  const procedure = event.target.closest('[data-procedure]');
  if (procedure) {
    state.procedures.selected = procedure.dataset.procedure;
    render();
    return;
  }
  const procedureTarget = event.target.closest('[data-sop-target]');
  if (procedureTarget) {
    focusProcedureStep(procedureTarget.dataset.sopTarget);
    return;
  }
  const procedureReveal = event.target.closest('[data-sop-reveal]');
  if (procedureReveal) {
    state.procedures.reveal = procedureReveal.dataset.sopReveal === '1';
    void loadProcedures();
    return;
  }
  const knowledgeReveal = event.target.closest('[data-knowledge-reveal]');
  if (knowledgeReveal) {
    state.knowledge.reveal = knowledgeReveal.dataset.knowledgeReveal === '1';
    void renderKnowledgePanel();
    return;
  }
  if (event.target.closest('[data-update-check]')) { void checkBrainUpdates(); return; }
  if (event.target.closest('[data-update-apply]')) { void applyBrainUpdate(); return; }
  if (event.target.closest('[data-open-brain-updates]')) {
    state.view = 'anatomy';
    state.brain.mode = 'updates';
    state.brain.query = '';
    try { localStorage.setItem('cb-brain-mode', state.brain.mode); } catch { /* preferência local */ }
    closeDrawer();
    void loadBrainUpdates();
    render();
    return;
  }
  const brainMode = event.target.closest('[data-brain-mode]');
  if (brainMode) {
    state.brain.mode = brainMode.dataset.brainMode;
    state.brain.query = '';
    try { localStorage.setItem('cb-brain-mode', state.brain.mode); } catch { /* preferência local */ }
    if (state.brain.mode === 'architecture') void loadBrainGraph();
    if (state.brain.mode === 'updates') void loadBrainUpdates();
    render();
    return;
  }
  const brainRun = event.target.closest('[data-open-brain-run]');
  if (brainRun) { openBrainRun(brainRun.dataset.openBrainRun); return; }
  const inboxSource = event.target.closest('[data-inbox-source]');
  if (inboxSource) { openOperationalNotice(inboxSource.dataset.inboxSource); return; }
  const inboxRead = event.target.closest('[data-inbox-read]');
  if (inboxRead) { void markOperationalNotice(inboxRead.dataset.inboxRead); return; }
  const inboxPage = event.target.closest('[data-inbox-page]');
  if (inboxPage) { state.inbox.offset = Number(inboxPage.dataset.inboxPage); state.inbox.loaded = false; state.inbox.loading = false; state.inbox.request++; renderLocalWorkspace(); return; }
  if (event.target.closest('[data-inbox-retry]')) { state.inbox.loaded = false; state.inbox.loading = false; state.inbox.request++; renderLocalWorkspace(); return; }
  if (event.target.closest('[data-tasks-retry]')) { state.tasks.notice = ''; void loadTasks(); return; }
  const localFile = event.target.closest('[data-open-local-file]');
  if (localFile) { void openLocalFile(localFile.dataset.openLocalFile); return; }
  const directory = event.target.closest('[data-local-directory]');
  if (directory) {
    state.files.directory = directory.dataset.localDirectory;
    state.files.offset = 0; state.files.loaded = false; state.files.loading = false; state.files.request++;
    closeDrawer(); render(); return;
  }
  if (event.target.closest('[data-area-files]')) {
    state.files.directory = ''; state.files.query = ''; state.files.type = '';
    state.view = 'files'; closeDrawer(); render(); return;
  }
  const filePage = event.target.closest('[data-local-files-page], [data-area-files-page]');
  if (filePage) {
    const slot = filePage.dataset.areaFilesPage != null ? state.areaFiles : state.files;
    slot.offset = Number(filePage.dataset.areaFilesPage ?? filePage.dataset.localFilesPage);
    slot.loaded = false; slot.loading = false; slot.request++; closeDrawer(); render(); return;
  }
  const localRetry = event.target.closest('[data-local-retry]');
  if (localRetry) {
    const slot = localRetry.dataset.localRetry === 'metrics' ? state.metrics : localRetry.dataset.localRetry === 'area' ? state.areaFiles : state.files;
    slot.loaded = false; slot.loading = false; slot.request++; render(); return;
  }
  const nav = event.target.closest('[data-view]');
  if (nav) { const fromBreadcrumb = Boolean(nav.closest('#breadcrumb-pages')); state.view = nav.dataset.view; closeDrawer(); if (breadcrumb) breadcrumb.open = false; render(); if (fromBreadcrumb) $('#breadcrumb-section').focus(); return; }
  const areaPill = event.target.closest('[data-operating-area-filter]');
  if (areaPill) { setOperatingAreaFilter(areaPill.dataset.operatingAreaFilter); return; }
  const canvasScope = event.target.closest('[data-canvas-scope]');
  if (canvasScope) {
    state.canvas.scope = canvasScope.dataset.canvasScope;
    state.canvas.ref = state.canvas.scope === 'system'
      ? defaultCanvasSystemRef()
      : state.canvas.scope === 'run' ? allCanvasExecutions()[0]?.selector_ref || null : null;
    state.canvas.positions = null;
    render();
    return;
  }
  const canvasZoom = event.target.closest('[data-canvas-zoom]');
  if (canvasZoom) { void state.canvas.controller?.[canvasZoom.dataset.canvasZoom === 'in' ? 'zoomIn' : 'zoomOut'](); return; }
  if (event.target.closest('[data-canvas-fit]')) { state.canvas.controller?.fit(); return; }
  if (event.target.closest('[data-open-brain-map]')) {
    state.canvas.scope = 'brain';
    state.canvas.ref = null;
    state.canvas.positions = null;
    state.view = 'canvas';
    closeDrawer();
    render();
    return;
  }
  const cycle = event.target.closest('[data-canvas-cycle]');
  if (cycle) { cycleCanvasRef(Number(cycle.dataset.canvasCycle)); return; }
  const jumpRun = event.target.closest('[data-canvas-jump-run]');
  if (jumpRun) {
    state.canvas.scope = 'run';
    state.canvas.ref = jumpRun.dataset.canvasJumpRun;
    state.canvas.positions = null;
    state.view = 'canvas';
    closeDrawer();
    render();
    return;
  }
  if (event.target.closest('[data-canvas-edit]')) {
    state.canvas.editable = !state.canvas.editable;
    state.canvas.positions = null;
    render();
    return;
  }
  if (event.target.closest('[data-canvas-save]')) { saveCanvasLayout(); return; }
  if (event.target.closest('[data-canvas-replay]')) { playTraceReplay(); return; }
  const canvasNode = event.target.closest('[data-canvas-inspect-node]');
  if (canvasNode && state.canvas.graph) {
    const node = state.canvas.graph.nodes.find((item) => item.id === canvasNode.dataset.canvasInspectNode);
    if (node) {
      canvasInspector(node);
      void state.canvas.controller?.focus?.(node.id);
    }
    return;
  }
  const runsSort = event.target.closest('[data-runs-sort]');
  if (runsSort) {
    const key = runsSort.dataset.runsSort;
    state.runs.sort = state.runs.sort.key === key
      ? { key, dir: state.runs.sort.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: key === 'when' ? 'desc' : 'asc' };
    render();
    return;
  }
  if (event.target.closest('[data-runs-clear]')) {
    state.runs.filters = { system: '', mode: '', status: '', decision: '', snapshot: '' };
    render();
    return;
  }
  const runsForRoutine = event.target.closest('[data-runs-for-routine]');
  if (runsForRoutine) {
    state.runs.filters = { system: '', routine: runsForRoutine.dataset.runsForRoutine, mode: '', status: '', decision: '', snapshot: '' };
    state.view = 'runs';
    closeDrawer();
    render();
    return;
  }
  const open = event.target.closest('[data-open-routine]');
  if (open) { openDrawer(open.dataset.openRoutine); return; }
  const openSystem = event.target.closest('[data-open-system]');
  if (openSystem) { openWorkspace(openSystem.dataset.openSystem); return; }
  const wsTab = event.target.closest('[data-ws-tab]');
  if (wsTab && state.view === 'system' && state.workspace) { state.workspace.tab = wsTab.dataset.wsTab; render(); return; }
  const wsHowMode = event.target.closest('[data-ws-how-mode]');
  if (wsHowMode && state.view === 'system' && state.workspace) {
    state.workspace.howMode = wsHowMode.dataset.wsHowMode;
    render();
    return;
  }
  const openSystemCanvas = event.target.closest('[data-open-system-canvas]');
  if (openSystemCanvas) {
    state.canvas.scope = 'system';
    state.canvas.ref = openSystemCanvas.dataset.openSystemCanvas;
    state.canvas.positions = null;
    state.view = 'canvas';
    closeDrawer();
    render();
    return;
  }
  const openSource = event.target.closest('[data-open-source]');
  if (openSource) { openSourceDrawer(openSource.dataset.openSource); return; }
  const focusBrain = event.target.closest('[data-focus-brain-node]');
  if (focusBrain) {
    state.canvas.scope = 'brain';
    state.canvas.ref = null;
    state.canvas.positions = null;
    state.canvas.pendingFocus = focusBrain.dataset.focusBrainNode;
    state.view = 'canvas';
    closeDrawer();
    render();
    return;
  }
  const judgment = event.target.closest('[data-open-judgment]');
  if (judgment) { openJudgment(judgment.dataset.openJudgment); return; }
  const experiment = event.target.closest('[data-open-experiment]');
  if (experiment) { openExperiment(experiment.dataset.openExperiment); return; }
  const experimentSystem = event.target.closest('[data-open-experiment-system]');
  if (experimentSystem) {
    state.canvas.scope = 'system';
    state.canvas.ref = experimentSystem.dataset.openExperimentSystem;
    state.view = 'canvas';
    closeDrawer();
    render();
    return;
  }
  const judgmentAction = event.target.closest('[data-judgment-action]');
  if (judgmentAction) { performJudgment(judgmentAction.dataset.judgmentAction); return; }
  const correctionAction = event.target.closest('[data-correction-action]');
  if (correctionAction) { performCorrectionAction(correctionAction.dataset.correctionAction); return; }
  const contextAction = event.target.closest('[data-open-context]');
  if (contextAction) { openContextDrawer(contextAction.dataset.openContext); return; }
  const loadContextAction = event.target.closest('[data-load-context]');
  if (loadContextAction) { loadContext(loadContextAction.dataset.loadContext, $('#context-slot')); return; }
  const revokeAction = event.target.closest('[data-revoke-grant]');
  if (revokeAction) { revokeGrant(revokeAction.dataset.revokeGrant); return; }
  const copyRef = event.target.closest('[data-copy-ref]');
  if (copyRef) {
    navigator.clipboard?.writeText(copyRef.dataset.copyRef).then(
      () => toast(copyRef.dataset.copyLabel || 'Referência copiada.'),
      () => toast('Não foi possível copiar.', 'bad'),
    );
    return;
  }
  const action = event.target.closest('[data-routine-action]');
  if (action) performAction(action.dataset.routineAction);
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'mobile-operating-area') {
    const value = event.target.value, note = activeNoteWorkspace();
    if (note && (note.getState().dirty || note.getState().busy)) {
      event.target.value = state.operatingAreaFilter;
      void note.requestLeave().then(allowed => { if (allowed && activeNoteWorkspace() === note) { closeDrawer({ force: true, preserveLibrarySelection: true }); setOperatingAreaFilter(value); } });
    } else setOperatingAreaFilter(value);
    return;
  }
  if (event.target.id === 'ws-cmp-a' || event.target.id === 'ws-cmp-b') {
    const ws = state.workspace?.data;
    const slot = $('#ws-compare');
    if (ws && slot) renderMarkup(slot, wsCompareTable(ws, Number($('#ws-cmp-a').value), Number($('#ws-cmp-b').value)));
    return;
  }
  if (event.target.id === 'runs-cmp-a' || event.target.id === 'runs-cmp-b') {
    state.runs[event.target.id === 'runs-cmp-a' ? 'cmpA' : 'cmpB'] = event.target.value;
    const slot = $('#runs-compare');
    if (slot) renderMarkup(slot, runsCompareSlot(runsVisibleEntries()));
    return;
  }
  const runsFilter = event.target.closest('[data-runs-filter]');
  if (runsFilter) {
    state.runs.filters[runsFilter.dataset.runsFilter] = runsFilter.value;
    render();
    return;
  }
  if (event.target.id !== 'canvas-ref') return;
  state.canvas.ref = event.target.value;
  state.canvas.positions = null;
  render();
});
// Protect the draft before any existing navigation handler changes the view.
document.addEventListener('click', event => {
  const note = activeNoteWorkspace();
  if (!note) return;
  const action = event.target.closest?.('button,a');
  if (!action || action.closest('[data-note-workspace]') || action.closest('[data-library-workspace]') || action.closest('[data-note-properties-dialog]') || action.closest('[data-note-attachment-dialog]') || action.closest('.confirm-dialog') || action.id === 'close-drawer' || action.id === 'collapse-nav') return;
  const snapshot = note.getState();
  if (!snapshot.busy && !snapshot.dirty) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (snapshot.busy) return;
  if (action.id === 'open-palette') { toast('Salve ou cancele a edição antes de navegar.'); return; }
  void note.requestLeave().then(allowed => {
    if (allowed && activeNoteWorkspace() === note && action.isConnected) { closeDrawer({ force: true, preserveLibrarySelection: true }); action.click(); }
  });
}, true);
$('#close-drawer').addEventListener('click', closeDrawer);
$('#drawer-backdrop').addEventListener('click', closeDrawer);
$('#refresh').addEventListener('click', async () => {
  try {
    state.systems.interfaceHealth = {};
    state.brain.updates.data = null;
    await loadModel();
    if (state.view === 'files') await state.library?.controller?.refresh();
    void loadTasks();
    if (state.view === 'anatomy' && state.brain.mode === 'updates') await loadBrainUpdates();
    toast('Estado local recompilado.');
  } catch (error) { toast(label(error.message), 'bad'); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#breadcrumb-navigation')?.open) {
    event.preventDefault(); event.stopImmediatePropagation(); $('#breadcrumb-navigation').open = false; $('#breadcrumb-section').focus(); return;
  }
  const note = activeNoteWorkspace();
  if (!note || document.querySelector('.confirm-dialog')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && (note.getState().dirty || note.getState().busy)) {
    event.preventDefault(); event.stopImmediatePropagation(); toast('Salve ou cancele a edição antes de navegar.');
  }
  else if (document.querySelector('.note-properties-dialog, .note-attachment-dialog')) return;
  else if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeDrawer(); }
}, true);
document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement
    && event.target.matches('[role="button"][data-open-system], [role="button"][data-open-skill], [role="button"][data-open-source], [role="button"][data-open-routine], [role="button"][data-open-experiment], [role="button"][data-case-open], [role="button"][data-open-brain-run], [role="button"][data-vibe-makers-open]')) {
    event.preventDefault();
    event.target.click();
    return;
  }
  if (!palette.open && !$('#confirm-dialog')?.open) drawerController.trapFocus(event);
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (document.querySelector('.note-properties-dialog, .note-attachment-dialog') || event.target?.closest?.('[data-note-properties-dialog], [data-note-attachment-dialog]')) return;
  if ($('#confirm-dialog')?.open) return; // o <dialog> cuida do próprio Escape
  closeDrawer();
});

/* --- Command palette (⌘K) — ir a qualquer view, rotina, sistema ou experimento --- */

const palette = { open: false, query: '', index: 0, items: [], invoker: null };

function paletteGlyph(view) {
  const direct = document.querySelector(`#navigation [data-view="${view}"] .nav-glyph`);
  if (direct) return direct.innerHTML;
  for (const button of document.querySelectorAll('#navigation [data-views]')) {
    if (button.dataset.views.split(',').includes(view)) return button.querySelector('.nav-glyph').innerHTML;
  }
  return '';
}

function paletteItems() {
  const items = Object.entries(titles)
    // A tela da comunidade Vibe Makers fica fora da navegação (hdoria/hugo-os-lab#21).
    .filter(([view]) => view !== 'vibe-makers')
    .filter(([view]) => view !== 'procedures' || state.procedures.available)
    .map(([view, [title]]) => ({
      glyph: view, title, hint: 'View', run: () => { state.view = view; closeDrawer(); render(); },
    }));
  const model = state.model;
  if (model) {
    model.routines.forEach((routine) => items.push({
      glyph: 'routines', title: routine.name, hint: 'Rotina',
      run: () => { state.view = 'routines'; render(); openDrawer(routine.routine_id); },
    }));
    (model.systems || []).forEach((system) => items.push({
      glyph: 'systems', title: system.name, hint: 'Sistema → Inspecionar operação',
      run: () => { closeDrawer(); openWorkspace(system.system_id); },
    }));
    (state.skills.data?.skills || []).forEach((skill) => items.push({
      glyph: 'skills', title: skillTitle(skill.name), hint: `Skill · ${skillOriginLabel(skill)}`,
      run: () => { state.view = 'skills'; render(); openSkill(skill.skill_id); },
    }));
    (model.experiments || []).forEach((experiment) => items.push({
      glyph: 'experiments', title: experiment.name, hint: experiment.experiment_id,
      run: () => { state.view = 'experiments'; render(); openExperiment(experiment.experiment_id); },
    }));
  }
  return items;
}

function paletteRender() {
  const query = palette.query.trim().toLowerCase();
  const all = paletteItems();
  palette.items = query ? all.filter((item) => `${item.title} ${item.hint}`.toLowerCase().includes(query)).slice(0, 12) : all.slice(0, 12);
  if (palette.index >= palette.items.length) palette.index = Math.max(0, palette.items.length - 1);
  renderMarkup($('#palette-list'), palette.items.map((item, index) => `<li role="option" data-palette-index="${index}" aria-selected="${index === palette.index}"><span class="palette-glyph">${paletteGlyph(item.glyph)}</span>${escapeHtml(item.title)}<small>${escapeHtml(item.hint)}</small></li>`).join('')
    || '<li class="palette-empty">Nada com esse nome no estado local.</li>');
}

function openPalette() {
  palette.invoker = document.activeElement;
  palette.open = true; palette.query = ''; palette.index = 0;
  if (!state.skills.data && !state.skills.loading) void loadSkills();
  setModalOpen('palette', true);
  const input = $('#palette-input');
  input.value = '';
  paletteRender();
  input.focus();
}

function closePalette() {
  palette.open = false;
  setModalOpen('palette', false);
  if (palette.invoker?.isConnected) palette.invoker.focus();
  palette.invoker = null;
}

window.addEventListener('cerebro:close-palette', closePalette);
$('#open-palette').addEventListener('click', openPalette);
$('#palette-backdrop').addEventListener('click', closePalette);
$('#palette-input').addEventListener('input', (event) => { palette.query = event.target.value; palette.index = 0; paletteRender(); });
$('#palette-list').addEventListener('click', (event) => {
  const item = event.target.closest('[data-palette-index]');
  if (!item) return;
  event.stopPropagation();
  closePalette();
  palette.items[Number(item.dataset.paletteIndex)]?.run();
});

// Captura para ganhar do Escape que fecha o drawer.
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    palette.open ? closePalette() : openPalette();
    return;
  }
  if (!palette.open) return;
  if (event.key === 'Escape') { event.stopPropagation(); closePalette(); return; }
  if (event.key === 'ArrowDown' || event.key === 'Down') { event.preventDefault(); palette.index = Math.min(palette.index + 1, palette.items.length - 1); paletteRender(); return; }
  if (event.key === 'ArrowUp' || event.key === 'Up') { event.preventDefault(); palette.index = Math.max(palette.index - 1, 0); paletteRender(); return; }
  if (event.key === 'Enter' || event.key === 'Return' || event.keyCode === 13) { event.preventDefault(); const item = palette.items[palette.index]; closePalette(); item?.run(); }
}, true);

/* --- Sidebar colapsável + atalhos globais --- */

function setNavCollapsed(collapsed) {
  const button = $('#collapse-nav');
  button?.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Encolher menu');
  button?.setAttribute('aria-expanded', String(!collapsed));
  document.body.dataset.nav = collapsed ? 'collapsed' : 'open';
  try { localStorage.setItem('cb-nav', document.body.dataset.nav); } catch { /* preferência local, nunca crítica */ }
}
setNavCollapsed((() => { try { return localStorage.getItem('cb-nav') === 'collapsed'; } catch { return false; } })());
$('#collapse-nav')?.addEventListener('click', () => setNavCollapsed(document.body.dataset.nav !== 'collapsed'));

document.addEventListener('keydown', (event) => {
  if (palette.open) return;
  const target = event.target;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if (event.key === '[') { setNavCollapsed(document.body.dataset.nav !== 'collapsed'); return; }
  if (state.view === 'canvas' && state.canvas.scope !== 'brain' && !state.busy) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); cycleCanvasRef(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); cycleCanvasRef(1); }
  }
});

try {
  $('#sys-line').textContent = `${window.location.host} · file-only · reference-only`;
  state.csrf = (await getJson('/api/session')).csrf_token;
  await loadModel();
  void loadTasks();
} catch (error) {
  renderMarkup($('#content'), empty('Console indisponível', `Não foi possível compilar o estado local: ${label(error.message)}.`));
  toast(label(error.message), 'bad');
}

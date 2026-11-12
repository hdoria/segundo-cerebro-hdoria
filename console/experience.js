// Shared presentation language for the local and internal Cockpit.
// This module derives copy from existing read models. It never reads private content or starts work.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const viewActions = Object.freeze({
  anatomy: ['Fontes, áreas e o que ainda falta aparecem aqui.', 'sources', 'Ver fontes'],
  systems: ['Cada sistema é um resultado executável ligado ao contexto.', null, null],
  system: ['Confira o estado, o julgamento e as fontes deste sistema.', null, null],
  judgments: ['Abra o output, confira a origem e decida.', null, null],
  cases: ['Abra o caso e leia o efeito antes do martelo.', null, null],
  routines: ['Abra a rotina para ver a agenda e o que precisa de aprovação.', null, null],
  runs: ['Abra a execução para ver resultado, fontes e limites.', null, null],
  sources: ['Abra a fonte para saber se ela está mapeada ou realmente disponível.', null, null],
  skills: ['Escolha uma skill para ver onde ela entra.', null, null],
  canvas: ['Selecione um nó para ver contrato e rastro.', null, null],
  compatibility: ['Revise o que pede atenção antes de atualizar o motor.', null, null],
  governance: ['Confira o alcance do acesso antes de mudar uma permissão.', null, null],
  health: ['Abra o alerta para ver impacto e o próximo passo.', null, null],
  hermes: ['Prepare o Hermes, conecte o bot e confirme a conta.', null, null],
  'vibe-makers': ['O catálogo é local. Instalar não envia contexto.', null, null],
  areas: ['Escolha uma área para filtrar sistemas e fontes.', null, null],
  experiments: ['Abra o experimento para conferir medição e martelo.', null, null],
  procedures: ['Cada procedimento do vault aparece como fluxo.', null, null],
});

export function journeyCue(view, model) {
  if (view === 'activation') return {
    state: 'Comece por um trabalho real', next: 'Abrir o console não executa modelo nem conecta fonte.',
  };
  if (view === 'today') {
    const pending = Number(model?.counts?.judgments || 0);
    if (pending > 0) return { attention: true, state: `${pending} ${pending === 1 ? 'julgamento espera' : 'julgamentos esperam'}`, next: 'Abra o primeiro. Nada é aprovado sozinho.', action: 'judgments', label: 'Abrir julgamento' };
    const ready = Number(model?.today?.ready_to_work?.length || 0);
    if (ready > 0) return { state: 'Nada espera julgamento agora', next: `${ready} ${ready === 1 ? 'sistema está pronto' : 'sistemas estão prontos'} para trabalhar.`, action: 'systems', label: 'Ver sistemas' };
    return { state: 'Nada pede julgamento agora', next: 'O cérebro e os sistemas continuam neste console.', action: 'anatomy', label: 'Ver arquitetura' };
  }
  if (view === 'systems') {
    const count = Number(model?.counts?.systems || 0);
    return { state: count ? `${count} ${count === 1 ? 'sistema nesta instalação' : 'sistemas nesta instalação'}` : 'Nenhum sistema nesta instalação', next: count ? 'Escolha pelo resultado e confira o estado antes de operar.' : 'O primeiro sistema nasce de um trabalho real, depois do mapa.' };
  }
  if (view === 'sources') {
    const count = Number(model?.counts?.sources || 0);
    return { state: count ? `${count} ${count === 1 ? 'fonte mapeada' : 'fontes mapeadas'}` : 'Nenhuma fonte mapeada', next: 'Fonte mapeada ainda pode precisar de conexão. Abra cada uma para conferir.' };
  }
  const [next, action, label] = viewActions[view] || ['O próximo passo desta tela está no conteúdo abaixo.', null, null];
  return { state: 'Nesta tela', next, action, label };
}

export function renderJourneyCue(view, model, options) {
  const cue = journeyCue(view, model, options);
  return `<section class="journey-cue ${cue.attention ? 'is-attention' : 'is-guidance'}" aria-label="Estado e próximo passo"><div>${cue.attention ? `<strong>${escapeHtml(cue.state)}</strong>` : ''}<p>${escapeHtml(cue.attention ? cue.next : `${cue.state === 'Nesta tela' ? '' : `${cue.state}. `}${cue.next}`)}</p></div>${cue.action ? `<button type="button" class="action" data-view="${escapeHtml(cue.action)}">${escapeHtml(cue.label)}</button>` : ''}</section>`;
}

export function detailDisclosure(content, { label = 'Ver como foi feito', open = false } = {}) {
  return `<details class="explain-detail"${open ? ' open' : ''}><summary>${escapeHtml(label)}</summary><div class="explain-detail-body">${content}</div></details>`;
}

export function renderBrainHumanSummary(anatomy) {
  const overview = anatomy?.control_center?.overview || {};
  const observed = Number(overview.sources?.observed || 0);
  const total = Number(overview.sources?.total || 0);
  const complete = Number(overview.runs?.complete || 0);
  return `<section class="journey-cue" aria-label="O que o Cérebro já sabe"><div><span class="journey-cue-label">Informação observada</span><strong>${observed ? `${observed} de ${total} fontes têm observação registrada` : 'Ainda não há fonte observada nesta instalação'}</strong><p>${complete ? `${complete} ${complete === 1 ? 'execução concluída aparece' : 'execuções concluídas aparecem'} nos registros.` : 'Ainda não há execução concluída nos registros.'} Fonte mapeada não significa acesso ou uso comprovado.</p></div><button type="button" class="action" data-view="sources">Conferir fontes</button></section>`;
}

export function friendlyFailure(code, fallback = 'Não foi possível concluir esta etapa.') {
  const known = {
    'request-failed': 'Não conseguimos completar o pedido. Atualize a página e tente novamente.',
    'source-unavailable': 'Esta fonte não está disponível agora. Confira a conexão antes de tentar novamente.',
    'context-not-recorded': 'Este run não registrou quais informações foram usadas.',
    'executor-authentication-required': 'A conexão com o agente precisa ser autorizada novamente.',
    'preview-stale': 'A proposta mudou desde a prévia. Revise e simule de novo antes de decidir.',
  };
  return known[String(code || '')] || fallback;
}

export function renderActivationStatus(activation, { formatDate } = {}) {
  if (activation.reason_code === 'vault-declared') return `<section class="brain-activation-receipt"><div><h2>Vault integrado</h2><p>O vault foi declarado para uso neste Console. A compatibilidade permite continuar o trabalho; esta declaração não comprova a missão T4 nem reutilização medida.</p></div></section>`;
  if (!activation.complete) return `<section class="brain-activation-receipt is-pending"><div><h2>A primeira missão ainda precisa provar reutilização.</h2><p>${escapeHtml(activation.completed_steps)} de ${escapeHtml(activation.total_steps)} passos foram observados.</p></div><button type="button" data-view="activation">Voltar à Primeira Missão →</button></section>`;
  return `<section class="brain-activation-receipt"><div><h2>Cérebro base ativado</h2><p>O contexto já provou que consegue voltar ao trabalho. A primeira missão fechou quando uma segunda tarefa reutilizou contexto aprovado sem releitura do bruto.</p></div><dl><div><dt>Concluído</dt><dd>${escapeHtml(formatDate?.(activation.completed_at) || 'não registrado')}</dd></div><div><dt>Versão</dt><dd>${escapeHtml(activation.product_version || 'não registrada')}</dd></div><div><dt>Recibo local</dt><dd>${activation.receipt_ref ? `<button type="button" data-copy-ref="${escapeHtml(activation.receipt_ref)}">${escapeHtml(activation.run_id || 'copiar referência')}</button>` : 'não registrado'}</dd></div></dl></section>`;
}

// A single lifecycle keeps every private-detail entry point keyboard-safe.
export function createDrawerController({ drawer, backdrop, background, closeButton, document, resolveInvoker }) {
  let invoker = null;
  let opened = false;
  return {
    open() {
      if (!opened) invoker = document.activeElement;
      opened = true;
      drawer.hidden = false;
      drawer.inert = false;
      drawer.setAttribute('aria-hidden', 'false');
      drawer.classList.add('open');
      backdrop.hidden = false;
      background.inert = true;
      closeButton.focus();
    },
    close() {
      if (!opened) return;
      opened = false;
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.inert = true;
      drawer.hidden = true;
      backdrop.hidden = true;
      background.inert = false;
      const returnTarget = invoker?.isConnected ? invoker : resolveInvoker?.(invoker);
      if (returnTarget?.isConnected) returnTarget.focus();
      invoker = null;
    },
    trapFocus(event) {
      if (!opened || event.key !== 'Tab') return;
      const targets = [...drawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')].filter((target) => !target.hidden && !target.closest('[hidden], [inert]') && (!target.getClientRects || target.getClientRects().length));
      const first = targets[0] || closeButton;
      const last = targets.at(-1) || first;
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    },
  };
}

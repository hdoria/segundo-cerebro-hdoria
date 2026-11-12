const CHECK_NAMES = {
  contract: 'Contrato da rotina', approval: 'Aprovação vigente', binding: 'Executor configurado',
  'executor-declaration': 'Estado declarado do executor', placement: 'Local de execução',
  permissions: 'Permissões do executor', 'model-policy': 'Modelo permitido', workspace: 'Pasta de trabalho',
  schedule: 'Agenda', destination: 'Destino da entrega', prompt: 'Instruções da rotina',
  access: 'Autorização de acesso', collection: 'Dados da fonte', collector: 'Coletor de dados',
  'collector-freshness': 'Atualidade da coleta', context: 'Contexto necessário', concurrency: 'Execução simultânea',
  'executor-session': 'Sessão do executor', 'executor-observation-cache': 'Registro da verificação',
};
const CHECK_RESULTS = {
  'preflight-ready': 'Requisitos conferidos.', 'routine-approved': 'Contrato aprovado.',
  'executor-declared-ready': 'Configuração declara disponibilidade; a sessão é conferida separadamente.',
  'executor-permission-valid': 'Permissões compatíveis.', 'executor-model-policy-valid': 'Modelo compatível com a configuração.',
  'executor-workspace-valid': 'Pasta de trabalho disponível.', 'destination-valid': 'Destino válido.', 'prompt-readable': 'Instruções disponíveis.',
  'access-authorized': 'Acesso autorizado para esta rotina.',
  'source-collection-not-verified': 'A autorização não comprova a coleta. Os dados serão conferidos durante a execução.',
  'collector-configuration-valid': 'Coletor configurado.', 'collector-freshness-checked-on-run': 'A saída recente será conferida durante a coleta.',
  'context-evidence-checked-on-run': 'As evidências efetivas serão conferidas na execução.', 'routine-lock-available': 'Nenhuma execução concorrente observada.',
  'executor-session-ready': 'Instalação e sessão conferidas.',
  'executor-observation-required': 'A sessão ainda não foi verificada. Use Verificar execução.',
  'executor-observation-stale': 'A conferência da sessão expirou. Verifique novamente.',
  'executor-observation-unavailable': 'Não foi possível salvar a conferência da sessão.',
  'routine-configuration-changed': 'A configuração mudou durante a conferência. Verifique novamente.',
};
const DESTINATION_ACTIONS = {
  'destination-not-private': ref => `O destino ${ref} é versionado no Git. Rotinas escrevem só em rascunho privado. Use um arquivo de rascunho como destino e aplique o conteúdo depois pelo Julgamento.`,
  'destination-is-directory': ref => `O destino ${ref} é uma pasta. Aponte para um arquivo dentro dela, como um .md.`,
  'destination-parent-not-directory': ref => `Uma parte do caminho ${ref} é um arquivo, não uma pasta. Corrija o caminho do destino.`,
  'destination-symlink-not-allowed': ref => `O destino ${ref} passa por um link simbólico. Use o caminho real do arquivo.`,
  'destination-not-regular-file': ref => `O destino ${ref} não é um arquivo comum. Aponte para um arquivo .md.`,
  'destination-path-invalid': ref => `O destino ${ref} precisa ser um caminho relativo dentro do Cérebro.`,
  'destination-private-manifest-missing': () => 'Falta o manifesto de privacidade em .cerebro/private-ignore.manifest. Sem ele, nenhum destino pode ser confirmado como privado.',
};
const STATUS_ORDER = { blocked: 0, warning: 1, passed: 2 };
function checkResult(check, esc, label) {
  const action = check.status === 'blocked' && DESTINATION_ACTIONS[check.reason_code];
  if (action) return action(`<code>${esc(check.destination_ref || 'configurado')}</code>`);
  return esc(CHECK_RESULTS[check.reason_code] || label(check.reason_code));
}
const EXTERNAL_SCHEDULERS = {
  'claude-scheduled-task': 'Tarefa agendada na claude.ai', 'codex-automation': 'Automação do Codex',
  launchd: 'launchd (macOS)', cron: 'cron', 'github-actions': 'GitHub Actions', other: 'Agendador externo',
};
export function routinePreflightMarkup(routine, { escapeHtml: esc, fmtDate, label }) {
  const external = routine.external_schedule;
  if (external) {
    return `<section class="drawer-section routine-preflight"><h3>Roda fora do Console</h3>
    <p>Quem executa esta rotina é ${esc(EXTERNAL_SCHEDULERS[external.scheduler] || EXTERNAL_SCHEDULERS.other)} (<code>${esc(external.trigger_ref)}</code>), não o Console. O Console acompanha a declaração e os registros; destino, sessão e privacidade da execução ficam com esse agendador.</p>
    <p class="section-help">Para o Console executar esta rotina, registre uma migração de agenda e pause o agendamento externo.</p></section>`;
  }
  const preflight = routine.preflight;
  if (!preflight) return '';
  const executor = preflight.executor || {};
  const checks = [...(preflight.checks || [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1));
  const blocker = !preflight.can_run && checks.find(check => check.status === 'blocked');
  const name = check => CHECK_NAMES[check.id.split(':')[0]] || 'Requisito da rotina';
  return `<section class="drawer-section routine-preflight"><h3>Verificação da execução</h3>
    ${blocker ? `<div class="preflight-blocker"><strong>Bloqueado em ${esc(name(blocker).toLowerCase())}</strong><p>${checkResult(blocker, esc, label)}</p></div>` : `<p>${preflight.can_run ? 'Requisitos conferidos. A coleta efetiva ainda será validada durante a execução.' : 'Há requisitos pendentes antes de executar. Confira os itens abaixo.'}</p>`}
    <p class="muted">Sessão: ${executor.observed_at ? `${esc(fmtDate(executor.observed_at))}${executor.fresh ? '' : ' · conferência expirada'}` : 'ainda não foi verificada'}.</p>
    <ul class="preflight-checks">${checks.map(check => {
      const status = check.status === 'passed' ? 'Conferido' : check.status === 'warning' ? 'A conferir na execução' : 'Pendente';
      return `<li class="${esc(check.status)}"><strong>${esc(name(check))}${check.source_ref ? ` · ${esc(check.source_ref)}` : ''}</strong><span class="badge ${check.status === 'passed' ? 'good' : 'warn'}">${status}</span><p>${checkResult(check, esc, label)}</p></li>`;
    }).join('')}</ul></section>`;
}

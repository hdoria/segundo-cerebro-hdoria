// The application proposal is private, short-lived UI state. The server remains
// authoritative for eligibility, exact bytes, approval, conflicts and reversal.
export function deliveryApplicationMarkup(slot, { escapeHtml: esc, renderReviewMarkdown: markdown, fmtDate, label }) {
  if (!slot) return '';
  const meta = slot.meta || {}, applied = meta.state?.status === 'applied';
  const preview = slot.preview, disabled = slot.busy ? ' disabled' : '';
  const header = '<h3>Aplicar ao diário</h3><p>Aprovar avalia o relatório. Esta ação separada grava uma proposta na nota, depois da sua confirmação.</p>';
  if (meta.state?.recovery_required) return `<section class="drawer-section delivery-application">${header}<p role="status">Uma operação foi interrompida. Confira o estado salvo antes de continuar; a recuperação não altera o conteúdo da nota.</p><button class="action" data-delivery-action="recover"${disabled}>Recuperar operação interrompida</button>${slot.error ? `<p role="alert">${esc(label(slot.error))}</p>` : ''}</section>`;
  if (applied) return `<section class="drawer-section delivery-application">${header}<p class="good-note">Aplicado em <code>${esc(meta.state.target_ref)}</code>.</p><p>Reverter restaura a versão anterior somente se ninguém tiver alterado a nota depois desta aplicação.</p><button class="action" data-delivery-action="rollback"${disabled}>Reverter aplicação</button>${slot.error ? `<p role="alert">${esc(label(slot.error))}</p>` : ''}</section>`;
  if (!meta.eligible) return `<section class="drawer-section delivery-application">${header}<p class="muted">${esc(label(meta.reason_code || 'delivery-application-approval-required'))}</p></section>`;
  return `<section class="drawer-section delivery-application">${header}
    ${meta.state?.status === 'rolled-back' ? '<p>Aplicação anterior revertida. Gere uma nova prévia para aplicar novamente.</p>' : ''}
    <p class="section-help">A proposta atualiza um bloco identificado como gerado por IA e preserva o texto manual fora dele.</p>
    <label for="delivery-target-date">Data da nota</label><input id="delivery-target-date" type="date" data-delivery-field="target_date" value="${esc(slot.target_date)}"${disabled}>
    <label for="delivery-approved-by">Quem confirma · referência sem dado pessoal</label><input id="delivery-approved-by" type="text" maxlength="128" data-delivery-field="approved_by" value="${esc(slot.approved_by)}"${disabled}>
    ${preview ? `<div class="application-preview"><h4>Confira as alterações</h4><p>Destino: <code>${esc(preview.target_ref)}</code></p><pre class="private-output application-diff" tabindex="0" aria-label="Alterações propostas na nota">${esc(preview.diff)}</pre>
      <details><summary>Ler a nota atual</summary>${preview.before === null ? '<p>A nota ainda não existe.</p>' : `<article class="review-document">${markdown(preview.before || '')}</article>`}</details>
      <details><summary>Ler a proposta completa</summary><article class="review-document">${markdown(preview.after || '')}</article></details>
      ${preview.expires_at ? `<p class="muted">Prévia válida até ${esc(fmtDate(preview.expires_at))}.</p>` : ''}
      <div class="application-actions"><button class="action primary" data-delivery-action="apply"${disabled}>Confirmar alterações e aplicar</button><button class="action" data-delivery-action="discard"${disabled}>Descartar prévia</button></div></div>`
      : `<button class="action" data-delivery-action="preview"${disabled}>Ver alterações antes de aplicar</button>`}
    <div role="status" aria-live="polite">${slot.busy ? 'Conferindo a proposta local…' : ''}</div>
    ${slot.error ? `<p role="alert">${esc(label(slot.error))}</p>` : ''}
  </section>`;
}

export function createDeliveryApplicationController(deps) {
  let current = null;
  const isCurrent = slot => current === slot && deps.selectedReceipt() === slot.receiptId;
  const paint = slot => { if (isCurrent(slot)) deps.paint(slot); };
  return {
    get: () => current,
    clear() { current = null; },
    open(receiptId, meta) {
      current = { receiptId, meta, target_date: meta?.state?.target_date || meta?.suggested_date || '', approved_by: 'role-founder', preview: null, busy: false, error: '', revision: 0 };
      return current;
    },
    setField(field, value) {
      if (!current || !['target_date', 'approved_by'].includes(field)) return;
      current[field] = value; current.preview = null; current.error = ''; current.revision++;
    },
    async perform(action) {
      const slot = current;
      if (!slot || !isCurrent(slot) || slot.busy || deps.isBusy()) return;
      if (action === 'discard') { slot.preview = null; slot.error = ''; slot.revision++; paint(slot); return; }
      if (!['preview', 'apply', 'rollback', 'recover'].includes(action)) return;
      if (!['rollback', 'recover'].includes(action) && !slot.meta?.eligible) return;
      if (action === 'rollback' && slot.meta?.state?.status !== 'applied') return;
      const preview = slot.preview, revision = slot.revision;
      const unchanged = () => isCurrent(slot) && slot.revision === revision;
      if (action === 'apply' && !preview) return;
      if (action === 'recover' && !slot.meta?.state?.recovery_required) return;
      let payload = { target_date: slot.target_date, approved_by: slot.approved_by };
      if (action === 'apply') {
        const approval = await deps.askConfirm({ title: 'Aplicar esta proposta ao diário', body: `Confirme as alterações exibidas na nota ${preview.target_ref}. O texto manual fora do bloco de IA será preservado. Esta confirmação é separada da avaliação do relatório.`, confirmLabel: 'Aplicar alterações' });
        if (!approval || !unchanged() || slot.preview !== preview) return;
        payload = { ...payload, previewed_at: preview.previewed_at, plan_digest: preview.plan_digest };
      } else if (action === 'recover') {
        const approval = await deps.askConfirm({ title: 'Conferir operação interrompida', body: 'Confere os recibos e as versões salvas para recuperar o estado da aplicação. O conteúdo da nota não será alterado.', confirmLabel: 'Conferir e recuperar', fields: [{ key: 'approvedBy', label: 'Quem confirma · referência sem dado pessoal', value: slot.approved_by }] });
        if (!approval?.approvedBy || !unchanged()) return;
        payload = { approved_by: approval.approvedBy };
      } else if (action === 'rollback') {
        const approval = await deps.askConfirm({ title: 'Reverter aplicação no diário', body: `Restaura a versão anterior de ${slot.meta.state.target_ref}. Se a nota tiver recebido outra edição, a reversão será bloqueada para preservá-la.`, confirmLabel: 'Reverter aplicação', fields: [{ key: 'approvedBy', label: 'Quem confirma · referência sem dado pessoal', value: slot.approved_by }] });
        if (!approval?.approvedBy || !unchanged()) return;
        payload = { application_id: slot.meta.state.application_id, approved_by: approval.approvedBy, reason: 'mistake' };
      }
      slot.busy = true; slot.error = ''; deps.setBusy(true); paint(slot);
      try {
        const result = await deps.mutate(`/api/runs/${slot.receiptId}/application/${action}`, payload);
        if (!unchanged()) return;
        if (action === 'preview') slot.preview = result;
        else {
          slot.preview = null;
          deps.toast(action === 'apply' ? 'Proposta aplicada ao diário.' : action === 'recover' ? 'Estado da operação recuperado.' : 'Aplicação revertida.');
          await deps.refresh(slot.receiptId, slot);
        }
      } catch (error) {
        if (unchanged()) {
          slot.error = error.message;
          if (action !== 'rollback') slot.preview = null;
          if (error.message === 'delivery-application-recovery-required') {
            try {
              const meta = await deps.readState(slot.receiptId);
              if (unchanged()) slot.meta = meta;
            } catch {
              if (unchanged()) slot.meta = { ...slot.meta, eligible: false, state: { ...slot.meta.state, recovery_required: true } };
            }
          }
        }
      } finally {
        slot.busy = false; deps.setBusy(false); paint(slot);
      }
    },
  };
}

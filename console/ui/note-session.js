// Local draft lifecycle. A Save is bound to the opened file version; responses
// and discard confirmations cannot move into a later note/draft instance.
export function createNoteSession(deps) {
  let live = true, revision = 0, confirming = false;
  let state = { file: deps.file, document: deps.parse(deps.file.text), editing: false, dirty: false, busy: false, error: '', saved: false };
  state.value = structuredClone(state.document.value);
  const notify = () => { if (live) deps.onChange?.({ ...state }); };
  const reset = file => { state = { ...state, file, document: deps.parse(file.text), editing: false, dirty: false, error: '', saved: false }; state.value = structuredClone(state.document.value); revision++; };
  const leave = async () => {
    if (!live || state.busy || confirming) return false;
    if (!state.dirty) return true;
    const before = revision; confirming = true;
    try { return Boolean(await deps.confirmDiscard()) && live && revision === before && !state.busy; }
    finally { confirming = false; }
  };
  return {
    getState: () => ({ ...state }),
    startEditing() { if (!live || state.busy || !state.document.editable) return; state.editing = true; state.error = ''; state.saved = false; notify(); },
    change(value) {
      if (!live || !state.editing || state.busy) return;
      state.value = value; state.saved = false; revision++;
      try { state.dirty = deps.serialize(state.document, value) !== state.file.text; state.error = ''; }
      catch(error) { state.dirty = true; state.error = error.message; }
      notify();
    },
    async cancel() { if (!await leave()) return false; reset(state.file); notify(); return true; },
    requestLeave: leave,
    async save() {
      if (!live || !state.editing || state.busy) return false;
      let text;
      try { text = deps.serialize(state.document, state.value); }
      catch(error) { state.error = error.message; notify(); return false; }
      if (text === state.file.text) { reset(state.file); notify(); return true; }
      state.busy = true; state.error = ''; notify(); const before = revision;
      try {
        const file = await deps.save({ ref: state.file.ref, expected_sha256: state.file.sha256, text, confirm: true });
        if (!live || revision !== before) return false;
        reset(file); state.saved = true; deps.onSaved?.(file); return true;
      } catch(error) { if (live && revision === before) state.error = error.message; return false; }
      finally { if (live && revision === before + (state.saved ? 1 : 0)) { state.busy = false; notify(); } }
    },
    dispose() { live = false; revision++; },
  };
}

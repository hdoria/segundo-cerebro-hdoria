// Ephemeral derived metadata: never holds note text or attachment bytes.
export function createNoteRelatedSession({ ref, loadBacklinks, loadAttachments, onChange } = {}) {
  const empty = () => ({ phase: 'idle', files: [], attachments: [], total: 0, complete: true, offset: 0 });
  const state = { backlinks: empty(), attachments: empty() };
  const revisions = { backlinks: 0, attachments: 0 };
  let live = true;
  const notify = () => { if (live) onChange?.({ ...state }); };
  async function load(kind, append = false) {
    if (!live || !['backlinks', 'attachments'].includes(kind) || state[kind].phase === 'loading') return false;
    const before = state[kind], request = ++revisions[kind];
    state[kind] = { ...before, phase: 'loading' }; notify();
    try {
      const result = kind === 'backlinks' ? await loadBacklinks({ ref, offset: append ? before.files.length : 0, limit: 50 }) : await loadAttachments({ from_ref: ref });
      if (!live || revisions[kind] !== request) return false;
      if (kind === 'backlinks' && (!Array.isArray(result?.files) || !Number.isSafeInteger(result.total) || result.total < 0)) throw new Error('invalid');
      if (kind === 'attachments' && !Array.isArray(result?.attachments)) throw new Error('invalid');
      state[kind] = { ...empty(), ...result, phase: 'ready', ...(kind === 'backlinks' && append ? { files: [...new Map([...before.files, ...result.files].map(item => [item.ref, item])).values()] } : {}) };
      return true;
    } catch { if (live && revisions[kind] === request) state[kind] = { ...before, phase: 'error' }; return false; }
    finally { notify(); }
  }
  return { getState: () => ({ ...state }), load, dispose() { live = false; revisions.backlinks++; revisions.attachments++; } };
}

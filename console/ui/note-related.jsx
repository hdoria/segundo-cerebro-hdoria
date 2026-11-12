import React from 'react';
import { Paperclip, Link2, X, ExternalLink } from 'lucide-react';
import { Button } from './components/button.jsx';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from './components/dialog.jsx';
import { createNoteRelatedSession } from './note-related-session.js';

export function NoteRelated({ file, services = {}, busy = false, onOpenNote }) {
  const [, paint] = React.useReducer(value => value + 1, 0);
  const model = React.useMemo(() => createNoteRelatedSession({ ref: file.ref, loadBacklinks: services.loadBacklinks, loadAttachments: services.loadAttachments, onChange: paint }), [file.ref, file.sha256, services]);
  const [preview, setPreview] = React.useState(null);
  const previewRevision = React.useRef(0);
  React.useEffect(() => () => { model.dispose(); previewRevision.current++; }, [model]);
  const state = model.getState();
  const close = () => { previewRevision.current++; setPreview(null); };
  async function open(attachment) {
    if (busy) return;
    const request = ++previewRevision.current;
    setPreview({ attachment, phase: 'loading' });
    try {
      await services.checkAttachment({ from_ref: file.ref, target: attachment.target });
      if (request === previewRevision.current) setPreview({ attachment, phase: 'ready', url: services.attachmentUrl({ from_ref: file.ref, target: attachment.target }) });
    } catch { if (request === previewRevision.current) setPreview({ attachment, phase: 'error' }); }
  }
  const disclosure = (kind, title, Icon, body) => <details className="note-related-group" onToggle={event => { if (event.currentTarget.open && model.getState()[kind].phase === 'idle') void model.load(kind); }}><summary><Icon aria-hidden="true"/>{title}{state[kind].phase === 'ready' && <span>{kind === 'backlinks' ? state[kind].total : state[kind].attachments.length}</span>}</summary>
    {state[kind].phase === 'loading' && <p role="status">Carregando…</p>}
    {state[kind].phase === 'error' && <div role="alert"><p>Não foi possível carregar esta lista.</p><Button type="button" variant="outline" size="sm" onClick={() => void model.load(kind)}>Tentar novamente</Button></div>}
    {state[kind].complete === false && <p role="status">Leitura parcial. Esta lista pode estar incompleta.</p>}
    {body}
  </details>;
  return <section className="note-related" aria-label="Referências e anexos da nota">
    <p className="note-related-hint">Referências e anexos do arquivo salvo. Abra cada seção para consultar.</p>
    {disclosure('backlinks', 'Referências recebidas', Link2, <>
      {state.backlinks.files.length > 0 && <ul>{state.backlinks.files.map(item => <li key={item.ref}><Button type="button" variant="ghost" disabled={busy} onClick={() => void onOpenNote?.(item.ref)}><span>{item.title}<small>{item.ref}</small></span></Button></li>)}</ul>}
      {state.backlinks.phase === 'ready' && !state.backlinks.files.length && <p>Nenhuma nota aponta para esta nota no acervo disponível.</p>}
      {state.backlinks.files.length < state.backlinks.total && <Button type="button" variant="outline" size="sm" disabled={state.backlinks.phase === 'loading'} onClick={() => void model.load('backlinks', true)}>Carregar mais referências</Button>}
    </>)}
    {disclosure('attachments', 'Anexos', Paperclip, <>
      {state.attachments.attachments.length > 0 && <ul>{state.attachments.attachments.map(item => <li key={item.target}><Button type="button" variant="ghost" disabled={busy} onClick={() => void open(item)}><span>{item.name}<small>{item.mime === 'application/pdf' ? 'PDF' : 'Imagem'} · {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(item.bytes / 1024)} KB</small></span></Button></li>)}</ul>}
      {state.attachments.phase === 'ready' && !state.attachments.attachments.length && <p>Nenhum PDF ou imagem local disponível nos links desta nota.</p>}
    </>)}
    <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="note-attachment-dialog" data-note-attachment-dialog="" showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); document.querySelector('.note-related-group:last-of-type summary')?.focus(); }}>
        <div className="note-attachment-heading"><div><DialogTitle>{preview?.attachment.name || 'Anexo'}</DialogTitle><DialogDescription>Visualização local do anexo vinculado à nota.</DialogDescription></div><DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar anexo"><X aria-hidden="true"/></Button></DialogClose></div>
        {preview?.phase === 'loading' && <p role="status">Abrindo anexo…</p>}
        {preview?.phase === 'error' && <p role="alert">Não foi possível abrir este anexo. Ele pode ter sido alterado ou não estar mais disponível.</p>}
        {preview?.phase === 'ready' && <><div className="note-attachment-view">{preview.attachment.mime === 'application/pdf' ? <iframe src={`${preview.url}#view=FitH`} title={`PDF: ${preview.attachment.name}`}/> : <img src={preview.url} alt={preview.attachment.name} onError={() => setPreview(current => current?.url === preview.url ? { ...current, phase: 'error' } : current)}/>}</div><a className="note-attachment-external" href={preview.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>Abrir em nova aba</a></>}
      </DialogContent>
    </Dialog>
  </section>;
}

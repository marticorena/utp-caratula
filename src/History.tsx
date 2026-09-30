import { chooseDestination, downloadCancelled } from './download';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, FileText, LoaderCircle, Search, Trash2, X } from 'lucide-react';
import { CoverApi } from './api';
import type { CoverFileFormat, HistoryEntry, StoredCover } from './types';

type Props = { open: boolean; revision: number; userId: string; onClose: () => void; onOpen: (data: StoredCover, id: string) => void };

export default function History({ open, revision, userId, onClose, onOpen }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const api = useMemo(() => new CoverApi(userId), [userId]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const result = await api.list(query, page * 20, controller.signal);
        if (!controller.signal.aborted) { setItems(result.items); setTotal(result.total); setLoading(false); }
      } catch (e) { if (!controller.signal.aborted) { setError((e as Error).message); setLoading(false); } }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, open, query, page, revision, retry]);

  async function remove(entry: HistoryEntry) {
    setBusy(entry.id); setError(''); setFeedback('');
    try {
      await api.delete(entry.id);
      setFeedback(`Se eliminó «${entry.title}» del historial.`);
      if (items.length === 1 && page > 0) setPage(p => p - 1);
      setRetry(n => n + 1);
    } catch (e) { setError(e instanceof TypeError ? 'No se pudo conectar con el historial local.' : (e as Error).message); }
    finally { setBusy(''); }
  }

  async function choose(entry: HistoryEntry, download: false | CoverFileFormat) {
    setBusy(entry.id); setError(''); setFeedback('');
    try {
      const writeFile = download ? await chooseDestination(entry.title, download) : null;
      if (download) {
        setFeedback(await writeFile!(await api.savedFile(entry.id, download)));
      } else {
        const result = await api.get(entry.id);
        if (!result) throw new Error('No se encontró esta carátula.');
        onOpen(result.data, result.id); onClose();
      }
    } catch (e) { if (!downloadCancelled(e)) setError(e instanceof TypeError ? 'No se pudo descargar o abrir el archivo.' : (e as Error).message); }
    finally { setBusy(''); }
  }

  return <dialog className="history-dialog" ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} aria-labelledby="history-title">
    <div className="history-heading"><div><h2 id="history-title">Mis carátulas</h2><p>Guardadas en este equipo. Sin cuentas.</p></div><button disabled={!!busy} className="icon-button" aria-label="Cerrar historial" onClick={onClose}><X size={20}/></button></div>
    <label className="history-search"><Search size={18}/><input aria-label="Buscar en mis carátulas" value={query} maxLength={350} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Busca por título, curso, integrante o cualquier texto…"/></label>
    {feedback && <p role="status" className="history-footnote">{feedback}</p>}
    <div className="history-results" aria-live="polite" aria-busy={loading}>
      {error && <div className="history-empty" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setRetry(n => n + 1)}>Volver a intentar</button></div>}
      {loading ? <div className="history-empty"><LoaderCircle className="spin" size={22}/><p>Buscando tus carátulas…</p></div> : !error && <>
        <p className="history-total">{total} {total === 1 ? 'carátula' : 'carátulas'}{query ? ' encontradas' : ' guardadas'}</p>
        {!items.length && <div className="history-empty"><FileText size={30}/><h3>{query ? 'No hay coincidencias' : 'Tu historial empieza aquí'}</h3><p>{query ? 'Prueba con otra palabra, un nombre o un código.' : 'Crea una nueva carátula para comenzar.'}</p></div>}
        {items.map(entry => <article key={entry.id} className="history-item"><span className="history-file"><FileText size={23}/></span><div className="history-info"><h3>{entry.title}</h3>{entry.course && <p>{entry.course}</p>}<time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><div className="history-actions"><button className="secondary-button" disabled={!!busy} onClick={() => choose(entry, false)}>{busy === entry.id ? 'Abriendo…' : 'Abrir en editor'}</button><button className="secondary-button history-download" aria-label={`Descargar PDF de ${entry.title}`} title="Descargar PDF guardado" disabled={!!busy} onClick={() => choose(entry, 'pdf')}><ArrowDownToLine size={16}/> PDF</button><button className="secondary-button history-download" aria-label={`Descargar DOCX de ${entry.title}`} disabled={!!busy} onClick={() => choose(entry, 'docx')}><ArrowDownToLine size={16}/> DOCX</button><button className="icon-button delete" aria-label={`Eliminar carátula ${entry.title}`} title="Eliminar carátula" disabled={!!busy} onClick={() => remove(entry)}>{busy === entry.id ? <LoaderCircle className="spin" size={18}/> : <Trash2 size={18}/>}</button></div></article>)}
        {total > 20 && <nav className="history-pagination" aria-label="Páginas del historial"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Anterior</button><span>{page + 1} / {Math.ceil(total / 20)}</span><button className="secondary-button" disabled={(page + 1) * 20 >= total} onClick={() => setPage(n => n + 1)}>Siguiente</button></nav>}
      </>}
    </div>
    <p className="history-footnote">Los cambios se guardan automáticamente en cada carátula.</p>
  </dialog>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, LoaderCircle, Search, X } from 'lucide-react';
import { CoverApi } from './api';
import { HistoryItem } from './components/HistoryItem';
import { HistoryPagination } from './components/HistoryPagination';
import { chooseDestination, downloadCancelled } from './download';
import type { CoverFileFormat, HistoryEntry, StoredCover } from './types';

const PAGE_SIZE = 20;

export interface HistoryProps {
  open: boolean;
  revision: number;
  userId: string;
  onClose: () => void;
  onOpen: (data: StoredCover, id: string) => void;
}

/** Display searchable saved covers and their available actions. */
export default function History({
  open,
  revision,
  userId,
  onClose,
  onOpen,
}: HistoryProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const api = useMemo(() => new CoverApi(userId), [userId]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const timer = window.setTimeout(async () => {
      try {
        const result = await api.list(
          query,
          page * PAGE_SIZE,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setItems(result.items);
          setTotal(result.total);
          setLoading(false);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error
            ? cause.message
            : 'No se pudo cargar el historial.');
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, open, page, query, retry, revision]);

  async function remove(entry: HistoryEntry) {
    beginAction(entry.id);
    try {
      await api.delete(entry.id);
      setFeedback(`Se eliminó «${entry.title}» del historial.`);
      if (items.length === 1 && page > 0) setPage((value) => value - 1);
      setRetry((value) => value + 1);
    } catch (cause) {
      setError(actionError(cause));
    } finally {
      setBusyId('');
    }
  }

  async function choose(
    entry: HistoryEntry,
    format: CoverFileFormat | null,
  ) {
    beginAction(entry.id);
    try {
      if (format) {
        const writeFile = await chooseDestination(entry.title, format);
        const file = await api.savedFile(entry.id, format);
        setFeedback(await writeFile(file));
      } else {
        const result = await api.get(entry.id);
        if (!result) throw new Error('No se encontró esta carátula.');
        onOpen(result.data, result.id);
        onClose();
      }
    } catch (cause) {
      if (!downloadCancelled(cause)) setError(actionError(cause));
    } finally {
      setBusyId('');
    }
  }

  function beginAction(entryId: string) {
    setBusyId(entryId);
    setError('');
    setFeedback('');
  }

  return (
    <dialog
      className="history-dialog"
      ref={dialog}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busyId) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom
        ) onClose();
      }}
      onCancel={(event) => {
        if (busyId) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="history-title"
    >
      <div className="history-heading">
        <div>
          <h2 id="history-title">Mis carátulas</h2>
          <p>Tus carátulas guardadas. Sin cuentas.</p>
        </div>
        <button
          disabled={Boolean(busyId)}
          className="icon-button"
          aria-label="Cerrar historial"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <label className="history-search">
        <Search size={18} />
        <input
          aria-label="Buscar en mis carátulas"
          value={query}
          maxLength={350}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Busca por título, curso, integrante o cualquier texto…"
        />
      </label>

      {feedback && (
        <p role="status" className="history-footnote">{feedback}</p>
      )}
      <div
        className="history-results"
        aria-live="polite"
        aria-busy={loading}
      >
        {error && (
          <div className="history-empty" role="alert">
            <p>{error}</p>
            <button
              className="secondary-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Volver a intentar
            </button>
          </div>
        )}
        {loading ? (
          <div className="history-empty">
            <LoaderCircle className="spin" size={22} />
            <p>Buscando tus carátulas…</p>
          </div>
        ) : !error && (
          <>
            <p className="history-total">
              {total} {total === 1 ? 'carátula' : 'carátulas'}
              {query ? ' encontradas' : ' guardadas'}
            </p>
            {!items.length && <EmptyHistory query={query} />}
            {items.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                disabled={Boolean(busyId)}
                busy={busyId === entry.id}
                onOpen={() => choose(entry, null)}
                onDownload={(format) => choose(entry, format)}
                onDelete={() => remove(entry)}
              />
            ))}
            <HistoryPagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>
      <p className="history-footnote">
        Los cambios se guardan automáticamente en cada carátula.
      </p>
    </dialog>
  );
}

function EmptyHistory({ query }: { query: string }) {
  return (
    <div className="history-empty">
      <FileText size={30} />
      <h3>{query ? 'No hay coincidencias' : 'Tu historial empieza aquí'}</h3>
      <p>
        {query
          ? 'Prueba con otra palabra, un nombre o un código.'
          : 'Crea una nueva carátula para comenzar.'}
      </p>
    </div>
  );
}

function actionError(cause: unknown): string {
  if (cause instanceof TypeError) {
    return 'No se pudo conectar con el historial local.';
  }
  return cause instanceof Error
    ? cause.message
    : 'No se pudo descargar o abrir el archivo.';
}

import { ArrowDownToLine, FileText, LoaderCircle, Trash2 } from 'lucide-react';
import type { CoverFileFormat, HistoryEntry } from '../types';

export interface HistoryItemProps {
  entry: HistoryEntry;
  disabled: boolean;
  busy: boolean;
  onOpen: () => void;
  onDownload: (format: CoverFileFormat) => void;
  onDelete: () => void;
}

/** Render one saved cover and its available actions. */
export function HistoryItem({
  entry,
  disabled,
  busy,
  onOpen,
  onDownload,
  onDelete,
}: HistoryItemProps) {
  return (
    <article className="history-item">
      <span className="history-file"><FileText size={23} /></span>
      <div className="history-info">
        <h3>{entry.title}</h3>
        {entry.course && <p>{entry.course}</p>}
        <time dateTime={entry.created_at}>
          {new Date(entry.created_at).toLocaleString('es-PE', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </time>
      </div>
      <div className="history-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={onOpen}
        >
          {busy ? 'Abriendo…' : 'Abrir en editor'}
        </button>
        <DownloadButton
          entry={entry}
          format="pdf"
          disabled={disabled}
          onDownload={onDownload}
        />
        <DownloadButton
          entry={entry}
          format="docx"
          disabled={disabled}
          onDownload={onDownload}
        />
        <button
          className="icon-button delete"
          aria-label={`Eliminar carátula ${entry.title}`}
          title="Eliminar carátula"
          disabled={disabled}
          onClick={onDelete}
        >
          {busy
            ? <LoaderCircle className="spin" size={18} />
            : <Trash2 size={18} />}
        </button>
      </div>
    </article>
  );
}

interface DownloadButtonProps {
  entry: HistoryEntry;
  format: CoverFileFormat;
  disabled: boolean;
  onDownload: (format: CoverFileFormat) => void;
}

function DownloadButton({
  entry,
  format,
  disabled,
  onDownload,
}: DownloadButtonProps) {
  const label = format.toUpperCase();
  return (
    <button
      className="secondary-button history-download"
      aria-label={`Descargar ${label} de ${entry.title}`}
      title={`Descargar ${label} guardado`}
      disabled={disabled}
      onClick={() => onDownload(format)}
    >
      <ArrowDownToLine size={16} /> {label}
    </button>
  );
}

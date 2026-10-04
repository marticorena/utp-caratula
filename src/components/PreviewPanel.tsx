import { useEffect, useState, type RefObject } from 'react';
import {
  ArrowDownToLine,
  FileText,
  FileType2,
  Info,
  LoaderCircle,
  Printer,
  Share2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Cover, CoverFileFormat, PreviewStatus } from '../types';

export interface PreviewPanelProps {
  pageSize: Cover['page_size'];
  font: Cover['font'];
  onPageSizeChange: (value: Cover['page_size']) => void;
  onFontChange: (value: Cover['font']) => void;
  imageUrl: string;
  status: PreviewStatus;
  previewError: string;
  actionError: string;
  zoom: number;
  downloadOpen: boolean;
  downloading: boolean;
  printing: boolean;
  sharing: boolean;
  canShare: boolean;
  downloadMenuRef: RefObject<HTMLDivElement | null>;
  onToggleDownload: () => void;
  onDownload: (format: CoverFileFormat) => void;
  onPrint: () => void;
  onShare: () => void;
  onZoomChange: (zoom: number) => void;
  onRetry: () => void;
}

/** Compose the preview toolbar, Carta canvas, status, and document metadata. */
export function PreviewPanel(props: PreviewPanelProps) {
  const [fontOptions, setFontOptions] = useState([
    { value: 'calibri', label: 'Calibri · 11 pt' },
    { value: 'arial', label: 'Arial · 11 pt' },
    { value: 'times', label: 'Times New Roman · 12 pt' },
    { value: 'georgia', label: 'Georgia · 11 pt' },
  ]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/formats', { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((formats) => setFontOptions(formats.fonts))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const {
    imageUrl,
    status,
    previewError,
    actionError,
    zoom,
    onRetry,
  } = props;

  return (
    <section className="preview-panel" aria-label="Vista previa de la carátula">
      <div className="preview-sticky">
        <PreviewToolbar {...props} />
        <PreviewPage
          imageUrl={imageUrl}
          status={status}
          error={previewError}
          zoom={zoom}
          pageSize={props.pageSize}
          onRetry={onRetry}
        />
        <div className="paper-caption">
          <label className="format-choice">
            <span>Papel</span>
            <select aria-label="Tamaño de página" value={props.pageSize}
              onChange={(event) => props.onPageSizeChange(event.target.value as Cover['page_size'])}>
              <option value="letter">Carta · 215,9 × 279,4 mm</option>
              <option value="a4">A4 · 210 × 297 mm</option>
            </select>
          </label>
          <label className="format-choice">
            <span>Fuente APA</span>
            <select aria-label="Fuente y tamaño APA" value={props.font}
              onChange={(event) => props.onFontChange(event.target.value as Cover['font'])}>
              {fontOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <span className="fixed-margins">Márgenes 2,54 cm · Interlineado doble</span>
        </div>
        {actionError && (
          <p className="download-error" role="alert">{actionError}</p>
        )}
      </div>
    </section>
  );
}

function PreviewToolbar({
  status,
  downloadOpen,
  downloading,
  printing,
  sharing,
  canShare,
  zoom,
  downloadMenuRef,
  onToggleDownload,
  onDownload,
  onPrint,
  onShare,
  onZoomChange,
}: PreviewPanelProps) {
  const outputBusy = downloading || printing;
  const outputDisabled = status !== 'ready' || outputBusy;

  return (
    <div className="preview-toolbar">
      <div className="preview-title">
        <span className="live-dot" />
        Vista previa
      </div>
      <div className="preview-toolbar-actions">
        <div
          className="toolbar-group"
          role="group"
          aria-label="Descarga e impresión"
        >
          <DownloadMenu
            open={downloadOpen}
            busy={downloading}
            disabled={outputDisabled}
            menuRef={downloadMenuRef}
            onToggle={onToggleDownload}
            onDownload={onDownload}
          />
          <button
            className="toolbar-download"
            disabled={outputDisabled}
            onClick={onPrint}
          >
            {printing
              ? <LoaderCircle size={15} className="spin" />
              : <Printer size={15} />}
            Imprimir
          </button>
          <button
            className="toolbar-download icon-only"
            disabled={outputDisabled || sharing || !canShare}
            onClick={onShare}
            aria-label="Compartir carátula"
            title="Compartir"
          >
            {sharing
              ? <LoaderCircle className="spin" size={15} />
              : <Share2 size={15} />}
          </button>
        </div>
        <ZoomControls zoom={zoom} onChange={onZoomChange} />
      </div>
    </div>
  );
}

interface DownloadMenuProps {
  open: boolean;
  busy: boolean;
  disabled: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onDownload: (format: CoverFileFormat) => void;
}

function DownloadMenu({
  open,
  busy,
  disabled,
  menuRef,
  onToggle,
  onDownload,
}: DownloadMenuProps) {
  return (
    <div className="download-menu" ref={menuRef}>
      <button
        className="toolbar-download icon-only"
        onClick={onToggle}
        disabled={disabled}
        aria-label="Descargar carátula"
        title="Descargar"
        aria-expanded={open}
      >
        {busy
          ? <LoaderCircle size={15} className="spin" />
          : <ArrowDownToLine size={15} />}
      </button>
      {open && (
        <div className="download-popover">
          <button onClick={() => onDownload('pdf')}>
            <FileType2 size={16} /> PDF
          </button>
          <button onClick={() => onDownload('docx')}>
            <FileText size={16} /> DOCX
          </button>
        </div>
      )}
    </div>
  );
}

interface ZoomControlsProps {
  zoom: number;
  onChange: (zoom: number) => void;
}

function ZoomControls({ zoom, onChange }: ZoomControlsProps) {
  return (
    <div
      className="toolbar-group toolbar-group-separated"
      role="group"
      aria-label="Nivel de ampliación"
    >
      <div className="zoom-controls">
        <button
          onClick={() => onChange(Math.max(70, zoom - 10))}
          disabled={zoom === 70}
          aria-label="Reducir zoom"
          title="Reducir zoom"
        >
          <ZoomOut size={15} />
        </button>
        <span aria-live="polite">{zoom}%</span>
        <button
          onClick={() => onChange(Math.min(240, zoom + 10))}
          disabled={zoom === 240}
          aria-label="Aumentar zoom"
          title="Aumentar zoom"
        >
          <ZoomIn size={15} />
        </button>
      </div>
    </div>
  );
}

interface PreviewPageProps {
  pageSize: Cover['page_size'];
  imageUrl: string;
  status: PreviewStatus;
  error: string;
  zoom: number;
  onRetry: () => void;
}

function PreviewPage({
  pageSize,
  imageUrl,
  status,
  error,
  zoom,
  onRetry,
}: PreviewPageProps) {
  const paperStyle = {
    aspectRatio: pageSize === 'a4' ? '210 / 297' : '8.5 / 11',
    ...(zoom === 100 ? {} : {
    width: `${4.6 * zoom}px`,
    minWidth: `${4.6 * zoom}px`,
    maxWidth: 'none',
    }),
  };

  return (
    <div
      className="page-stage"
      tabIndex={0}
      role="region"
      aria-label={`Vista previa centrada al ${zoom}%`}
    >
      <div
        className="paper"
        style={paperStyle}
        aria-busy={status === 'loading'}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={`Vista previa de tu carátula en formato ${pageSize === 'a4' ? 'A4' : 'carta'}`}
            className={status !== 'ready' ? 'stale-preview' : ''}
          />
        )}
        <div className="paper-status" aria-live="polite">
          {status === 'loading' && (
            <span>
              <LoaderCircle className="spin" size={16} />
              {imageUrl ? 'Actualizando…' : 'Preparando tu página…'}
            </span>
          )}
          {status === 'error' && (
            <div className="preview-error">
              <Info size={24} />
              <strong>No se puede mostrar la vista previa</strong>
              <p>{error}</p>
              <button className="secondary-button" onClick={onRetry}>
                Volver a intentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

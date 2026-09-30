import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Info, Trash2 } from 'lucide-react';
import { CoverApi } from './api';
import {
  getCurrentCoverId,
  getSavedZoom,
  getTemporaryUserId,
  saveCurrentCoverId,
  saveZoom,
} from './browserStorage';
import { copyText } from './clipboard';
import { AppHeader } from './components/AppHeader';
import { EditorTabs } from './components/EditorTabs';
import { MembersPanel } from './components/MembersPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { Toast } from './components/Toast';
import { WorkDetailsPanel } from './components/WorkDetailsPanel';
import {
  coverFromStored,
  createEmptyCover,
  createInitialCover,
  toStoredCover,
} from './cover';
import { chooseDestination, downloadCancelled } from './download';
import History from './History';
import { useCoverPreview } from './hooks/useCoverPreview';
import type { Cover, CoverFileFormat, StoredCover } from './types';
import './styles.css';

export function App() {
  const [cover, setCover] = useState<Cover>(createInitialCover);
  const [activeTab, setActiveTab] = useState(0);
  const [actionError, setActionError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [zoom, setZoom] = useState(getSavedZoom);
  const [userId] = useState(getTemporaryUserId);
  const [currentCoverId, setCurrentCoverId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const api = useMemo(() => new CoverApi(userId), [userId]);
  const preview = useCoverPreview(api, cover);

  function setCoverField<Key extends keyof Cover>(
    key: Key,
    value: Cover[Key],
  ) {
    setCover((current) => ({ ...current, [key]: value }));
  }

  async function persistCover(
    nextCover = cover,
    coverId = currentCoverId,
    signal?: AbortSignal,
  ) {
    if (!coverId) {
      throw new Error('La carátula todavía no está lista para guardarse.');
    }
    return api.update(coverId, toStoredCover(nextCover), signal);
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => saveZoom(zoom), [zoom]);

  useEffect(() => {
    if (!downloadOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (!downloadMenuRef.current?.contains(event.target as Node)) {
        setDownloadOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDownloadOpen(false);
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [downloadOpen]);

  useEffect(() => {
    const controller = new AbortController();

    async function createSavedCover(nextCover: Cover) {
      return api.create(toStoredCover(nextCover), controller.signal);
    }

    async function initializeEditor() {
      try {
        const sharedId = new URL(window.location.href).searchParams.get('cover');
        const savedId = sharedId || getCurrentCoverId();

        if (savedId) {
          const saved = await api.get(savedId, controller.signal);
          if (saved) {
            const opened = coverFromStored(saved.data);
            if (sharedId && !saved.owned) {
              const copy = await createSavedCover(opened);
              selectCover(copy.id);
              replaceSharedCoverId(copy.id);
            } else {
              selectCover(saved.id);
            }
            setCover(opened);
            if (sharedId) {
              setNotice('Carátula compartida abierta en el editor.');
            }
            setInitialized(true);
            return;
          }
        }

        const fresh = createInitialCover();
        const created = await createSavedCover(fresh);
        setCover(fresh);
        selectCover(created.id);
        setHistoryRevision((value) => value + 1);
        setInitialized(true);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setActionError(errorMessage(
            cause,
            'No se pudo conectar con el guardado local.',
          ));
        }
      }
    }

    initializeEditor();
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    if (!initialized || !currentCoverId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        await persistCover(cover, currentCoverId, controller.signal);
        setHistoryRevision((value) => value + 1);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setActionError(errorMessage(
            cause,
            'No se pudo guardar automáticamente. Revisa la conexión local.',
          ));
        }
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cover, currentCoverId, initialized]);

  function selectCover(coverId: string) {
    setCurrentCoverId(coverId);
    saveCurrentCoverId(coverId);
  }

  async function download(format: CoverFileFormat) {
    setDownloadOpen(false);
    setDownloading(true);
    setActionError('');
    try {
      const title = cover.title || cover.course || 'caratula';
      const writeFile = await chooseDestination(title, format);
      await persistCover();
      const file = await api.generate(toStoredCover(cover), format);
      setNotice(await writeFile(file));
      setHistoryRevision((value) => value + 1);
    } catch (cause) {
      if (!downloadCancelled(cause)) {
        setActionError(errorMessage(
          cause,
          'No se pudo descargar el archivo. Vuelve a intentar.',
        ));
      }
    } finally {
      setDownloading(false);
    }
  }

  async function printCover() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setActionError(
        'El navegador bloqueó la ventana de impresión. Permite ventanas '
        + 'emergentes y vuelve a intentar.',
      );
      return;
    }

    printWindow.document.title = 'Preparando impresión…';
    printWindow.document.body.textContent = 'Preparando la carátula para imprimir…';
    setPrinting(true);
    setActionError('');
    try {
      await persistCover();
      const file = await api.generate(toStoredCover(cover), 'pdf');
      const url = URL.createObjectURL(file);
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
      printWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
      setHistoryRevision((value) => value + 1);
      setNotice('Carátula preparada para imprimir.');
    } catch (cause) {
      printWindow.close();
      setActionError(errorMessage(
        cause,
        'No se pudo preparar la impresión. Vuelve a intentar.',
      ));
    } finally {
      setPrinting(false);
    }
  }

  async function shareCover() {
    setSharing(true);
    setActionError('');
    try {
      await persistCover();
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('cover', currentCoverId);
      await copyText(url.toString());
      setHistoryRevision((value) => value + 1);
      setNotice('Enlace copiado. Puedes pegarlo donde quieras.');
    } catch (cause) {
      setActionError(errorMessage(
        cause,
        'No se pudo crear el enlace. Vuelve a intentar.',
      ));
    } finally {
      setSharing(false);
    }
  }

  function openSaved(saved: StoredCover, coverId: string) {
    setCover(coverFromStored(saved));
    selectCover(coverId);
    setNotice('Carátula abierta en el editor.');
  }

  async function newCover() {
    setCreating(true);
    setActionError('');
    try {
      const fresh = createInitialCover();
      const created = await api.create(toStoredCover(fresh));
      setCover(fresh);
      selectCover(created.id);
      setActiveTab(0);
      setHistoryRevision((value) => value + 1);
      setNotice('Nueva carátula creada.');
    } catch (cause) {
      setActionError(errorMessage(
        cause,
        'No se pudo crear una nueva carátula.',
      ));
    } finally {
      setCreating(false);
    }
  }

  function loadExample() {
    setCover(createInitialCover());
    setActiveTab(0);
    setNotice('Ejemplo cargado.');
  }

  function clearCover() {
    setCover(createEmptyCover());
    setActiveTab(0);
    setNotice('Se limpiaron todos los campos.');
  }

  return (
    <div className="app-shell">
      <AppHeader
        creating={creating}
        onCreate={newCover}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <main className="workspace">
        <section className="editor" aria-label="Editor de carátula">
          <div className="optional-note">
            <Info size={15} />
            <span>Todo es opcional. Lo que dejes vacío no aparecerá.</span>
          </div>
          <EditorTabs
            activeTab={activeTab}
            memberCount={cover.members.length}
            onChange={setActiveTab}
          />
          <WorkDetailsPanel
            cover={cover}
            hidden={activeTab !== 0}
            onChange={setCoverField}
          />
          <MembersPanel
            members={cover.members}
            hidden={activeTab !== 1}
            onChange={(members) => setCoverField('members', members)}
            onNotice={setNotice}
          />
          <div className="editor-bottom-actions">
            <button className="reset-button" onClick={loadExample}>
              <BookOpen size={14} /> Cargar ejemplo
            </button>
            <button className="reset-button" onClick={clearCover}>
              <Trash2 size={14} /> Limpiar todo
            </button>
          </div>
        </section>
        <PreviewPanel
          imageUrl={preview.imageUrl}
          status={preview.status}
          previewError={preview.error}
          actionError={actionError}
          zoom={zoom}
          downloadOpen={downloadOpen}
          downloading={downloading}
          printing={printing}
          sharing={sharing}
          canShare={Boolean(currentCoverId)}
          downloadMenuRef={downloadMenuRef}
          onToggleDownload={() => setDownloadOpen((open) => !open)}
          onDownload={download}
          onPrint={printCover}
          onShare={shareCover}
          onZoomChange={setZoom}
          onRetry={preview.retry}
        />
      </main>
      <footer className="site-footer">
        <span>Hecho por Jean Marticornea</span>
        <a href="mailto:duanner.marticorena@gmail.com">
          duanner.marticorena@gmail.com
        </a>
      </footer>
      <History
        open={historyOpen}
        revision={historyRevision}
        userId={userId}
        onClose={() => setHistoryOpen(false)}
        onOpen={openSaved}
      />
      <Toast message={notice} onClose={() => setNotice('')} />
    </div>
  );
}

function replaceSharedCoverId(coverId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('cover', coverId);
  history.replaceState(null, '', url);
}

function errorMessage(cause: unknown, networkMessage: string): string {
  if (cause instanceof TypeError) return networkMessage;
  return cause instanceof Error ? cause.message : networkMessage;
}

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento raíz de la aplicación.');
createRoot(root).render(<StrictMode><App /></StrictMode>);

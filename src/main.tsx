import { chooseDestination, downloadCancelled } from './download';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownAZ, ArrowDownToLine, BookOpen, Check, FileText, FileType2, FolderOpen, Share2, Info, LoaderCircle, Plus, Printer, Trash2, GripVertical, Users, X, ZoomIn, ZoomOut } from 'lucide-react';
import './styles.css';
import defaults from './defaults.json';
import History from './History';
import type { Member, PersonName, Cover, StoredCover } from './types';

const member = (): Member => ({ first_names: '', last_names: '', code: '', id: crypto.randomUUID() });
const personFromStored = (name: string): PersonName => {
  const comma = name.indexOf(',');
  if (comma >= 0) return { last_names: name.slice(0, comma).trim(), first_names: name.slice(comma + 1).trim() };
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first_names: words[0] || '', last_names: '' };
  const surnameWords = words.length >= 3 ? 2 : 1;
  return { first_names: words.slice(0, -surnameWords).join(' '), last_names: words.slice(-surnameWords).join(' ') };
};
const memberFromStored = ({ name, code }: { name: string; code: string }): Member => {
  return { ...personFromStored(name), code, id: crypto.randomUUID() };
};
const personName = (person: PersonName) => [person.last_names.trim(), person.first_names.trim()].filter(Boolean).join(', ');
const initial = (): Cover => ({ ...defaults, teacher: personFromStored(defaults.teacher), show_codes: true, year: String(new Date().getFullYear()), members: defaults.members.map(memberFromStored) });
const emptyCover = (): Cover => ({ course: '', week: '', title: '', subtitle: '', teacher: { first_names: '', last_names: '' }, city: '', year: '', faculty: '', members: [], show_codes: true });
const payload = (data: Cover) => ({ ...data, teacher: personName(data.teacher), show_codes: true, members: data.members.map(m => ({ name: personName(m), code: m.code })) });
const compareBySurname = (a: Member, b: Member) => {
  const options = { sensitivity: 'base', numeric: true } as const;
  return a.last_names.localeCompare(b.last_names, 'es', options) || a.first_names.localeCompare(b.first_names, 'es', options);
};
const USER_ID_KEY = 'utp-caratula-user-id';
const CURRENT_COVER_KEY = 'utp-caratula-current-cover-id';
const SETTINGS_KEY = 'utp-caratula-settings';
const localGet = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const localSet = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ } };
const temporaryUserId = () => {
  const saved = localGet(USER_ID_KEY);
  if (saved) return saved;
  const created = crypto.randomUUID();
  localSet(USER_ID_KEY, created);
  return created;
};
const savedZoom = () => {
  try {
    const value = Number(JSON.parse(localGet(SETTINGS_KEY) || '{}').zoom);
    return Number.isFinite(value) ? Math.min(240, Math.max(70, value)) : 100;
  } catch { return 100; }
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (Array.isArray(body.detail)) return 'Hay datos que no son válidos. Revisa la longitud de los campos y vuelve a intentar.';
  return typeof body.detail === 'string' ? body.detail : 'No se pudo generar la carátula. Revisa los datos e inténtalo otra vez.';
}

function Field({ label, value, onChange, placeholder, maxLength = 350, list, multiline = false, type = 'text', min, step }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; list?: string; multiline?: boolean; type?: React.HTMLInputTypeAttribute; min?: number; step?: number }) {
  const id = React.useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} rows={2} /> : <input id={id} type={type} min={min} step={step} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} list={list} autoComplete="off" />}</div>;
}

function App() {
  const [data, setData] = useState<Cover>(initial);
  const [activeTab, setActiveTab] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const memberDrag = useRef<{ id: string; target: string } | null>(null);
  function reorderMember(id: string, target: string) {
    setData(current => {
      const from = current.members.findIndex(m => m.id === id);
      const to = current.members.findIndex(m => m.id === target);
      if (from < 0 || to < 0 || from === to) return current;
      const members = [...current.members];
      const [moved] = members.splice(from, 1);
      members.splice(to, 0, moved);
      return { ...current, members };
    });
  }
  function endMemberDrag(commit: boolean) {
    const drag = memberDrag.current;
    if (commit && drag && drag.id !== drag.target) {
      reorderMember(drag.id, drag.target);
      setNotice('Orden de integrantes actualizado.');
    }
    memberDrag.current = null; setDragging(null); setDragTarget(null);
  }
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadMenu = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(savedZoom);
  const [userId] = useState(temporaryUserId);
  const [currentCoverId, setCurrentCoverId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const imageUrl = useRef('');
  const requestId = useRef(0);
  const set = <K extends keyof Cover>(key: K, value: Cover[K]) => setData(d => ({ ...d, [key]: value }));
  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setStatus('loading');
    setError('');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)), signal: controller.signal });
        if (!response.ok) throw new Error(await apiError(response));
        const blob = await response.blob();
        if (id !== requestId.current || controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
        imageUrl.current = url;
        setPreview(url);
        setStatus('ready');
      } catch (e) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setStatus('error');
        setError(e instanceof TypeError ? 'No se pudo conectar con el generador. Comprueba que la API esté en ejecución y vuelve a intentar.' : (e as Error).message);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data, retry]);

  useEffect(() => () => { if (imageUrl.current) URL.revokeObjectURL(imageUrl.current); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { localSet(SETTINGS_KEY, JSON.stringify({ zoom: zoomLevel })); }, [zoomLevel]);
  useEffect(() => {
    if (!downloadOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!downloadMenu.current?.contains(event.target as Node)) setDownloadOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDownloadOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [downloadOpen]);
  useEffect(() => {
    const controller = new AbortController();
    const headers = { 'X-User-Id': userId };
    const create = async (cover: Cover) => {
      const response = await fetch('/api/covers', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload(cover)), signal: controller.signal });
      if (!response.ok) throw new Error(await apiError(response));
      return response.json();
    };
    const start = async () => {
      try {
        const sharedId = new URL(window.location.href).searchParams.get('cover');
        const savedId = sharedId || localGet(CURRENT_COVER_KEY);
        if (savedId) {
          const response = await fetch(`/api/covers/${encodeURIComponent(savedId)}`, { headers, signal: controller.signal, cache: 'no-store' });
          if (response.ok) {
            const result = await response.json();
            const opened = coverFromStored(result.data);
            if (sharedId && !result.owned) {
              const copy = await create(opened);
              setCurrentCoverId(copy.id); localSet(CURRENT_COVER_KEY, copy.id);
              const url = new URL(window.location.href); url.searchParams.set('cover', copy.id); history.replaceState(null, '', url);
            } else {
              setCurrentCoverId(result.id); localSet(CURRENT_COVER_KEY, result.id);
            }
            setData(opened);
            if (sharedId) setNotice('Carátula compartida abierta en el editor.');
            setInitialized(true);
            return;
          }
        }
        const fresh = initial();
        const created = await create(fresh);
        setData(fresh); setCurrentCoverId(created.id); localSet(CURRENT_COVER_KEY, created.id);
        setHistoryRevision(n => n + 1); setInitialized(true);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof TypeError ? 'No se pudo conectar con el guardado local.' : (cause as Error).message);
      }
    };
    start();
    return () => controller.abort();
  }, [userId]);

  async function persistCover(nextData = data, coverId = currentCoverId, signal?: AbortSignal) {
    if (!coverId) throw new Error('La carátula todavía no está lista para guardarse.');
    const response = await fetch(`/api/covers/${encodeURIComponent(coverId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User-Id': userId }, body: JSON.stringify(payload(nextData)), signal });
    if (!response.ok) throw new Error(await apiError(response));
    return response.json();
  }

  useEffect(() => {
    if (!initialized || !currentCoverId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        await persistCover(data, currentCoverId, controller.signal);
        setHistoryRevision(n => n + 1);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof TypeError ? 'No se pudo guardar automáticamente. Revisa la conexión local.' : (cause as Error).message);
      }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [data, currentCoverId, initialized]);

  async function download(format: 'pdf' | 'docx') {
    setDownloadOpen(false); setDownloading(true);
    try {
      const writeFile = await chooseDestination(data.title || data.course || 'caratula', format);
      await persistCover();
      const response = await fetch(`/api/${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
      if (!response.ok) throw new Error(await apiError(response));
      const message = await writeFile(await response.blob());
      setHistoryRevision(n => n + 1);
      setNotice(message);
    } catch (e) { if (!downloadCancelled(e)) setError(e instanceof TypeError ? 'No se pudo descargar el archivo. Vuelve a intentar.' : (e as Error).message); }
    finally { setDownloading(false); }
  }

  async function printCover() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes y vuelve a intentar.');
      return;
    }
    printWindow.document.title = 'Preparando impresión…';
    printWindow.document.body.textContent = 'Preparando la carátula para imprimir…';
    setPrinting(true); setError('');
    try {
      await persistCover();
      const response = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
      if (!response.ok) throw new Error(await apiError(response));
      const url = URL.createObjectURL(await response.blob());
      printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
      printWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
      setHistoryRevision(n => n + 1);
      setNotice('Carátula preparada para imprimir.');
    } catch (e) {
      printWindow.close();
      setError(e instanceof TypeError ? 'No se pudo preparar la impresión. Vuelve a intentar.' : (e as Error).message);
    } finally { setPrinting(false); }
  }

  async function share() {
    setSharing(true); setError('');
    try {
      await persistCover();
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('cover', currentCoverId);
      try {
        await navigator.clipboard.writeText(url.toString());
      } catch {
        const input = document.createElement('textarea');
        input.value = url.toString(); input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.appendChild(input); input.select();
        if (!document.execCommand('copy')) throw new Error('No se pudo copiar el enlace.');
        input.remove();
      }
      setHistoryRevision(n => n + 1);
      setNotice('Enlace copiado. Puedes pegarlo donde quieras.');
    } catch (e) { setError(e instanceof TypeError ? 'No se pudo crear el enlace. Vuelve a intentar.' : (e as Error).message); }
    finally { setSharing(false); }
  }

  function coverFromStored(saved: StoredCover): Cover {
    const { course, week, title, subtitle, teacher, city, year, faculty, members } = saved;
    return { course, week, title, subtitle, teacher: personFromStored(teacher), city, year, faculty, show_codes: true, members: members.map(memberFromStored) };
  }

  function openSaved(saved: StoredCover, coverId: string) {
    setData(coverFromStored(saved)); setCurrentCoverId(coverId); localSet(CURRENT_COVER_KEY, coverId);
    setNotice('Carátula abierta en el editor.');
  }

  async function newCover() {
    setCreating(true); setError('');
    try {
      const fresh = initial();
      const response = await fetch('/api/covers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': userId }, body: JSON.stringify(payload(fresh)) });
      if (!response.ok) throw new Error(await apiError(response));
      const created = await response.json();
      setData(fresh); setCurrentCoverId(created.id); localSet(CURRENT_COVER_KEY, created.id); setActiveTab(0);
      setHistoryRevision(n => n + 1); setNotice('Nueva carátula creada.');
    } catch (cause) { setError(cause instanceof TypeError ? 'No se pudo crear una nueva carátula.' : (cause as Error).message); }
    finally { setCreating(false); }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand-group"><a href="#" className="wordmark" aria-label="UTP Carátula, inicio"><span className="brand-utp">UTP</span> Carátula</a></div><div className="top-actions"><button className="history-button" disabled={creating} onClick={newCover}>{creating ? <LoaderCircle className="spin" size={17}/> : <Plus size={17}/>}Nueva carátula</button><button className="history-button" onClick={() => setHistoryOpen(true)}><FolderOpen size={17}/>Mis carátulas</button></div></header>
    <main className="workspace">
      <section className="editor" aria-label="Editor de carátula">
        <div className="optional-note"><Info size={15}/><span>Todo es opcional. Lo que dejes vacío no aparecerá.</span></div>
        <div className="editor-tabs" role="tablist" aria-label="Secciones del formulario">
          {['Sobre tu trabajo', 'Integrantes'].map((label, index) => <button key={label} ref={el => { tabRefs.current[index] = el; }} id={`editor-tab-${index}`} role="tab" aria-selected={activeTab === index} aria-controls={`editor-panel-${index}`} tabIndex={activeTab === index ? 0 : -1} onClick={() => setActiveTab(index)} onKeyDown={event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % 2;
            else if (event.key === 'ArrowLeft') next = (index + 1) % 2;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = 1;
            else return;
            event.preventDefault(); setActiveTab(next); tabRefs.current[next]?.focus();
          }}>{label}{index === 1 && <span className="tab-count">{data.members.length}</span>}</button>)}
        </div>
        <section className="form-section tab-panel" role="tabpanel" id="editor-panel-0" aria-labelledby="editor-tab-0" hidden={activeTab !== 0}>
          <div className="faculty-week-fields"><Field label="Facultad o carrera" value={data.faculty} onChange={v => set('faculty', v)} placeholder="Nombre de la facultad o carrera"/><Field label="Semana" value={data.week} onChange={v => set('week', v)} placeholder="1" maxLength={3} type="number" min={1} step={1}/></div>
          <Field label="Asignatura" value={data.course} onChange={v => set('course', v)} placeholder="Nombre de la asignatura"/>
          <Field label="Tema" value={data.title} onChange={v => set('title', v)} placeholder="¿Cuál es el tema de tu trabajo?" multiline/>
          <Field label="Subtema" value={data.subtitle} onChange={v => set('subtitle', v)} placeholder="Una pregunta o un título complementario" multiline/>
          <div className="member-name-fields"><Field label="Nombres del docente" value={data.teacher.first_names} onChange={v => set('teacher', { ...data.teacher, first_names: v })} placeholder="Nombres" maxLength={60}/><Field label="Apellidos del docente" value={data.teacher.last_names} onChange={v => set('teacher', { ...data.teacher, last_names: v })} placeholder="Apellidos" maxLength={60}/></div>
          <div className="two-fields"><Field label="Ciudad" value={data.city} onChange={v => set('city', v)} placeholder="Ciudad" list="cities" maxLength={120}/><Field label="Año" value={data.year} onChange={v => set('year', v)} placeholder="2026" maxLength={10}/></div>
          <datalist id="cities">{['Lima', 'Arequipa', 'Chiclayo', 'Piura', 'Trujillo', 'Huancayo', 'Ica', 'Chimbote'].map(c => <option key={c} value={c}/>)}</datalist>
        </section>
        <section className="form-section tab-panel" role="tabpanel" id="editor-panel-1" aria-labelledby="editor-tab-1" hidden={activeTab !== 1}>
          <div className="member-tools"><button type="button" className="sort-members" disabled={data.members.length < 2} onClick={() => {
            set('members', [...data.members].sort(compareBySurname));
            setNotice('Integrantes ordenados alfabéticamente por apellido.');
          }}><ArrowDownAZ size={16}/> Por apellido</button></div>
          <div className="members-list">{data.members.map((m, i) => <div className={`member-card ${dragging === m.id ? 'member-dragging' : ''} ${dragTarget === m.id && dragging !== m.id ? 'member-drop-target' : ''}`} data-member-id={m.id} key={m.id} onDragEnter={event => {
            if (!memberDrag.current) return;
            event.preventDefault(); memberDrag.current.target = m.id; setDragTarget(m.id);
          }} onDragOver={event => { if (memberDrag.current) event.preventDefault(); }} onDrop={event => { event.preventDefault(); endMemberDrag(true); }}><div className="member-heading"><button type="button" draggable={data.members.length > 1} className="icon-button member-grip" aria-label={`Reordenar integrante ${i + 1}: arrastra o usa las flechas arriba y abajo`} title="Arrastra para reordenar; también puedes usar ↑ y ↓" onDragStart={event => {
            memberDrag.current = { id: m.id, target: m.id }; setDragging(m.id); setDragTarget(m.id);
            event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', m.id);
          }} onDragEnd={() => endMemberDrag(false)} onPointerDown={event => {
            if (event.button !== 0 || data.members.length < 2) return;
            if (event.pointerType === 'mouse') return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
            memberDrag.current = { id: m.id, target: m.id }; setDragging(m.id); setDragTarget(m.id);
          }} onPointerMove={event => {
            if (!memberDrag.current) return;
            const card = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-member-id]');
            if (card?.dataset.memberId) { memberDrag.current.target = card.dataset.memberId; setDragTarget(card.dataset.memberId); }
            if (event.clientY < 65) window.scrollBy(0, -18);
            else if (event.clientY > window.innerHeight - 65) window.scrollBy(0, 18);
          }} onPointerUp={() => endMemberDrag(true)} onPointerCancel={() => endMemberDrag(false)} onLostPointerCapture={() => endMemberDrag(false)} onKeyDown={event => {
            if (event.key === 'Escape') { endMemberDrag(false); return; }
            const to = event.key === 'ArrowUp' ? i - 1 : event.key === 'ArrowDown' ? i + 1 : -1;
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            if (to >= 0 && to < data.members.length) { reorderMember(m.id, data.members[to].id); setNotice(`Integrante movido a la posición ${to + 1}.`); }
          }}><GripVertical size={18}/></button><span><Users size={14}/> Integrante {i + 1}</span><button className="icon-button delete" onClick={() => set('members', data.members.filter(item => item.id !== m.id))} aria-label={`Eliminar integrante ${i + 1}`} title="Eliminar integrante"><Trash2 size={15}/></button></div><div className="member-name-fields"><Field label="Nombres" value={m.first_names} onChange={v => set('members', data.members.map(item => item.id === m.id ? { ...item, first_names: v } : item))} placeholder="Nombres" maxLength={120}/><Field label="Apellidos" value={m.last_names} onChange={v => set('members', data.members.map(item => item.id === m.id ? { ...item, last_names: v } : item))} placeholder="Apellidos" maxLength={120}/></div><Field label="Código (opcional)" value={m.code} onChange={v => set('members', data.members.map(item => item.id === m.id ? { ...item, code: v } : item))} placeholder="Código de estudiante" maxLength={30}/></div>)}</div>
          {!data.members.length && <p className="empty-members">Tu carátula no tendrá una sección de estudiantes.</p>}
          <button className="add-member" disabled={data.members.length >= 30} onClick={() => set('members', [...data.members, member()])}><Plus size={17}/> {data.members.length >= 30 ? 'Límite de 30 integrantes' : 'Agregar integrante'}</button>
        </section>
        <div className="editor-bottom-actions"><button className="reset-button" onClick={() => { setData(initial()); setActiveTab(0); setNotice('Ejemplo cargado.'); }}><BookOpen size={14}/> Cargar ejemplo</button><button className="reset-button" onClick={() => { setData(emptyCover()); setActiveTab(0); setNotice('Se limpiaron todos los campos.'); }}><Trash2 size={14}/> Limpiar todo</button></div>
      </section>
      <section className="preview-panel" aria-label="Vista previa de la carátula"><div className="preview-sticky"><div className="preview-toolbar"><div className="preview-title"><span className="live-dot"/>Vista previa</div><div className="preview-toolbar-actions"><div className="toolbar-group" role="group" aria-label="Descarga e impresión"><div className="download-menu" ref={downloadMenu}><button className="toolbar-download icon-only" onClick={() => setDownloadOpen(open => !open)} disabled={status !== 'ready' || downloading || printing} aria-label="Descargar carátula" title="Descargar" aria-expanded={downloadOpen}>{downloading ? <LoaderCircle size={15} className="spin"/> : <ArrowDownToLine size={15}/>}</button>{downloadOpen && <div className="download-popover"><button onClick={() => download('pdf')}><FileType2 size={16}/> PDF</button><button onClick={() => download('docx')}><FileText size={16}/> DOCX</button></div>}</div><button className="toolbar-download" disabled={status !== 'ready' || downloading || printing} onClick={printCover}>{printing ? <LoaderCircle size={15} className="spin"/> : <Printer size={15}/>} Imprimir</button><button className="toolbar-download icon-only" disabled={status !== 'ready' || sharing || downloading || printing || !currentCoverId} onClick={share} aria-label="Compartir carátula" title="Compartir">{sharing ? <LoaderCircle className="spin" size={15}/> : <Share2 size={15}/>}</button></div><div className="toolbar-group toolbar-group-separated" role="group" aria-label="Nivel de ampliación"><div className="zoom-controls"><button onClick={() => setZoomLevel(level => Math.max(70, level - 10))} disabled={zoomLevel === 70} aria-label="Reducir zoom" title="Reducir zoom"><ZoomOut size={15}/></button><span aria-live="polite">{zoomLevel}%</span><button onClick={() => setZoomLevel(level => Math.min(240, level + 10))} disabled={zoomLevel === 240} aria-label="Aumentar zoom" title="Aumentar zoom"><ZoomIn size={15}/></button></div></div></div></div>
        <div className="page-stage" tabIndex={0} role="region" aria-label={`Vista previa centrada al ${zoomLevel}%`}><div className="paper" style={zoomLevel === 100 ? undefined : { width: `${4.6 * zoomLevel}px`, minWidth: `${4.6 * zoomLevel}px`, maxWidth: 'none' }} aria-busy={status === 'loading'}>{preview && <img src={preview} alt="Vista previa de tu carátula en formato A4" className={status !== 'ready' ? 'stale-preview' : ''}/>}<div className="paper-status" aria-live="polite">{status === 'loading' && <span><LoaderCircle className="spin" size={16}/>{preview ? 'Actualizando…' : 'Preparando tu página…'}</span>}{status === 'error' && <div className="preview-error"><Info size={24}/><strong>No se puede mostrar la vista previa</strong><p>{error}</p><button className="secondary-button" onClick={() => setRetry(n => n + 1)}>Volver a intentar</button></div>}</div></div></div>
        <div className="paper-caption"><span>A4 <span>210 × 297 mm</span></span><span>Calibri 11 <i/> Márgenes 2,54 cm</span></div>
        {error && status !== 'error' && <p className="download-error" role="alert">{error}</p>}
      </div></section>
    </main>
    <footer className="site-footer"><span>Hecho por Jean Marticornea</span><a href="mailto:duanner.marticorena@gmail.com">duanner.marticorena@gmail.com</a></footer>
    <History open={historyOpen} revision={historyRevision} userId={userId} onClose={() => setHistoryOpen(false)} onOpen={openSaved}/>
    {notice && <div className="toast" role="status"><Check size={17}/>{notice}<button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

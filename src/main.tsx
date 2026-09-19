import { chooseDestination, downloadCancelled } from './download';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownAZ, ArrowDownToLine, Check, FolderOpen, Save, Share2, Info, LoaderCircle, Plus, RotateCcw, Trash2, GripVertical, Users, X, ZoomIn, ZoomOut } from 'lucide-react';
import './styles.css';
import defaults from './defaults.json';
import History from './History';
import type { Member, Cover, StoredCover } from './types';

const member = (): Member => ({ first_names: '', last_names: '', code: '', id: crypto.randomUUID() });
const memberFromStored = ({ name, code }: { name: string; code: string }): Member => {
  const comma = name.indexOf(',');
  return comma >= 0
    ? { last_names: name.slice(0, comma).trim(), first_names: name.slice(comma + 1).trim(), code, id: crypto.randomUUID() }
    : { last_names: name.trim(), first_names: '', code, id: crypto.randomUUID() };
};
const memberName = (m: Member) => [m.last_names.trim(), m.first_names.trim()].filter(Boolean).join(', ');
const initial = (): Cover => ({ ...defaults, show_codes: true, year: String(new Date().getFullYear()), members: defaults.members.map(memberFromStored) });
const payload = (data: Cover) => ({ ...data, show_codes: true, members: data.members.map(m => ({ name: memberName(m), code: m.code })) });
const compareBySurname = (a: Member, b: Member) => {
  const options = { sensitivity: 'base', numeric: true } as const;
  return a.last_names.localeCompare(b.last_names, 'es', options) || a.first_names.localeCompare(b.first_names, 'es', options);
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (Array.isArray(body.detail)) return 'Hay datos que no son válidos. Revisa la longitud de los campos y vuelve a intentar.';
  return typeof body.detail === 'string' ? body.detail : 'No se pudo generar la carátula. Revisa los datos e inténtalo otra vez.';
}

function Field({ label, value, onChange, placeholder, maxLength = 350, list, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; list?: string; multiline?: boolean }) {
  const id = React.useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} rows={2} /> : <input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} list={list} autoComplete="off" />}</div>;
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
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [resetting, setResetting] = useState(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
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
  useEffect(() => { if (resetting) resetDialog.current?.showModal(); else resetDialog.current?.close(); }, [resetting]);
  useEffect(() => {
    const coverId = new URL(window.location.href).searchParams.get('cover');
    if (!coverId) return;
    const controller = new AbortController();
    fetch(`/api/covers/${encodeURIComponent(coverId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'El enlace compartido ya no existe en este equipo.' : 'No se pudo abrir el enlace compartido.');
        return response.json();
      })
      .then(result => { openSaved(result.data); setNotice('Carátula compartida abierta en el editor.'); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof TypeError ? 'No se pudo conectar con el historial local.' : error.message); });
    return () => controller.abort();
  }, []);

  async function download(format: 'pdf' | 'docx') {
    setDownloading(true);
    try {
      const writeFile = await chooseDestination(data.title || data.course || 'caratula', format);
      const response = await fetch(`/api/${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
      if (!response.ok) throw new Error(await apiError(response));
      const message = await writeFile(await response.blob());
      setHistoryRevision(n => n + 1);
      setNotice(message);
    } catch (e) { if (!downloadCancelled(e)) setError(e instanceof TypeError ? 'No se pudo descargar el archivo. Vuelve a intentar.' : (e as Error).message); }
    finally { setDownloading(false); }
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/covers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
      if (!response.ok) throw new Error(await apiError(response));
      setHistoryRevision(n => n + 1);
      setNotice('Carátula guardada. La encontrarás en Mis carátulas.');
    } catch (e) { setError(e instanceof TypeError ? 'No se pudo conectar con el guardado local. Vuelve a intentar.' : (e as Error).message); }
    finally { setSaving(false); }
  }

  async function share() {
    setSharing(true); setError('');
    try {
      const response = await fetch('/api/covers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
      if (!response.ok) throw new Error(await apiError(response));
      const saved = await response.json();
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('cover', saved.id);
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

  function openSaved(saved: StoredCover) {
    const { course, week, title, subtitle, teacher, city, year, faculty, members } = saved;
    setData({ course, week, title, subtitle, teacher, city, year, faculty, show_codes: true, members: members.map(memberFromStored) });
    setNotice('Carátula abierta. Puedes editarla y guardar otra versión.');
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand-group"><a href="#" className="wordmark" aria-label="UTP Carátula, inicio"><span className="brand-utp">UTP</span> Carátula</a></div><div className="top-actions"><button className="history-button" onClick={() => setHistoryOpen(true)}><FolderOpen size={17}/>Mis carátulas</button></div></header>
    <main className="workspace">
      <section className="editor" aria-label="Editor de carátula">
        <div className="optional-note"><Info size={15}/><span>Todo es opcional. Lo que dejes vacío no aparecerá.</span></div>
        <div className="editor-tabs" role="tablist" aria-label="Secciones del formulario">
          {['Sobre tu trabajo', 'Integrantes', 'Detalles finales'].map((label, index) => <button key={label} ref={el => { tabRefs.current[index] = el; }} id={`editor-tab-${index}`} role="tab" aria-selected={activeTab === index} aria-controls={`editor-panel-${index}`} tabIndex={activeTab === index ? 0 : -1} onClick={() => setActiveTab(index)} onKeyDown={event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % 3;
            else if (event.key === 'ArrowLeft') next = (index + 2) % 3;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = 2;
            else return;
            event.preventDefault(); setActiveTab(next); tabRefs.current[next]?.focus();
          }}>{label}{index === 1 && <span className="tab-count">{data.members.length}</span>}</button>)}
        </div>
        <section className="form-section tab-panel" role="tabpanel" id="editor-panel-0" aria-labelledby="editor-tab-0" hidden={activeTab !== 0}>
          <Field label="Semana o evaluación" value={data.week} onChange={v => set('week', v)} placeholder="Semana o nombre de la evaluación" maxLength={120}/>
          <Field label="Tema o título del trabajo" value={data.title} onChange={v => set('title', v)} placeholder="¿Cómo se llama tu trabajo?" multiline/>
          <Field label="Subtema" value={data.subtitle} onChange={v => set('subtitle', v)} placeholder="Una pregunta o un título complementario" multiline/>
          <Field label="Asignatura" value={data.course} onChange={v => set('course', v)} placeholder="Nombre de la asignatura"/>
          <Field label="Docente" value={data.teacher} onChange={v => set('teacher', v)} placeholder="Nombres y apellidos" maxLength={120}/>
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
        <section className="form-section tab-panel last-section" role="tabpanel" id="editor-panel-2" aria-labelledby="editor-tab-2" hidden={activeTab !== 2}>
          <div className="two-fields"><Field label="Ciudad" value={data.city} onChange={v => set('city', v)} placeholder="Ciudad" list="cities" maxLength={120}/><Field label="Año" value={data.year} onChange={v => set('year', v)} placeholder="2026" maxLength={10}/></div>
          <datalist id="cities">{['Lima', 'Arequipa', 'Chiclayo', 'Piura', 'Trujillo', 'Huancayo', 'Ica', 'Chimbote'].map(c => <option key={c} value={c}/>)}</datalist>
          <Field label="Facultad o carrera" value={data.faculty} onChange={v => set('faculty', v)} placeholder="Nombre de la facultad o carrera"/>
        </section>
        <button className="reset-button" onClick={() => setResetting(true)}><RotateCcw size={14}/> Empezar de nuevo</button>
      </section>
      <section className="preview-panel" aria-label="Vista previa de la carátula"><div className="preview-sticky"><div className="preview-toolbar"><div className="preview-title"><span className="live-dot"/>Vista previa</div><div className="preview-toolbar-actions"><div className="toolbar-group" role="group" aria-label="Descargas"><button className="toolbar-download" onClick={() => download('pdf')} disabled={status !== 'ready' || downloading}>{downloading ? <LoaderCircle size={15} className="spin"/> : <ArrowDownToLine size={15}/>} PDF</button><button className="toolbar-download" disabled={status !== 'ready' || downloading} onClick={() => download('docx')}><ArrowDownToLine size={15}/> DOCX</button></div><div className="toolbar-group toolbar-group-separated" role="group" aria-label="Guardar y compartir"><button className="toolbar-download" disabled={status !== 'ready' || saving || sharing || downloading} onClick={save}>{saving ? <LoaderCircle className="spin" size={15}/> : <Save size={15}/>} Guardar</button><button className="toolbar-download" disabled={status !== 'ready' || saving || sharing || downloading} onClick={share}>{sharing ? <LoaderCircle className="spin" size={15}/> : <Share2 size={15}/>} Compartir</button></div><div className="toolbar-group toolbar-group-separated" role="group" aria-label="Controles de vista"><div className="zoom-controls" role="group" aria-label="Nivel de ampliación"><button onClick={() => setZoomLevel(level => Math.max(70, level - 10))} disabled={zoomLevel === 70} aria-label="Reducir vista previa" title="Reducir"><ZoomOut size={15}/></button><span aria-live="polite">{zoomLevel}%</span><button onClick={() => setZoomLevel(level => Math.min(240, level + 10))} disabled={zoomLevel === 240} aria-label="Ampliar vista previa" title="Ampliar"><ZoomIn size={15}/></button></div><button className="zoom-button" onClick={() => setZoomLevel(zoomLevel > 100 ? 100 : 240)} aria-pressed={zoomLevel > 100}>{zoomLevel > 100 ? 'Reducir' : 'Ampliar'}</button></div></div></div>
        <div className={`page-stage ${zoomLevel > 100 ? 'expanded' : ''}`} tabIndex={zoomLevel > 100 ? 0 : undefined} role={zoomLevel > 100 ? 'region' : undefined} aria-label={zoomLevel > 100 ? `Carátula ampliada al ${zoomLevel}%; desplázate para recorrer la página` : undefined}><div className="paper" style={zoomLevel === 100 ? undefined : { width: `${4.6 * zoomLevel}px`, minWidth: `${4.6 * zoomLevel}px`, maxWidth: 'none' }} aria-busy={status === 'loading'}>{preview && <img src={preview} alt="Vista previa de tu carátula en formato A4" className={status !== 'ready' ? 'stale-preview' : ''}/>}<div className="paper-status" aria-live="polite">{status === 'loading' && <span><LoaderCircle className="spin" size={16}/>{preview ? 'Actualizando…' : 'Preparando tu página…'}</span>}{status === 'error' && <div className="preview-error"><Info size={24}/><strong>No se puede mostrar la vista previa</strong><p>{error}</p><button className="secondary-button" onClick={() => setRetry(n => n + 1)}>Volver a intentar</button></div>}</div></div></div>
        <div className="paper-caption"><span>A4 <span>210 × 297 mm</span></span><span>Calibri 11 <i/> Márgenes 2,54 cm</span></div>
        {error && status !== 'error' && <p className="download-error" role="alert">{error}</p>}
        <p className="privacy-note">Al guardar o descargar, tu carátula se conserva en este equipo.</p>
      </div></section>
    </main>
    <footer className="site-footer"><span>Hecho por Jean Marticornea</span><a href="mailto:duanner.marticorena@gmail.com">duanner.marticorena@gmail.com</a></footer>
    <History open={historyOpen} revision={historyRevision} onClose={() => setHistoryOpen(false)} onOpen={openSaved}/>
    {notice && <div className="toast" role="status"><Check size={17}/>{notice}<button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}
    <dialog ref={resetDialog} onCancel={() => setResetting(false)} className="reset-dialog"><h2>¿Comenzar una nueva carátula?</h2><p>Se borrarán los datos que has escrito en esta página.</p><div><button className="secondary-button" onClick={() => setResetting(false)}>Conservar datos</button><button className="primary-button" onClick={() => { setData(initial()); setResetting(false); }}>Empezar de nuevo</button></div></dialog>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

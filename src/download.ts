type Format = 'pdf' | 'docx';
type FileHandle = { createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> };
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle>;

// Open before any network await to retain the click's user activation.
export async function chooseDestination(title: string, format: Format) {
  const name = `${title.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 70) || 'caratula'}.${format}`;
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  const handle = picker ? await picker.call(window, { suggestedName: name, types: [{
    description: format === 'pdf' ? 'Documento PDF' : 'Documento Word',
    accept: { [format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']: [`.${format}`] },
  }] }) : null;
  return async (blob: Blob) => {
    if (handle) {
      const writable = await handle.createWritable();
      try { await writable.write(blob); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
      return 'Archivo guardado en la ubicación que elegiste.';
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Descarga iniciada. Este navegador no permite elegir carpeta desde la app; activa “Preguntar dónde guardar” en sus ajustes de descarga.';
  };
}

export function downloadCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

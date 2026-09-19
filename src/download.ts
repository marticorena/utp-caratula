type Format = 'pdf' | 'docx';

export async function chooseDestination(title: string, format: Format) {
  const name = `${title.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 70) || 'caratula'}.${format}`;
  return async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Descarga iniciada. Puedes abrir el archivo desde la lista de descargas del navegador.';
  };
}

export function downloadCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

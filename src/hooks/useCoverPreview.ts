import { useCallback, useEffect, useRef, useState } from 'react';
import { toStoredCover } from '../cover';
import type { CoverApi } from '../api';
import type { Cover, PreviewStatus } from '../types';

export interface CoverPreview {
  imageUrl: string;
  status: PreviewStatus;
  error: string;
  retry: () => void;
}

/** Generate a debounced preview and manage object URL ownership. */
export function useCoverPreview(api: CoverApi, cover: Cover): CoverPreview {
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<PreviewStatus>('loading');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const activeUrl = useRef('');
  const requestId = useRef(0);

  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setError('');

    const timer = window.setTimeout(async () => {
      try {
        const blob = await api.preview(toStoredCover(cover), controller.signal);
        if (controller.signal.aborted || currentRequest !== requestId.current) return;

        const nextUrl = URL.createObjectURL(blob);
        if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
        activeUrl.current = nextUrl;
        setImageUrl(nextUrl);
        setStatus('ready');
      } catch (cause) {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        setStatus('error');
        setError(previewErrorMessage(cause));
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, cover, revision]);

  useEffect(() => () => {
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
  }, []);

  return { imageUrl, status, error, retry };
}

function previewErrorMessage(cause: unknown): string {
  if (cause instanceof TypeError) {
    return 'No se pudo conectar con el generador. Comprueba que la API '
      + 'esté en ejecución y vuelve a intentar.';
  }
  return cause instanceof Error
    ? cause.message
    : 'No se pudo generar la vista previa.';
}

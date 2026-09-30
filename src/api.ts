import type {
  CoverFileFormat,
  HistoryEntry,
  HistoryPage,
  SavedCover,
  StoredCover,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Extract a stable, user-facing message from an API response. */
export async function apiError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  if (Array.isArray(body.detail)) {
    return 'Hay datos que no son válidos. Revisa la longitud de los campos y vuelve a intentar.';
  }
  return typeof body.detail === 'string'
    ? body.detail
    : 'No se pudo generar la carátula. Revisa los datos e inténtalo otra vez.';
}

/** Typed facade over the cover HTTP API. */
export class CoverApi {
  constructor(private readonly userId: string) {}

  async preview(data: StoredCover, signal?: AbortSignal): Promise<Blob> {
    return this.blob('/api/preview', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
      signal,
    });
  }

  async generate(data: StoredCover, format: CoverFileFormat): Promise<Blob> {
    return this.blob(`/api/${format}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    });
  }

  async create(data: StoredCover, signal?: AbortSignal): Promise<HistoryEntry> {
    return this.json('/api/covers', {
      method: 'POST',
      headers: this.userHeaders(true),
      body: JSON.stringify(data),
      signal,
    });
  }

  async update(
    coverId: string,
    data: StoredCover,
    signal?: AbortSignal,
  ): Promise<HistoryEntry> {
    return this.json(`/api/covers/${encodeURIComponent(coverId)}`, {
      method: 'PUT',
      headers: this.userHeaders(true),
      body: JSON.stringify(data),
      signal,
    });
  }

  async get(coverId: string, signal?: AbortSignal): Promise<SavedCover | null> {
    const response = await fetch(`/api/covers/${encodeURIComponent(coverId)}`, {
      headers: this.userHeaders(),
      signal,
      cache: 'no-store',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await apiError(response));
    return response.json() as Promise<SavedCover>;
  }

  async list(
    query: string,
    offset: number,
    signal?: AbortSignal,
  ): Promise<HistoryPage> {
    const search = new URLSearchParams({ q: query, offset: String(offset) });
    return this.json(`/api/covers?${search}`, {
      headers: this.userHeaders(),
      signal,
      cache: 'no-store',
    });
  }

  async delete(coverId: string): Promise<void> {
    const response = await fetch(`/api/covers/${encodeURIComponent(coverId)}`, {
      method: 'DELETE',
      headers: this.userHeaders(),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(await apiError(response));
    }
  }

  async savedFile(coverId: string, format: CoverFileFormat): Promise<Blob> {
    return this.blob(
      `/api/covers/${encodeURIComponent(coverId)}/${format}`,
      { headers: this.userHeaders(), cache: 'no-store' },
    );
  }

  private userHeaders(json = false): HeadersInit {
    return {
      ...(json ? JSON_HEADERS : {}),
      'X-User-Id': this.userId,
    };
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    if (!response.ok) throw new Error(await apiError(response));
    return response.json() as Promise<T>;
  }

  private async blob(path: string, init?: RequestInit): Promise<Blob> {
    const response = await fetch(path, init);
    if (!response.ok) throw new Error(await apiError(response));
    return response.blob();
  }
}

const USER_ID_KEY = 'utp-caratula-user-id';
const CURRENT_COVER_KEY = 'utp-caratula-current-cover-id';
const SETTINGS_KEY = 'utp-caratula-settings';

interface Settings {
  zoom?: number;
}

/** Read local storage without failing when browser storage is unavailable. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write local storage without making it a runtime requirement. */
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function getTemporaryUserId(): string {
  const saved = read(USER_ID_KEY);
  if (saved) return saved;

  const created = crypto.randomUUID();
  write(USER_ID_KEY, created);
  return created;
}

export function getCurrentCoverId(): string | null {
  return read(CURRENT_COVER_KEY);
}

export function saveCurrentCoverId(coverId: string): void {
  write(CURRENT_COVER_KEY, coverId);
}

export function getSavedZoom(): number {
  try {
    const settings = JSON.parse(read(SETTINGS_KEY) || '{}') as Settings;
    const value = Number(settings.zoom);
    return Number.isFinite(value)
      ? Math.min(240, Math.max(70, value))
      : 100;
  } catch {
    return 100;
  }
}

export function saveZoom(zoom: number): void {
  write(SETTINGS_KEY, JSON.stringify({ zoom } satisfies Settings));
}

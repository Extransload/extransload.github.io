import { normalizeGuestName } from './protocol';

const key = 'extransload-renju-name';
const clientKey = 'extransload-renju-client-id';
export function guestName(): string | null {
  try {
    return normalizeGuestName(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function saveGuestName(value: string): string | null {
  const name = normalizeGuestName(value);
  if (!name) return null;
  try {
    localStorage.setItem(key, name);
  } catch {
    /* Keep the name for this tab when storage is unavailable. */
  }
  return name;
}

export function guestClientId(): string {
  try {
    const saved = localStorage.getItem(clientKey);
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(clientKey, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

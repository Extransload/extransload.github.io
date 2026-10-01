import { normalizeGuestName } from './protocol';

const key = 'extransload-renju-name';
const clientKey = 'extransload-renju-client-id';
const adjectives = [
  'Bright',
  'Calm',
  'Curious',
  'Gentle',
  'Lucky',
  'Mellow',
  'Misty',
  'Nimble',
  'Quiet',
  'Sunny',
  'Swift',
  'Witty',
];
const animals = ['Badger', 'Bear', 'Crane', 'Deer', 'Fox', 'Hare', 'Heron', 'Otter', 'Owl', 'Panda', 'Robin', 'Seal'];

export function guestName(): string {
  try {
    const saved = localStorage.getItem(key);
    const normalized = normalizeGuestName(saved);
    if (normalized) return normalized;
    const random = crypto.getRandomValues(new Uint32Array(3));
    const name = `${adjectives[random[0] % adjectives.length]}${animals[random[1] % animals.length]}${random[2] % 100}`;
    localStorage.setItem(key, name);
    return name;
  } catch {
    return 'GuestFox';
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

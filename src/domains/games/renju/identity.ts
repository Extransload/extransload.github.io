const key = 'extransload-renju-name';
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
    if (saved && /^[A-Za-z][A-Za-z0-9 -]{2,29}$/.test(saved)) return saved;
    const random = crypto.getRandomValues(new Uint32Array(3));
    const name = `${adjectives[random[0] % adjectives.length]}${animals[random[1] % animals.length]}${random[2] % 100}`;
    localStorage.setItem(key, name);
    return name;
  } catch {
    return 'GuestFox';
  }
}

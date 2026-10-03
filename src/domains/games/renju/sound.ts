const STORAGE_KEY = 'omokmaru:sound';
const VOLUME_KEY = 'omokmaru:sound-volume';

export function normalizeSoundVolume(value: string | null) {
  const number = value === null ? 75 : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 75;
}

export function mountGameSound() {
  const button = document.querySelector<HTMLButtonElement>('#sound')!;
  const panel = document.querySelector<HTMLElement>('#sound-panel')!;
  const toggle = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
  const slider = document.querySelector<HTMLInputElement>('#sound-volume')!;
  const value = document.querySelector<HTMLOutputElement>('#sound-volume-value')!;
  let enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
  let volume = normalizeSoundVolume(localStorage.getItem(VOLUME_KEY));
  let context: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  const update = () => {
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-label', `효과음 설정 · ${enabled ? '켜짐' : '꺼짐'} · ${volume}%`);
    button.title = `효과음 설정 · ${volume}%`;
    button.textContent = '♫';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '효과음 켜짐' : '효과음 꺼짐';
    slider.value = String(volume);
    value.textContent = `${volume}%`;
  };
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) slider.focus();
  });
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    update();
  });
  slider.addEventListener('input', () => {
    volume = normalizeSoundVolume(slider.value);
    localStorage.setItem(VOLUME_KEY, String(volume));
    update();
  });
  slider.addEventListener('change', () => playStone());
  document.addEventListener('pointerdown', (event) => {
    if (panel.hidden || button.contains(event.target as Node) || panel.contains(event.target as Node)) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  });
  update();

  function playStone() {
    if (!enabled || volume === 0) return;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume();
      if (!noise) {
        noise = context.createBuffer(1, Math.round(context.sampleRate * 0.12), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.value = 1150;
      gain.gain.setValueAtTime((0.32 * volume) / 100, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.11);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start();
      source.stop(context.currentTime + 0.12);
    } catch {
      // Visual feedback still works when audio is unavailable.
    }
  }

  return { playStone };
}

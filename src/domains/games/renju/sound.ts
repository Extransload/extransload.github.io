const STORAGE_KEY = 'omokmaru:sound';

export function mountGameSound() {
  const button = document.querySelector<HTMLButtonElement>('#sound')!;
  let enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
  let context: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  const update = () => {
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? '효과음 끄기' : '효과음 켜기');
    button.title = enabled ? '효과음 끄기' : '효과음 켜기';
    button.textContent = '♫';
  };
  button.addEventListener('click', () => {
    enabled = !enabled;
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    update();
  });
  update();

  return {
    playStone() {
      if (!enabled) return;
      try {
        context ??= new AudioContext();
        if (context.state === 'suspended') void context.resume();
        if (!noise) {
          noise = context.createBuffer(1, Math.round(context.sampleRate * 0.09), context.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = noise;
        filter.type = 'lowpass';
        filter.frequency.value = 850;
        gain.gain.setValueAtTime(0.11, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.085);
        source.connect(filter).connect(gain).connect(context.destination);
        source.start();
        source.stop(context.currentTime + 0.09);
      } catch {
        // Visual feedback still works when audio is unavailable.
      }
    },
  };
}

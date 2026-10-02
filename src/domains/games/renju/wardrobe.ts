import { loadAppearance, saveAppearance, type Appearance } from './appearance';

export function mountWardrobe(onChange: (appearance: Appearance) => void) {
  let appearance = loadAppearance();
  const controls = document.querySelectorAll<HTMLSelectElement>('[data-wardrobe]');
  const previews = document.querySelectorAll<HTMLElement>('.wardrobe-preview');
  const updatePreviews = () => {
    for (const preview of previews) {
      preview.dataset.stone = appearance.stone;
      preview.dataset.avatar = appearance.avatar;
      preview.dataset.board = appearance.board;
    }
  };
  for (const control of controls) {
    const key = control.dataset.wardrobe as keyof Appearance;
    control.value = appearance[key];
    control.addEventListener('change', () => {
      appearance = { ...appearance, [key]: control.value };
      saveAppearance(appearance);
      for (const peer of controls) if (peer !== control && peer.dataset.wardrobe === key) peer.value = control.value;
      updatePreviews();
      onChange(appearance);
    });
  }
  updatePreviews();
  onChange(appearance);
  return () => appearance;
}

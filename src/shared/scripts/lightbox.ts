import { clampPan, fitScale, maxScaleFor, step, zoomAt, type Point, type Size, type Transform } from './lightbox-math';

const SMALL_IMAGE_EDGE = 80;
const SWIPE_DISTANCE = 60;
const EXCLUDED = 'a, button, [data-no-zoom], [aria-hidden="true"], dialog.image-lightbox';

/** An image opens in the lightbox unless it is decorative, tiny, or already a control. */
export function isZoomable(image: HTMLImageElement): boolean {
  if (!image.getAttribute('src')) return false;
  if (image.closest(EXCLUDED)) return false;
  const box = image.getBoundingClientRect();
  if (box.width < SMALL_IMAGE_EDGE && box.height < SMALL_IMAGE_EDGE) return false;
  return true;
}

/** Images that share the nearest [data-lightbox-group] ancestor, in document order. */
export function groupFor(image: HTMLImageElement): HTMLImageElement[] {
  const container = image.closest<HTMLElement>('[data-lightbox-group]');
  if (!container) return [image];
  const found = [...container.querySelectorAll<HTMLImageElement>('img')].filter(isZoomable);
  return found.includes(image) ? found : [image];
}

const sourceFor = (image: HTMLImageElement) => image.dataset.full || image.currentSrc || image.src;

function captionFor(image: HTMLImageElement): string {
  const figure = image.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
  if (figure) return figure;
  return image.getAttribute('alt')?.trim() ?? '';
}

export function initializeLightbox(root: ParentNode = document): void {
  const dialog = root.querySelector<HTMLDialogElement>('dialog.image-lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  if (dialog.dataset.ready === 'true') return;
  dialog.dataset.ready = 'true';

  const stage = dialog.querySelector<HTMLElement>('[data-lightbox-stage]')!;
  const view = dialog.querySelector<HTMLImageElement>('img.image-lightbox__img')!;
  const caption = dialog.querySelector<HTMLElement>('[data-lightbox-caption]')!;
  const counter = dialog.querySelector<HTMLElement>('[data-lightbox-counter]')!;
  const previous = dialog.querySelector<HTMLButtonElement>('[data-lightbox-prev]')!;
  const next = dialog.querySelector<HTMLButtonElement>('[data-lightbox-next]')!;

  let group: HTMLImageElement[] = [];
  let index = 0;
  let transform: Transform = { scale: 1, tx: 0, ty: 0 };
  let fitted: Size = { width: 0, height: 0 };
  let max = 3;
  let restoreFocus: HTMLElement | null = null;
  const pointers = new Map<number, Point>();
  let pinchDistance = 0;
  let dragFrom: Point | null = null;
  let swipeFrom: Point | null = null;
  let dragged = 0;

  const stageSize = (): Size => {
    const box = stage.getBoundingClientRect();
    return { width: box.width, height: box.height };
  };

  const draw = () => {
    view.style.transform = `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`;
    stage.dataset.zoomed = transform.scale > 1 ? 'true' : 'false';
  };

  const settle = () => {
    transform = clampPan(transform, fitted, stageSize());
    draw();
  };

  const measure = () => {
    const natural = { width: view.naturalWidth, height: view.naturalHeight };
    const size = stageSize();
    const fit = fitScale(natural, size);
    fitted = { width: natural.width * fit, height: natural.height * fit };
    max = maxScaleFor(fit);
    view.style.width = `${fitted.width}px`;
    view.style.height = `${fitted.height}px`;
  };

  const reset = () => {
    transform = { scale: 1, tx: 0, ty: 0 };
    draw();
  };

  const show = (position: number) => {
    index = position;
    const image = group[index];
    const source = sourceFor(image);
    dialog.dataset.error = 'false';
    view.src = source;
    view.alt = image.getAttribute('alt')?.trim() || '';

    const text = captionFor(image);
    caption.textContent = text;
    caption.hidden = text === '';

    const many = group.length > 1;
    counter.textContent = many ? `${index + 1} / ${group.length}` : '';
    counter.hidden = !many;
    previous.hidden = !many;
    next.hidden = !many;
    previous.disabled = index === 0;
    next.disabled = index === group.length - 1;
    reset();
  };

  const go = (delta: -1 | 1) => {
    const position = step(index, delta, group.length);
    if (position !== index) show(position);
  };

  const zoom = (factor: number, point: Point = { x: 0, y: 0 }) => {
    transform = zoomAt(transform, factor, point, max);
    settle();
  };

  const pointIn = (event: { clientX: number; clientY: number }): Point => {
    const box = stage.getBoundingClientRect();
    return { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
  };

  const close = () => {
    dialog.close();
  };

  const open = (image: HTMLImageElement) => {
    group = groupFor(image);
    restoreFocus = document.activeElement as HTMLElement | null;
    show(Math.max(0, group.indexOf(image)));
    dialog.showModal();
    document.body.classList.add('lightbox-open');
    dialog.querySelector<HTMLButtonElement>('[data-lightbox-close]')?.focus();
  };

  view.addEventListener('load', () => {
    measure();
    reset();
  });

  view.addEventListener('error', () => {
    dialog.dataset.error = 'true';
  });

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const image = (event.target as HTMLElement | null)?.closest?.('img');
    if (!(image instanceof HTMLImageElement) || !isZoomable(image)) return;
    event.preventDefault();
    open(image);
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  // 스테이지는 그리드 칸을 가득 채우므로 이미지 바깥의 어두운 영역도 스테이지다.
  // 끌지 않은 단일 클릭만 닫기로 본다. 더블클릭 확대의 첫 클릭까지 닫지 않도록
  // detail 로 걸러내고, 두 번째 클릭이 올 여지를 한 박자 기다린다.
  let closeOnClick: number | undefined;
  stage.addEventListener('click', (event) => {
    window.clearTimeout(closeOnClick);
    if (event.target !== stage || dragged >= 4 || event.detail > 1) return;
    closeOnClick = window.setTimeout(close, 250);
  });

  stage.addEventListener('dblclick', () => window.clearTimeout(closeOnClick));

  dialog.addEventListener('close', () => {
    pointers.clear();
    pinchDistance = 0;
    document.body.classList.remove('lightbox-open');
    view.removeAttribute('src');
    restoreFocus?.focus?.();
    restoreFocus = null;
  });

  dialog.querySelector('[data-lightbox-close]')?.addEventListener('click', close);
  previous.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  dialog.querySelector('[data-lightbox-zoom-in]')?.addEventListener('click', () => zoom(1.25));
  dialog.querySelector('[data-lightbox-zoom-out]')?.addEventListener('click', () => zoom(1 / 1.25));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === '0') reset();
    else return;
    event.preventDefault();
  });

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom(1.1 ** (-event.deltaY / 100), pointIn(event));
    },
    { passive: false },
  );

  stage.addEventListener('dblclick', (event) => {
    event.preventDefault();
    if (transform.scale > 1) reset();
    else zoom(2.5, pointIn(event));
  });

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      dragFrom = null;
      swipeFrom = null;
      dragged = 0;
    } else {
      dragFrom = { x: event.clientX, y: event.clientY };
      swipeFrom = { x: event.clientX, y: event.clientY };
      dragged = 0;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0) {
        const centre = pointIn({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        zoom(distance / pinchDistance, centre);
      }
      pinchDistance = distance;
      return;
    }

    if (!dragFrom) return;
    const dx = event.clientX - dragFrom.x;
    const dy = event.clientY - dragFrom.y;
    dragged += Math.abs(dx) + Math.abs(dy);
    dragFrom = { x: event.clientX, y: event.clientY };
    if (transform.scale > 1) {
      transform = { ...transform, tx: transform.tx + dx, ty: transform.ty + dy };
      settle();
    }
  });

  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (transform.scale === 1 && swipeFrom && dragged > SWIPE_DISTANCE && group.length > 1) {
      // A horizontal drag at the fitted size moves through the group.
      const dx = event.clientX - swipeFrom.x;
      if (Math.abs(dx) > SWIPE_DISTANCE) go(dx < 0 ? 1 : -1);
    }
    dragFrom = null;
    swipeFrom = null;
    dragged = 0;
  };

  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  window.addEventListener('resize', () => {
    if (!dialog.open) return;
    measure();
    settle();
  });

  const mark = (scope: ParentNode) => {
    for (const image of scope.querySelectorAll<HTMLImageElement>('img')) {
      if (isZoomable(image)) image.dataset.zoomable = 'true';
      else delete image.dataset.zoomable;
    }
  };

  mark(document);
  window.addEventListener('load', () => mark(document));
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLImageElement) mark(node.parentNode ?? document);
        else if (node instanceof HTMLElement) mark(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

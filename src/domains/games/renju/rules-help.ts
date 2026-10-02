type Stone = [number, number, 'black' | 'white'];
type Slide = {
  tag: string;
  title: string;
  body: string;
  alt: string;
  stones: Stone[];
  candidate?: [number, number, 'forbidden' | 'allowed'];
  future?: [number, number];
  paths: [number, number, number, number, 'gold' | 'red' | 'red-dashed' | 'muted'][];
};
const black = (xs: number[], y: number): Stone[] => xs.map((x) => [x, y, 'black']);
const slides: Slide[] = [
  {
    tag: '승리',
    title: '다섯 개를 잇기',
    body: '흑은 정확히 5개, 백은 5개 이상이면 승리합니다. 금수는 흑에게만 적용하며, 정확한 5목은 승리가 우선합니다.',
    alt: '흑돌 다섯 개와 백돌 여섯 개가 각각 한 줄로 이어진 그림',
    stones: [...black([2, 3, 4, 5, 6], 2), ...[1, 2, 3, 4, 5, 6].map((x) => [x, 6, 'white'] as Stone)],
    paths: [
      [2, 2, 6, 2, 'gold'],
      [1, 6, 6, 6, 'gold'],
    ],
  },
  {
    tag: '흑 금수',
    title: '장목 · 여섯 개 이상',
    body: '흑이 붉은 자리에 두면 여섯 개가 이어집니다. 정확한 5목이 없는 이 수는 장목 금수입니다.',
    alt: '붉은 교차점을 채우면 여섯 개가 연속되는 그림',
    stones: black([1, 2, 3, 4, 6], 4),
    candidate: [5, 4, 'forbidden'],
    paths: [[1, 4, 6, 4, 'red']],
  },
  {
    tag: '흑 금수',
    title: '4·4 · 네 개가 두 방향',
    body: '붉은 자리에 흑돌을 두면 네 개짜리 줄이 가로와 세로에 동시에 생깁니다.',
    alt: '붉은 교차점에 놓으면 가로와 세로에 네 개짜리 흑돌 줄이 생기는 그림',
    stones: [
      [2, 4, 'black'],
      [3, 4, 'black'],
      [5, 4, 'black'],
      [4, 2, 'black'],
      [4, 3, 'black'],
      [4, 5, 'black'],
    ],
    candidate: [4, 4, 'forbidden'],
    paths: [
      [2, 4, 5, 4, 'red'],
      [4, 2, 4, 5, 'red'],
    ],
  },
  {
    tag: '흑 금수',
    title: '3·3 · 띈 3도 포함',
    body: '붉은 자리에 두면 가로의 띈 3과 세로의 3이 만납니다. 빈 칸을 채워 열린 4가 되는 띈 3도 포함됩니다.',
    alt: '가로의 띈 3과 세로의 열린 3이 붉은 수에서 만나는 그림',
    stones: [
      [2, 4, 'black'],
      [3, 4, 'black'],
      [5, 3, 'black'],
      [5, 5, 'black'],
    ],
    candidate: [5, 4, 'forbidden'],
    future: [4, 4],
    paths: [
      [2, 4, 5, 4, 'red-dashed'],
      [5, 3, 5, 5, 'red'],
    ],
  },
  {
    tag: '허용',
    title: '겉보기 3·3은 허용',
    body: '황동색 자리에 두어도 가로줄은 백돌에 막혀 열린 4로 이어지지 않습니다. 한 방향만 3이므로 3·3 금수가 아닙니다.',
    alt: '가로 양쪽이 백돌에 막혀 한쪽만 열린 3으로 인정되는 그림',
    stones: [
      [3, 4, 'black'],
      [5, 4, 'black'],
      [4, 3, 'black'],
      [4, 5, 'black'],
      [1, 4, 'white'],
      [7, 4, 'white'],
    ],
    candidate: [4, 4, 'allowed'],
    paths: [
      [3, 4, 5, 4, 'muted'],
      [4, 3, 4, 5, 'gold'],
    ],
  },
  {
    tag: '허용',
    title: '띈 4와 3은 쌍삼이 아님',
    body: '가로 OXOOO는 빈 칸 하나를 채우면 5목이 되는 띈 4입니다. 세로의 3과 만나도 3·3 금수가 아닙니다.',
    alt: '가로 띈 4와 세로 열린 3이 만나는 자리에 흑돌을 놓아도 허용되는 그림',
    stones: [
      [4, 3, 'black'],
      [1, 4, 'black'],
      [3, 4, 'black'],
      [5, 4, 'black'],
      [4, 5, 'black'],
    ],
    candidate: [4, 4, 'allowed'],
    paths: [
      [1, 4, 5, 4, 'gold'],
      [4, 3, 4, 5, 'gold'],
    ],
  },
];
function diagram(slide: Slide) {
  const point = (x: number, y: number) => [36 + x * 33, 36 + y * 33];
  const grid = Array.from({ length: 9 }, (_, i) => {
    const [v] = point(i, 0),
      [, h] = point(0, i);
    return `<path d="M${v} 36V300M36 ${h}H300" stroke="#c3ad81" stroke-width="1" opacity=".58"/>`;
  }).join('');
  const paths = slide.paths
    .map(([x1, y1, x2, y2, type]) => {
      const [sx, sy] = point(x1, y1),
        [ex, ey] = point(x2, y2);
      const color = type === 'gold' ? '#b99452' : type === 'muted' ? '#9da69f' : '#ca655c';
      return `<path d="M${sx} ${sy}L${ex} ${ey}" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity=".25" ${type === 'red-dashed' ? 'stroke-dasharray="15 9"' : ''}/>`;
    })
    .join('');
  const stones = slide.stones
    .map(([x, y, color]) => {
      const [cx, cy] = point(x, y);
      return `<circle cx="${cx}" cy="${cy}" r="12.2" fill="${color === 'black' ? 'url(#black)' : 'url(#white)'}" stroke="${color === 'black' ? '#334655' : '#bdad8c'}" stroke-width="1.5"/>`;
    })
    .join('');
  const future = slide.future
    ? `<circle cx="${point(...slide.future)[0]}" cy="${point(...slide.future)[1]}" r="14" fill="none" stroke="#b99452" stroke-width="2" stroke-dasharray="4 4"/>`
    : '';
  const candidate = slide.candidate
    ? (() => {
        const [cx, cy] = point(slide.candidate![0], slide.candidate![1]);
        const color = slide.candidate![2] === 'allowed' ? '#b99452' : '#c85b55';
        return `<circle cx="${cx}" cy="${cy}" r="17" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="9" fill="#112535" fill-opacity=".48"/>`;
      })()
    : '';
  return `<svg viewBox="0 0 336 336" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="black"><stop stop-color="#506471"/><stop offset="1" stop-color="#07121e"/></radialGradient><radialGradient id="white"><stop stop-color="#fffdf4"/><stop offset="1" stop-color="#c4b392"/></radialGradient></defs><rect x="8" y="8" width="320" height="320" rx="18" fill="#f4eedf"/><rect x="20" y="20" width="296" height="296" rx="7" fill="#faf6eb" stroke="#d3bf98"/>${grid}${paths}${stones}${future}${candidate}</svg>`;
}
export function mountRulesHelp() {
  const dialog = document.querySelector<HTMLDialogElement>('#rules-dialog')!;
  let current = 0;
  function show(index: number) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    const slide = slides[current];
    document.querySelector('#rules-count')!.textContent = `${current + 1} / ${slides.length}`;
    document.querySelector('#rules-tag')!.textContent = slide.tag;
    document.querySelector('#rules-tag')!.classList.toggle('allowed', slide.tag === '허용');
    document.querySelector('#rules-slide-title')!.textContent = slide.title;
    document.querySelector('#rules-slide-body')!.textContent = slide.body;
    const visual = document.querySelector<HTMLElement>('#rules-visual')!;
    visual.innerHTML = diagram(slide);
    visual.setAttribute('aria-label', slide.alt);
    document.querySelector('#rules-dots')!.innerHTML = slides
      .map((_, i) => `<span class="${i === current ? 'active' : ''}"></span>`)
      .join('');
    (document.querySelector('#rules-prev') as HTMLButtonElement).disabled = current === 0;
    (document.querySelector('#rules-next') as HTMLButtonElement).disabled = current === slides.length - 1;
  }
  document.querySelector('#rules')!.addEventListener('click', () => {
    show(0);
    dialog.showModal();
  });
  document.querySelector('#rules-close')!.addEventListener('click', () => dialog.close());
  document.querySelector('#rules-prev')!.addEventListener('click', () => show(current - 1));
  document.querySelector('#rules-next')!.addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
}

import type { Point } from './rules';
import { RenjuBoard, coordinate } from './board-3d';

export function mountMoveConfirm(board: RenjuBoard, confirm: (point: Point) => void) {
  const panel = document.querySelector<HTMLElement>('#move-confirm')!;
  const button = document.querySelector<HTMLButtonElement>('#place-move')!;
  const label = document.querySelector<HTMLElement>('#place-label')!;
  const cancel = document.querySelector<HTMLButtonElement>('#cancel-move')!;
  let available = false;

  const update = () => {
    const point = board.selectedPoint;
    panel.hidden = !available || !point;
    button.disabled = !available || !point;
    label.textContent = point ? `${coordinate(point.x, point.y)} 착수` : '자리 선택';
    cancel.hidden = !point;
  };
  board.onSelectionChange = update;
  board.onImmediateMove = (point) => {
    if (available) confirm(point);
  };
  button.addEventListener('click', () => {
    if (!available) return;
    const point = board.takeSelection();
    if (point) confirm(point);
  });
  cancel.addEventListener('click', () => board.clearSelection());
  update();
  return {
    setAvailable(value: boolean, color: 'black' | 'white') {
      available = value;
      panel.dataset.color = color;
      if (!value) board.clearSelection();
      update();
    },
  };
}

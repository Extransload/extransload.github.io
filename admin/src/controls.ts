import { calendarDate } from './rolling';

function openPicker(trigger: HTMLButtonElement, title: string) {
  const dialog = document.createElement('dialog');
  dialog.className = 'control-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', title);
  const compact = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 600px)').matches;
  let dismiss: ((event: PointerEvent) => void) | undefined;
  const close = () => {
    if (dismiss) document.removeEventListener('pointerdown', dismiss, true);
    dialog.close?.();
    dialog.remove();
    trigger.focus();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  document.body.append(dialog);
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
  if (!compact) {
    dialog.classList.add('control-dialog--popover');
    dismiss = (event: PointerEvent) => {
      if (!dialog.contains(event.target as Node) && !trigger.contains(event.target as Node)) close();
    };
    window.setTimeout(() => document.addEventListener('pointerdown', dismiss!, true));
  }
  const place = () => {
    if (compact) return;
    const source = trigger.getBoundingClientRect();
    const target = dialog.getBoundingClientRect();
    dialog.style.left = `${Math.max(16, Math.min(source.left, innerWidth - target.width - 16))}px`;
    dialog.style.top = `${Math.min(source.bottom + 8, innerHeight - target.height - 16)}px`;
  };
  return { dialog, close, place };
}

export function enhanceControls(root: ParentNode) {
  root.querySelectorAll<HTMLSelectElement>('select:not([data-enhanced])').forEach((select) => {
    select.dataset.enhanced = 'true';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'control-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    const sync = () => {
      trigger.innerHTML = `<span>${select.selectedOptions[0]?.textContent ?? '선택'}</span><svg class="control-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 6 4 4 4-4"/></svg>`;
    };
    select.hidden = true;
    select.after(trigger);
    sync();
    select.addEventListener('change', sync);
    trigger.onclick = () => {
      const { dialog, close, place } = openPicker(trigger, '옵션 선택');
      const heading = document.createElement('h3');
      heading.textContent = '옵션 선택';
      dialog.append(heading);
      for (const option of Array.from(select.options)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.value = option.value;
        button.textContent = option.textContent;
        button.className = 'picker-option';
        button.disabled = option.disabled;
        button.setAttribute('aria-pressed', String(option.selected));
        button.onclick = () => {
          select.value = option.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync();
          close();
        };
        dialog.append(button);
      }
      const cancel = document.createElement('button');
      cancel.textContent = '닫기';
      cancel.onclick = close;
      dialog.append(cancel);
      place();
      dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    };
  });
  root.querySelectorAll<HTMLInputElement>('input[type="date"]:not([data-enhanced])').forEach((input) => {
    input.dataset.enhanced = 'true';
    input.type = 'text';
    input.pattern = '\\d{4}-\\d{2}-\\d{2}';
    input.placeholder = 'YYYY-MM-DD';
    input.setAttribute(
      'aria-label',
      input.name === 'pubDate' ? '발행일' : input.id === 'period-start' ? '시작일' : '종료일',
    );
    const wrapper = document.createElement('span');
    wrapper.className = 'date-control';
    input.before(wrapper);
    wrapper.append(input);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.innerHTML =
      '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m3 0h2"/></svg>';
    trigger.className = 'calendar-trigger';
    trigger.setAttribute('aria-label', `${input.getAttribute('aria-label')} 달력 열기`);
    wrapper.append(trigger);
    trigger.onclick = () => {
      const parsed = new Date(`${input.value}T12:00:00`);
      let month = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      month = new Date(month.getFullYear(), month.getMonth(), 1);
      const { dialog, close, place } = openPicker(trigger, '날짜 선택');
      const draw = () => {
        dialog.innerHTML =
          '<div class="calendar-heading"><button type="button" aria-label="이전 달">‹</button><strong></strong><button type="button" aria-label="다음 달">›</button></div><div class="calendar-grid"></div><button type="button" class="calendar-close">닫기</button>';
        dialog.querySelector('strong')!.textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
        const nav = dialog.querySelectorAll<HTMLButtonElement>('.calendar-heading button');
        nav[0].onclick = () => {
          month.setMonth(month.getMonth() - 1);
          draw();
          navFocus(0);
        };
        nav[1].onclick = () => {
          month.setMonth(month.getMonth() + 1);
          draw();
          navFocus(1);
        };
        const grid = dialog.querySelector('.calendar-grid')!;
        for (const day of ['일', '월', '화', '수', '목', '금', '토']) {
          const label = document.createElement('span');
          label.textContent = day;
          grid.append(label);
        }
        for (let i = 0; i < month.getDay(); i++) grid.append(document.createElement('span'));
        const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= count; day++) {
          const value = calendarDate(new Date(month.getFullYear(), month.getMonth(), day));
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = String(day);
          button.dataset.date = value;
          button.setAttribute('aria-label', value);
          button.setAttribute('aria-pressed', String(value === input.value));
          if (value === calendarDate(new Date())) button.setAttribute('aria-current', 'date');
          button.onclick = () => {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            close();
          };
          grid.append(button);
        }
        dialog.querySelector<HTMLButtonElement>('.calendar-close')!.onclick = close;
      };
      const navFocus = (index: number) =>
        dialog.querySelectorAll<HTMLButtonElement>('.calendar-heading button')[index].focus();
      draw();
      place();
      dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    };
  });
}

export type HudStats = { flowsDone: number; flowsTotal: number; fillPct: number };

export type HudHandle = { update(stats: HudStats, elapsedMs: number, hint: boolean): void };

/** mm:ss (minutes keep growing past 59; at least two digits). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
}

export function createHud(el: HTMLElement): HudHandle {
  const wrap = document.createElement('div');
  wrap.className = 'hud-wrap';

  const row = document.createElement('div');
  row.className = 'hud num';

  const stat = (label: string) => {
    const item = document.createElement('span');
    item.className = 'hud__item';
    const value = document.createElement('b');
    value.className = 'hud__value';
    if (label) {
      const l = document.createElement('span');
      l.className = 'hud__label';
      l.textContent = label + ' ';
      item.append(l);
    }
    item.append(value);
    return { item, value };
  };
  const sep = () => {
    const s = document.createElement('span');
    s.className = 'hud__sep';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ' · ';
    return s;
  };

  const flows = stat('Flows');
  const fill = stat('Fill');
  const time = stat('');
  time.item.classList.add('hud__time');
  time.item.setAttribute('aria-label', 'Time');
  row.append(flows.item, sep(), fill.item, sep(), time.item);

  const hintEl = document.createElement('p');
  hintEl.className = 'hud__hint';
  hintEl.textContent = 'All connected — fill every cell!';
  hintEl.hidden = true;

  wrap.append(row, hintEl);
  el.append(wrap);

  const set = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    update(s, elapsedMs, hint) {
      set(flows.value, `${s.flowsDone}/${s.flowsTotal}`);
      set(fill.value, `${s.fillPct}%`);
      set(time.value, formatClock(elapsedMs));
      if (hintEl.hidden === hint) hintEl.hidden = !hint;
    },
  };
}

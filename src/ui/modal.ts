export type ModalOptions = {
  title: string;
  body: Node[];
  /** Element to refocus on close. */
  returnFocus: HTMLElement | null;
  onClose?: () => void;
  /** Buttons in place of the single "Got it"; each closes the modal, then runs. The first gets focus. */
  actions?: ModalAction[];
};

export type ModalAction = { label: string; action?: string; primary?: boolean; run?: () => void };

export type ModalHandle = { close(): void };

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

let current: ModalHandle | null = null;
let count = 0;

/** True while a modal is showing (global shortcuts should stand down). */
export function isModalOpen(): boolean {
  return current !== null;
}

/**
 * Shared dialog shell: title + ✕, the caller's body, a full-width "Got it" (or the caller's `actions`).
 * Esc, ✕, any button or the backdrop close it; focus is trapped inside and returns to `returnFocus`.
 * Only one is open at a time: opening another closes the current one.
 */
export function openModal(opts: ModalOptions): ModalHandle {
  current?.close();

  const titleId = `modal-title-${++count}`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn modal__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';

  const title = document.createElement('h2');
  title.id = titleId;
  title.className = 'modal__title';
  title.textContent = opts.title;

  const head = document.createElement('div');
  head.className = 'modal__head';
  head.append(title, closeBtn);

  const buttons = (opts.actions ?? [{ label: 'Got it', primary: true }]).map(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.primary ? 'btn btn--primary' : 'btn';
    b.textContent = a.label;
    if (a.action) b.dataset.action = a.action;
    b.addEventListener('click', () => {
      close();
      a.run?.();
    });
    return b;
  });
  let foot: HTMLElement;
  if (opts.actions) {
    foot = document.createElement('div');
    foot.className = 'modal__actions';
    foot.append(...buttons);
  } else {
    foot = buttons[0];
    foot.classList.add('modal__done');
  }

  const dialog = document.createElement('div');
  dialog.className = 'modal__panel glass';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.append(head, ...opts.body, foot);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal';
  backdrop.append(dialog);
  document.body.append(backdrop);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (current === handle) current = null;
    opts.returnFocus?.focus();
    opts.onClose?.();
  }
  const handle: ModalHandle = { close };
  current = handle;

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const a = document.activeElement;
      if (!dialog.contains(a)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && a === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });
  buttons[0].focus({ preventScroll: true });
  return handle;
}

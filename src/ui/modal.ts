export type ModalOptions = {
  title: string;
  body: Node[];
  /** Element to refocus on close. */
  returnFocus: HTMLElement | null;
  onClose?: () => void;
};

export type ModalHandle = { close(): void };

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

let current: ModalHandle | null = null;
let count = 0;

/** True while a modal is showing (global shortcuts should stand down). */
export function isModalOpen(): boolean {
  return current !== null;
}

/**
 * Shared dialog shell: title + ✕, the caller's body, a full-width "Got it".
 * Esc, ✕, "Got it" or the backdrop close it; focus is trapped inside and returns to `returnFocus`.
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

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary modal__done';
  done.textContent = 'Got it';

  const dialog = document.createElement('div');
  dialog.className = 'modal__panel glass';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.append(head, ...opts.body, done);

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
  done.addEventListener('click', close);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });
  done.focus({ preventScroll: true });
  return handle;
}

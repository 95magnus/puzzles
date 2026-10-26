import { openModal } from './modal';

export type ConfirmText = { title: string; message: string };

/** Wording shared by every game's Clear (undoable) and Restart (starts the board over). */
export const CLEAR_CONFIRM: ConfirmText = {
  title: 'Clear the board?',
  message: 'Everything you placed is removed. Undo brings it back.',
};
export const RESTART_CONFIRM: ConfirmText = {
  title: 'Restart this board?',
  message: 'Your progress is lost and the board starts over.',
};

/**
 * Cancel / confirm dialog on the shared modal. Cancel is focused, so Enter or Esc never destroys
 * anything by accident; `onConfirm` runs only from the confirm button.
 */
export function confirmDialog(opts: ConfirmText & { confirmLabel: string; returnFocus: HTMLElement | null; onConfirm: () => void }): void {
  const p = document.createElement('p');
  p.className = 'text-2';
  p.textContent = opts.message;
  openModal({
    title: opts.title,
    body: [p],
    returnFocus: opts.returnFocus,
    actions: [
      { label: 'Cancel', action: 'cancel' },
      { label: opts.confirmLabel, action: 'confirm', primary: true, run: opts.onConfirm },
    ],
  });
}

// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { CLEAR_CONFIRM, confirmDialog } from '../../src/ui/confirm';

const button = (action: string) => document.querySelector<HTMLButtonElement>(`.modal [data-action="${action}"]`)!;

function open(onConfirm = vi.fn()) {
  const opener = document.createElement('button');
  document.body.append(opener);
  confirmDialog({ ...CLEAR_CONFIRM, confirmLabel: 'Clear', returnFocus: opener, onConfirm });
  return { onConfirm, opener };
}

afterEach(() => {
  document.body.textContent = '';
});

test('shows the title, message and both buttons', () => {
  open();
  expect(document.querySelector('.modal')?.textContent).toContain('Clear the board?');
  expect(document.querySelector('.modal')?.textContent).toContain('Undo brings it back.');
  expect(button('cancel').textContent).toBe('Cancel');
  expect(button('confirm').textContent).toBe('Clear');
});

test('focuses Cancel, so Enter never destroys anything by accident', () => {
  open();
  expect(document.activeElement).toBe(button('cancel'));
});

test('Cancel closes without confirming and returns focus', () => {
  const { onConfirm, opener } = open();
  button('cancel').click();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(document.querySelector('.modal')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test('the confirm button runs onConfirm once and closes', () => {
  const { onConfirm } = open();
  button('confirm').click();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.modal')).toBeNull();
});

test('Escape cancels', () => {
  const { onConfirm } = open();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(document.querySelector('.modal')).toBeNull();
});

/**
 * Umami custom events. The tracker script in each page's <head> only reports on the
 * deployed domain, and may be blocked; then every call here is a no-op.
 */
type Props = Record<string, string | number>;

export function track(event: string, data?: Props): void {
  try {
    (window as { umami?: { track(event: string, data?: Props): void } }).umami?.track(event, data);
  } catch {
    /* analytics must never break a game */
  }
}

/** Controls counted on `puzzle_end`: they change the board in place (Restart and New board start a new one). */
export const COUNTED_ACTIONS = ['undo', 'clear'] as const;

export type PlayTracker = {
  /** A board (fresh or restored) is on screen; `props` describe it, e.g. mode and size. Resets the counts. */
  begin(props: Props): void;
  /** The player changed the board. The first change after begin() reports `puzzle_start`; every one counts a move. */
  move(): void;
  /** A control ran; counted when it is one of the tracker's `counted` names. */
  action(name: string): void;
  /** The board was won or lost; reports `puzzle_end` with the counts, once per begin(). */
  end(result: 'won' | 'lost', elapsedMs: number): void;
};

export function createPlayTracker(game: string, counted: readonly string[] = []): PlayTracker {
  let props: Props | null = null;
  let started = false;
  let moves = 0;
  let counts: Record<string, number> = {};
  return {
    begin(p) {
      props = { game, ...p };
      started = false;
      moves = 0;
      counts = Object.fromEntries(counted.map((a) => [a, 0]));
    },
    move() {
      if (!props) return;
      moves++;
      if (started) return;
      started = true;
      track('puzzle_start', props);
    },
    action(name) {
      if (props && name in counts) counts[name]++;
    },
    end(result, elapsedMs) {
      if (!props) return;
      track('puzzle_end', { ...props, result, seconds: Math.round(elapsedMs / 1000), moves, ...counts });
      props = null;
    },
  };
}

const MAX_ERRORS = 3;
let errorsInstalled = false;
const errorsSent = new Set<string>();
/** Errors from before the async tracker script loaded; sent on the window's load. */
let errorsPending: Props[] = [];

/**
 * Reports uncaught errors and unhandled rejections as `error` events: each distinct message once,
 * at most three per page. Cross-origin errors arrive as a bare "Script error." and are skipped.
 * Errors raised before the tracker script has loaded wait for the window's load event.
 */
export function trackErrors(page: string): void {
  if (errorsInstalled) return;
  errorsInstalled = true;
  const send = (raw: string, where: string) => {
    const message = raw.trim().slice(0, 120);
    if (!message || message === 'Script error.' || errorsSent.has(message) || errorsSent.size >= MAX_ERRORS) return;
    errorsSent.add(message);
    if ((window as { umami?: unknown }).umami) track('error', { page, message, where });
    else errorsPending.push({ page, message, where });
  };
  window.addEventListener('load', () => {
    for (const data of errorsPending) track('error', data);
    errorsPending = [];
  });
  window.addEventListener('error', (e) => {
    send(e.message ?? '', e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : '');
  });
  window.addEventListener('unhandledrejection', (e) => {
    send(e.reason instanceof Error ? e.reason.message : String(e.reason), '');
  });
}

/** Tests only. */
export function resetErrorsForTest(): void {
  errorsSent.clear();
  errorsPending = [];
}

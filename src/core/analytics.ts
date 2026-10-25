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

export type PlayTracker = {
  /** A board (fresh or restored) is on screen; `props` describe it, e.g. mode and size. */
  begin(props: Props): void;
  /** The player changed the board. The first change after begin() reports `puzzle_start`. */
  move(): void;
  /** The board was won or lost; reports `puzzle_end` once per begin(). */
  end(result: 'won' | 'lost', elapsedMs: number): void;
};

export function createPlayTracker(game: string): PlayTracker {
  let props: Props | null = null;
  let started = false;
  return {
    begin(p) {
      props = { game, ...p };
      started = false;
    },
    move() {
      if (!props || started) return;
      started = true;
      track('puzzle_start', props);
    },
    end(result, elapsedMs) {
      if (!props) return;
      track('puzzle_end', { ...props, result, seconds: Math.round(elapsedMs / 1000) });
      props = null;
    },
  };
}

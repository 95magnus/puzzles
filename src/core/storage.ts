/** Flow's own flags keep their original names; every other game uses `<id>-howto-seen`. */
type FlagName = 'howto-seen' | 'colorblind' | `${string}-howto-seen`;

/**
 * Today's daily save under one localStorage key, stored as `{ v: 1, ...save }`. `parse` gets a
 * stored object already checked for v 1 and the asked date, and does the game's own shape check.
 * Unavailable storage reads as no save, and saving to it does nothing.
 */
export function dailyStore<T extends { v: 1; date: string }>(key: string, parse: (o: T) => T | null) {
  return {
    load(date: string): T | null {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const o = JSON.parse(raw) as T | null;
        if (typeof o !== 'object' || o === null) return null;
        if (o.v !== 1 || typeof o.date !== 'string' || o.date !== date) return null;
        return parse(o);
      } catch {
        return null;
      }
    },
    save(save: Omit<T, 'v'>): void {
      try {
        localStorage.setItem(key, JSON.stringify({ v: 1, ...save }));
      } catch {
        /* storage unavailable */
      }
    },
  };
}

/** The last practice preset under one localStorage key; a value not in `ids` reads as none. */
export function presetStore<P extends string>(key: string, ids: readonly P[]) {
  return {
    get(): P | null {
      try {
        const v = localStorage.getItem(key);
        return v !== null && (ids as readonly string[]).includes(v) ? (v as P) : null;
      } catch {
        return null;
      }
    },
    set(id: P): void {
      try {
        localStorage.setItem(key, id);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

export function getFlag(name: FlagName): boolean {
  try {
    return localStorage.getItem('flow:flag:' + name) === '1';
  } catch {
    return false;
  }
}

export function setFlag(name: FlagName, value: boolean): void {
  try {
    localStorage.setItem('flow:flag:' + name, value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

/** A file of the built site, by its path relative to `dist/`. */
export type BuildFile = { name: string; content: string | Uint8Array };

/** Never precached: the service worker itself, and the link-preview image only crawlers fetch. */
const EXCLUDED = new Set(['sw.js', 'og.png']);

/**
 * The paths sw.js precaches, sorted, and a version that changes whenever any of them changes
 * (name or content), so every deploy that changes the site installs a new service worker.
 */
export async function precacheManifest(files: BuildFile[]): Promise<{ paths: string[]; version: string }> {
  const kept = files.filter((f) => !EXCLUDED.has(f.name)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const encoder = new TextEncoder();
  const parts = kept.flatMap((f) => [encoder.encode(f.name + '\0'), typeof f.content === 'string' ? encoder.encode(f.content) : f.content, encoder.encode('\0')]);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  const version = [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { paths: kept.map((f) => f.name), version };
}

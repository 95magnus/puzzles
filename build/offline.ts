import type { Plugin } from 'vite';

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

const REGISTER = "if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});";

/**
 * Builds src/sw/sw.ts into dist/sw.js with the build's precache list and version, and registers
 * it from every page. Build only: `npm run dev` and Vitest never get a service worker.
 */
export function offline(): Plugin {
  let root = '';
  let publicDir = '';
  return {
    name: 'puzzles-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },
    buildStart() {
      this.emitFile({ type: 'chunk', id: `${root}/src/sw/sw.ts`, fileName: 'sw.js' });
    },
    async generateBundle(_, bundle) {
      const chunk = bundle['sw.js'];
      if (chunk?.type !== 'chunk') this.error('sw.js was not built');
      if (chunk.imports.length || chunk.dynamicImports.length) {
        this.error('sw.js must not import shared chunks; keep src/sw/ self-contained');
      }
      const files: BuildFile[] = Object.values(bundle).map((f) => ({ name: f.fileName, content: f.type === 'chunk' ? f.code : f.source }));
      const walk = async (dir: string, prefix: string): Promise<void> => {
        for (const entry of await this.fs.readdir(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) await walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
          else if (entry.isFile()) files.push({ name: prefix + entry.name, content: await this.fs.readFile(`${dir}/${entry.name}`) });
        }
      };
      if (publicDir) await walk(publicDir, '');
      const { paths, version } = await precacheManifest(files);
      if (!chunk.code.includes('__PRECACHE__') || !chunk.code.includes('__VERSION__')) {
        this.error('sw.js lost its __PRECACHE__/__VERSION__ placeholders');
      }
      chunk.code = chunk.code.replaceAll('__PRECACHE__', JSON.stringify(paths)).replaceAll('__VERSION__', JSON.stringify(version));
    },
    transformIndexHtml() {
      return [{ tag: 'script', injectTo: 'head', children: REGISTER }];
    },
  };
}

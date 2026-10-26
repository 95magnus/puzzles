import { expect, test } from 'vitest';
import { precacheManifest, REGISTER_SCRIPT, type BuildFile } from '../../build/offline';

const files = (): BuildFile[] => [
  { name: 'flow.html', content: '<html>flow</html>' },
  { name: 'sw.js', content: 'self.x = 1;' },
  { name: 'assets/a.js', content: 'console.log(1);' },
  { name: 'og.png', content: new Uint8Array([1, 2, 3]) },
  { name: 'index.html', content: '<html>home</html>' },
];
const version = async (f: BuildFile[]) => (await precacheManifest(f)).version;

test('sorts paths and drops sw.js and og.png', async () => {
  expect((await precacheManifest(files())).paths).toEqual(['assets/a.js', 'flow.html', 'index.html']);
});

test('version is 12 hex chars', async () => {
  expect(await version(files())).toMatch(/^[0-9a-f]{12}$/);
});

test('version ignores input order', async () => {
  expect(await version(files().reverse())).toBe(await version(files()));
});

test('version changes when one file changes', async () => {
  const changed = files();
  changed[0] = { name: 'flow.html', content: '<html>flow v2</html>' };
  expect(await version(changed)).not.toBe(await version(files()));
});

test('version changes when a file is renamed', async () => {
  const renamed = files();
  renamed[2] = { name: 'assets/b.js', content: 'console.log(1);' };
  expect(await version(renamed)).not.toBe(await version(files()));
});

test('accepts binary content', async () => {
  const font = (byte: number): BuildFile[] => [...files(), { name: 'assets/inter.woff2', content: new Uint8Array([0, byte]) }];
  expect((await precacheManifest(font(1))).paths).toContain('assets/inter.woff2');
  expect(await version(font(1))).not.toBe(await version(font(2)));
});

test('ignores excluded files in the version', async () => {
  const changed = files();
  changed[3] = { name: 'og.png', content: new Uint8Array([9, 9, 9]) };
  expect(await version(changed)).toBe(await version(files()));
});

test('version changes when only the service worker code changes', async () => {
  const a = await precacheManifest(files(), 'worker v1');
  const b = await precacheManifest(files(), 'worker v2');
  expect(a.paths).toEqual(b.paths);
  expect(a.version).not.toBe(b.version);
});

/** Runs the injected registration script against a fake window and navigator. */
function runRegister(navigator: object) {
  const listeners: Record<string, () => void> = {};
  const window = { addEventListener: (type: string, fn: () => void) => void (listeners[type] = fn) };
  // The script is a string injected into every page; running it is the point of the test.
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function('window', 'navigator', REGISTER_SCRIPT)(window, navigator);
  return listeners;
}

test('registers sw.js only once the page has loaded', () => {
  const registered: string[] = [];
  const listeners = runRegister({ serviceWorker: { register: (url: string) => (registered.push(url), Promise.resolve()) } });
  expect(registered).toEqual([]);
  listeners.load();
  expect(registered).toEqual(['./sw.js']);
});

test('registration ignores browsers without service workers', () => {
  expect(() => runRegister({}).load()).not.toThrow();
});

test('registration ignores a navigator.serviceWorker that throws', () => {
  const navigator = Object.defineProperty({}, 'serviceWorker', {
    get() {
      throw new Error('SecurityError');
    },
  });
  expect(() => runRegister(navigator).load()).not.toThrow();
});

test('registration swallows a rejected register()', async () => {
  const listeners = runRegister({ serviceWorker: { register: () => Promise.reject(new Error('blocked')) } });
  listeners.load();
  await new Promise((r) => setTimeout(r, 0));
});

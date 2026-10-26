import { expect, test } from 'vitest';
import { precacheManifest, type BuildFile } from '../../build/offline';

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

import { readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const index = new URL('index.html', dist);
let html = await readFile(index, 'utf8');
const script = html.match(/<script type="module"[^>]* src="([^"]+)"><\/script>/);
const stylesheet = html.match(/<link rel="stylesheet"[^>]* href="([^"]+)">/);
if (!script || !stylesheet) throw new Error('Expected one compiled script and stylesheet.');

const [js, css, license] = await Promise.all([
  readFile(new URL(script[1], dist), 'utf8'),
  readFile(new URL(stylesheet[1], dist), 'utf8'),
  readFile(new URL('../node_modules/@fontsource/jetbrains-mono/LICENSE', import.meta.url), 'utf8'),
]);
html = html.replace(script[0], () => '')
  .replace(stylesheet[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
  .replace('</body>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>\n  </body>`);
await writeFile(index, html + `\n<!-- Bundled JetBrains Mono font license\n${license}\n-->\n`);

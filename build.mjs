/* Build the Research Hub release bundle from a single source file.
 *
 *   input   source.html      one readable file, this is what you edit
 *   output  index.html       a short shell
 *           app-<hash>.js    all logic, minified
 *           app-<hash>.css   all styles, minified
 *
 * Everything lands in the project root, so the whole site is a flat list of
 * files. Old builds are removed first, so no stale app-*.js is left behind.
 *
 * A content hash is part of each filename, so a browser can cache the bundles
 * forever and still never serve a stale version after a rebuild.
 *
 * Sub-path deployments. When the dashboard is not served from the root of a
 * domain, for example on GitHub Pages at username.github.io/research-hub, set
 * the base path at build time:
 *
 *     RH_BASE_PATH=/research-hub npm run build
 *
 * The shell then links the assets through that prefix and defines
 * window.RH_BASE, which the dashboard uses to build its /api address. Use the
 * same value for the server, so that both sides agree.
 *
 * Note for anyone tempted to tidy this up: the bundle is NOT wrapped in an
 * IIFE. The markup carries hundreds of onclick attributes that look their
 * handler up in the top-level scope, so wrapping the code would silently kill
 * every button in the interface.
 */
import fs from 'fs';
import crypto from 'crypto';
import * as esbuild from 'esbuild';

const SOURCE = 'source.html';
const BASE = (process.env.RH_BASE_PATH || '').replace(/\/+$/, '');
const html = fs.readFileSync(SOURCE, 'utf8');

/* Every block with the given tag is collected, because the source carries more
   than one <style> block. */
function collectAll(tag) {
  const pattern = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
  const found = [];
  let m;
  while ((m = pattern.exec(html)) !== null) found.push(m[1]);
  if (!found.length) throw new Error('No <' + tag + '> block found in ' + SOURCE);
  return found;
}

const css = collectAll('style').join('\n');
const js = collectAll('script').join('\n;\n');

/* The body markup moves into the bundle as well, so the shell stays short. It
   is injected as the very first statement, before any other line runs, so that
   every element lookup afterwards succeeds. */
const bodyMarkup = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'))
  .replace(/^<body[^>]*>/, '')
  .replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '')
  .replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/g, '')
  .replace(/\n\s*/g, '\n').trim();

const bodyClass = (html.match(/<body[^>]*class="([^"]*)"/) || [, ''])[1];

/* Remove the previous build so that renaming by hash does not accumulate. */
for (const f of fs.readdirSync('.')) {
  if (/^app-[0-9a-f]{8}\.(js|css)$/.test(f)) fs.unlinkSync(f);
}

const inject = 'document.body.innerHTML=' + JSON.stringify(bodyMarkup) + ';\n';
const outJs = await esbuild.transform(inject + js, {
  loader: 'js', minify: true, target: 'es2020', legalComments: 'none'
});
const outCss = await esbuild.transform(css, { loader: 'css', minify: true });

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 8);
const jsName = 'app-' + hash(outJs.code) + '.js';
const cssName = 'app-' + hash(outCss.code) + '.css';

fs.writeFileSync(jsName, outJs.code);
fs.writeFileSync(cssName, outCss.code);

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Research Hub'])[1];
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const fontLinks = (head.match(/<link[^>]*fonts\.[^>]*>/g) || []).join('\n');
const themeColor = (head.match(/<meta name="theme-color"[^>]*>/) || [''])[0];
const baseScript = BASE ? '<script>window.RH_BASE=' + JSON.stringify(BASE) + ';</script>' : '';

const shell = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${themeColor}
<title>${title}</title>
${fontLinks}
<link rel="stylesheet" href="${BASE}/${cssName}">
</head>
<body${bodyClass ? ' class="' + bodyClass + '"' : ''}>
${baseScript}
<script src="${BASE}/${jsName}" defer></script>
</body>
</html>
`.replace(/\n{2,}/g, '\n');
fs.writeFileSync('index.html', shell);

const kb = (t) => (Buffer.byteLength(t) / 1024).toFixed(0) + ' KB';
console.log('base path     ' + (BASE || '(domain root)'));
console.log('source        ' + kb(html));
console.log('body markup   ' + kb(bodyMarkup));
console.log('index.html    ' + kb(shell));
console.log(jsName + '  ' + kb(outJs.code));
console.log(cssName + '  ' + kb(outCss.code));

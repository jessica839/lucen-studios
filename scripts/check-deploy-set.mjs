#!/usr/bin/env node
// Model the next commit, including new unignored files, rather than the working directory.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseHTML, rewriteSrcset, decode } from './build-lang-pages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const lines = readFileSync(path.join(root, '.vercelignore'), 'utf8').trim().split(/\r?\n/);
if (lines[0] !== '/*' || lines.slice(1).some(line => !/^!\/[\w.-]+$/.test(line))) {
  throw new Error('.vercelignore must start with /* and contain only !/name allowlist entries');
}
const allowed = lines.slice(1).map(line => line.slice(2));
const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const deploy = new Set(candidates.filter(file => allowed.some(name => file === name || file.startsWith(name + '/'))));
const failures = new Set();
for (const file of deploy) {
  // vercel.json is allowed: Vercel consumes it as config and does not serve it as a file.
  if (/\.(md|docx|jsx)$/i.test(file) || /(^|\/)package[^/]*\.json$/i.test(file) || file.startsWith('scripts/')) failures.add(`Forbidden deployed file: ${file}`);
  if (!existsSync(path.join(root, file))) failures.add(`Tracked deploy file is missing: ${file}`);
}
let references = 0, sitemapCount = 0, scanned = 0;
const hosts = new Set(['www.gamperklimmek.com', 'gamperklimmek.com']);
function check(value, file, kind = 'reference') {
  value = decode(value).trim();
  if (!value || /^[#?]/.test(value) || /^(?:data|mailto|tel|javascript|blob):/i.test(value) || /[${}]/.test(value)) return;
  let url;
  // Static pages are visited at their clean URL, so /de resolves relative paths from /.
  const pagePath = file.replace(/\/index\.html$/, '').replace(/^index\.html$/, '').replace(/\.html$/, '');
  try { url = new URL(value, `https://www.gamperklimmek.com/${pagePath}`); }
  catch { failures.add(`${file}: malformed ${kind}: ${value}`); return; }
  if (!['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname)) return;
  references++;
  let target = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
  const choices = target.startsWith('api/') ? [target.endsWith('.js') ? target : target + '.js'] : [target, target + '.html', target ? target + '/index.html' : 'index.html'];
  if (!choices.some(candidate => deploy.has(candidate))) failures.add(`${file}: ${kind} is outside deploy set: ${value}`);
}
function css(source, file) {
  for (const m of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) check(m[1] ?? m[2] ?? m[3], file, 'CSS url');
}
function markup(source, file) {
  const walk = node => {
    const a = node.attrs || {};
    for (const attr of ['href', 'src', 'poster', 'data-consent-src']) if (a[attr]) check(a[attr], file, attr);
    if (a.srcset) rewriteSrcset(a.srcset, value => { check(value, file, 'srcset'); return value; });
    if (a.style) css(a.style, file);
    if (node.tag === 'meta' && a.property === 'og:image' && a.content) check(a.content, file, 'og:image');
    if (node.tag === 'style') css(node.children.map(child => child.value || '').join(''), file);
    for (const child of node.children || []) walk(child);
  };
  walk(parseHTML(source));
}
function stripJSComments(source) {
  let out = '', quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') out += source[++i] || '';
      else if (c === quote) quote = null;
    } else if (['"', "'", '`'].includes(c)) { quote = c; out += c; }
    else if (c === '/' && next === '/') { while (i < source.length && source[i] !== '\n') i++; out += '\n'; }
    else if (c === '/' && next === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i++; out += ' '; }
    else out += c;
  }
  return out;
}
function javascript(source, file) {
  source = stripJSComments(source);
  // Includes HTML embedded in translation and consent strings and JS-created asset URLs.
  const normalized = source.replace(/\\(["'])/g, '$1');
  for (const m of normalized.matchAll(/\b(href|src|poster|data-consent-src)\s*[:=]\s*(["'])([^"'\n]+)\2/g)) check(m[3], file, `JS ${m[1]}`);
  for (const m of normalized.matchAll(/\.setAttribute\(\s*(["'])(href|src|poster|data-consent-src)\1\s*,\s*(["'])([^"']+)\3/g)) check(m[4], file, `JS ${m[2]}`);
  for (const m of normalized.matchAll(/<meta\b[^>]*>/gi)) markup(m[0], file);
  for (const m of normalized.matchAll(/\b(?:fetch|import)\s*\(\s*(["'])([^"']+)\1/g)) check(m[2], file, 'JS request');
  for (const m of normalized.matchAll(/\bsrcset\s*=\s*(["'])([^"']+)\1/g)) rewriteSrcset(m[2], value => { check(value, file, 'JS srcset'); return value; });
  // CSS appears in string literals; do not mistake the JavaScript URL constructor for CSS.
  css(normalized.replace(/\bnew\s+URL\(/g, 'new URLConstructor('), file);
}
for (const file of deploy) {
  if (!/\.(html|css|js)$/.test(file) || !existsSync(path.join(root, file))) continue;
  scanned++;
  const source = readFileSync(path.join(root, file), 'utf8');
  if (file.endsWith('.html')) {
    markup(source, file);
    for (const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) javascript(m[1], file);
  } else if (file.endsWith('.css')) css(source, file);
  else javascript(source, file);
}
if (!deploy.has('sitemap.xml')) failures.add('sitemap.xml is missing from deploy set');
else for (const match of readFileSync(path.join(root, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
  sitemapCount++;
  check(match[1], 'sitemap.xml', 'sitemap loc');
}
if (!deploy.size || !scanned || !references || !sitemapCount) failures.add('Deploy verification must be non-empty');
console.log(`Deploy set: ${deploy.size} files; scanned ${scanned} HTML/CSS/JS files; checked ${references} internal references and ${sitemapCount} sitemap locations.`);
if (failures.size) { console.error([...failures].join('\n')); process.exitCode = 1; }
else console.log('Deploy set checks passed.');

#!/usr/bin/env node
/** Dependency-free, deterministic static translations. EN is only patched at the marked alternate block. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set(['script', 'style']);
export const BLOCK_START = '<!-- static-language-alternates:start -->';
export const BLOCK_END = '<!-- static-language-alternates:end -->';
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…', copy: '©', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', rarr: '→' };
export function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? whole;
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
  });
}
export const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const norm = value => decode(value).replace(/\s+/g, ' ').trim();

/** Small HTML tokenizer/tree builder: quoted >, comments, raw script/style and void tags. */
export function parseHTML(html) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let i = 0;
  const append = node => stack.at(-1).children.push(node);
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      if (end < 0) throw new Error('Unclosed HTML comment');
      append({ type: 'raw', value: html.slice(i, end + 3) }); i = end + 3; continue;
    }
    if (html[i] !== '<' || !/^<[/!a-z]/i.test(html.slice(i, i + 3))) {
      const start = i++;
      while (i < html.length && !(html[i] === '<' && /^<[/!a-z]/i.test(html.slice(i, i + 3)))) i++;
      append({ type: 'text', value: html.slice(start, i) }); continue;
    }
    const start = i++;
    let quote = null;
    for (; i < html.length; i++) {
      const c = html[i];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (i === html.length) throw new Error(`Unclosed HTML tag at ${start}`);
    const token = html.slice(start, ++i);
    if (token.startsWith('<!')) { append({ type: 'raw', value: token }); continue; }
    const closing = /^<\s*\/\s*([\w:-]+)/.exec(token);
    if (closing) {
      const tag = closing[1].toLowerCase();
      let index = stack.length - 1;
      while (index > 0 && stack[index].tag !== tag) index--;
      if (!index) throw new Error(`Unexpected </${tag}> at ${start}`);
      stack.length = index;
      continue;
    }
    const match = /^<([\w:-]+)/.exec(token);
    if (!match) throw new Error(`Invalid HTML tag at ${start}`);
    const tag = match[1].toLowerCase();
    const attrs = {};
    const attrSource = token.slice(match[0].length, -1).replace(/\/$/, '');
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const a of attrSource.matchAll(attrPattern)) {
      attrs[a[1].toLowerCase()] = a[2] !== undefined || a[3] !== undefined || a[4] !== undefined ? decode(a[2] ?? a[3] ?? a[4]) : null;
    }
    const node = { type: 'element', tag, attrs, children: [], selfClosing: /\/\s*>$/.test(token) };
    append(node);
    if (RAW.has(tag)) {
      const endPattern = new RegExp(`</${tag}\\s*>`, 'ig');
      endPattern.lastIndex = i;
      const end = endPattern.exec(html);
      if (!end) throw new Error(`Unclosed <${tag}>`);
      node.children.push({ type: 'raw', value: html.slice(i, end.index) });
      i = endPattern.lastIndex;
    } else if (!VOID.has(tag) && !node.selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack.at(-1).tag}>`);
  return root;
}
export function serialize(node) {
  if (node.type === 'text' || node.type === 'raw') return node.value;
  if (node.type === 'root') return node.children.map(serialize).join('');
  const attrs = Object.entries(node.attrs).map(([key, value]) => value === null ? ` ${key}` : ` ${key}="${escapeAttr(value)}"`).join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  if (node.selfClosing) return `<${node.tag}${attrs} />`;
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`;
}
function walk(node, callback) {
  if (node.type === 'element') callback(node);
  for (const child of node.children ?? []) walk(child, callback);
}
function textContent(node) {
  if (node.type === 'text') return decode(node.value);
  return (node.children ?? []).map(textContent).join('');
}

export function pagePath(page, lang) {
  return lang === 'en' ? (page === 'index' ? '/' : `/${page}`) : `/${lang}${page === 'index' ? '' : `/${page}`}`;
}
export function alternates(page, origin) {
  return [BLOCK_START, ...['en', 'de', 'fr', 'x-default'].map(lang => `  <link rel="alternate" hreflang="${lang}" href="${origin}${pagePath(page, lang === 'x-default' ? 'en' : lang)}">`), `  ${BLOCK_END}`].join('\n');
}
export function patchAlternates(html, page, origin) {
  const block = alternates(page, origin);
  if (html.includes(BLOCK_START)) {
    const start = html.indexOf(BLOCK_START), end = html.indexOf(BLOCK_END, start);
    if (end < 0) throw new Error('Unclosed static language alternates block');
    return html.slice(0, start) + block + html.slice(end + BLOCK_END.length);
  }
  if (!html.includes('</head>')) throw new Error('Missing </head>');
  return html.replace('</head>', `  ${block}\n</head>`);
}

/** Fragment/query-only and non-HTTP protocols stay literal. Same-origin navigations follow the language. */
export function rewriteURL(value, lang, pages, origin, navigation = false) {
  if (!value || /^[#?]/.test(value) || value.startsWith('//')) return value;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (hasScheme && !/^https?:/i.test(value)) return value;
  const url = new URL(value, `${origin}/`);
  if (url.origin !== origin) return value;
  if (navigation) {
    let pathname = url.pathname.replace(/\/$/, '') || '/';
    pathname = pathname.replace(/^\/(?:en|de|fr)(?=\/|$)/, '') || '/';
    const page = pathname === '/' || pathname === '/index.html' || pathname === '/index' ? 'index' : pathname.slice(1).replace(/\.html$/, '');
    if (pages.includes(page)) return `${pagePath(page, lang)}${url.search}${url.hash}`;
  }
  return hasScheme ? value : `${url.pathname}${url.search}${url.hash}`;
}

/** Keep density/width descriptors and data URLs (which can contain commas) intact. */
export function rewriteSrcset(value, rewrite) {
  let i = 0, out = '';
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) out += value[i++];
    const start = i;
    while (i < value.length && !/\s/.test(value[i])) i++;
    let url = value.slice(start, i), commas = '';
    while (url.endsWith(',')) { url = url.slice(0, -1); commas += ','; }
    out += rewrite(url) + commas;
    if (commas) continue;
    while (i < value.length && value[i] !== ',') out += value[i++];
  }
  return out;
}
export function rewriteCSS(value, rewrite) {
  return value.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (all, double, single, bare) => {
    const old = double ?? single ?? bare.trim(), next = rewrite(old);
    if (next === old) return all;
    const quote = double !== undefined ? '"' : single !== undefined ? "'" : '';
    return `url(${quote}${next}${quote})`;
  });
}

function allowedText(value, allowlist) {
  let rest = norm(value);
  // Exact phrases only, with word boundaries: never allow an arbitrary English sentence.
  for (const phrase of [...allowlist].sort((a, b) => b.length - a.length)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rest = rest.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu'), '');
  }
  return !/\p{L}/u.test(rest);
}

export function translateTree(tree, lang, translations, meta, bindings, page, errors) {
  const dict = translations[lang];
  const get = key => {
    if (typeof dict?.[key] !== 'string') { errors.add(`${page}/${lang}: missing translation ${key}`); return ''; }
    return dict[key];
  };
  // Check the original tree as well: a translated parent must not mask a missing child key.
  walk(tree, node => {
    for (const attr of ['data-i18n', 'data-i18n-ph']) {
      if (node.attrs[attr] !== undefined) get(node.attrs[attr]);
    }
  });
  function visit(node, body = false, covered = false) {
    if (node.type === 'text') {
      if (body && !covered && !allowedText(node.value, meta.allowlist)) {
        const key = bindings.text[norm(node.value)];
        if (!key) { errors.add(`${page}/${lang}: text outside data-i18n: ${norm(node.value)}`); return node; }
        // Preserve whitespace and all existing surrounding markup (notably price spans).
        const lead = node.value.match(/^\s*/)[0], tail = node.value.match(/\s*$/)[0];
        return { type: 'root', children: [{ type: 'text', value: lead }, {
          type: 'element', tag: 'span', attrs: { 'data-i18n': key }, children: parseHTML(get(key)).children
        }, { type: 'text', value: tail }] };
      }
      return node;
    }
    if (node.type === 'raw') return node;
    if (RAW.has(node.tag)) return node;
    body ||= node.tag === 'body';
    const a = node.attrs ?? {};
    // Supplemental bindings annotate only the generated copy; original EN bytes are untouched.
    if (body) {
      for (const [attr, table] of Object.entries(bindings.attributes ?? {})) {
        if (!a[attr] || (a['data-i18n-attr'] === attr) || (attr === 'placeholder' && a['data-i18n-ph'])) continue;
        const key = table[norm(a[attr])];
        if (key) {
          if (attr === 'placeholder') a['data-i18n-ph'] = key;
          else {
            // Some elements need both visible copy and accessible attributes. Keep a separate marker.
            a[`data-static-i18n-${attr}`] = key;
            a[attr] = textContent(parseHTML(get(key)));
          }
        }
      }
    }
    const key = a['data-i18n'];
    if (a['data-i18n-attr']) {
      if (!key) errors.add(`${page}/${lang}: data-i18n-attr without key`);
      else a[a['data-i18n-attr']] = textContent(parseHTML(get(key)));
    } else if (key !== undefined) {
      const translated = parseHTML(get(key));
      for (const name of meta.protectedNames ?? []) {
        if (textContent(node).toLowerCase().includes(name.toLowerCase()) && !textContent(translated).toLowerCase().includes(name.toLowerCase())) {
          errors.add(`${page}/${lang}: translation ${key} changes protected product name ${name}`);
        }
      }
      node.children = translated.children;
      covered = true;
    }
    if (a['data-i18n-ph']) a.placeholder = get(a['data-i18n-ph']);
    if (a['data-lang']) {
      const classes = (a.class ?? '').split(/\s+/).filter(c => c && c !== 'active');
      if (a['data-lang'] === lang) classes.push('active');
      if (classes.length) a.class = classes.join(' '); else delete a.class;
    }
    node.children = node.children.map(child => visit(child, body, covered));
    return node;
  }
  visit(tree);
}

function updateHead(tree, page, lang, meta) {
  const canonical = meta.origin + pagePath(page, lang), copy = meta.pages[page][lang];
  let head;
  const present = new Set();
  const values = {
    description: copy.description,
    'og:title': copy.title, 'og:description': copy.description, 'og:url': canonical,
    'og:locale': copy.locale,
    'twitter:title': copy.title, 'twitter:description': copy.description, 'twitter:url': canonical,
    'twitter:card': 'summary_large_image', 'twitter:image': `${meta.origin}/og-image.png`
  };
  walk(tree, node => {
    if (node.tag === 'html') Object.assign(node.attrs, { lang, 'data-static-lang': lang });
    if (node.tag === 'head') head = node;
    if (node.tag === 'title') node.children = [{ type: 'text', value: escapeAttr(copy.title) }];
    if (node.tag === 'link' && node.attrs.rel === 'canonical') node.attrs.href = canonical;
    if (node.tag === 'meta') {
      const key = node.attrs.property ?? node.attrs.name;
      if (key in values) { node.attrs.content = values[key]; present.add(key); }
    }
    if (node.tag === 'script' && node.attrs.type === 'application/ld+json') {
      const data = JSON.parse(node.children.map(child => child.value).join(''));
      function localize(value) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(localize); return; }
        const types = [].concat(value['@type'] ?? []);
        if (String(value['@id'] ?? '').endsWith('#organization') || types.some(t => ['Organization', 'ProfessionalService'].includes(t))) return;
        for (const field of ['url', '@id', 'item']) {
          if (typeof value[field] === 'string' && value[field].startsWith(meta.origin)) {
            const localized = rewriteURL(value[field], lang, Object.keys(meta.pages), meta.origin, true);
            value[field] = localized.startsWith('/') ? meta.origin + localized : localized;
          }
        }
        if (types.some(t => /Page$/.test(t) || t === 'WebSite')) {
          value.inLanguage = lang;
          if (types.some(t => /Page$/.test(t))) { value.name = copy.title; value.description = copy.description; }
        }
        Object.values(value).forEach(localize);
      }
      localize(data);
      node.children = [{ type: 'raw', value: '\n' + JSON.stringify(data, null, 2) + '\n  ' }];
    }
  });
  for (const [key, value] of Object.entries(values)) if (!present.has(key)) {
    head.children.push({ type: 'element', tag: 'meta', attrs: { [key.startsWith('og:') ? 'property' : 'name']: key, content: value }, children: [] });
  }
  // Reveal-on-scroll animations must not hide localized content when JavaScript is disabled.
  head.children.push(...parseHTML('\n<noscript><style>.reveal { opacity: 1 !important; transform: none !important; }</style></noscript>\n').children);
}

async function updateURLs(tree, lang, meta) {
  const scripts = [];
  walk(tree, node => {
    const a = node.attrs;
    for (const attr of ['href', 'src', 'poster']) {
      if (a[attr]) {
        // Canonical and alternate links are already absolute and intentionally language-specific.
        if (node.tag === 'link' && ['canonical', 'alternate'].includes(a.rel)) continue;
        a[attr] = rewriteURL(a[attr], lang, Object.keys(meta.pages), meta.origin, attr === 'href' && ['a', 'area'].includes(node.tag));
      }
    }
    const asset = value => rewriteURL(value, lang, Object.keys(meta.pages), meta.origin);
    if (a.srcset) a.srcset = rewriteSrcset(a.srcset, asset);
    if (a.style) a.style = rewriteCSS(a.style, asset);
    if (node.tag === 'style') node.children.forEach(child => { child.value = rewriteCSS(child.value, asset); });
    if (node.tag === 'script' && a.src) scripts.push(node);
  });
  for (const script of scripts) {
    const url = new URL(script.attrs.src, meta.origin);
    if (url.origin !== meta.origin) continue;
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) throw new Error(`Script escapes site directory: ${url.pathname}`);
    const hash = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10);
    url.searchParams.set('v', hash);
    script.attrs.src = url.pathname + url.search + url.hash;
  }
}

function sitemapXML(original, meta) {
  const pages = Object.keys(meta.pages), entries = [];
  const originalEntries = [...original.matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g)].map(m => m[1]);
  for (const entry of originalEntries) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(entry)?.[1];
    if (!pages.some(page => ['en', 'de', 'fr'].some(lang => loc === meta.origin + pagePath(page, lang)))) entries.push(`  <url>\n    ${entry}\n  </url>`);
  }
  for (const page of pages) {
    const enURL = meta.origin + pagePath(page, 'en');
    const old = originalEntries.find(entry => /<loc>([^<]+)<\/loc>/.exec(entry)?.[1] === enURL) ?? '';
    const extras = ['lastmod', 'changefreq', 'priority'].map(tag => old.match(new RegExp(`<${tag}>[^<]*</${tag}>`))?.[0]).filter(Boolean);
    const links = ['en', 'de', 'fr', 'x-default'].map(lang => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${meta.origin}${pagePath(page, lang === 'x-default' ? 'en' : lang)}" />`).join('\n');
    for (const lang of ['en', 'de', 'fr']) entries.push(`  <url>\n    <loc>${meta.origin}${pagePath(page, lang)}</loc>\n${extras.map(value => `    ${value}\n`).join('')}${links}\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

export async function build() {
  const meta = JSON.parse(await readFile(path.join(ROOT, 'scripts/lang-meta.json'), 'utf8'));
  const bindings = JSON.parse(await readFile(path.join(ROOT, 'scripts/lang-bindings.json'), 'utf8'));
  const source = await readFile(path.join(ROOT, 'i18n.js'), 'utf8');
  const engine = source.indexOf('/* ── ENGINE');
  if (engine < 0) throw new Error('i18n.js translation/engine boundary missing');
  const translations = vm.runInNewContext(source.slice(0, engine) + '\ntranslations;', {}, { timeout: 1000 });
  const errors = new Set(), outputs = new Map();
  for (const [page, copy] of Object.entries(meta.pages)) {
    const original = await readFile(path.join(ROOT, `${page}.html`), 'utf8');
    outputs.set(`${page}.html`, patchAlternates(original, page, meta.origin));
    for (const lang of ['de', 'fr']) {
      for (const [field, min, max] of [['title', 50, 60], ['description', 120, 155]]) {
        const length = [...(copy[lang]?.[field] ?? '')].length;
        if (length < min || length > max) errors.add(`${page}/${lang}: ${field} length ${length}; expected ${min}–${max}`);
      }
      const tree = parseHTML(outputs.get(`${page}.html`));
      translateTree(tree, lang, translations, meta, bindings, page, errors);
      updateHead(tree, page, lang, meta);
      await updateURLs(tree, lang, meta);
      outputs.set(`${lang}/${page}.html`, serialize(tree));
    }
  }
  outputs.set('sitemap.xml', sitemapXML(await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8'), meta));
  if (errors.size) throw new Error(`Language build failed (${errors.size} issues):\n${[...errors].map(error => ` - ${error}`).join('\n')}`);
  for (const [name, content] of outputs) {
    const target = path.join(ROOT, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  console.log(`build:lang OK — ${Object.keys(meta.pages).length * 2} static DE/FR pages; 7 EN alternate blocks; sitemap updated.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build().catch(error => { console.error(error.message); process.exitCode = 1; });
}

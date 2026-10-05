#!/usr/bin/env node
/**
 * Independent verification for the static DE/FR pages.  This deliberately
 * does not import the generator: a successful generator run is only useful
 * when the files it produced also pass checks made from a fresh read.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originDefault = 'https://www.gamperklimmek.com';
const pages = ['index', 'businesses', 'calculator', 'story', 'work', 'operators', 'legal'];
const languages = ['en', 'de', 'fr'];
const localized = ['de', 'fr'];
const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const rawStopwords = {
  // Proper names, product names, numbers and technical vocabulary are absent
  // on purpose. The denominator is only recognized DE/FR/EN stopword hits.
  de: new Set('der die das den dem des und oder aber ist sind wir sie ein eine einen einer einem für mit von auf im in zu bei als auch nicht sich ihr ihre unsere unsere ihren werden wird diese dieser dieses durch nach über unter mehr weniger wenn dass wie was noch nur schon aus an um'.split(' ')),
  fr: new Set('le la les un une des du de d et ou mais est sont nous vous ils elles ce cette ces pour avec dans sur en au aux par pas plus moins que qui se son sa ses notre nos votre vos comme aussi'.split(' ')),
  en: new Set('the a an and or but is are we you they this that these those for with from on in to of by not as it be have has will can your our their more less when what how'.split(' ')),
};
// Score only language-specific stopwords. Shared words such as "de" and
// "in" would otherwise count for multiple languages and skew the denominator.
const stopwordFrequency = new Map();
for (const words of Object.values(rawStopwords)) for (const word of words) stopwordFrequency.set(word, (stopwordFrequency.get(word) ?? 0) + 1);
const stopwords = Object.fromEntries(Object.entries(rawStopwords).map(([lang, words]) => [lang, new Set([...words].filter(word => stopwordFrequency.get(word) === 1))]));

const errors = [];
function fail(message) { errors.push(message); }
function norm(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function decodeEntities(value) {
  return value.replace(/&(?:#(x[\da-fA-F]+|\d+)|([a-zA-Z][\w]+));/g, (all, numeric, named) => {
    if (numeric) return String.fromCodePoint(numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named] ?? all;
  });
}
function urlFor(origin, lang, page) {
  if (lang === 'en') return page === 'index' ? `${origin}/` : `${origin}/${page}`;
  return page === 'index' ? `${origin}/${lang}` : `${origin}/${lang}/${page}`;
}
function outputPath(lang, page) {
  if (lang === 'en') return path.join(root, `${page === 'index' ? 'index' : page}.html`);
  return path.join(root, lang, `${page}.html`);
}
function parseAttrs(source) {
  const attrs = new Map();
  const body = source.replace(/^<\s*\/?\s*[^\s/>]+/, '').replace(/\/?>\s*$/, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = re.exec(body))) attrs.set(match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  return attrs;
}

/** A small, independent HTML tokenizer. Quotes, comments, script and style
 * bodies are consumed before looking for the next angle bracket. */
function tokenize(html) {
  const tokens = [];
  let i = 0;
  const findTagEnd = (start) => {
    let quote = null;
    for (let p = start; p < html.length; p++) {
      const ch = html[p];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') return p;
    }
    return -1;
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { if (i < html.length) tokens.push({ type: 'text', start: i, end: html.length, raw: html.slice(i) }); break; }
    if (lt > i) tokens.push({ type: 'text', start: i, end: lt, raw: html.slice(i, lt) });
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const end = findTagEnd(lt + 1);
    if (end < 0) break;
    const raw = html.slice(lt, end + 1);
    const close = /^<\s*\//.test(raw);
    const name = /^<\s*\/?\s*([\w:-]+)/.exec(raw)?.[1]?.toLowerCase();
    if (!name) { i = end + 1; continue; }
    const token = { type: close ? 'close' : 'open', start: lt, end: end + 1, raw, name, attrs: close ? new Map() : parseAttrs(raw), pair: null };
    tokens.push(token);
    i = end + 1;
    if (!close && (name === 'script' || name === 'style')) {
      const closing = new RegExp(`<\\s*/\\s*${name}\\s*>`, 'ig');
      closing.lastIndex = i;
      const found = closing.exec(html);
      if (found) { tokens.push({ type: 'raw', start: i, end: found.index, raw: html.slice(i, found.index) }); tokens.push({ type: 'close', start: found.index, end: closing.lastIndex, raw: found[0], name, attrs: new Map(), pair: token }); token.pair = tokens.at(-1); i = closing.lastIndex; }
      else i = html.length;
    }
  }
  const stack = [];
  for (const token of tokens) {
    if (token.type === 'open' && !voidElements.has(token.name) && !/\/\s*>$/.test(token.raw)) stack.push(token);
    if (token.type === 'close') {
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].name === token.name) { const open = stack.splice(j, 1)[0]; open.pair = token; token.pair = open; break; }
      }
    }
  }
  return tokens;
}
function startTags(html) { return tokenize(html).filter(token => token.type === 'open'); }
function tagsWith(html, predicate) { return startTags(html).filter(token => predicate(token.attrs, token)); }
function innerHTML(html, token) { return token.pair ? html.slice(token.end, token.pair.start) : ''; }
function getMeta(html, name, key = 'name') {
  return tagsWith(html, attrs => attrs.get(key) === name).map(token => token.attrs.get('content') ?? '');
}
function getLinkRelations(html, relation) {
  return tagsWith(html, attrs => attrs.get('rel')?.toLowerCase().split(/\s+/).includes(relation)).map(token => token.attrs);
}
function absoluteOrSpecial(url) {
  return !url || url.startsWith('/') || url.startsWith('#') || url.startsWith('?') || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
}
function checkUrl(url, where) {
  if (!absoluteOrSpecial(url)) fail(`${where}: relative URL "${url}"`);
}
function collectUrls(html) {
  const entries = [];
  for (const tag of startTags(html)) {
    for (const name of ['href', 'src']) if (tag.attrs.has(name)) entries.push({ url: tag.attrs.get(name), where: `<${tag.name} ${name}>` });
    if (tag.attrs.has('srcset')) {
      for (const candidate of tag.attrs.get('srcset').split(',')) {
        const url = candidate.trim().split(/\s+/, 1)[0];
        if (url) entries.push({ url, where: `<${tag.name} srcset>` });
      }
    }
    if (tag.attrs.has('style')) {
      for (const match of tag.attrs.get('style').matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) entries.push({ url: match[2], where: `<${tag.name} style url()>` });
    }
  }
  // CSS blocks are deliberately parsed separately from style attributes.
  for (const style of tagsWith(html, (_, tag) => tag.name === 'style')) {
    for (const match of innerHTML(html, style).matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) entries.push({ url: match[2], where: '<style url()>' });
  }
  return entries;
}
function extractTranslations(source) {
  // Supplemental bindings are appended through Object.assign before ENGINE.
  // Evaluate only that data declaration in a blank VM context; browser engine
  // code is never executed and the generator itself is never imported.
  const engine = source.indexOf('/* ── ENGINE');
  if (engine < 0) throw new Error('Cannot find the i18n ENGINE boundary');
  const data = source.slice(0, engine).replace(/\bconst\s+translations\s*=/, 'const translations = globalThis.__translations =');
  const context = {};
  vm.runInNewContext(data, context, { filename: 'i18n.js translations' });
  return context.__translations ?? {};
}
function visibleBodyText(html) {
  const body = startTags(html).find(tag => tag.name === 'body');
  const relevant = body?.pair ? innerHTML(html, body) : html;
  return tokenize(relevant).filter(token => token.type === 'text').map(token => decodeEntities(token.raw)).join(' ');
}
function languageShare(html, lang) {
  const words = [];
  words.push(...visibleBodyText(html).toLocaleLowerCase(lang).match(/[\p{L}]+(?:['’][\p{L}]+)?/gu) ?? []);
  const hits = Object.fromEntries(languages.map(candidate => [candidate, 0]));
  for (const word of words) for (const candidate of languages) if (stopwords[candidate].has(word)) hits[candidate]++;
  const denominator = hits.de + hits.fr + hits.en;
  return { hits, denominator, share: denominator ? hits[lang] / denominator : 0 };
}
function priceNodeSignature(html) {
  return tagsWith(html, attrs => [...attrs.keys()].some(name => name.startsWith('data-price'))).map(tag => ({
    tag: tag.name,
    prices: [...tag.attrs].filter(([name]) => name.startsWith('data-price')).sort(([a], [b]) => a.localeCompare(b)),
    content: innerHTML(html, tag),
  }));
}
function countLiteral(value, literal) {
  return value.split(literal).length - 1;
}
function checkFixedOfferTerms(source, localizedHtml, label) {
  if (JSON.stringify(priceNodeSignature(source)) !== JSON.stringify(priceNodeSignature(localizedHtml))) fail(`${label}: data-price nodes or their visible price content changed`);
  for (const product of ['Business Systems Review', 'Implementation Sprint']) {
    if (countLiteral(visibleBodyText(source), product) !== countLiteral(visibleBodyText(localizedHtml), product)) fail(`${label}: fixed product name "${product}" changed or was removed`);
  }
}
function normalizedJson(value) {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizedJson(value[key])]));
  return value;
}
function objectsOfType(value, type, result = []) {
  if (Array.isArray(value)) for (const item of value) objectsOfType(item, type, result);
  else if (value && typeof value === 'object') {
    const kinds = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (kinds.includes(type)) result.push(value);
    for (const child of Object.values(value)) objectsOfType(child, type, result);
  }
  return result;
}
function hasJsonLdValue(value, field, expected) {
  if (Array.isArray(value)) return value.some(item => hasJsonLdValue(item, field, expected));
  if (!value || typeof value !== 'object') return false;
  return value[field] === expected || Object.values(value).some(item => hasJsonLdValue(item, field, expected));
}
function hasJsonLdField(value, field, predicate) {
  if (Array.isArray(value)) return value.some(item => hasJsonLdField(item, field, predicate));
  if (!value || typeof value !== 'object') return false;
  return (typeof value[field] === 'string' && predicate(value[field])) || Object.values(value).some(item => hasJsonLdField(item, field, predicate));
}
function jsonLdObjects(html, pageLabel) {
  const objects = [];
  for (const tag of tagsWith(html, (_, tag) => tag.name === 'script' && tag.attrs.get('type')?.toLowerCase() === 'application/ld+json')) {
    try { objects.push(JSON.parse(innerHTML(html, tag))); }
    catch (error) { fail(`${pageLabel}: invalid JSON-LD (${error.message})`); }
  }
  return objects;
}
function snapshotFiles() {
  const result = new Map();
  for (const lang of languages) for (const page of pages) {
    const file = outputPath(lang, page);
    result.set(file, existsSync(file) ? Buffer.from(requireRead(file)) : null);
  }
  const sitemap = path.join(root, 'sitemap.xml');
  result.set(sitemap, existsSync(sitemap) ? Buffer.from(requireRead(sitemap)) : null);
  return result;
}
function requireRead(file) {
  // This is intentionally synchronous only for the short pre-build snapshot.
  // Dynamic import avoids an additional dependency and keeps test ordering clear.
  return readFileSyncCompat(file);
}
function readFileSyncCompat(file) {
  // Node exposes this through a tiny built-in module; kept here to make the
  // snapshot byte-for-byte, including untracked generated pages.
  return Buffer.from(process.getBuiltinModule('node:fs').readFileSync(file));
}
function runGeneratorAndCheckDeterminism(before) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-lang-pages.mjs')], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`generator failed during determinism check:\n${result.stderr || result.stdout}`);
  for (const [file, oldValue] of before) {
    const newValue = existsSync(file) ? readFileSyncCompat(file) : null;
    if (oldValue === null || newValue === null || !oldValue.equals(newValue)) fail(`generator is not deterministic: ${path.relative(root, file)} changed on a second build`);
  }
}
function checkEnglishSourcesOnlyChangedForAlternates() {
  const marker = /<!-- static-language-alternates:start -->[\s\S]*?<!-- static-language-alternates:end -->/;
  const stripAlternates = html => html.replace(/^[ \t]*<!-- static-language-alternates:start -->[\s\S]*?<!-- static-language-alternates:end -->\n?/m, '');
  for (const page of pages) {
    const relative = `${page === 'index' ? 'index' : page}.html`;
    const current = readFileSyncCompat(path.join(root, relative)).toString('utf8');
    const head = spawnSync('git', ['show', `HEAD:${relative}`], { cwd: root, encoding: 'utf8' });
    if (head.status !== 0) { fail(`${relative}: cannot read HEAD for English-source regression check`); continue; }
    if (!marker.test(current)) { fail(`${relative}: hreflang additions must use the static-language-alternates marker block`); continue; }
    if (stripAlternates(current) !== stripAlternates(head.stdout)) fail(`${relative}: English source changed outside the hreflang marker block`);
  }
}
function scriptSignature(html) {
  return startTags(html).filter(tag => tag.name === 'script' && tag.attrs.get('type')?.toLowerCase() !== 'application/ld+json').map(tag => {
    if (tag.attrs.has('src')) {
      const pathname = new URL(tag.attrs.get('src'), originDefault).pathname;
      return { src: path.posix.basename(pathname) };
    }
    return { inline: innerHTML(html, tag) };
  });
}
function checkScriptsPreserved(source, localizedHtml, label) {
  if (JSON.stringify(scriptSignature(source)) !== JSON.stringify(scriptSignature(localizedHtml))) fail(`${label}: non-JSON-LD scripts or their order changed (consent/GA regression)`);
  for (const tag of tagsWith(localizedHtml, (_, tag) => tag.name === 'script' && tag.attrs.has('src'))) {
    const src = tag.attrs.get('src');
    if (!src.startsWith('/')) continue;
    const url = new URL(src, originDefault);
    const supplied = url.searchParams.get('v');
    const disk = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!disk.startsWith(root) || !existsSync(disk)) { fail(`${label}: local script target is missing: ${url.pathname}`); continue; }
    const actual = createHash('sha256').update(readFileSyncCompat(disk)).digest('hex').slice(0, 10);
    if (supplied !== actual) fail(`${label}: script hash is stale for ${url.pathname}`);
  }
}
async function main() {
  const metaPath = path.join(root, 'scripts/lang-meta.json');
  if (!existsSync(metaPath)) { console.error('Missing scripts/lang-meta.json. Run the language build first.'); process.exitCode = 1; return; }
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const origin = meta.origin || originDefault;
  const sourceTranslations = extractTranslations(await readFile(path.join(root, 'i18n.js'), 'utf8'));
  // Optional change-review guard. Normal maintenance must also work after
  // intentional template edits, and in an exported site without Git/HEAD.
  if (process.argv.includes('--check-en-baseline')) checkEnglishSourcesOnlyChangedForAlternates();
  const before = snapshotFiles();
  for (const [file, content] of before) if (content === null) fail(`missing generated file before deterministic rebuild: ${path.relative(root, file)}`);
  const htmlByFile = new Map();
  for (const lang of languages) for (const page of pages) {
    const file = outputPath(lang, page);
    if (!existsSync(file)) { fail(`missing ${path.relative(root, file)}`); continue; }
    htmlByFile.set(`${lang}:${page}`, await readFile(file, 'utf8'));
  }

  const languageEvidence = [];
  for (const [id, html] of htmlByFile) {
    const [lang, page] = id.split(':');
    const label = `${path.relative(root, outputPath(lang, page))}`;
    const htmlTag = startTags(html).find(token => token.name === 'html');
    if (!htmlTag || htmlTag.attrs.get('lang') !== lang) fail(`${label}: <html lang> must be ${lang}`);
    if (lang === 'en' ? htmlTag?.attrs.has('data-static-lang') : htmlTag?.attrs.get('data-static-lang') !== lang) fail(`${label}: invalid data-static-lang marker`);

    const expectedUrl = urlFor(origin, lang, page);
    const canonicals = getLinkRelations(html, 'canonical').map(attrs => attrs.get('href'));
    if (canonicals.length !== 1 || canonicals[0] !== expectedUrl) fail(`${label}: canonical must be ${expectedUrl}`);
    const alternate = getLinkRelations(html, 'alternate').filter(attrs => attrs.has('hreflang'));
    const expectedAlternates = new Map([['en', urlFor(origin, 'en', page)], ['de', urlFor(origin, 'de', page)], ['fr', urlFor(origin, 'fr', page)], ['x-default', urlFor(origin, 'en', page)]]);
    for (const [hreflang, href] of expectedAlternates) {
      const matching = alternate.filter(attrs => attrs.get('hreflang') === hreflang && attrs.get('href') === href);
      if (matching.length !== 1) fail(`${label}: requires exactly one hreflang ${hreflang} → ${href}`);
    }
    if (alternate.length !== expectedAlternates.size) fail(`${label}: hreflang block has unexpected or duplicate entries`);

    if (localized.includes(lang)) {
      const pageMeta = meta.pages?.[page]?.[lang];
      if (!pageMeta) fail(`${label}: missing ${lang} metadata in lang-meta.json`);
      else {
        const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? '';
        const description = getMeta(html, 'description')[0] ?? '';
        if (norm(title) !== norm(pageMeta.title)) fail(`${label}: title does not match lang-meta.json`);
        if (norm(description) !== norm(pageMeta.description)) fail(`${label}: description does not match lang-meta.json`);
        if (norm(title).length < 50 || norm(title).length > 60) fail(`${label}: title must be 50–60 characters`);
        if (norm(description).length < 120 || norm(description).length > 155) fail(`${label}: description must be 120–155 characters`);
        const expectedLocale = pageMeta.locale || (lang === 'de' ? 'de_CH' : 'fr_CH');
        if (getMeta(html, 'og:title', 'property')[0] !== pageMeta.title) fail(`${label}: og:title must match title`);
        if (getMeta(html, 'og:description', 'property')[0] !== pageMeta.description) fail(`${label}: og:description must match description`);
        if (getMeta(html, 'og:url', 'property')[0] !== expectedUrl) fail(`${label}: og:url must be canonical`);
        if (getMeta(html, 'og:locale', 'property')[0] !== expectedLocale) fail(`${label}: og:locale must be ${expectedLocale}`);
        if (getMeta(html, 'twitter:title')[0] !== pageMeta.title || getMeta(html, 'twitter:description')[0] !== pageMeta.description) fail(`${label}: twitter title/description must match localized metadata`);
      }
      for (const entry of collectUrls(html)) checkUrl(entry.url, `${label} ${entry.where}`);
      checkFixedOfferTerms(htmlByFile.get(`en:${page}`) ?? '', html, label);
      for (const tag of tagsWith(html, (_, tag) => tag.name === 'script' && tag.attrs.has('src'))) {
        const src = tag.attrs.get('src');
        if (src.startsWith('/')) {
          const query = src.split('?', 2)[1] ?? '';
          if (!/(?:^|&)v=[a-f0-9]{6,}(?:&|$)/i.test(query)) fail(`${label}: local script lacks immutable ?v= hash: ${src}`);
        }
      }
      checkScriptsPreserved(htmlByFile.get(`en:${page}`) ?? '', html, label);
      const internal = tagsWith(html, attrs => attrs.has('href')).map(tag => tag.attrs.get('href'));
      for (const target of pages) {
        const expectedPath = new URL(urlFor(origin, lang, target)).pathname;
        const englishPath = new URL(urlFor(origin, 'en', target)).pathname;
        if (internal.some(href => href === englishPath || href.startsWith(`${englishPath}#`))) fail(`${label}: link to translated ${target} must use ${expectedPath}`);
      }
      for (const href of internal) {
        const match = /^\/(de|fr)(?:\/([^?#/]+))?(?:[?#]|$)/.exec(href);
        if (match && !pages.includes(match[2] || 'index')) fail(`${label}: untranslated page must remain English, found localized target ${href}`);
      }
    }

    const translations = sourceTranslations[lang] ?? {};
    for (const tag of tagsWith(html, attrs => attrs.has('data-i18n') || attrs.has('data-i18n-ph') || [...attrs.keys()].some(name => name.startsWith('data-static-i18n-')))) {
      const key = tag.attrs.get('data-i18n') || tag.attrs.get('data-i18n-ph');
      const staticBindings = [...tag.attrs].filter(([name]) => name.startsWith('data-static-i18n-'));
      const keys = [key, ...staticBindings.map(([, value]) => value)].filter(Boolean);
      if (keys.some(bindingKey => !(bindingKey in translations))) { fail(`${label}: missing ${lang} translation for key ${keys.find(bindingKey => !(bindingKey in translations))}`); continue; }
      const expected = key ? translations[key] : null;
      if (localized.includes(lang) && tag.attrs.has('data-i18n-ph') && norm(tag.attrs.get('placeholder') ?? '') !== norm(expected)) fail(`${label}: placeholder for ${key} is not statically translated`);
      if (localized.includes(lang) && tag.attrs.has('data-i18n-attr')) {
        const attr = tag.attrs.get('data-i18n-attr').toLowerCase();
        if (!tag.attrs.has(attr) || norm(tag.attrs.get(attr)) !== norm(expected)) fail(`${label}: ${attr} for ${key} is not statically translated`);
      }
      for (const [marker, bindingKey] of localized.includes(lang) ? staticBindings : []) {
        const attr = marker.slice('data-static-i18n-'.length);
        if (!tag.attrs.has(attr) || norm(tag.attrs.get(attr)) !== norm(translations[bindingKey])) fail(`${label}: ${attr} for ${bindingKey} is not statically translated`);
      }
      // Attribute-only bindings often intentionally retain an icon as their
      // element content (for example a hamburger button).
      if (localized.includes(lang) && tag.attrs.has('data-i18n') && !tag.attrs.has('data-i18n-attr') && !voidElements.has(tag.name) && tag.pair) {
        if (norm(innerHTML(html, tag)) !== norm(expected)) fail(`${label}: visible content for ${key} is not the ${lang} translation`);
      }
    }

    if (localized.includes(lang)) {
      const evidence = languageShare(html, lang);
      languageEvidence.push({ label, lang, ...evidence });
      if (evidence.share <= 0.6) fail(`${label}: ${lang} stopword share ${(evidence.share * 100).toFixed(1)}% must exceed 60% (hits ${JSON.stringify(evidence.hits)}, denominator ${evidence.denominator})`);
      const localLd = jsonLdObjects(html, label);
      if (!hasJsonLdValue(localLd, 'url', expectedUrl) || !hasJsonLdField(localLd, '@id', value => value.startsWith(expectedUrl)) || !hasJsonLdValue(localLd, 'inLanguage', lang)) fail(`${label}: JSON-LD must contain this page URL/@id and inLanguage ${lang}`);
      const enLd = jsonLdObjects(htmlByFile.get(`en:${page}`) ?? '', `index.html for ${page}`);
      const localOrg = ['Organization', 'ProfessionalService'].flatMap(type => objectsOfType(localLd, type)).map(item => JSON.stringify(normalizedJson(item)));
      const enOrg = ['Organization', 'ProfessionalService'].flatMap(type => objectsOfType(enLd, type)).map(item => JSON.stringify(normalizedJson(item)));
      if (JSON.stringify(localOrg) !== JSON.stringify(enOrg)) fail(`${label}: Organization JSON-LD must remain unchanged`);
    }
  }

  const sitemapPath = path.join(root, 'sitemap.xml');
  const sitemap = existsSync(sitemapPath) ? await readFile(sitemapPath, 'utf8') : '';
  if (!/xmlns:xhtml=["']http:\/\/www\.w3\.org\/1999\/xhtml["']/.test(sitemap)) fail('sitemap.xml: missing xmlns:xhtml');
  const entries = [...sitemap.matchAll(/<url>\s*([\s\S]*?)<\/url>/g)].map(match => match[1]);
  for (const page of pages) {
    for (const lang of languages) {
      const expectedUrl = urlFor(origin, lang, page);
      const entry = entries.find(body => new RegExp(`<loc>${expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`).test(body));
      if (!entry) { fail(`sitemap.xml: missing ${expectedUrl}`); continue; }
      for (const [altLang, altUrl] of [['en', urlFor(origin, 'en', page)], ['de', urlFor(origin, 'de', page)], ['fr', urlFor(origin, 'fr', page)], ['x-default', urlFor(origin, 'en', page)]]) {
        const escaped = altUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`<xhtml:link\\s+[^>]*hreflang=["']${altLang}["'][^>]*href=["']${escaped}["'][^>]*\\/?>(?:<\\/xhtml:link>)?`).test(entry) && !new RegExp(`<xhtml:link\\s+[^>]*href=["']${escaped}["'][^>]*hreflang=["']${altLang}["'][^>]*\\/?>(?:<\\/xhtml:link>)?`).test(entry)) fail(`sitemap.xml: ${expectedUrl} lacks ${altLang} alternate`);
      }
    }
  }
  // Read and validate the pre-existing output first. Only then re-run the
  // generator and require byte-for-byte idempotence, so a rebuild cannot hide
  // a broken checked-in generated page.
  runGeneratorAndCheckDeterminism(before);
  if (errors.length) {
    console.error(`Static language-page checks failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Static language-page checks passed. Language evidence denominator: disjoint DE + FR + EN stopword hits in visible body text; proper names and neutral words are ignored.');
    for (const item of languageEvidence) console.log(`- ${item.label}: ${item.lang} ${(item.share * 100).toFixed(1)}% (hits ${JSON.stringify(item.hits)}, denominator ${item.denominator})`);
  }
}

await main();

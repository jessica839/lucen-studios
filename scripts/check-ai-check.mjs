#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML, serialize, decode } from './build-lang-pages.mjs';

const root = new URL('../', import.meta.url);
const navURL = 'https://audit.gamperklimmek.com/?utm_source=gamperklimmek.com&utm_medium=nav&utm_campaign=site';
const homeURL = navURL.replace('utm_medium=nav', 'utm_medium=homepage');
const labels = { en: 'Free AI check', de: 'Gratis KI-Check', fr: 'Check IA gratuit' };
const notes = { en: '', de: 'Das Tool ist auf Englisch.', fr: 'L’outil est en anglais.' };
const pages = ['index', 'businesses', 'operators', 'work', 'insurance', 'resources', 'start'];
const localized = pages.slice(0, 4);
const elements = node => (node.type === 'element' ? [node] : []).concat((node.children ?? []).flatMap(elements));
const content = node => node.type === 'text' ? decode(node.value) : (node.children ?? []).map(content).join('');
const hasClass = (node, cls) => (node.attrs?.class ?? '').split(/\s+/).includes(cls);
const one = (nodes, predicate, message) => {
  const matches = nodes.filter(predicate);
  assert.equal(matches.length, 1, message);
  return matches[0];
};
function checkEvent(link, location, message) {
  const handler = link.attrs.onclick ?? '';
  assert.match(handler, /typeof\s+GK_event\s*===\s*['"]function['"]/, message + ': guarded event');
  assert.match(handler, new RegExp(`GK_event\\(['"]ai_check_clicked['"],\\s*\\{\\s*location:\\s*['"]${location}['"]\\s*\\}\\)`), message + ': location event');
  assert.ok(!link.attrs.target, message + ': same tab');
}
export function checkPage(html, lang, page) {
  const all = elements(parseHTML(html));
  const context = `${lang}/${page}`;
  for (const cls of ['nav-links', 'mobile-menu']) {
    const menu = one(all, node => hasClass(node, cls), `${context}: one ${cls}`);
    const links = elements(menu).filter(node => node.tag === 'a');
    const link = one(links, node => node.attrs.href === navURL, `${context}/${cls}: one audit link`);
    assert.equal(link.attrs['data-i18n'], 'nav.ai_check', context + ': nav key');
    assert.equal(content(link), labels[lang], context + ': nav label');
    assert.ok(!/cta|btn/.test(link.attrs.class ?? ''), context + ': plain nav style');
    checkEvent(link, 'nav', `${context}/${cls}`);
    const booking = links.findIndex(node => /widget\/bookings\//.test(node.attrs.href ?? ''));
    assert.equal(links.indexOf(link), booking < 0 ? links.length - 1 : booking - 1, context + ': last plain link before booking');
  }
  if (page !== 'index') return;
  const section = one(all, node => node.attrs.id === 'ai-check' && node.tag === 'section', context + ': one ai-check section');
  assert.ok(hasClass(section, 'ai-check'), context + ': section class');
  const work = one(all, node => node.attrs.id === 'work', context + ': work section');
  const audit = one(all, node => node.attrs.id === 'audit', context + ': audit section');
  assert.ok(all.indexOf(work) < all.indexOf(section) && all.indexOf(section) < all.indexOf(audit), context + ': section order');
  const inside = elements(section);
  const link = one(inside, node => node.tag === 'a' && node.attrs.href === homeURL, context + ': homepage UTM link');
  checkEvent(link, 'homepage', context);
  const note = one(inside, node => node.attrs['data-i18n'] === 'ai_check.note', context + ': language note');
  assert.equal(content(note), notes[lang], context + ': note text');
  assert.ok(inside.indexOf(note) > inside.indexOf(link), context + ': note under CTA');
}

for (const lang of Object.keys(labels)) {
  for (const page of lang === 'en' ? pages : localized) {
    const filename = `${lang === 'en' ? '' : lang + '/'}${page}.html`;
    const html = readFileSync(new URL(filename, root), 'utf8');
    checkPage(html, lang, page);
    // Prove each individual link is required, including its event handler.
    const tree = parseHTML(html);
    for (const link of elements(tree).filter(node => node.tag === 'a' && [navURL, homeURL].includes(node.attrs.href))) {
      const href = link.attrs.href;
      link.attrs.href = '#removed';
      assert.throws(() => checkPage(serialize(tree), lang, page), /one audit link|homepage UTM link/);
      link.attrs.href = href;
      const onclick = link.attrs.onclick;
      delete link.attrs.onclick;
      assert.throws(() => checkPage(serialize(tree), lang, page), /guarded event/);
      link.attrs.onclick = onclick;
    }
    assert.throws(() => checkPage(html.replaceAll('data-i18n="nav.ai_check"', 'data-i18n="removed"'), lang, page), /nav key/);
    assert.throws(() => checkPage(html.replaceAll('ai_check_clicked', 'removed_event'), lang, page), /location event/);
    assert.throws(() => checkPage(html.replaceAll('utm_medium=nav', 'utm_medium=removed'), lang, page), /one audit link/);
    if (page === 'index') {
      assert.throws(() => checkPage(html.replace('id="ai-check"', 'id="removed"'), lang, page), /one ai-check section/);
      assert.throws(() => checkPage(html.replaceAll('utm_medium=homepage', 'utm_medium=removed'), lang, page), /homepage UTM link/);
      assert.throws(() => checkPage(html.replace('data-i18n="ai_check.note"', 'data-i18n="removed"'), lang, page), /language note/);
    }
  }
}
console.log('AI check links, placement, translations, notes and analytics OK (15 pages).');

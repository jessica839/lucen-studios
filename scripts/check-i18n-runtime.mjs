import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');

function run({ staticLang = null, saved = null, browser = 'en-US', pathname = '/', withMenu = false } = {}) {
  const listeners = {};
  const writes = [];
  const events = [];
  const local = new Map(saved ? [['gk_lang', saved]] : []);
  const elements = [];
  const buttons = [];
  const links = [];
  const switchers = [{ hidden: false, style: {} }];
  const observers = [];
  let menuOpen = false;
  const menuLink = element({ href: '#section' });
  const menu = {
    ...element({}), id: '', listeners: {},
    classList: { contains: () => menuOpen, add() { menuOpen = true; }, remove() { menuOpen = false; } },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    querySelector() { return menuLink; },
    querySelectorAll() { return [menuLink]; },
    contains(el) { return el === menuLink; },
  };
  const hamburger = element({});
  const hamburgerClasses = new Set();
  hamburger.classList = { contains: name => hamburgerClasses.has(name), add: name => hamburgerClasses.add(name), remove: name => hamburgerClasses.delete(name) };
  const nav = { ...element({}), contains: el => el === hamburger };
  const main = { ...element({}), contains: () => false };
  const document = {
    body: { children: [nav, menu, main] },
    activeElement: null,
    documentElement: { dataset: staticLang ? { staticLang } : {}, lang: staticLang || 'en' },
    addEventListener(name, fn) { listeners[name] = fn; },
    querySelector(selector) { return withMenu ? (selector === '.mobile-menu' ? menu : selector === '.nav-hamburger' ? hamburger : null) : null; },
    querySelectorAll(selector) {
      if (selector.startsWith('link')) return links;
      if (selector === '.lang-switcher, .gk-lang-switcher, .mobile-lang') return switchers;
      if (selector.startsWith('[data-i18n')) return elements.filter(el => Object.hasOwn(el.attrs, selector.slice(1, -1)));
      return buttons;
    },
  };
  for (const el of [menuLink, hamburger]) {
    el.focus = () => { document.activeElement = el; };
    el.getClientRects = () => [{}];
    el.closest = selector => selector === 'a' && el === menuLink ? menuLink : null;
  }
  const context = vm.createContext({
    document,
    URL,
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    window: { location: { pathname, set href(value) { events.push(['navigate', value]); writes.push(value); }, get href() { return writes.at(-1) || "https://lucen-studios-preview-jessica-8829s-projects.vercel.app" + pathname; } } },
    navigator: { language: browser },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => { events.push(['store', key, value]); local.set(key, value); } },
    console,
  });
  vm.runInContext(source, context);
  return { context, document, listeners, local, writes, events, elements, buttons, links, switchers, hamburger, setMenuOpen(value) { menuOpen = value; observers.forEach(fn => fn()); } };
}

function element(attrs, content = 'server text') {
  return { attrs, innerHTML: content, placeholder: 'server placeholder', getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.attrs[name] = value; }, hasAttribute(name) { return Object.hasOwn(this.attrs, name); }, removeAttribute(name) { delete this.attrs[name]; } };
}
function button(lang) {
  const result = { dataset: { lang }, active: false, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  result.classList = { toggle(name, active) { assert.equal(name, 'active'); result.active = active; } };
  return result;
}

// Static pages select their server language synchronously, so dynamic callers can translate before DOM ready.
{
  const runState = run({ staticLang: 'de', saved: 'fr', browser: 'fr-CH' });
  assert.equal(vm.runInContext('currentLang', runState.context), 'de');
  assert.equal(vm.runInContext("t('nav_home')", runState.context), 'Startseite');
  runState.elements.push(element({ 'data-i18n': 'nav_home' }), element({ 'data-i18n': 'aria.open_menu', 'data-i18n-attr': 'aria-label', 'aria-label': 'server aria' }, '<span></span>'), element({ 'data-i18n-ph': 'ph.firstname' }));
  runState.buttons.push(button('de'), button('fr'));
  const before = JSON.stringify(runState.elements);
  runState.listeners.DOMContentLoaded();
  assert.equal(JSON.stringify(runState.elements), before, 'Static content, attributes and placeholders must remain untouched');
  assert.equal(runState.document.documentElement.lang, 'de');
  assert.equal(runState.buttons[0].active, true);
  assert.equal(runState.buttons[1].active, false);
  assert.deepEqual(runState.events, [], 'Static initialization must not run applyTranslations or overwrite preferences');
}

// Static language switching persists first and follows the matching hreflang URL.
{
  const runState = run({ staticLang: 'fr' });
  assert.equal(vm.runInContext('currentLang', runState.context), 'fr');
  assert.equal(vm.runInContext("t('nav_home')", runState.context), 'Accueil');
  runState.links.push({ getAttribute: name => name === 'hreflang' ? 'de' : null, href: 'https://www.gamperklimmek.com/de/calculator' });
  runState.buttons.push(button('de'));
  runState.listeners.DOMContentLoaded();
  runState.buttons[0].listeners.click();
  assert.equal(runState.local.get('gk_lang'), 'de');
  assert.equal(runState.writes.at(-1), '/de/calculator');
  assert.deepEqual(runState.events, [['store', 'gk_lang', 'de'], ['navigate', '/de/calculator']]);
}

// Missing alternates use the previous in-place fallback; unsupported languages do nothing.
{
  const state = run({ staticLang: 'de' });
  state.elements.push(element({ 'data-i18n': 'nav_home' }));
  vm.runInContext("switchLang('fr')", state.context);
  assert.equal(state.elements[0].innerHTML, 'Accueil');
  assert.equal(state.document.documentElement.lang, 'fr');
  assert.equal(state.local.get('gk_lang'), 'fr');
  assert.deepEqual(state.writes, []);
  const before = JSON.stringify(state.events);
  vm.runInContext("switchLang('xx')", state.context);
  assert.equal(JSON.stringify(state.events), before);
}

// English URLs stay English even with a German browser and saved French preference.
for (const saved of [null, 'fr']) {
  const state = run({ saved, browser: 'de-CH' });
  state.elements.push(element({ 'data-i18n': 'nav_home' }, 'Home'));
  state.links.push({ getAttribute: () => 'de', href: 'https://www.gamperklimmek.com/de' });
  state.listeners.DOMContentLoaded();
  assert.equal(state.elements[0].innerHTML, 'Home');
  assert.equal(state.document.documentElement.lang, 'en');
  assert.deepEqual(state.events, [], 'Initialization neither navigates nor rewrites preferences');
  vm.runInContext("switchLang('de')", state.context);
  assert.equal(state.elements[0].innerHTML, 'Home');
  assert.equal(state.writes.at(-1), '/de', 'English-page alternates use a path on the current origin');
}
for (const pathname of ['/start', '/resources', '/insurance', '/start.html']) {
  const state = run({ pathname });
  state.listeners.DOMContentLoaded();
  assert.equal(state.switchers[0].hidden, true, pathname);
  assert.equal(state.switchers[0].style.display, 'none', pathname);
}
for (const lang of ['es', 'it', 'xx']) {
  const state = run();
  vm.runInContext(`switchLang('${lang}')`, state.context);
  assert.deepEqual(state.events, []);
}

{
  const state = run({ withMenu: true });
  state.listeners.DOMContentLoaded();
  assert.equal(state.hamburger.attrs['aria-controls'], 'mobileMenu');
  assert.equal(state.hamburger.attrs['aria-expanded'], 'false');
  state.setMenuOpen(true);
  assert.equal(state.hamburger.attrs['aria-expanded'], 'true');
  state.setMenuOpen(false);
  assert.equal(state.hamburger.attrs['aria-expanded'], 'false');
  state.setMenuOpen(true);
  state.listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(state.document.querySelector('.mobile-menu').classList.contains('open'), false, 'Escape closes an open menu');
}

console.log('i18n runtime checks passed: static content, alternate navigation, EN stability, fallback and hidden switchers');

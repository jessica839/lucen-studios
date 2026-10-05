import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');

function run({ staticLang = null, saved = null, browser = 'en-US' } = {}) {
  const listeners = {};
  const writes = [];
  const events = [];
  const local = new Map(saved ? [['gk_lang', saved]] : []);
  const elements = [];
  const buttons = [];
  const links = [];
  const document = {
    documentElement: { dataset: staticLang ? { staticLang } : {}, lang: staticLang || 'en' },
    addEventListener(name, fn) { listeners[name] = fn; },
    querySelectorAll(selector) {
      if (selector.startsWith('link')) return links;
      if (selector.startsWith('[data-i18n')) return elements.filter(el => Object.hasOwn(el.attrs, selector.slice(1, -1)));
      return buttons;
    },
  };
  const context = vm.createContext({
    document,
    window: { location: { set href(value) { events.push(['navigate', value]); writes.push(value); }, get href() { return writes.at(-1); } } },
    navigator: { language: browser },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => { events.push(['store', key, value]); local.set(key, value); } },
    console,
  });
  vm.runInContext(source, context);
  return { context, document, listeners, local, writes, events, elements, buttons, links };
}

function element(attrs, content = 'server text') {
  return { attrs, innerHTML: content, placeholder: 'server placeholder', getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.attrs[name] = value; } };
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
  assert.equal(runState.writes.at(-1), 'https://www.gamperklimmek.com/de/calculator');
  assert.deepEqual(runState.events, [['store', 'gk_lang', 'de'], ['navigate', 'https://www.gamperklimmek.com/de/calculator']]);
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

// With no static marker, the existing browser detection and DOM translation path remains active.
{
  const runState = run({ saved: 'fr', browser: 'de-CH' });
  runState.elements.push(element({ 'data-i18n': 'nav_home' }));
  runState.links.push({ getAttribute: () => 'de', href: '/de' });
  runState.listeners.DOMContentLoaded();
  assert.equal(runState.elements[0].innerHTML, 'Accueil', 'Saved language wins over browser preference');
  vm.runInContext("switchLang('de')", runState.context);
  assert.equal(runState.elements[0].innerHTML, 'Startseite');
  assert.deepEqual(runState.writes, [], 'Non-static pages keep the existing in-place language switch');
}
for (const [browser, expected] of [['de-CH', 'de'], ['fr-FR', 'fr'], ['xx-XX', 'en']]) {
  const state = run({ browser });
  state.listeners.DOMContentLoaded();
  assert.equal(vm.runInContext('currentLang', state.context), expected);
}

console.log('i18n runtime checks passed');

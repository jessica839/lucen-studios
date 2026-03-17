/**
 * currency.js — IP-based currency detection + manual switcher
 * Gamper Klimmek Consulting
 *
 * Price elements: <* data-price-usd="1500">USD 1,500</*>
 * Optional suffix: data-price-usd-suffix=" fixed price"
 * Storage key: gk_currency  (CHF | EUR | USD)
 */
(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────── */
  var STORAGE_KEY = 'gk_currency';
  var CURRENCIES  = ['CHF', 'EUR', 'USD'];
  var RATES       = { USD: 1, CHF: 0.90, EUR: 0.92 };

  var EU = {
    AT:1, BE:1, BG:1, HR:1, CY:1, CZ:1, DK:1, EE:1, FI:1, FR:1,
    DE:1, GR:1, HU:1, IE:1, IT:1, LV:1, LT:1, LU:1, MT:1, NL:1,
    PL:1, PT:1, RO:1, SK:1, SI:1, ES:1, SE:1
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  function fmt(usdVal, currency) {
    var val = Math.round(usdVal * RATES[currency]);
    var s   = val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return currency + '\u00a0' + s;   // non-breaking space between code and number
  }

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function store(currency) {
    try { localStorage.setItem(STORAGE_KEY, currency); } catch (e) {}
  }

  /* ── DOM update ──────────────────────────────────────────── */
  function updateDOM(currency) {
    document.querySelectorAll('[data-price-usd]').forEach(function (el) {
      var usd = parseFloat(el.getAttribute('data-price-usd'));
      if (isNaN(usd)) return;
      var suffix = el.getAttribute('data-price-usd-suffix') || '';
      el.textContent = fmt(usd, currency) + suffix;
    });

    // Sync active state on all switcher buttons across the page
    document.querySelectorAll('.gk-currency-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.currency === currency);
    });
  }

  /* ── Set & persist ───────────────────────────────────────── */
  function setCurrency(currency) {
    if (!RATES[currency]) return;
    store(currency);
    updateDOM(currency);
  }

  /* ── IP detection ────────────────────────────────────────── */
  function detectAndSet() {
    var stored = getStored();
    if (stored && RATES[stored]) {
      updateDOM(stored);
      return;
    }

    fetch('https://ipapi.co/json/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var cc       = String(data.country_code || '').toUpperCase();
        var currency = 'USD';
        if (cc === 'CH')     currency = 'CHF';
        else if (EU[cc])     currency = 'EUR';
        setCurrency(currency);
      })
      .catch(function () {
        setCurrency('USD');
      });
  }

  /* ── Styles ──────────────────────────────────────────────── */
  function injectStyles() {
    var css = [
      /* Wrapper sits inline next to the language switcher */
      '.gk-currency-switcher{',
        'display:inline-flex;',
        'align-items:center;',
        'gap:.25rem;',
        'margin-left:.6rem;',
      '}',

      /* Thin separator rule before the currency block */
      '.gk-currency-switcher::before{',
        'content:"";',
        'display:block;',
        'width:1px;',
        'height:10px;',
        'background:rgba(255,255,255,.18);',
        'margin-right:.5rem;',
      '}',

      /* Buttons — match .gk-lang-btn / .lang-btn style exactly */
      '.gk-currency-btn{',
        'font-family:"Syne",sans-serif;',
        'font-size:.62rem;',
        'letter-spacing:.08em;',
        'text-transform:uppercase;',
        'border:1px solid rgba(255,255,255,.2);',
        'background:transparent;',
        'color:rgba(255,255,255,.6);',
        'padding:.28rem .45rem;',
        'cursor:pointer;',
        'line-height:1;',
        'transition:color .2s,border-color .2s;',
      '}',
      '.gk-currency-btn:hover{',
        'color:var(--gold,#c9a84c);',
        'border-color:rgba(201,168,76,.5);',
      '}',
      '.gk-currency-btn.active{',
        'color:var(--gold,#c9a84c);',
        'border-color:var(--gold,#c9a84c);',
      '}',

      /* On dive-suite nav (dark, flex, space-between) keep it compact */
      '.site-nav .gk-currency-switcher{margin-left:0;margin-right:.75rem;}',

      /* Mobile: hide switcher text on very small screens, show only on ≥400px */
      '@media(max-width:399px){.gk-currency-switcher{display:none;}}',
    ].join('');

    var style    = document.createElement('style');
    style.id     = 'gk-currency-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Build switcher widget ───────────────────────────────── */
  function buildSwitcher() {
    var wrap = document.createElement('div');
    wrap.className = 'gk-currency-switcher';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Currency');

    CURRENCIES.forEach(function (c) {
      var btn       = document.createElement('button');
      btn.className = 'gk-currency-btn';
      btn.dataset.currency = c;
      btn.textContent      = c;
      btn.type             = 'button';
      btn.setAttribute('aria-label', 'Show prices in ' + c);
      btn.addEventListener('click', function () { setCurrency(c); });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  /* ── Inject into the right place in the nav ─────────────── */
  function injectSwitcher() {
    // operators.html — uses .gk-lang-switcher
    // index.html     — uses .lang-switcher (inside a <li>)
    // dive-suite.html — no lang switcher; append before .nav-back-link
    var langSwitch = document.querySelector('.gk-lang-switcher, .lang-switcher');

    if (langSwitch) {
      // Insert immediately after the language switcher
      langSwitch.parentNode.insertBefore(buildSwitcher(), langSwitch.nextSibling);
      return;
    }

    // Fallback: insert before the last child of the first <nav>
    var nav = document.querySelector('nav');
    if (nav) {
      var last = nav.lastElementChild;
      nav.insertBefore(buildSwitcher(), last || null);
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    injectSwitcher();
    detectAndSet();
  });

  /* ── Public API (for external re-trigger if needed) ─────── */
  window.GK_setCurrency = setCurrency;

}());

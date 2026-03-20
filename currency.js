/**
 * currency.js — IP-based currency detection + footer switcher
 * Gamper Klimmek Consulting
 *
 * NEW scheme (explicit per-currency prices):
 *   <span data-price-chf="950" data-price-eur="950" data-price-usd="990">CHF 950</span>
 *
 * LEGACY scheme (still supported — computed from rates):
 *   <span data-price-usd="1056">CHF 950</span>
 *
 * Optional suffix: data-price-suffix=" fixed price"
 * Storage key: gk_currency  (CHF | EUR | USD)
 *
 * IP detection: ipapi.co → CH=CHF, EU=EUR, else=USD
 * Switcher: injected into <footer> before .footer-copy
 */
(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────── */
  var STORAGE_KEY = 'gk_currency';
  var CURRENCIES  = ['CHF', 'EUR', 'USD'];

  // Legacy fallback rates (only used for elements without explicit per-currency prices)
  var RATES = { USD: 1, CHF: 0.90, EUR: 0.92 };

  var EU = {
    AT:1, BE:1, BG:1, HR:1, CY:1, CZ:1, DK:1, EE:1, FI:1, FR:1,
    DE:1, GR:1, HU:1, IE:1, IT:1, LV:1, LT:1, LU:1, MT:1, NL:1,
    PL:1, PT:1, RO:1, SK:1, SI:1, ES:1, SE:1
  };

  /* ── Formatting ──────────────────────────────────────────── */
  function fmtNum(val) {
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtExact(currency, val) {
    return currency + '\u00a0' + fmtNum(val);
  }

  function fmtLegacy(usdVal, currency) {
    return currency + '\u00a0' + fmtNum(usdVal * RATES[currency]);
  }

  /* ── Storage ─────────────────────────────────────────────── */
  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function store(currency) {
    try { localStorage.setItem(STORAGE_KEY, currency); } catch (e) {}
  }

  /* ── DOM update ──────────────────────────────────────────── */
  function updateDOM(currency) {
    var key = 'data-price-' + currency.toLowerCase();

    // New scheme: elements with explicit per-currency prices (data-price-chf present)
    document.querySelectorAll('[data-price-chf]').forEach(function (el) {
      var val    = el.getAttribute(key);
      var suffix = el.getAttribute('data-price-suffix') || '';
      if (val !== null) {
        var num = parseFloat(val);
        if (!isNaN(num)) el.textContent = fmtExact(currency, num) + suffix;
      } else {
        // Specific currency attr missing — fall back to USD attr with rate
        var usd = parseFloat(el.getAttribute('data-price-usd') || '');
        if (!isNaN(usd)) el.textContent = fmtLegacy(usd, currency) + suffix;
      }
    });

    // Legacy scheme: only data-price-usd, no data-price-chf
    document.querySelectorAll('[data-price-usd]:not([data-price-chf])').forEach(function (el) {
      var usd    = parseFloat(el.getAttribute('data-price-usd'));
      var suffix = el.getAttribute('data-price-usd-suffix') || '';
      if (!isNaN(usd)) el.textContent = fmtLegacy(usd, currency) + suffix;
    });

    // Sync active state on all switcher buttons across the page
    document.querySelectorAll('.gk-currency-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.currency === currency);
    });
  }

  /* ── Set & persist ───────────────────────────────────────── */
  function setCurrency(currency) {
    if (CURRENCIES.indexOf(currency) === -1) return;
    store(currency);
    updateDOM(currency);
  }

  /* ── IP-based detection ──────────────────────────────────── */
  function detectAndSet() {
    var stored = getStored();
    if (stored && CURRENCIES.indexOf(stored) !== -1) {
      updateDOM(stored);
      return;
    }

    // Detect by IP: CH → CHF, EU countries → EUR, everyone else → USD
    fetch('https://ipapi.co/json/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var cc       = (data.country_code || '').toUpperCase();
        var currency = cc === 'CH' ? 'CHF' : EU[cc] ? 'EUR' : 'USD';
        setCurrency(currency);
      })
      .catch(function () {
        setCurrency('USD'); // safe international fallback
      });
  }

  /* ── Styles ──────────────────────────────────────────────── */
  function injectStyles() {
    var css = [
      /* Footer currency switcher wrapper */
      '.gk-currency-switcher{',
        'display:inline-flex;',
        'align-items:center;',
        'gap:.25rem;',
      '}',

      /* Buttons */
      '.gk-currency-btn{',
        'font-family:"Syne",sans-serif;',
        'font-size:.62rem;',
        'letter-spacing:.08em;',
        'text-transform:uppercase;',
        'border:1px solid rgba(255,255,255,.15);',
        'background:transparent;',
        'color:rgba(255,255,255,.35);',
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

      '@media(max-width:399px){.gk-currency-switcher{display:none;}}',
    ].join('');

    var style       = document.createElement('style');
    style.id        = 'gk-currency-styles';
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
      var btn              = document.createElement('button');
      btn.className        = 'gk-currency-btn';
      btn.dataset.currency = c;
      btn.textContent      = c;
      btn.type             = 'button';
      btn.setAttribute('aria-label', 'Show prices in ' + c);
      btn.addEventListener('click', function () { setCurrency(c); });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  /* ── Inject into footer ──────────────────────────────────── */
  function injectSwitcher() {
    var footer = document.querySelector('footer');
    if (!footer) return;

    var copy = footer.querySelector('.footer-copy');
    if (copy) {
      footer.insertBefore(buildSwitcher(), copy);
    } else {
      footer.appendChild(buildSwitcher());
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    injectSwitcher();
    detectAndSet();
  });

  /* ── Public API ──────────────────────────────────────────── */
  window.GK_setCurrency = setCurrency;

}());

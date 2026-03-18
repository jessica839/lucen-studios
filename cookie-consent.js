/**
 * Gamper Klimmek — Cookie Consent (Google Consent Mode v2)
 * GDPR / Swiss FADP compliant: analytics denied by default,
 * only granted after explicit user acceptance.
 *
 * Also gates the FEA Create CRM tracking script behind consent.
 *
 * Exposes window.GK_openCookieSettings() to reopen the banner.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'gk_cookie_consent';

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function saveConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }

  /* FEA Create / GoHighLevel CRM tracking script */
  var FEA_SRC = 'https://link.gamperklimmek.com/js/external-tracking.js';
  var FEA_TID = 'tk_ae9529981d674c5ebbdeb28a95ac2143';

  function loadFeaTracking() {
    if (document.querySelector('script[data-tracking-id="' + FEA_TID + '"]')) return;
    if (document.querySelector('script[src*="external-tracking"]')) return;
    var s = document.createElement('script');
    s.src = FEA_SRC;
    s.setAttribute('data-tracking-id', FEA_TID);
    s.async = true;
    document.head.appendChild(s);
  }

  function updateGtag(storage, adStorage) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: storage,
        ad_storage: adStorage || 'denied'
      });
    }
  }

  function removeBanner() {
    var el = document.getElementById('gk-cb');
    if (el) {
      el.style.transform = 'translateY(110%)';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }
  }

  function showBanner() {
    if (document.getElementById('gk-cb')) return; // already shown

    /* ── styles ─────────────────────────────────────────────────────── */
    var css = document.createElement('style');
    css.id = 'gk-cb-css';
    css.textContent = [
      '#gk-cb{',
        'position:fixed;bottom:0;left:0;right:0;z-index:99999;',
        'background:#0d1a1e;border-top:1px solid rgba(201,168,76,.28);',
        'padding:1.1rem 1.5rem;',
        'box-shadow:0 -6px 32px rgba(0,0,0,.45);',
        'transform:translateY(100%);opacity:0;',
        'transition:transform .38s cubic-bezier(.4,0,.2,1),opacity .38s ease;',
        'font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;',
        'font-size:0.83rem;line-height:1.5;',
      '}',
      '#gk-cb.gk-cb--visible{transform:translateY(0);opacity:1;}',
      '#gk-cb-inner{',
        'max-width:960px;margin:0 auto;',
        'display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;',
      '}',
      '#gk-cb-text{flex:1;min-width:220px;color:rgba(244,241,236,.72);}',
      '#gk-cb-text strong{',
        'display:block;color:#c9a84c;',
        'font-family:"Syne",-apple-system,sans-serif;',
        'font-size:.88rem;font-weight:700;letter-spacing:.04em;margin-bottom:.25rem;',
      '}',
      '#gk-cb-text a{color:rgba(201,168,76,.75);text-decoration:underline;text-underline-offset:2px;}',
      '#gk-cb-text a:hover{color:#c9a84c;}',
      '#gk-cb-btns{display:flex;gap:.6rem;flex-shrink:0;align-items:center;}',
      '.gk-cb-btn{',
        'cursor:pointer;border:none;border-radius:4px;',
        'font-family:"Syne",-apple-system,sans-serif;',
        'font-size:.82rem;font-weight:600;letter-spacing:.03em;',
        'padding:.55rem 1.15rem;transition:all .2s;white-space:nowrap;',
      '}',
      '.gk-cb-btn--accept{background:#c9a84c;color:#0a0a0f;}',
      '.gk-cb-btn--accept:hover{background:#e8c97a;}',
      '.gk-cb-btn--decline{',
        'background:transparent;color:rgba(244,241,236,.55);',
        'border:1px solid rgba(244,241,236,.2);',
      '}',
      '.gk-cb-btn--decline:hover{color:#f4f1ec;border-color:rgba(244,241,236,.5);}',
      '@media(max-width:560px){',
        '#gk-cb-inner{gap:.85rem;}',
        '#gk-cb-btns{width:100%;}',
        '.gk-cb-btn{flex:1;text-align:center;}',
      '}'
    ].join('');
    document.head.appendChild(css);

    /* ── markup ──────────────────────────────────────────────────────── */
    var banner = document.createElement('div');
    banner.id = 'gk-cb';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-label', 'Cookie consent');

    var legalPage = (window.location.pathname.indexOf('legal') !== -1)
      ? '#cookies'
      : '/legal.html#cookies';

    banner.innerHTML =
      '<div id="gk-cb-inner">' +
        '<div id="gk-cb-text">' +
          '<strong>Cookie &amp; Analytics Notice</strong>' +
          'We use Google Analytics to understand how visitors use this site. ' +
          'No data is shared for advertising purposes. ' +
          'Analytics cookies are only placed after you accept.' +
          ' <a href="' + legalPage + '">Privacy Policy</a>' +
        '</div>' +
        '<div id="gk-cb-btns">' +
          '<button class="gk-cb-btn gk-cb-btn--accept" id="gk-cb-accept">Accept analytics</button>' +
          '<button class="gk-cb-btn gk-cb-btn--decline" id="gk-cb-decline">Decline</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);

    /* animate in on next frame */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('gk-cb--visible');
      });
    });

    document.getElementById('gk-cb-accept').addEventListener('click', function () {
      saveConsent('granted');
      updateGtag('granted', 'granted');
      loadFeaTracking();
      removeBanner();
    });

    document.getElementById('gk-cb-decline').addEventListener('click', function () {
      saveConsent('denied');
      updateGtag('denied');
      removeBanner();
    });
  }

  /* ── public API ──────────────────────────────────────────────────── */
  window.GK_openCookieSettings = function () {
    /* Reset stored choice so banner shows again */
    try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
    showBanner();
  };

  /* ── init ────────────────────────────────────────────────────────── */
  var stored = getConsent();

  if (stored === 'granted') {
    updateGtag('granted');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadFeaTracking);
    } else {
      loadFeaTracking();
    }
    /* no banner needed */
  } else if (stored === 'denied') {
    /* stays denied — no banner */
  } else {
    /* no choice yet → show banner */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

}());

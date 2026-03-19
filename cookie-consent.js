/**
 * Gamper Klimmek — Cookie Consent (Google Consent Mode v2)
 * GDPR / Swiss FADP compliant: analytics denied by default,
 * only granted after explicit user acceptance.
 *
 * Gates behind consent:
 *   - FEA Create external-tracking.js (CRM pixel)
 *   - FEA Create form_embed.js (booking/contact forms)
 *   - Any element with class="gk-consent-gate" and data-consent-src="<url>"
 *     (renders as iframe after acceptance, placeholder before)
 *
 * Public API:
 *   window.GK_openCookieSettings()  — reopen the banner / reset choice
 *   window.GK_consentGranted()      — returns true if consent was granted
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

  /* ── FEA Create external tracking (CRM pixel) ────────────────── */
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

  /* ── FEA Create form embed (booking / contact forms) ─────────── */
  var FEA_FORM_SRC = 'https://link.gamperklimmek.com/js/form_embed.js';
  var _formEmbedLoaded = false;

  function loadFeaFormEmbed() {
    if (_formEmbedLoaded) return;
    if (document.querySelector('script[src*="form_embed"]')) {
      _formEmbedLoaded = true;
      return;
    }
    var s = document.createElement('script');
    s.src = FEA_FORM_SRC;
    s.async = true;
    document.head.appendChild(s);
    _formEmbedLoaded = true;
  }

  /* ── Consent-gated iframe rendering ──────────────────────────── */
  /**
   * Elements with class="gk-consent-gate" and data-consent-src="<url>"
   * are rendered as iframes when consent is granted, or shown as
   * explanatory placeholders when consent is denied / not yet given.
   *
   * Optional attributes on the container:
   *   data-consent-title   — iframe title (accessibility)
   *   data-consent-height  — iframe height hint (passed as data-height)
   *   data-consent-id      — id to assign to the rendered iframe
   *   data-consent-form-id — GoHighLevel form ID (sets data-form-id etc.)
   *   data-consent-msg     — custom placeholder message text
   */
  function renderConsentGatedElements(granted) {
    document.querySelectorAll('.gk-consent-gate').forEach(function (container) {
      if (granted) {
        if (container.querySelector('iframe')) return; /* already rendered */

        var src    = container.getAttribute('data-consent-src')    || '';
        var title  = container.getAttribute('data-consent-title')  || 'Embedded content';
        var height = container.getAttribute('data-consent-height') || '';
        var formId = container.getAttribute('data-consent-form-id') || '';
        var elemId = container.getAttribute('data-consent-id')     || '';

        var iframe = document.createElement('iframe');
        iframe.src   = src;
        iframe.title = title;
        iframe.style.cssText = 'width:100%;border:none;border-radius:3px;display:block;';
        iframe.setAttribute('loading', 'lazy');
        if (height) iframe.setAttribute('data-height', height);
        if (formId) {
          iframe.setAttribute('data-form-id', formId);
          iframe.setAttribute('data-layout', "{'id':'INLINE'}");
          iframe.setAttribute('data-trigger-type', 'alwaysShow');
          iframe.setAttribute('data-activation-type', 'alwaysActivated');
          iframe.setAttribute('data-deactivation-type', 'neverDeactivate');
          iframe.setAttribute('data-form-name', title);
        }
        if (elemId) {
          iframe.id = elemId;
          iframe.setAttribute('data-layout-iframe-id', elemId);
        }

        container.innerHTML = '';
        container.appendChild(iframe);
      } else {
        if (container.querySelector('iframe') || container.querySelector('.gk-cp')) return;
        var msg = container.getAttribute('data-consent-msg') ||
          'This content is provided by a third-party service. Accept cookies to load it.';
        container.innerHTML = buildPlaceholder(msg);
      }
    });
  }

  function buildPlaceholder(msg) {
    return '<div class="gk-cp" style="' +
      'border:1px solid rgba(201,168,76,0.2);border-radius:4px;' +
      'padding:2.5rem 2rem;text-align:center;background:rgba(255,255,255,0.02);">' +
      '<p style="font-family:\'DM Sans\',sans-serif;font-size:0.875rem;' +
        'color:rgba(244,241,236,0.55);line-height:1.6;margin:0 auto 1.25rem;' +
        'max-width:420px;">' + msg + '</p>' +
      '<button onclick="window.GK_openCookieSettings();return false;" style="' +
        'font-family:\'Syne\',sans-serif;font-size:0.78rem;font-weight:700;' +
        'letter-spacing:0.08em;text-transform:uppercase;background:#c9a84c;' +
        'color:#0a0a0f;border:none;cursor:pointer;padding:0.65rem 1.5rem;' +
        'border-radius:3px;transition:background 0.2s;">' +
      'Accept cookies to load form</button>' +
      '</div>';
  }

  /* ── gtag consent update ─────────────────────────────────────── */
  function updateGtag(storage, adStorage) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: storage,
        ad_storage: adStorage || 'denied'
      });
    }
  }

  /* ── GA event helper (only fires when consent granted) ───────── */
  function gkEvent(name, params) {
    if (getConsent() === 'granted' && typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  /* ── Banner ──────────────────────────────────────────────────── */
  function removeBanner() {
    var el = document.getElementById('gk-cb');
    if (el) {
      el.style.transform = 'translateY(110%)';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }
  }

  function showBanner() {
    if (document.getElementById('gk-cb')) return;

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
          'No data is shared for advertising. ' +
          'Analytics and third-party contact forms only load after you accept.' +
          ' <a href="' + legalPage + '">Privacy Policy</a>' +
        '</div>' +
        '<div id="gk-cb-btns">' +
          '<button class="gk-cb-btn gk-cb-btn--accept" id="gk-cb-accept">Accept analytics</button>' +
          '<button class="gk-cb-btn gk-cb-btn--decline" id="gk-cb-decline">Decline</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('gk-cb--visible'); });
    });

    document.getElementById('gk-cb-accept').addEventListener('click', function () {
      saveConsent('granted');
      updateGtag('granted', 'granted');
      loadFeaTracking();
      loadFeaFormEmbed();
      renderConsentGatedElements(true);
      removeBanner();
    });

    document.getElementById('gk-cb-decline').addEventListener('click', function () {
      saveConsent('denied');
      updateGtag('denied');
      renderConsentGatedElements(false);
      removeBanner();
    });
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.GK_openCookieSettings = function () {
    try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
    showBanner();
  };

  window.GK_consentGranted = function () {
    return getConsent() === 'granted';
  };

  /* Exposed so inline GA event calls can check consent first */
  window.GK_event = gkEvent;

  /* ── Init ────────────────────────────────────────────────────── */
  var stored = getConsent();

  if (stored === 'granted') {
    updateGtag('granted');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        loadFeaTracking();
        loadFeaFormEmbed();
        renderConsentGatedElements(true);
      });
    } else {
      loadFeaTracking();
      loadFeaFormEmbed();
      renderConsentGatedElements(true);
    }
  } else if (stored === 'denied') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderConsentGatedElements(false); });
    } else {
      renderConsentGatedElements(false);
    }
  } else {
    /* No choice yet — show banner and render placeholders */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        showBanner();
        renderConsentGatedElements(false);
      });
    } else {
      showBanner();
      renderConsentGatedElements(false);
    }
  }

}());

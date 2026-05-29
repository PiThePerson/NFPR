/* ════════════════ NeuronFRAMES — Auto language toggle (EN ⇄ ไทย) ════════════════
 *
 * Runtime machine translation — NOT a hard-coded dictionary.
 * Any visible English text is translated to Thai on demand via a translation
 * API, results are cached in localStorage, and a MutationObserver keeps newly
 * added / changed text translated automatically while Thai is active.
 *
 * Toggling back to English restores the original text from per-node memory.
 * The choice is persisted (localStorage) and shared across every page.
 * ──────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var LANG_KEY  = 'nf-lang';            // 'en' | 'th'
  var CACHE_KEY = 'nf-th-cache-v1';     // { "<english>": "<thai>" }
  var SRC = 'en', TGT = 'th';
  var CONCURRENCY = 8;

  /* Authoritative translations.
     - A few manual terms we never want machine-translated.
     - Everything in the prebuilt cache (th-cache.js → window.NF_TH_CACHE),
       generated at build time. These are used as-is, never re-fetched, so the
       site works fully offline / under strict CORS with guaranteed quality.
     Any string NOT found here falls back to the live translation API. */
  var OVERRIDES = {
    "NeuronFRAMES": "NeuronFRAMES"
  };
  if (window.NF_TH_CACHE) {
    Object.keys(window.NF_TH_CACHE).forEach(function (k) {
      if (OVERRIDES[k] == null && window.NF_TH_CACHE[k]) OVERRIDES[k] = window.NF_TH_CACHE[k];
    });
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1 };

  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) {}
  var cacheDirty = false;
  function saveCache() {
    if (!cacheDirty) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); cacheDirty = false; } catch (e) {}
  }

  var currentLang = 'en';
  var suppress = false;          // ignore our own DOM writes in the observer
  var EN_TITLE = document.title;

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function norm(s) { return s ? s.replace(/\s+/g, ' ').trim() : ''; }

  function translatable(s) {
    if (!s) return false;
    if (!/[A-Za-z]/.test(s)) return false;          // must contain Latin letters
    if (/[฀-๿]/.test(s)) return false;  // already Thai
    if (/^\S+@\S+\.\S+$/.test(s)) return false;     // email
    if (/^(https?:)?\/\//.test(s)) return false;    // URL
    if (/^\S+\.(html|com|org|net|js|css|png|jpg|svg)$/i.test(s)) return false; // filename/domain
    return true;
  }

  function lead(s)  { return (s.match(/^\s*/) || [''])[0]; }
  function trail(s) { return (s.match(/\s*$/) || [''])[0]; }

  function skippableParent(el) {
    while (el) {
      if (el.nodeType === 1) {
        if (SKIP_TAGS[el.nodeName]) return true;
        if (el.hasAttribute && el.hasAttribute('data-no-translate')) return true;
      }
      el = el.parentNode;
    }
    return false;
  }

  /* Collect candidate text nodes under `root` (inclusive). */
  function gatherTextNodes(root, out) {
    if (root.nodeType === 3) {                       // text node
      if (root.nodeValue && root.nodeValue.trim() && !skippableParent(root.parentNode)) out.push(root);
      return;
    }
    if (root.nodeType !== 1) return;                 // only elements otherwise
    if (SKIP_TAGS[root.nodeName] || (root.hasAttribute && root.hasAttribute('data-no-translate'))) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return skippableParent(node.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) out.push(walker.currentNode);
  }

  function allTextNodes() { var out = []; gatherTextNodes(document.body, out); return out; }

  function attrTargets() {
    return Array.prototype.slice.call(document.querySelectorAll('[placeholder]'))
      .filter(function (el) { return !skippableParent(el); });
  }

  /* ── translation API (Google endpoint, MyMemory fallback) ─────────────── */
  function gtx(text) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
      SRC + '&tl=' + TGT + '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('gtx ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!data || !data[0]) throw new Error('gtx bad');
      return data[0].map(function (seg) { return seg && seg[0] ? seg[0] : ''; }).join('');
    });
  }
  function myMemory(text) {
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
      '&langpair=' + SRC + '|' + TGT;
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.responseData && d.responseData.translatedText) return d.responseData.translatedText;
      throw new Error('mymemory bad');
    });
  }
  function translateOne(text) {
    return gtx(text).catch(function () { return myMemory(text); });
  }

  /* Ensure every string in `keys` has a cached Thai translation. */
  function ensureTranslations(keys) {
    var todo = [];
    var seen = {};
    keys.forEach(function (k) {
      if (!seen[k] && translatable(k) && OVERRIDES[k] == null && cache[k] == null) { seen[k] = 1; todo.push(k); }
    });
    if (!todo.length) return Promise.resolve();

    var i = 0;
    function worker() {
      if (i >= todo.length) return Promise.resolve();
      var key = todo[i++];
      return translateOne(key).then(function (tr) {
        if (tr && tr.trim()) { cache[key] = tr; cacheDirty = true; }
      }).catch(function () { /* leave untranslated → stays English */ })
        .then(worker);
    }
    var pool = [];
    for (var w = 0; w < CONCURRENCY; w++) pool.push(worker());
    return Promise.all(pool).then(saveCache);
  }

  function thaiFor(key) { return OVERRIDES[key] != null ? OVERRIDES[key] : cache[key]; }

  /* ── apply / restore ─────────────────────────────────────────────────── */
  function applyNode(n) {
    var raw = n.nodeValue, key = norm(raw);
    if (!translatable(key)) return;
    var tr = thaiFor(key);
    if (tr == null) return;
    if (n.__nfEn === undefined) n.__nfEn = raw;
    var val = lead(raw) + tr + trail(raw);
    n.__nfTh = val;
    if (n.nodeValue !== val) n.nodeValue = val;
  }
  function restoreNode(n) {
    if (n.__nfEn !== undefined && n.nodeValue !== n.__nfEn) n.nodeValue = n.__nfEn;
  }
  function applyAttr(el) {
    var raw = el.getAttribute('placeholder'), key = norm(raw);
    if (!translatable(key)) return;
    var tr = thaiFor(key);
    if (tr == null) return;
    if (el.__nfEnPh === undefined) el.__nfEnPh = raw;
    el.setAttribute('placeholder', tr);
  }
  function restoreAttr(el) {
    if (el.__nfEnPh !== undefined) el.setAttribute('placeholder', el.__nfEnPh);
  }

  function withSuppressed(fn) {
    suppress = true;
    try { fn(); } finally {
      if (observer) observer.takeRecords();   // discard mutations we just caused
      suppress = false;
    }
  }

  /* ── busy state on the button ────────────────────────────────────────── */
  function btn() { return document.getElementById('lang-toggle'); }
  function labelEl() { return document.querySelector('#lang-toggle .lang-label'); }
  function setBusy(on) {
    var b = btn(); if (!b) return;
    b.classList.toggle('is-loading', !!on);
    b.disabled = !!on;
    var l = labelEl();
    if (l) l.textContent = on ? '…' : (currentLang === 'th' ? 'EN' : 'ไทย');
  }
  function setLangUI(lang) {
    document.documentElement.lang = lang;
    document.title = (lang === 'th') ? (thaiFor(norm(EN_TITLE)) ? lead(EN_TITLE) + thaiFor(norm(EN_TITLE)) + trail(EN_TITLE) : EN_TITLE) : EN_TITLE;
    var l = labelEl(); if (l) l.textContent = (lang === 'th') ? 'EN' : 'ไทย';
    var b = btn(); if (b) b.setAttribute('aria-label', lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย');
  }

  function uncloak() { document.documentElement.classList.remove('nf-cloak'); }

  /* ── main toggle ─────────────────────────────────────────────────────── */
  function toThai() {
    var nodes = allTextNodes();
    var attrs = attrTargets();

    /* Phase 1 — synchronous: apply everything already known (prebuilt cache,
       overrides, localStorage). No network, so this is instant and lets the
       page reveal in Thai with no flash of English. */
    currentLang = 'th';
    withSuppressed(function () {
      nodes.forEach(applyNode);
      attrs.forEach(applyAttr);
    });
    setLangUI('th');
    try { localStorage.setItem(LANG_KEY, 'th'); } catch (e) {}
    uncloak();

    /* Phase 2 — async: fetch any strings not yet cached, then fill them in.
       With a complete prebuilt cache this is a no-op. */
    var keys = [];
    nodes.forEach(function (n) { keys.push(norm(n.nodeValue)); });
    attrs.forEach(function (el) { keys.push(norm(el.getAttribute('placeholder'))); });
    keys.push(norm(EN_TITLE));
    var missing = keys.filter(function (k) {
      return translatable(k) && OVERRIDES[k] == null && cache[k] == null;
    });
    if (!missing.length) return Promise.resolve();

    setBusy(true);
    return ensureTranslations(missing).then(function () {
      withSuppressed(function () { nodes.forEach(applyNode); attrs.forEach(applyAttr); });
      setLangUI('th');
      setBusy(false);
    }, function () { setBusy(false); });
  }

  function toEnglish() {
    withSuppressed(function () {
      allTextNodes().forEach(restoreNode);
      attrTargets().forEach(restoreAttr);
    });
    currentLang = 'en';
    setLangUI('en');
    try { localStorage.setItem(LANG_KEY, 'en'); } catch (e) {}
  }

  /* ── dynamic content: translate things added / changed while Thai is on ── */
  var pending = [], pendTimer = null;
  function scheduleTranslate(extraNodes) {
    if (extraNodes) for (var i = 0; i < extraNodes.length; i++) pending.push(extraNodes[i]);
    if (pendTimer) return;
    pendTimer = setTimeout(function () {
      pendTimer = null;
      if (currentLang !== 'th' || !pending.length) { pending = []; return; }
      var batch = pending; pending = [];
      var keys = batch.map(function (n) { return norm(n.nodeValue); });
      ensureTranslations(keys).then(function () {
        withSuppressed(function () { batch.forEach(applyNode); });
      });
    }, 60);
  }

  var observer = new MutationObserver(function (muts) {
    if (currentLang !== 'th' || suppress) return;
    var found = [];
    muts.forEach(function (m) {
      if (m.type === 'characterData') {
        var t = m.target;
        if (t.nodeType === 3 && t.nodeValue && t.nodeValue.trim() && !skippableParent(t.parentNode)) {
          if (t.nodeValue !== t.__nfTh) { t.__nfEn = undefined; t.__nfTh = undefined; } // changed externally
          found.push(t);
        }
      } else if (m.type === 'childList') {
        Array.prototype.forEach.call(m.addedNodes, function (an) { gatherTextNodes(an, found); });
      }
    });
    if (found.length) scheduleTranslate(found);
  });

  /* ── init ────────────────────────────────────────────────────────────── */
  function init() {
    var b = btn();
    if (b) b.addEventListener('click', function () {
      if (b.disabled) return;
      if (currentLang === 'th') toEnglish(); else toThai();
    });

    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    var saved;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (saved === 'th') toThai();
    else uncloak();   // reveal immediately for English
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

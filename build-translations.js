#!/usr/bin/env node
/* ═══════════════════ NeuronFRAMES — Thai translation prebuilder ═══════════════════
 *
 * Build-time step that generates `th-cache.js` (window.NF_TH_CACHE), a complete
 * English→Thai cache for every visible string across all *.html pages.
 *
 * At runtime, lang-toggle.js loads this cache and uses it as authoritative,
 * so the live translation API is never needed for known strings — the site
 * translates instantly, offline, and with consistent quality (no CORS issues).
 *
 *   Usage:   node build-translations.js
 *            npm run build:th
 *
 * Requires Node 18+ (uses the built-in global `fetch`). No npm dependencies.
 * Existing translations in th-cache.js are preserved (so you can hand-edit
 * any entry and it won't be overwritten); only missing strings are fetched.
 * ──────────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'th-cache.js');
const SRC = 'en', TGT = 'th';
const DELAY_MS = 120;            // polite delay between API calls
const MAX_RETRY = 3;

/* ── HTML entity decode ──────────────────────────────────────────────── */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', times: '×',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°', trade: '™',
  copy: '©', reg: '®', rarr: '→', larr: '←', uarr: '↑', darr: '↓'
};
function decode(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
          .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
          .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] != null ? ENTITIES[name]
                 : (ENTITIES[name.toLowerCase()] != null ? ENTITIES[name.toLowerCase()] : m));
}

/* ── same translatable() rule as the runtime ────────────────────────── */
function norm(s) { return s ? s.replace(/\s+/g, ' ').trim() : ''; }
function translatable(s) {
  if (!s) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (/[฀-๿]/.test(s)) return false;            // already Thai
  if (/^\S+@\S+\.\S+$/.test(s)) return false;             // email
  if (/^(https?:)?\/\//.test(s)) return false;            // URL
  if (/^\S+\.(html|com|org|net|js|css|png|jpg|svg)$/i.test(s)) return false;
  return true;
}

/* ── extract translatable strings from one HTML document ─────────────── */
function extract(html) {
  const found = new Set();

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) { const t = norm(decode(title[1])); if (translatable(t)) found.add(t); }

  let re = /placeholder\s*=\s*"([^"]*)"/gi, m;
  while ((m = re.exec(html))) { const t = norm(decode(m[1])); if (translatable(t)) found.add(t); }

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, ' ')
    .replace(/<(code|pre)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<button[^>]*data-no-translate[^>]*>[\s\S]*?<\/button>/gi, ' ');

  // Split on tags; each gap is a candidate text node (mirrors the runtime walker).
  body.split(/<[^>]*>/).forEach(frag => {
    const t = norm(decode(frag));
    if (translatable(t)) found.add(t);
  });

  return found;
}

/* ── translation API: Google endpoint, MyMemory fallback ─────────────── */
async function gtx(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
    SRC + '&tl=' + TGT + '&dt=t&q=' + encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('gtx ' + r.status);
  const data = await r.json();
  if (!data || !data[0]) throw new Error('gtx bad');
  return data[0].map(seg => (seg && seg[0]) ? seg[0] : '').join('');
}
async function myMemory(text) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
    '&langpair=' + SRC + '|' + TGT;
  const r = await fetch(url);
  const d = await r.json();
  if (d && d.responseData && d.responseData.translatedText) return d.responseData.translatedText;
  throw new Error('mymemory bad');
}
async function translate(text) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try { return await gtx(text); }
    catch (e) {
      try { return await myMemory(text); }
      catch (e2) {
        if (attempt === MAX_RETRY) throw e2;
        await sleep(500 * attempt);
      }
    }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── load existing cache (preserve manual edits / done work) ─────────── */
function loadExisting() {
  try {
    const txt = fs.readFileSync(OUT, 'utf8');
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch (e) {}
  return {};
}

function writeCache(cache) {
  const keys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
  const body = keys.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(cache[k])).join(',\n');
  const out =
    '/* AUTO-GENERATED by build-translations.js — English→Thai prebuilt cache.\n' +
    '   Run `node build-translations.js` to refresh. Hand-edits are preserved\n' +
    '   on re-run (only missing strings are fetched). ' + keys.length + ' entries. */\n' +
    'window.NF_TH_CACHE = {\n' + body + '\n};\n';
  fs.writeFileSync(OUT, out);
}

/* ── main ────────────────────────────────────────────────────────────── */
(async function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));
  const all = new Set();
  files.forEach(f => {
    const html = fs.readFileSync(path.join(DIR, f), 'utf8');
    extract(html).forEach(s => all.add(s));
  });

  const cache = loadExisting();
  const todo = [...all].filter(s => cache[s] == null);

  console.log(`Pages: ${files.length}  ·  unique strings: ${all.size}  ·  already cached: ${all.size - todo.length}  ·  to translate: ${todo.length}`);
  if (!todo.length) { writeCache(cache); console.log('th-cache.js up to date.'); return; }

  let done = 0, failed = 0;
  for (const s of todo) {
    try {
      const tr = await translate(s);
      if (tr && tr.trim()) cache[s] = tr;
      else failed++;
    } catch (e) { failed++; process.stdout.write('\n  ! failed: ' + JSON.stringify(s.slice(0, 60)) + '\n'); }
    done++;
    if (done % 10 === 0 || done === todo.length) {
      process.stdout.write(`\r  translated ${done}/${todo.length}${failed ? ' (' + failed + ' failed)' : ''}   `);
      writeCache(cache);                   // checkpoint so partial runs aren't lost
    }
    await sleep(DELAY_MS);
  }
  writeCache(cache);
  console.log(`\nDone. th-cache.js now has ${Object.keys(cache).length} entries${failed ? ', ' + failed + ' could not be translated (left to runtime API)' : ''}.`);
})().catch(e => { console.error('\nBuild failed:', e); process.exit(1); });

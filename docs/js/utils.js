// Utility functions — pure helpers with no state dependencies
// Extracted from index.html

(function () {
  'use strict';

function normalizeTerm(term) {
  return String(term || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseNumeric(text) {
  if (text == null) return NaN;
  const raw = String(text).trim();
  if (!raw) return NaN;
  const s = raw.replace(/,/g, '');
  // Strict numeric: optional sign, digits with optional decimal OR leading decimal, optional trailing %.
  // Entire cell must match; avoids treating values like "3H6" as numeric.
  const re = /^-?(?:\d+(?:\.\d+)?|\.\d+)%?$/;
  if (!re.test(s)) return NaN;
  const num = parseFloat(s.replace('%',''));
  return Number.isFinite(num) ? num : NaN;
}

function pickTextColorForBg(rgbStr) {
  const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(rgbStr);
  if (!m) return '#1a1a1a';
  const r = parseInt(m[1],10), g = parseInt(m[2],10), b = parseInt(m[3],10);
  const brightness = (r*299 + g*587 + b*114) / 1000; // YIQ
  return brightness < 170 ? '#ffffff' : '#1a1a1a';
}

function quantiles(arr, qs) {
  if (!arr.length) return qs.map(() => NaN);
  const a = [...arr].sort((x,y)=>x-y);
  const n = a.length;
  return qs.map(q => {
    if (n === 1) return a[0];
    const pos = (n - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return a[base] + (a[Math.min(base+1, n-1)] - a[base]) * rest;
  });
}

function normName(s){ return String(s||'').toUpperCase().replace(/\s+/g,' ').trim(); }

function fmtPct(num) { return (num*100).toFixed(3) + '%'; }

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

function highlightHTML(text, re) {
  if (!re) return escapeHTML(text);
  let out = '';
  let last = 0;
  const s = String(text);
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index;
    const end = start + (m[0]?.length || 0);
    out += escapeHTML(s.slice(last, start));
    out += '<span class="hit">' + escapeHTML(m[0]) + '</span>';
    last = end;
    if (!re.global) break;
    if (end === start) re.lastIndex++; // avoid zero-width infinite loop
  }
  out += escapeHTML(s.slice(last));
  return out;
}

function toCsvValue(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(toCsvValue).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function countRegexMatches(text, re) {
  if (!re) return 0;
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const r = new RegExp(re.source, flags);
  let count = 0;
  let m;
  while ((m = r.exec(text))) {
    if (m[0].length === 0) {
      r.lastIndex++;
      continue;
    }
    count++;
  }
  return count;
}

function tokenizeLineText(text) {
  const m = String(text || '').normalize('NFC').toLowerCase().match(/[\p{L}]+/gu);
  return m ? m : [];
}

function getLineTokens(line) {
  if (!line) return [];
  if (!line._tokensCache) {
    line._tokensCache = tokenizeLineText(line.text);
  }
  return line._tokensCache;
}

function getLineNgrams(line, n) {
  if (!line) return [];
  if (!line._ngramsCache) line._ngramsCache = {};
  if (!line._ngramsCache[n]) {
    const toks = getLineTokens(line);
    const out = [];
    for (let i = 0; i <= toks.length - n; i++) {
      out.push(toks.slice(i, i + n).join(' '));
    }
    line._ngramsCache[n] = out;
  }
  return line._ngramsCache[n];
}

function escapeRegexText(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHighlightRegexFromNgrams(ngrams) {
  if (!Array.isArray(ngrams) || ngrams.length === 0) return null;
  const parts = [];
  for (const ng of ngrams) {
    const tokens = ng.split(' ').filter(Boolean).map(escapeRegexText);
    if (tokens.length === 0) continue;
    parts.push('\\b' + tokens.join('\\s+') + '\\b');
  }
  if (parts.length === 0) return null;
  return new RegExp(parts.join('|'), 'gi');
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function paginateArray(arr, page, pageSize) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return arr.slice(start, end);
}

function getTotalPages(totalRows, pageSize) {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

function setElementHidden(el, hidden) {
  if (!el || !el.classList) return;
  el.classList.toggle('is-hidden', !!hidden);
}

function showElement(el) {
  setElementHidden(el, false);
}

function hideElement(el) {
  setElementHidden(el, true);
}

  // Expose on window
  window.normalizeTerm = normalizeTerm;
  window.parseNumeric = parseNumeric;
  window.pickTextColorForBg = pickTextColorForBg;
  window.quantiles = quantiles;
  window.normName = normName;
  window.fmtPct = fmtPct;
  window.escapeHTML = escapeHTML;
  window.highlightHTML = highlightHTML;
  window.toCsvValue = toCsvValue;
  window.downloadCsv = downloadCsv;
  window.stripTags = stripTags;
  window.countRegexMatches = countRegexMatches;
  window.tokenizeLineText = tokenizeLineText;
  window.getLineTokens = getLineTokens;
  window.getLineNgrams = getLineNgrams;
  window.escapeRegexText = escapeRegexText;
  window.buildHighlightRegexFromNgrams = buildHighlightRegexFromNgrams;
  window.debounce = debounce;
  window.paginateArray = paginateArray;
  window.getTotalPages = getTotalPages;
  window.setElementHidden = setElementHidden;
  window.showElement = showElement;
  window.hideElement = hideElement;
})();

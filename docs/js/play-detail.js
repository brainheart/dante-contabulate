// Canto Detail Modal (TF-IDF analysis)
// Extracted from index.html — initialized via initPlayDetail()

(function () {
  'use strict';

  const NAME_TOKEN_RE = /[a-z]+/g;
  const GENERIC_CHARACTER_NAME_TOKENS = new Set([
    'all', 'and', 'both', 'boy', 'captain', 'chorus', 'citizen', 'citizens', 'clown',
    'constable', 'doctor', 'duke', 'earl', 'epilogue', 'first', 'fool', 'fourth', 'gentleman',
    'gentlemen', 'girl', 'governor', 'guard', 'guards', 'herald', 'jailer', 'king', 'knight',
    'lady', 'lord', 'lords', 'man', 'mayor', 'messenger', 'messengers', 'musician', 'musicians',
    'nobleman', 'nurse', 'of', 'officer', 'officers', 'old', 'other', 'others', 'page', 'porter',
    'priest', 'prince', 'prologue', 'queen', 'second', 'senator', 'senators', 'servant',
    'servants', 'seventh', 'sheriff', 'sixth', 'soldier', 'soldiers', 'tenth', 'the', 'third',
    'unknown', 'watch', 'widow', 'woman', 'young'
  ]);

  let sceneToPlayId, playShapeById, chunkById, playsById, tokens, tokens2, tokens3, escapeHTML, characterNameFiltersByPlay;
  const setElementHidden = window.setElementHidden || ((el, hidden) => {
    if (!el || !el.classList) return;
    el.classList.toggle('is-hidden', !!hidden);
  });

  const playDetailCache = new Map();
  const playDetailState = {
    playId: null,
    currentN: 1,
    sortKey: 'count',
    sortDir: 'desc',
    excludeCharacterNames: true,
    threshold: 0,
    rowsByN: { 1: [], 2: [], 3: [] },
    maxByN: { 1: 0, 2: 0, 3: 0 },
    rowsByNNoNames: { 1: [], 2: [], 3: [] },
    maxByNNoNames: { 1: 0, 2: 0, 3: 0 }
  };
  let playDetailEls = null;

  function getDocCountTotal() {
    return playsById && typeof playsById.size === 'number' ? playsById.size : 1;
  }

  function isPlayDetailCell(granVal, key, row) {
    if (!row || row.play_id == null) return false;
    if (granVal === 'play' && (key === 'title' || key === 'id')) return true;
    if ((granVal === 'scene' || granVal === 'act' || granVal === 'character') && key === 'play_title') return true;
    return false;
  }

  function buildPlayDetailLink(text, playId) {
    const el = document.createElement('span');
    el.className = 'play-detail-link';
    el.dataset.playId = String(playId);
    el.textContent = String(text ?? '');
    return el;
  }

  function renderPlayDetailHeaderLabel(label, playId) {
    const safe = escapeHTML(label ?? '');
    if (playId == null || Number.isNaN(Number(playId))) return safe;
    return `<span class="play-detail-link" data-play-id="${Number(playId)}">${safe}</span>`;
  }

  function tokenizeName(name) {
    return String(name || '').toLowerCase().match(NAME_TOKEN_RE) || [];
  }

  function createCharacterNameFilter() {
    return { tokens: new Set(), phrasesByN: { 1: new Set(), 2: new Set(), 3: new Set() } };
  }

  function ensureCharacterNameFilter(byPlay, playId) {
    if (!byPlay.has(playId)) byPlay.set(playId, createCharacterNameFilter());
    return byPlay.get(playId);
  }

  function addAutoDetectedName(filter, name) {
    const toks = tokenizeName(name);
    if (!toks.length) return;

    if (toks.length >= 2 && toks.length <= 3) {
      filter.phrasesByN[toks.length].add(toks.join(' '));
    }

    const filteredTokens = Array.from(new Set(toks.filter(tok => (
      tok.length >= 2 && !GENERIC_CHARACTER_NAME_TOKENS.has(tok)
    ))));
    for (const tok of filteredTokens) filter.tokens.add(tok);
  }

  function addConfigName(filter, name) {
    const toks = tokenizeName(name);
    if (!toks.length || toks.length > 3) return;
    const phrase = toks.join(' ');
    filter.phrasesByN[toks.length].add(phrase);
    if (toks.length === 1) filter.tokens.add(toks[0]);
  }

  function removeConfigName(filter, name) {
    const toks = tokenizeName(name);
    if (!toks.length || toks.length > 3) return;
    const phrase = toks.join(' ');
    filter.phrasesByN[toks.length].delete(phrase);
    if (toks.length === 1) filter.tokens.delete(toks[0]);
  }

  function buildConfigPlayLookup(playsByIdMap) {
    const lookup = new Map();
    for (const [playId, play] of playsByIdMap.entries()) {
      lookup.set(String(playId), playId);
      if (play && play.abbr) lookup.set(String(play.abbr).trim().toUpperCase(), playId);
      if (play && play.title) lookup.set(String(play.title).trim().toLowerCase(), playId);
    }
    return lookup;
  }

  function resolveConfigPlayId(key, lookup) {
    const raw = String(key || '').trim();
    if (!raw) return null;
    if (lookup.has(raw)) return lookup.get(raw);
    const upper = raw.toUpperCase();
    if (lookup.has(upper)) return lookup.get(upper);
    const lower = raw.toLowerCase();
    if (lookup.has(lower)) return lookup.get(lower);
    return null;
  }

  function applyCharacterNameFilterConfig(byPlay, playsByIdMap, config) {
    if (!config || typeof config !== 'object') return byPlay;

    const playIds = Array.from(playsByIdMap.keys());
    const globalAdditions = Array.isArray(config.global_additions) ? config.global_additions : [];
    const globalRemovals = Array.isArray(config.global_removals) ? config.global_removals : [];
    for (const playId of playIds) {
      const filter = ensureCharacterNameFilter(byPlay, playId);
      globalAdditions.forEach(name => addConfigName(filter, name));
      globalRemovals.forEach(name => removeConfigName(filter, name));
    }

    const lookup = buildConfigPlayLookup(playsByIdMap);
    const applyPerPlay = (entries, applyFn) => {
      for (const [playKey, names] of Object.entries(entries || {})) {
        const playId = resolveConfigPlayId(playKey, lookup);
        if (!Number.isInteger(playId)) continue;
        const filter = ensureCharacterNameFilter(byPlay, playId);
        (Array.isArray(names) ? names : []).forEach(name => applyFn(filter, name));
      }
    };

    applyPerPlay(config.play_additions, addConfigName);
    applyPerPlay(config.play_removals, removeConfigName);
    return byPlay;
  }

  function buildCharacterNameTokensByPlay(characters, playsByIdMap, config) {
    const byPlay = new Map();
    for (const ch of characters || []) {
      const playId = Number(ch && ch.play_id);
      if (!Number.isInteger(playId)) continue;
      const filter = ensureCharacterNameFilter(byPlay, playId);
      addAutoDetectedName(filter, ch.name);
    }
    return applyCharacterNameFilterConfig(byPlay, playsByIdMap, config);
  }

  function ngramContainsCharacterName(ngram, playId) {
    const filter = characterNameFiltersByPlay && characterNameFiltersByPlay.get(playId);
    if (!filter) return false;

    const phrase = String(ngram || '').toLowerCase().trim();
    if (!phrase) return false;
    const toks = phrase.split(' ');
    const phraseSet = filter.phrasesByN[toks.length];
    if (phraseSet && phraseSet.has(phrase)) return true;
    for (const tok of toks) {
      if (filter.tokens.has(tok)) return true;
    }
    return false;
  }

  function maxTfIdfFromRows(rows) {
    let max = 0;
    for (const row of rows || []) {
      if (row.tfidf > max) max = row.tfidf;
    }
    return max;
  }

  function rowsForCurrentSelection() {
    const n = playDetailState.currentN;
    return playDetailState.excludeCharacterNames
      ? (playDetailState.rowsByNNoNames[n] || [])
      : (playDetailState.rowsByN[n] || []);
  }

  function maxForCurrentSelection() {
    const n = playDetailState.currentN;
    return playDetailState.excludeCharacterNames
      ? (playDetailState.maxByNNoNames[n] || 0)
      : (playDetailState.maxByN[n] || 0);
  }

  function ensurePlayDetailModal() {
    if (playDetailEls) return playDetailEls;

    const overlay = document.createElement('div');
    overlay.className = 'play-detail-overlay';
    overlay.innerHTML = `
      <div class="play-detail-modal" role="dialog" aria-modal="true" aria-label="Canto detail">
        <div class="play-detail-head">
          <button type="button" class="play-detail-close" aria-label="Close">×</button>
          <h3 id="playDetailTitle"></h3>
          <div class="play-detail-meta" id="playDetailMeta"></div>
        </div>
        <div class="play-detail-body">
          <div class="play-detail-tabs">
            <button type="button" class="play-detail-tab-btn active" data-n="1">Unigrams</button>
            <button type="button" class="play-detail-tab-btn" data-n="2">Bigrams</button>
            <button type="button" class="play-detail-tab-btn" data-n="3">Trigrams</button>
          </div>
          <div class="play-detail-controls">
            <label for="playDetailSlider">Unusualness</label>
            <input id="playDetailSlider" type="range" min="0" max="0" value="0" step="0.0001">
            <span class="play-detail-value" id="playDetailValue">0</span>
            <label class="play-detail-toggle" for="playDetailFilterNames">
              <input id="playDetailFilterNames" type="checkbox" checked>
              Exclude configured names
            </label>
          </div>
          <div class="play-detail-loading" id="playDetailLoading">Computing...</div>
          <table id="playDetailTable" class="is-hidden">
            <thead>
              <tr>
                <th>Rank</th>
                <th data-key="ngram">N-gram</th>
                <th data-key="count">Count</th>
                <th data-key="tfidf">TF-IDF Score</th>
              </tr>
            </thead>
            <tbody id="playDetailTableBody"></tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.play-detail-close');
    const loading = overlay.querySelector('#playDetailLoading');
    const slider = overlay.querySelector('#playDetailSlider');
    const sliderValue = overlay.querySelector('#playDetailValue');
    const table = overlay.querySelector('#playDetailTable');
    const tbodyEl = overlay.querySelector('#playDetailTableBody');
    const titleEl = overlay.querySelector('#playDetailTitle');
    const metaEl = overlay.querySelector('#playDetailMeta');
    const filterNamesToggle = overlay.querySelector('#playDetailFilterNames');
    const tabBtns = Array.from(overlay.querySelectorAll('.play-detail-tab-btn'));
    const sortableHeaders = Array.from(overlay.querySelectorAll('th[data-key]'));

    function setLoading(msg) {
      loading.textContent = msg || 'Computing...';
      setElementHidden(loading, false);
      setElementHidden(table, true);
    }

    function updateSliderUi() {
      const max = maxForCurrentSelection();
      slider.max = String(max);
      slider.min = '0';
      slider.step = String(max > 0 ? Math.max(max / 400, 0.0001) : 0.0001);
      if (playDetailState.threshold > max) playDetailState.threshold = max;
      slider.value = String(playDetailState.threshold);
      slider.disabled = max <= 0;
      sliderValue.textContent = playDetailState.threshold.toFixed(4);
    }

    function pdSortRows(rows) {
      const out = rows.slice();
      const key = playDetailState.sortKey;
      const dir = playDetailState.sortDir;
      out.sort((a, b) => {
        let cmp = 0;
        if (key === 'ngram') cmp = a.ngram.localeCompare(b.ngram);
        else if (key === 'tfidf') cmp = a.tfidf - b.tfidf;
        else cmp = a.count - b.count;
        if (cmp === 0) cmp = a.ngram.localeCompare(b.ngram);
        return dir === 'asc' ? cmp : -cmp;
      });
      return out;
    }

    function updateSortIndicators() {
      sortableHeaders.forEach(th => {
        const key = th.dataset.key;
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (!key || key !== playDetailState.sortKey) return;
        th.classList.add(playDetailState.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      });
    }

    function renderRows() {
      const rows = rowsForCurrentSelection();
      const threshold = playDetailState.threshold || 0;
      const filtered = threshold > 0 ? rows.filter(r => r.tfidf >= threshold) : rows.slice();
      const sorted = pdSortRows(filtered);
      updateSortIndicators();

      if (!sorted.length) {
        const emptyMsg = (threshold > 0)
          ? 'No n-grams at this unusualness threshold.'
          : (playDetailState.excludeCharacterNames
            ? 'No n-grams remain after excluding configured names.'
            : 'No n-grams available.');
        tbodyEl.innerHTML = `<tr><td colspan="4" class="muted">${emptyMsg}</td></tr>`;
        return;
      }

      const html = [];
      for (let i = 0; i < sorted.length; i++) {
        const row = sorted[i];
        html.push(
          `<tr>` +
          `<td>${i + 1}</td>` +
          `<td>${escapeHTML(row.ngram)}</td>` +
          `<td>${row.count}</td>` +
          `<td>${row.tfidf.toFixed(4)}</td>` +
          `</tr>`
        );
      }
      tbodyEl.innerHTML = html.join('');
    }

    function setTab(n) {
      playDetailState.currentN = n;
      tabBtns.forEach(btn => btn.classList.toggle('active', Number(btn.dataset.n) === n));
      playDetailState.threshold = 0;
      playDetailState.sortKey = 'count';
      playDetailState.sortDir = 'desc';
      updateSliderUi();
      renderRows();
    }

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => setTab(Number(btn.dataset.n)));
    });

    slider.addEventListener('input', () => {
      playDetailState.threshold = Number(slider.value) || 0;
      if (playDetailState.threshold === 0) {
        playDetailState.sortKey = 'count';
        playDetailState.sortDir = 'desc';
      }
      sliderValue.textContent = playDetailState.threshold.toFixed(4);
      renderRows();
    });

    if (filterNamesToggle) {
      filterNamesToggle.addEventListener('change', () => {
        playDetailState.excludeCharacterNames = !!filterNamesToggle.checked;
        updateSliderUi();
        renderRows();
      });
    }

    sortableHeaders.forEach(th => {
      th.style.cursor = 'pointer';
      const key = th.dataset.key || '';
      if (key === 'tfidf') {
        th.title = 'TF-IDF = term frequency in this canto × inverse document frequency across all cantos. IDF = ln(N / df), where N is the number of cantos and df is the number of cantos containing the term. Higher means more distinctive to this canto. Click to sort.';
        th.setAttribute('aria-label', 'TF-IDF score. Hover for explanation. Click to sort.');
      } else {
        th.title = 'Click to sort';
      }
      th.addEventListener('click', () => {
        const clickedKey = th.dataset.key;
        if (!clickedKey) return;
        if (playDetailState.sortKey === clickedKey) {
          playDetailState.sortDir = (playDetailState.sortDir === 'asc' ? 'desc' : 'asc');
        } else {
          playDetailState.sortKey = clickedKey;
          playDetailState.sortDir = (clickedKey === 'ngram' ? 'asc' : 'desc');
        }
        renderRows();
      });
    });

    closeBtn.addEventListener('click', closePlayDetailModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePlayDetailModal();
    });

    playDetailEls = {
      overlay, loading, table, titleEl, metaEl, filterNamesToggle, setLoading, setTab, updateSliderUi, renderRows
    };
    return playDetailEls;
  }

  function closePlayDetailModal() {
    if (!playDetailEls) return;
    playDetailEls.overlay.classList.remove('open');
  }

  function computePlayNgramRows(index, playId) {
    const rows = [];
    let maxTfIdf = 0;
    for (const [ngram, postings] of Object.entries(index || {})) {
      if (!Array.isArray(postings) || postings.length === 0) continue;

      let tf = 0;
      const playsSeen = new Set();

      for (const posting of postings) {
        if (!Array.isArray(posting) || posting.length < 2) continue;
        const sceneId = posting[0];
        const count = Number(posting[1]) || 0;
        if (count <= 0) continue;

        const pid = sceneToPlayId.get(sceneId) ?? (chunkById.get(sceneId) || {}).play_id;
        if (pid == null) continue;
        playsSeen.add(pid);
        if (pid === playId) tf += count;
      }

      if (tf <= 0) continue;
      const df = playsSeen.size;
      if (df <= 0) continue;

      const idf = Math.log(getDocCountTotal() / df);
      const tfidf = tf * idf;
      if (tfidf > maxTfIdf) maxTfIdf = tfidf;
      rows.push({ ngram, count: tf, tfidf, containsCharacterName: ngramContainsCharacterName(ngram, playId) });
    }

    rows.sort((a, b) => (b.count - a.count) || a.ngram.localeCompare(b.ngram));
    return { rows, maxTfIdf };
  }

  async function computePlayDetailData(playId) {
    if (playDetailCache.has(playId)) return playDetailCache.get(playId);

    const result = {
      rowsByN: { 1: [], 2: [], 3: [] },
      maxByN: { 1: 0, 2: 0, 3: 0 },
      rowsByNNoNames: { 1: [], 2: [], 3: [] },
      maxByNNoNames: { 1: 0, 2: 0, 3: 0 }
    };
    const modal = ensurePlayDetailModal();

    modal.setLoading('Computing unigrams...');
    await new Promise(r => setTimeout(r, 0));
    const u = computePlayNgramRows(tokens, playId);
    result.rowsByN[1] = u.rows;
    result.maxByN[1] = u.maxTfIdf;

    modal.setLoading('Computing bigrams...');
    await new Promise(r => setTimeout(r, 0));
    const b = computePlayNgramRows(tokens2, playId);
    result.rowsByN[2] = b.rows;
    result.maxByN[2] = b.maxTfIdf;

    modal.setLoading('Computing trigrams...');
    await new Promise(r => setTimeout(r, 0));
    const t = computePlayNgramRows(tokens3, playId);
    result.rowsByN[3] = t.rows;
    result.maxByN[3] = t.maxTfIdf;

    for (const n of [1, 2, 3]) {
      const noNames = result.rowsByN[n].filter(row => !row.containsCharacterName);
      result.rowsByNNoNames[n] = noNames;
      result.maxByNNoNames[n] = maxTfIdfFromRows(noNames);
    }

    playDetailCache.set(playId, result);
    return result;
  }

  async function openPlayDetailModal(playId) {
    const play = playsById.get(playId);
    if (!play) return;

    const modal = ensurePlayDetailModal();
    playDetailState.playId = playId;
    playDetailState.currentN = 1;
    playDetailState.sortKey = 'count';
    playDetailState.sortDir = 'desc';
    playDetailState.excludeCharacterNames = true;
    playDetailState.threshold = 0;
    playDetailState.rowsByN = { 1: [], 2: [], 3: [] };
    playDetailState.maxByN = { 1: 0, 2: 0, 3: 0 };
    playDetailState.rowsByNNoNames = { 1: [], 2: [], 3: [] };
    playDetailState.maxByNNoNames = { 1: 0, 2: 0, 3: 0 };

    const shape = playShapeById.get(playId) || { scenes: new Set(), acts: new Set() };
    const totalWords = play.total_words || 0;
    const totalVerses = play.total_lines || 0;
    const chapters = shape.acts.size || play.num_acts || 0;

    modal.titleEl.textContent = play.title || play.abbr || 'Unknown canto';
    modal.metaEl.textContent = `${play.genre || 'Unknown canticle'} \u00b7 ${totalWords} words \u00b7 ${totalVerses} lines \u00b7 ${chapters} section${chapters === 1 ? '' : 's'}`;
    if (modal.filterNamesToggle) modal.filterNamesToggle.checked = true;
    modal.overlay.classList.add('open');
    modal.setLoading('Computing...');
    modal.updateSliderUi();

    const data = await computePlayDetailData(playId);
    if (playDetailState.playId !== playId) return;

    playDetailState.rowsByN = data.rowsByN;
    playDetailState.maxByN = data.maxByN;
    playDetailState.rowsByNNoNames = data.rowsByNNoNames;
    playDetailState.maxByNNoNames = data.maxByNNoNames;
    setElementHidden(modal.loading, true);
    setElementHidden(modal.table, false);
    modal.setTab(1);
  }

  // Event delegation for play detail links (works across all tables)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.play-detail-link');
    if (!trigger) return;
    const playId = Number(trigger.dataset.playId);
    if (!Number.isInteger(playId)) return;
    e.preventDefault();
    e.stopPropagation();
    openPlayDetailModal(playId);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playDetailEls && playDetailEls.overlay.classList.contains('open')) {
      closePlayDetailModal();
    }
  });

  // Expose the init function and helpers on window
  window.initPlayDetail = function (deps) {
    sceneToPlayId = new Map(deps.chunks.map(c => [c.scene_id, c.play_id]));
    playShapeById = new Map();
    for (const c of deps.chunks) {
      if (!playShapeById.has(c.play_id)) {
        playShapeById.set(c.play_id, { scenes: new Set(), acts: new Set() });
      }
      const s = playShapeById.get(c.play_id);
      s.scenes.add(c.scene_id);
      s.acts.add(c.act);
    }
    chunkById = deps.chunkById;
    playsById = deps.playsById;
    tokens = deps.tokens;
    tokens2 = deps.tokens2;
    tokens3 = deps.tokens3;
    escapeHTML = deps.escapeHTML;
    characterNameFiltersByPlay = buildCharacterNameTokensByPlay(
      deps.characters || [],
      playsById,
      deps.characterNameFilterConfig || null
    );
  };

  window.isPlayDetailCell = isPlayDetailCell;
  window.buildPlayDetailLink = buildPlayDetailLink;
})();

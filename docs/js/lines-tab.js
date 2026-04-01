// Lines tab controller (search/render/filter/pagination)
// Extracted from index.html — initialized via createLinesTabController()

(function () {
  'use strict';

  function createLinesTabController(initDeps) {
    const deps = Object.assign({}, initDeps || {});

    const els = {
      query: document.getElementById('linesQuery'),
      ngramMode: document.getElementById('linesNgramMode'),
      matchMode: document.getElementById('linesMatchMode'),
      resultsTable: document.getElementById('linesResults'),
      headRow: document.getElementById('linesHeadRow'),
      tableBody: document.getElementById('linesTableBody'),
      pagination: document.getElementById('linesPagination'),
      firstPage: document.getElementById('linesFirstPage'),
      prevPage: document.getElementById('linesPrevPage'),
      nextPage: document.getElementById('linesNextPage'),
      lastPage: document.getElementById('linesLastPage'),
      pageSize: document.getElementById('linesPageSize'),
      pageInfo: document.getElementById('linesPageInfo'),
      totalInfo: document.getElementById('linesTotalInfo'),
      filterActions: document.getElementById('linesFilterActions'),
      filtersInfo: document.getElementById('linesFiltersInfo'),
      clearFilters: document.getElementById('clearLinesFilters'),
      downloadCsv: document.getElementById('downloadLinesCsv'),
      refreshBtn: document.getElementById('linesRefresh')
    };

    const state = {
      currentPage: 1,
      pageSize: Number.parseInt(els.pageSize && els.pageSize.value, 10) || 50,
      allRows: [],
      sortKey: 'line_num',
      sortDir: 'asc',
      columnFilters: new Map(),
      pendingChanges: false,
      lastSearch: {
        query: '',
        ngramMode: '',
        matchMode: ''
      }
    };

    let initialized = false;
    let debouncedDoSearch = null;

    function callUpdateDeepLink() {
      if (typeof deps.updateDeepLink === 'function') deps.updateDeepLink();
    }

    function callApplyOrClear() {
      const fn = deps.applyOrClear || window.applyOrClear;
      if (typeof fn === 'function') fn('#linesResults');
    }

    function getShowFilterPopover() {
      return deps.showFilterPopover || window.showFilterPopover;
    }

    function getColorScaleState() {
      return deps.colorScaleState || window.colorScaleState || { highlightEnabled: true };
    }

    function setElementHidden(el, hidden) {
      const fn = deps.setElementHidden || window.setElementHidden;
      if (typeof fn === 'function') {
        fn(el, hidden);
        return;
      }
      if (!el || !el.classList) return;
      el.classList.toggle('is-hidden', !!hidden);
    }

    function getAllLinesData() {
      if (typeof deps.getAllLines === 'function') return deps.getAllLines() || [];
      return Array.isArray(deps.allLines) ? deps.allLines : [];
    }

    function getPlaysById() {
      if (typeof deps.getPlaysById === 'function') return deps.getPlaysById();
      return deps.playsById;
    }

    function buildLinesRows(query) {
      const isRegex = (els.matchMode && els.matchMode.value === 'regex');
      const n = Number.parseInt(els.ngramMode && els.ngramMode.value, 10);
      const allLines = getAllLinesData();

      if (!Array.isArray(allLines) || allLines.length === 0) {
        return null;
      }

      const rows = [];

      let searchPattern = null;
      if (isRegex) {
        try {
          searchPattern = new RegExp(window.normalizeTerm(query), 'i');
        } catch (e) {
          return null;
        }
      }
      const queryTokens = window.normalizeTerm(query).split(/\s+/).filter(Boolean).slice(0, n);
      const queryNgram = queryTokens.join(' ');

      for (const line of allLines) {
        let matches = false;
        let highlightRegex = null;
        const rawText = line.text == null ? '' : String(line.text);
        const ngrams = window.getLineNgrams(line, n);

        if (isRegex) {
          const re = new RegExp(searchPattern.source, searchPattern.flags.replace('g', ''));
          let count = 0;
          const matchedNgrams = [];
          for (const ng of ngrams) {
            if (re.test(ng)) {
              count++;
              if (matchedNgrams.length <= 60) matchedNgrams.push(ng);
            }
          }
          matches = count > 0;
          if (matches) {
            highlightRegex = matchedNgrams.length > 50 ? null : window.buildHighlightRegexFromNgrams(matchedNgrams);
          }
        } else {
          if (!queryNgram) return null;
          let count = 0;
          for (const ng of ngrams) {
            if (ng === queryNgram) count++;
          }
          matches = count > 0;
          if (matches) highlightRegex = window.buildHighlightRegexFromNgrams([queryNgram]);
        }

        if (matches) {
          const playsById = getPlaysById();
          const play = playsById && typeof playsById.get === 'function'
            ? playsById.get(line.play_id)
            : null;
          rows.push({
            play_title: play ? play.title : 'Unknown canto',
            play_id: line.play_id,
            act: line.act,
            scene: line.scene,
            line_num: line.line_num,
            text: rawText,
            highlightRegex
          });
        }
      }

      return rows;
    }

    function sortRows(rows) {
      if (!state.sortKey || !rows) return rows;
      rows.sort((a, b) => {
        const av = a[state.sortKey];
        const bv = b[state.sortKey];
        if (typeof av === 'string' || typeof bv === 'string') {
          return state.sortDir === 'asc'
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av));
        }
        return state.sortDir === 'asc' ? (av - bv) : (bv - av);
      });
      return rows;
    }

    function updateSortIndicators() {
      if (!els.headRow) return;
      els.headRow.querySelectorAll('th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.key === state.sortKey) {
          th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
      });
    }

    function updateFilterActions() {
      if (!els.filterActions) return;
      const count = state.columnFilters.size;
      if (count > 0) {
        setElementHidden(els.filterActions, false);
        if (els.filtersInfo) {
          els.filtersInfo.textContent = `(${count} active filter${count > 1 ? 's' : ''})`;
        }
      } else {
        setElementHidden(els.filterActions, true);
      }
    }

    function applyFilters(rows) {
      if (!rows) return [];
      let out = rows;
      for (const [key, f] of state.columnFilters.entries()) {
        if (!f) continue;
        const type = f.type || 'text';
        if (type === 'number') {
          const hasMin = f.min != null && f.min !== '';
          const hasMax = f.max != null && f.max !== '';
          if (!hasMin && !hasMax) continue;
          const minVal = hasMin ? Number.parseFloat(f.min) : -Infinity;
          const maxVal = hasMax ? Number.parseFloat(f.max) : Infinity;
          out = out.filter(r => {
            const v = Number(r[key]);
            if (!Number.isFinite(v)) return false;
            return v >= minVal && v <= maxVal;
          });
        } else {
          if (!f.pattern) continue;
          let re = null;
          try {
            re = new RegExp(f.pattern, 'i');
          } catch (e) {
            re = null;
          }
          if (!re) continue;
          out = out.filter(r => re.test(String(r[key] ?? '')));
        }
      }
      return out;
    }

    function renderPage() {
      if (!els.tableBody) return;

      const filtered = applyFilters(state.allRows);
      const totalPages = window.getTotalPages(filtered.length, state.pageSize);
      const paginatedRows = window.paginateArray(filtered, state.currentPage, state.pageSize);

      els.tableBody.innerHTML = '';
      for (const row of paginatedRows) {
        const tr = document.createElement('tr');
        const sceneVal = row.scene_label || row.scene;

        const tdPlay = document.createElement('td');
        if (row.play_id != null && typeof window.buildPlayDetailLink === 'function') {
          tdPlay.appendChild(window.buildPlayDetailLink(row.play_title, row.play_id));
        } else {
          tdPlay.textContent = row.play_title ?? '';
        }

        const tdScene = document.createElement('td');
        tdScene.textContent = sceneVal;

        const tdText = document.createElement('td');
        tdText.className = 'line-text';
        tdText.innerHTML = (getColorScaleState().highlightEnabled && row.highlightRegex)
          ? window.highlightHTML(row.text, row.highlightRegex)
          : window.escapeHTML(row.text);

        tr.appendChild(tdPlay);
        tr.appendChild(tdScene);
        tr.appendChild(tdText);
        els.tableBody.appendChild(tr);
      }

      updateSortIndicators();

      if (els.pagination) {
        setElementHidden(els.pagination, filtered.length <= 25);
      }
      if (els.pageInfo) els.pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
      if (els.totalInfo) els.totalInfo.textContent = `(${filtered.length} total lines)`;
      if (els.firstPage) els.firstPage.disabled = state.currentPage === 1;
      if (els.prevPage) els.prevPage.disabled = state.currentPage === 1;
      if (els.nextPage) els.nextPage.disabled = state.currentPage === totalPages;
      if (els.lastPage) els.lastPage.disabled = state.currentPage === totalPages;

      callApplyOrClear();
      callUpdateDeepLink();
      updateFilterActions();
    }

    function setHeaders() {
      if (!els.headRow) return;
      const cols = [
        { key: 'play_title', label: 'Canto', defaultDir: 'asc', type: 'text' },
        { key: 'scene', label: 'Terzina', type: 'number' },
        { key: 'text', label: 'Line', defaultDir: 'asc', type: 'text' }
      ];

      els.headRow.innerHTML = '';
      cols.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c.label;
        th.dataset.key = c.key;
        th.dataset.type = c.type || 'text';
        if (c.key !== 'text') {
          th.title = 'Click to sort';
          th.style.cursor = 'pointer';
          th.addEventListener('click', () => {
            if (state.sortKey === c.key) {
              state.sortDir = (state.sortDir === 'asc' ? 'desc' : 'asc');
            } else {
              state.sortKey = c.key;
              state.sortDir = c.defaultDir || 'desc';
            }
            state.allRows = sortRows(state.allRows);
            state.currentPage = 1;
            renderPage();
          });
        }

        const icon = document.createElement('span');
        icon.className = 'filter-icon';
        icon.textContent = '⚙';
        icon.title = 'Filter this column';
        icon.addEventListener('click', (e) => {
          e.stopPropagation();
          const showFilterPopover = getShowFilterPopover();
          if (typeof showFilterPopover === 'function') {
            showFilterPopover(th, c.key, (c.type || 'text'), 'lines');
          }
        });
        th.appendChild(icon);
        els.headRow.appendChild(th);
      });
      updateSortIndicators();
    }

    function doSearch() {
      if (!els.query || !els.tableBody || !els.pagination) return;
      const query = els.query.value.trim();
      if (!query) {
        els.tableBody.innerHTML = '';
        setElementHidden(els.pagination, true);
        updateFilterActions();
        return;
      }

      const rows = buildLinesRows(query);
      if (!rows) {
        els.tableBody.innerHTML = '<tr><td colspan="3" class="warning">Invalid search or no line data available.</td></tr>';
        setElementHidden(els.pagination, true);
        updateFilterActions();
        return;
      }

      if (rows.length === 0) {
        els.tableBody.innerHTML = '<tr><td colspan="3" class="muted">No lines matched.</td></tr>';
        setElementHidden(els.pagination, true);
        updateFilterActions();
        return;
      }

      state.allRows = sortRows(rows);
      state.currentPage = 1;
      setHeaders();
      renderPage();
      saveState();
    }

    function currentInputState() {
      return {
        query: (els.query && els.query.value.trim()) || '',
        ngramMode: (els.ngramMode && els.ngramMode.value) || '',
        matchMode: (els.matchMode && els.matchMode.value) || ''
      };
    }

    function updateRefreshButton() {
      if (!els.refreshBtn) return;
      if (state.pendingChanges) {
        els.refreshBtn.classList.add('refresh-btn-pending');
        els.refreshBtn.textContent = 'Refresh ⟳';
      } else {
        els.refreshBtn.classList.remove('refresh-btn-pending');
        els.refreshBtn.textContent = 'Refresh';
      }
    }

    function checkPendingChanges() {
      const current = currentInputState();
      state.pendingChanges =
        current.query !== state.lastSearch.query ||
        current.ngramMode !== state.lastSearch.ngramMode ||
        current.matchMode !== state.lastSearch.matchMode;
      updateRefreshButton();
    }

    function saveState() {
      state.lastSearch = currentInputState();
      state.pendingChanges = false;
      updateRefreshButton();
    }

    function clearFilters() {
      if (state.columnFilters.size === 0) return;
      state.columnFilters.clear();
      renderPage();
      updateFilterActions();
      callUpdateDeepLink();
    }

    function downloadCsvAll(filename) {
      if (!els.headRow || !state.allRows || state.allRows.length === 0) return;
      const cols = Array.from(els.headRow.children).map(th => ({
        key: th.dataset.key,
        label: (th.childNodes[0] && th.childNodes[0].textContent ? th.childNodes[0].textContent : th.textContent || '')
          .replace('⚙', '')
          .trim()
      }));
      if (cols.length === 0) return;
      const filtered = applyFilters(state.allRows);
      const rows = [cols.map(c => c.label)];
      for (const r of filtered) {
        rows.push(cols.map(c => {
          if (c.key === 'scene') return r.scene_label || r.scene;
          if (c.key === 'text') return r.text;
          return r[c.key] ?? '';
        }));
      }
      window.downloadCsv(filename, rows);
    }

    function setSortState(sortKey, sortDir) {
      if (sortKey) state.sortKey = sortKey;
      if (sortDir) state.sortDir = sortDir;
    }

    function getSortState() {
      return { sortKey: state.sortKey, sortDir: state.sortDir };
    }

    function getColumnFilters() {
      return state.columnFilters;
    }

    function replaceColumnFilters(nextMap) {
      state.columnFilters.clear();
      if (!nextMap || typeof nextMap.entries !== 'function') return;
      for (const [k, v] of nextMap.entries()) {
        state.columnFilters.set(k, v);
      }
    }

    function init() {
      if (initialized) return;
      initialized = true;

      const debounceFn = window.debounce || ((fn) => fn);
      debouncedDoSearch = debounceFn(doSearch, 250);

      if (els.query) {
        els.query.addEventListener('keydown', e => {
          if (e.key === 'Enter') doSearch();
        });
        els.query.addEventListener('input', () => {
          checkPendingChanges();
          debouncedDoSearch();
        });
      }

      if (els.ngramMode) {
        els.ngramMode.addEventListener('change', () => {
          checkPendingChanges();
          doSearch();
        });
      }

      if (els.matchMode) {
        els.matchMode.addEventListener('change', () => {
          checkPendingChanges();
          doSearch();
        });
      }

        if (els.downloadCsv) {
        els.downloadCsv.addEventListener('click', () => {
          const name = `lines-${Date.now()}.csv`;
          downloadCsvAll(name);
        });
      }

      if (els.clearFilters) {
        els.clearFilters.addEventListener('click', (e) => {
          e.preventDefault();
          clearFilters();
        });
      }

      if (els.firstPage) {
        els.firstPage.addEventListener('click', () => {
          state.currentPage = 1;
          renderPage();
        });
      }
      if (els.prevPage) {
        els.prevPage.addEventListener('click', () => {
          if (state.currentPage > 1) {
            state.currentPage--;
            renderPage();
          }
        });
      }
      if (els.nextPage) {
        els.nextPage.addEventListener('click', () => {
          const totalPages = window.getTotalPages(state.allRows.length, state.pageSize);
          if (state.currentPage < totalPages) {
            state.currentPage++;
            renderPage();
          }
        });
      }
      if (els.lastPage) {
        els.lastPage.addEventListener('click', () => {
          state.currentPage = window.getTotalPages(state.allRows.length, state.pageSize);
          renderPage();
        });
      }
      if (els.pageSize) {
        els.pageSize.addEventListener('change', (e) => {
          state.pageSize = Number.parseInt(e.target.value, 10);
          state.currentPage = 1;
          renderPage();
        });
      }

      updateFilterActions();
      updateRefreshButton();
    }

    return {
      init,
      doSearch,
      renderPage,
      updateFilterActions,
      applyFilters,
      clearFilters,
      downloadCsvAll,
      getColumnFilters,
      replaceColumnFilters,
      setSortState,
      getSortState
    };
  }

  window.createLinesTabController = createLinesTabController;
})();

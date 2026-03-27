// Color scale + highlighting UI state and table coloring helpers
// Extracted from index.html — initialized via initColorScaleModule()

(function () {
  'use strict';

  const state = {
    colorScaleEnabled: true,
    highlightEnabled: true,
    colorScalePalette: 'blue-diverging',
    colorScaleSteps: 7
  };

    let deps = {
      getSegmentsQueryValue: () => '',
      getLinesQueryValue: () => '',
      hasActiveSegmentsSearch: null,
      hasActiveLinesSearch: null,
      doSearch: null,
      doLinesSearch: null
    };

  function syncColorScaleToggles() {
    document.querySelectorAll('.color-scale-toggle').forEach(cb => {
      if (cb) cb.checked = state.colorScaleEnabled;
    });
  }

  function syncColorScaleOptions() {
    document.querySelectorAll('.color-scale-palette').forEach(sel => {
      if (sel) sel.value = state.colorScalePalette;
    });
    document.querySelectorAll('.color-scale-steps').forEach(sel => {
      if (sel) sel.value = String(state.colorScaleSteps);
    });
  }

  function setColorScaleEnabled(v) {
    state.colorScaleEnabled = !!v;
    syncColorScaleToggles();
    applyColorScalesForVisibleTables();
  }

  function syncHighlightToggles() {
    document.querySelectorAll('.highlight-toggle').forEach(cb => {
      if (cb) cb.checked = state.highlightEnabled;
    });
  }

    function setHighlightEnabled(v) {
      state.highlightEnabled = !!v;
      syncHighlightToggles();

      const hasSegmentsSearch = (typeof deps.hasActiveSegmentsSearch === 'function')
        ? !!deps.hasActiveSegmentsSearch()
        : !!(typeof deps.getSegmentsQueryValue === 'function' ? deps.getSegmentsQueryValue() : '');
      if (hasSegmentsSearch && typeof deps.doSearch === 'function') deps.doSearch();

      const hasLinesSearch = (typeof deps.hasActiveLinesSearch === 'function')
        ? !!deps.hasActiveLinesSearch()
        : !!(typeof deps.getLinesQueryValue === 'function' ? deps.getLinesQueryValue() : '');
      if (hasLinesSearch && typeof deps.doLinesSearch === 'function') deps.doLinesSearch();
    }

  function clearColorScale(table) {
    if (!table) return;
    table.querySelectorAll('tbody td').forEach(td => {
      td.style.background = '';
      td.style.backgroundColor = '';
      td.style.color = '';
    });
  }

  function applyColorScale(table) {
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (rows.length === 0) return;
    const colCount = (rows[0] && rows[0].children && rows[0].children.length) || 0;
    const palette = getPalette(state.colorScalePalette, state.colorScaleSteps);

    for (let c = 0; c < colCount; c++) {
      const colTds = rows.map(r => r.children[c]).filter(Boolean);
      const values = [];
      const cells = [];
      for (const td of colTds) {
        const dv = td.getAttribute('data-value');
        const v = dv != null ? parseFloat(dv) : window.parseNumeric(td.textContent);
        if (Number.isFinite(v)) {
          values.push(v);
          cells.push([td, v]);
        }
      }
      if (values.length < 2) continue;
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (!(max > min)) continue;

      const thresholds = [];
      for (let i = 1; i < palette.length; i++) thresholds.push(i / palette.length);
      const qs = window.quantiles(values, thresholds);
      for (const [td, v] of cells) {
        let idx = 0;
        while (idx < qs.length && v > qs[idx]) idx++;
        const bg = palette[idx];
        td.style.backgroundColor = bg;
        td.style.color = window.pickTextColorForBg(bg);
      }
    }
  }

  function applyOrClear(tableSel) {
    const table = document.querySelector(tableSel);
    if (!table) return;
    if (state.colorScaleEnabled) applyColorScale(table);
    else clearColorScale(table);
  }

  function applyColorScalesForVisibleTables() {
    applyOrClear('#results');
    applyOrClear('#linesResults');
    renderAllLegends();
  }

  function getPalette(name, steps) {
    steps = parseInt(steps, 10) || 5;
    const clampSteps = (arr) => {
      if (arr.length === steps) return arr;
      const out = [];
      for (let i = 0; i < steps; i++) {
        const idx = Math.round(i * (arr.length - 1) / (steps - 1));
        out.push(arr[idx]);
      }
      return out;
    };
    if (name === 'blue-diverging') {
      const base5 = ['rgb(176, 176, 176)','rgb(209, 209, 209)','rgb(250, 250, 250)','rgb(134, 164, 177)','rgb(0, 63, 92)'];
      const base7 = ['rgb(180,180,180)','rgb(200,200,200)','rgb(220,220,220)','rgb(250,250,250)','rgb(150,175,185)','rgb(110,140,160)','rgb(0,63,92)'];
      return clampSteps(steps === 7 ? base7 : base5);
    } else if (name === 'blue-linear') {
      const base5 = ['rgb(120,120,120)','rgb(176,176,176)','rgb(250,250,250)','rgb(134,164,177)','rgb(0,63,92)'];
      const base7 = ['rgb(110,110,110)','rgb(150,150,150)','rgb(190,190,190)','rgb(250,250,250)','rgb(160,180,190)','rgb(110,140,160)','rgb(0,63,92)'];
      return clampSteps(steps === 7 ? base7 : base5);
    } else if (name === 'burgundy-gold') {
      const base5 = ['rgb(120,100,40)','rgb(190,170,90)','rgb(250,250,250)','rgb(170,110,120)','rgb(139,21,56)'];
      const base7 = ['rgb(110,90,35)','rgb(150,130,60)','rgb(200,180,100)','rgb(250,250,250)','rgb(185,130,135)','rgb(160,90,110)','rgb(139,21,56)'];
      return clampSteps(steps === 7 ? base7 : base5);
    }
    return getPalette('blue-diverging', steps);
  }

  function renderLegend(container, palette) {
    if (!container) return;
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'legend-wrap';
    palette.forEach((c, i) => {
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.backgroundColor = c;
      sw.title = i === 0 ? 'Low' : (i === palette.length - 1 ? 'High' : (palette.length % 2 === 1 && i === Math.floor(palette.length / 2) ? 'Median' : ''));
      wrap.appendChild(sw);
    });
    const labels = document.createElement('div');
    labels.className = 'legend-labels';
    labels.innerHTML = '<span>Low</span><span>Median</span><span>High</span>';
    container.appendChild(wrap);
    container.appendChild(labels);
  }

  function renderAllLegends() {
    const pal = getPalette(state.colorScalePalette, state.colorScaleSteps);
    document.querySelectorAll('.color-scale-legend').forEach(el => renderLegend(el, pal));
  }

  function initColorScaleModule(initDeps) {
    deps = Object.assign({}, deps, initDeps || {});
  }

  window.colorScaleState = state;
  window.initColorScaleModule = initColorScaleModule;
  window.syncColorScaleToggles = syncColorScaleToggles;
  window.syncColorScaleOptions = syncColorScaleOptions;
  window.setColorScaleEnabled = setColorScaleEnabled;
  window.syncHighlightToggles = syncHighlightToggles;
  window.setHighlightEnabled = setHighlightEnabled;
  window.applyColorScale = applyColorScale;
  window.clearColorScale = clearColorScale;
  window.applyOrClear = applyOrClear;
  window.applyColorScalesForVisibleTables = applyColorScalesForVisibleTables;
  window.getPalette = getPalette;
  window.renderLegend = renderLegend;
  window.renderAllLegends = renderAllLegends;
})();

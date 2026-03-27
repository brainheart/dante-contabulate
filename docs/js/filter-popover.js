// Shared column filter popover UI (segments + lines)
// Extracted from index.html and initialized via initFilterPopoverModule()

(function () {
  'use strict';

  let currentFilterPopover = null;
  let deps = {
    getStateMap: () => new Map(),
    applyTableFilters: () => {}
  };

  function closeFilterPopover() {
    if (currentFilterPopover && currentFilterPopover.parentNode) {
      currentFilterPopover.parentNode.removeChild(currentFilterPopover);
    }
    currentFilterPopover = null;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFilterPopover();
  });

  document.addEventListener('click', (e) => {
    if (
      currentFilterPopover &&
      !currentFilterPopover.contains(e.target) &&
      !(e.target.classList && e.target.classList.contains('filter-icon'))
    ) {
      closeFilterPopover();
    }
  });

  function showFilterPopover(th, key, type, table) {
    if (!th || !key) return;
    closeFilterPopover();

    const rect = th.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'filter-popover';

    const stateMap = typeof deps.getStateMap === 'function'
      ? deps.getStateMap(table)
      : new Map();
    const existing = (stateMap && stateMap.get && stateMap.get(key)) || { type };

    if (type === 'number') {
      pop.innerHTML = `
        <h4>Filter: ${th.textContent.replace('⚙','').trim()}</h4>
        <div class="row"><label style="width:3rem;">Min</label><input type="number" step="any" class="f-min" value="${existing.min ?? ''}" placeholder="min"></div>
        <div class="row"><label style="width:3rem;">Max</label><input type="number" step="any" class="f-max" value="${existing.max ?? ''}" placeholder="max"></div>
        <div class="actions"><button class="link-btn f-clear">Clear</button><button class="link-btn f-close">Close</button></div>
        <div class="hint">Tip: for % columns you may enter 5 or 0.05</div>
      `;
    } else {
      pop.innerHTML = `
        <h4>Filter: ${th.textContent.replace('⚙','').trim()}</h4>
        <div class="row"><input type="text" class="f-pattern" value="${existing.pattern ?? ''}" placeholder="Regex pattern (case-insensitive)"></div>
        <div class="actions"><button class="link-btn f-clear">Clear</button><button class="link-btn f-close">Close</button></div>
        <div class="hint">Examples: ^Gen, John$, faith|hope</div>
      `;
    }

    document.body.appendChild(pop);
    currentFilterPopover = pop;

    const top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;
    if (left + pop.offsetWidth > window.scrollX + window.innerWidth) {
      left = window.scrollX + window.innerWidth - pop.offsetWidth - 12;
    }
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    const debounceFn = window.debounce || ((fn) => fn);
    const applyForTable = () => {
      if (typeof deps.applyTableFilters === 'function') deps.applyTableFilters(table);
    };

    const applyNumber = debounceFn(() => {
      const minEl = pop.querySelector('.f-min');
      const maxEl = pop.querySelector('.f-max');
      if (!minEl || !maxEl || !stateMap) return;
      const minV = minEl.value;
      const maxV = maxEl.value;
      if (minV === '' && maxV === '') stateMap.delete(key);
      else stateMap.set(key, { type: 'number', min: minV, max: maxV });
      applyForTable();
    }, 200);

    const applyText = debounceFn(() => {
      const patEl = pop.querySelector('.f-pattern');
      if (!patEl || !stateMap) return;
      const pat = patEl.value.trim();
      if (!pat) stateMap.delete(key);
      else stateMap.set(key, { type: 'text', pattern: pat });
      applyForTable();
    }, 200);

    if (type === 'number') {
      const minEl = pop.querySelector('.f-min');
      const maxEl = pop.querySelector('.f-max');
      if (minEl) minEl.addEventListener('input', applyNumber);
      if (maxEl) maxEl.addEventListener('input', applyNumber);
    } else {
      const patEl = pop.querySelector('.f-pattern');
      if (patEl) patEl.addEventListener('input', applyText);
    }

    const clearBtn = pop.querySelector('.f-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (type === 'number') {
          const minEl = pop.querySelector('.f-min');
          const maxEl = pop.querySelector('.f-max');
          if (minEl) minEl.value = '';
          if (maxEl) maxEl.value = '';
        } else {
          const patEl = pop.querySelector('.f-pattern');
          if (patEl) patEl.value = '';
        }
        if (stateMap && stateMap.delete) stateMap.delete(key);
        applyForTable();
      });
    }

    const closeBtn = pop.querySelector('.f-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeFilterPopover();
      });
    }
  }

  function initFilterPopoverModule(initDeps) {
    deps = Object.assign({}, deps, initDeps || {});
  }

  window.initFilterPopoverModule = initFilterPopoverModule;
  window.showFilterPopover = showFilterPopover;
  window.closeFilterPopover = closeFilterPopover;
})();

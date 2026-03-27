// Shared table UI helpers (column ordering + header drag/drop)
// Extracted from index.html

(function () {
  'use strict';

  let activeHeaderDrag = null;
  let sortClickSuppressedUntil = 0;

  function applyColumnOrder(cols, order) {
    if (!Array.isArray(cols) || cols.length === 0) return [];
    if (!Array.isArray(order) || order.length === 0) return cols.slice();
    const byKey = new Map(cols.map(c => [c.key, c]));
    const ordered = [];
    for (const key of order) {
      if (!byKey.has(key)) continue;
      ordered.push(byKey.get(key));
      byKey.delete(key);
    }
    for (const c of cols) {
      if (byKey.has(c.key)) ordered.push(c);
    }
    return ordered;
  }

  function moveKeyBeforeTarget(order, sourceKey, targetKey) {
    const out = Array.isArray(order) ? order.slice() : [];
    const from = out.indexOf(sourceKey);
    const to = out.indexOf(targetKey);
    if (from < 0 || to < 0 || from === to) return out;
    const moved = out.splice(from, 1)[0];
    const insertAt = from < to ? to - 1 : to;
    out.splice(insertAt, 0, moved);
    return out;
  }

  function clearDragOverClasses(selector) {
    document.querySelectorAll(selector).forEach(el => el.classList.remove('drag-over'));
  }

  function wireHeaderDrag(th, opts) {
    const tableType = opts && opts.tableType;
    const selector = opts && opts.selector;
    const onDropReorder = opts && opts.onDropReorder;
    if (!th || !tableType || !selector || typeof onDropReorder !== 'function') return;

    th.draggable = true;
    th.style.cursor = 'grab';
    th.addEventListener('dragstart', (e) => {
      activeHeaderDrag = { tableType, key: th.dataset.key };
      sortClickSuppressedUntil = Date.now() + 400;
      th.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', th.dataset.key || '');
      }
    });
    th.addEventListener('dragover', (e) => {
      if (!activeHeaderDrag || activeHeaderDrag.tableType !== tableType) return;
      if (activeHeaderDrag.key === th.dataset.key) return;
      e.preventDefault();
      th.classList.add('drag-over');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
    th.addEventListener('drop', (e) => {
      if (!activeHeaderDrag || activeHeaderDrag.tableType !== tableType) return;
      e.preventDefault();
      clearDragOverClasses(selector);
      const sourceKey = activeHeaderDrag.key;
      const targetKey = th.dataset.key;
      if (sourceKey && targetKey && sourceKey !== targetKey) {
        sortClickSuppressedUntil = Date.now() + 250;
        onDropReorder(sourceKey, targetKey);
      }
    });
    th.addEventListener('dragend', () => {
      clearDragOverClasses(selector);
      th.classList.remove('dragging');
      activeHeaderDrag = null;
    });
  }

  function getSortClickSuppressedUntil() {
    return sortClickSuppressedUntil;
  }

  window.applyColumnOrder = applyColumnOrder;
  window.moveKeyBeforeTarget = moveKeyBeforeTarget;
  window.wireHeaderDrag = wireHeaderDrag;
  window.getSortClickSuppressedUntil = getSortClickSuppressedUntil;
})();

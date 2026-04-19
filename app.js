// ===== One-time reset to new defaults =====
const DEFAULTS_VERSION = '3';
if (localStorage.getItem('defaultsVersion') !== DEFAULTS_VERSION) {
  ['budgetItems', 'categoryRegistry', 'categoryColors', 'categoryEmojis', 'ingresos', 'paletteIdx']
    .forEach(k => localStorage.removeItem(k));
  localStorage.setItem('defaultsVersion', DEFAULTS_VERSION);
}

// ===== DOM Elements =====
const themeToggle = document.getElementById('themeToggle');

// ===== Theme =====
function getStoredTheme() {
  return localStorage.getItem('theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

setTheme(getStoredTheme());

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'light' ? 'dark' : 'light');
});

// ===== Budget Page =====

const CATEGORY_PALETTE = [
  '#4ecdc4','#6c5ce7','#a29bfe','#ffd93d','#ff6b6b',
  '#74b9ff','#fd79a8','#00b894','#e17055','#81ecec',
  '#55efc4','#fdcb6e','#e84393','#0984e3','#00cec9',
];

const DEFAULT_CATEGORY_COLORS = {
  'Casa':             '#4ecdc4',
  'Cuentas básicas':  '#6c5ce7',
  'Compras':          '#a29bfe',
  'Gastos felices':   '#ffd93d',
  'Otros':            '#ff6b6b',
  'Ahorro':           '#00b894',
};
let categoryColors = (() => {
  try { return { ...DEFAULT_CATEGORY_COLORS, ...JSON.parse(localStorage.getItem('categoryColors') || '{}') }; }
  catch { return { ...DEFAULT_CATEGORY_COLORS }; }
})();
function saveCategoryColors() {
  localStorage.setItem('categoryColors', JSON.stringify(categoryColors));
}
let paletteIdx = parseInt(localStorage.getItem('paletteIdx') || '5', 10);

const DEFAULT_CATEGORY_EMOJIS = {
  'Casa':             '🏠',
  'Cuentas básicas':  '🧾',
  'Compras':          '🛒',
  'Gastos felices':   '😀',
  'Otros':            '🤔',
  'Ahorro':           '🏦',
};
let categoryEmojis = (() => {
  try { return { ...DEFAULT_CATEGORY_EMOJIS, ...JSON.parse(localStorage.getItem('categoryEmojis') || '{}') }; }
  catch { return { ...DEFAULT_CATEGORY_EMOJIS }; }
})();
function saveCategoryEmojis() {
  localStorage.setItem('categoryEmojis', JSON.stringify(categoryEmojis));
}
function getCategoryEmoji(cat) {
  if (!cat) return '❓';
  return categoryEmojis[cat] || '🏷️';
}

function getCategoryColor(cat) {
  if (!categoryColors[cat]) {
    categoryColors[cat] = CATEGORY_PALETTE[paletteIdx % CATEGORY_PALETTE.length];
    paletteIdx++;
    localStorage.setItem('paletteIdx', String(paletteIdx));
    saveCategoryColors();
  }
  return categoryColors[cat];
}

const DEFAULT_BUDGET_ITEMS = [
  { id: 1, emoji: '🏠', name: 'Nuevo item', amount: 0, category: 'Casa' },
  { id: 2, emoji: '🧾', name: 'Nuevo item', amount: 0, category: 'Cuentas básicas' },
  { id: 3, emoji: '🛒', name: 'Nuevo item', amount: 0, category: 'Compras' },
  { id: 4, emoji: '😀', name: 'Nuevo item', amount: 0, category: 'Gastos felices' },
  { id: 5, emoji: '🤔', name: 'Nuevo item', amount: 0, category: 'Otros' },
];

let budgetItems = [];
let categoryRegistry = [];
let nextId = 100;
let budgetChart = null;
let activeCatItemId = null;
let ingresosValue = parseInt(localStorage.getItem('ingresos') || '0');

// ── Helpers ──
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Return a text-safe version of a color for the current theme
function textSafeColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    // lighten very dark colors
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 100) {
      const f = 1.4;
      return `rgb(${Math.min(255,Math.round(r*f))},${Math.min(255,Math.round(g*f))},${Math.min(255,Math.round(b*f))})`;
    }
    return hex;
  }
  // light mode: darken bright/pastel colors so they're readable on white
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum > 160) {
    const f = 0.55;
    return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
  }
  return hex;
}

function formatCLP(amount) {
  return Math.abs(amount).toLocaleString('es-CL');
}

// ── Category Registry ──
function loadCategoryRegistry() {
  try {
    const stored = JSON.parse(localStorage.getItem('categoryRegistry') || 'null');
    categoryRegistry = Array.isArray(stored) ? stored : [];
  } catch {
    categoryRegistry = [];
  }
  // Merge in any categories present in loaded items that aren't in the registry yet
  const missing = budgetItems
    .map(i => i.category)
    .filter(cat => cat && !categoryRegistry.includes(cat));
  if (missing.length) {
    categoryRegistry.push(...missing);
    saveCategoryRegistry();
  }
}

function saveCategoryRegistry() {
  localStorage.setItem('categoryRegistry', JSON.stringify(categoryRegistry));
}

function addCategoryToRegistry(cat) {
  if (cat && !categoryRegistry.includes(cat)) {
    categoryRegistry.push(cat);
    saveCategoryRegistry();
  }
}

function deleteCategoryFromRegistry(cat) {
  categoryRegistry = categoryRegistry.filter(c => c !== cat);
  saveCategoryRegistry();
}

// Remove a category entirely: its registry entry, color, emoji, and every item assigned to it.
function deleteCategory(cat) {
  if (!cat) return;
  budgetItems = budgetItems.filter(i => i.category !== cat);
  deleteCategoryFromRegistry(cat);
  delete categoryColors[cat];
  saveCategoryColors();
  delete categoryEmojis[cat];
  saveCategoryEmojis();
  if (openCategory === cat) openCategory = null;
  refreshBudget();
}

// ── Confirmation modal ──
function showConfirm(message, onConfirm) {
  const overlay = document.getElementById('confirmModalOverlay');
  const msgEl   = document.getElementById('confirmModalMessage');
  const yesBtn  = document.getElementById('confirmModalYes');
  const noBtn   = document.getElementById('confirmModalNo');
  if (!overlay) return;

  msgEl.textContent = message;
  overlay.style.display = 'flex';

  const cleanup = () => {
    overlay.style.display = 'none';
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onKey);
  };
  const onYes = () => { cleanup(); onConfirm(); };
  const onNo  = () => cleanup();
  const onOverlayClick = (e) => { if (e.target === overlay) cleanup(); };
  const onKey = (e) => {
    if (e.key === 'Escape') cleanup();
    else if (e.key === 'Enter') { cleanup(); onConfirm(); }
  };

  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);
  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onKey);

  setTimeout(() => noBtn.focus(), 0);
}

// ── Data ──
function loadBudgetItems() {
  try {
    const stored = JSON.parse(localStorage.getItem('budgetItems') || 'null');
    if (Array.isArray(stored) && stored.length) {
      budgetItems = stored;
      nextId = Math.max(...budgetItems.map(i => i.id), 99) + 1;
      return;
    }
  } catch {}
  budgetItems = DEFAULT_BUDGET_ITEMS.map(i => ({ ...i }));
  nextId = 20;
  saveBudgetItems();
}

function saveBudgetItems() {
  localStorage.setItem('budgetItems', JSON.stringify(budgetItems));
}

// ── Render ──
function buildCatSelectorHTML(item) {
  if (!item.category) {
    return `<div class="cat-selector" data-id="${item.id}"><span class="cat-placeholder">Select…</span></div>`;
  }
  const color = getCategoryColor(item.category);
  const safeColor = textSafeColor(color);
  const bg    = hexToRgba(color, 0.13);
  const bdr   = hexToRgba(color, 0.35);
  return `<div class="cat-selector" data-id="${item.id}">
    <span class="cat-pill-selected" style="background:${bg};color:${safeColor};border:1px solid ${bdr};">
      <span>${escapeHtml(item.category)}</span>
      <button class="cat-pill-clear" data-id="${item.id}" tabindex="-1">×</button>
    </span>
  </div>`;
}

let openCategory = null;

const AHORRO_CAT = 'Ahorro';

function computeGastos() {
  return budgetItems.reduce((s, i) => (i.amount < 0 && i.category !== AHORRO_CAT) ? s + Math.abs(i.amount) : s, 0);
}
function computeAhorro() {
  return ingresosValue - computeGastos();
}

// Tween state for the Ahorro card so we can interrupt an in-flight animation with a new target.
let ahorroAnim = { raf: null, displayed: 0 };

function paintAhorro(value) {
  const el = document.getElementById('ahorroValue');
  if (!el) return;
  el.textContent = (value < 0 ? '−' : '') + Math.abs(value).toLocaleString('es-CL');
  el.className = 'summary-card-value ' + (value >= 0 ? 'card-val-positive' : 'card-val-negative');
}

function animateAhorro(target) {
  const start = ahorroAnim.displayed;
  if (start === target) { paintAhorro(target); return; }

  if (ahorroAnim.raf) cancelAnimationFrame(ahorroAnim.raf);

  const duration = 500; // ms
  const t0 = performance.now();

  const tick = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    // ease-out cubic so the count-up decelerates toward the final value
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(start + (target - start) * eased);
    ahorroAnim.displayed = value;
    paintAhorro(value);
    if (t < 1) {
      ahorroAnim.raf = requestAnimationFrame(tick);
    } else {
      ahorroAnim.raf = null;
      ahorroAnim.displayed = target;
    }
  };
  ahorroAnim.raf = requestAnimationFrame(tick);
}

function renderSummaryCards() {
  const gastos = computeGastos();
  const ahorro = ingresosValue - gastos;

  const ingresosEl = document.getElementById('ingresosInput');
  if (ingresosEl && document.activeElement !== ingresosEl) {
    ingresosEl.value = ingresosValue.toLocaleString('es-CL');
  }

  const gastosEl = document.getElementById('gastosValue');
  if (gastosEl) gastosEl.textContent = gastos.toLocaleString('es-CL');

  animateAhorro(ahorro);
}

function itemRowHTML(item) {
  return `<tr data-id="${item.id}" draggable="true">
    <td class="drag-handle-cell" title="Drag to another category">
      <span class="drag-handle">⠿</span>
    </td>
    <td><input class="editable-cell" data-id="${item.id}" data-field="name"
               value="${item.name.replace(/"/g, '&quot;')}" type="text" /></td>
    <td><input class="editable-cell amount-cell" data-id="${item.id}" data-field="amount"
               value="${formatCLP(item.amount)}" data-raw="${item.amount}" type="text" /></td>
    <td><button class="delete-btn" data-id="${item.id}" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg></button></td>
  </tr>`;
}

function renderBudgetAccordion() {
  const container = document.getElementById('budgetAccordion');

  // Group items by category (Ahorro is synthetic — handled separately below)
  const groups = new Map();
  budgetItems.forEach(item => {
    if (item.category === AHORRO_CAT) return;
    const cat = item.category || '';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });

  // Include empty categories from the registry so they stay visible after the last item is deleted
  categoryRegistry.forEach(cat => {
    if (cat === AHORRO_CAT) return;
    if (!groups.has(cat)) groups.set(cat, []);
  });

  // Sort groups by total absolute amount descending
  const sorted = [...groups.entries()].sort((a, b) => {
    const tA = a[1].reduce((s, i) => s + Math.abs(i.amount), 0);
    const tB = b[1].reduce((s, i) => s + Math.abs(i.amount), 0);
    return tB - tA;
  });

  const normalHTML = sorted.map(([cat, items]) => {
    // Items sorted by absolute amount descending
    const sortedItems = [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const total = items.reduce((s, i) => s + i.amount, 0);
    const totalClass = '';
    const isOpen = openCategory === cat;
    const isEmpty = items.length === 0;

    let headerInner;
    if (cat) {
      const color = getCategoryColor(cat);
      const emoji = getCategoryEmoji(cat);
      headerInner = `<button class="acc-cat-emoji" data-cat="${escapeHtml(cat)}" title="Change emoji">${emoji}</button>`
        + `<span class="acc-cat-icon" style="background:${color};"></span>`
        + `<input class="acc-cat-name-input" data-cat="${escapeHtml(cat)}" value="${escapeHtml(cat)}" spellcheck="false" />`;
    } else {
      headerInner = `<span class="acc-cat-emoji" title="Uncategorized" style="cursor:default">❓</span>`
        + `<span class="acc-cat-icon" style="background:var(--border-color);"></span>`
        + `<span class="acc-cat-name acc-cat-uncategorized">Uncategorized</span>`;
    }

    const deleteCatBtn = cat
      ? `<button class="acc-delete-cat" data-cat="${escapeHtml(cat)}" title="Borrar categoría" aria-label="Borrar categoría">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1.4 13.1A2 2 0 0 1 15.6 21H8.4a2 2 0 0 1-2-1.9L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>`
      : '';

    const bodyHTML = isEmpty
      ? `<div class="acc-empty-state">
           <span class="acc-empty-text">Aún no hay gastos en esta categoría.</span>
           <button class="acc-empty-add" data-cat="${escapeHtml(cat)}">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
               <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
             </svg>
             Agregar primer gasto
           </button>
         </div>`
      : `<table class="budget-table"><tbody>${sortedItems.map(itemRowHTML).join('')}</tbody></table>`;

    return `<div class="acc-group${isOpen ? ' open' : ''}${isEmpty ? ' acc-group-empty' : ''}" data-cat="${escapeHtml(cat)}">
      <div class="acc-header">
        <span class="acc-chevron">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        ${headerInner}
        <span class="acc-total ${totalClass}">${formatCLP(total)}</span>
        <button class="acc-add-item" data-cat="${escapeHtml(cat)}" title="Add item to ${escapeHtml(cat || 'Uncategorized')}" aria-label="Add item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        ${deleteCatBtn}
      </div>
      <div class="acc-body">
        <div>${bodyHTML}</div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = normalHTML
    + `<button class="acc-add-category" id="addCategoryBtn" title="Add new category">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
           <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
         </svg>
       </button>`;
}

function computeChartData() {
  const totals = {};
  budgetItems.forEach(item => {
    if (item.amount < 0 && item.category !== AHORRO_CAT)
      totals[item.category] = (totals[item.category] || 0) + Math.abs(item.amount);
  });
  // Ahorro is always included as a category slice (clamped to ≥ 0 so a deficit doesn't break the doughnut)
  totals[AHORRO_CAT] = Math.max(0, computeAhorro());
  const sorted = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const data   = sorted.map(e => e[1]);
  const colors = labels.map(l => getCategoryColor(l));
  const total  = data.reduce((a, b) => a + b, 0);
  return { labels, data, colors, total };
}

function renderSummaryStats() {
  const incomeEl = document.getElementById('summaryIncome');
  if (!incomeEl) return;

  const income   = budgetItems.filter(i => i.amount > 0).reduce((s, i) => s + i.amount, 0);
  const expenses = budgetItems.filter(i => i.amount < 0).reduce((s, i) => s + Math.abs(i.amount), 0);
  const balance  = income - expenses;

  incomeEl.textContent = `CLP ${income.toLocaleString('es-CL')}`;
  document.getElementById('summaryExpenses').textContent = `−CLP ${expenses.toLocaleString('es-CL')}`;

  const balEl = document.getElementById('summaryBalance');
  balEl.textContent = `${balance >= 0 ? '+' : '−'}CLP ${Math.abs(balance).toLocaleString('es-CL')}`;
  balEl.className   = `summary-val balance-val ${balance >= 0 ? 'income-val' : 'expense-val'}`;
}

// Category-level data cached for hover logic
let chartCatData = { labels: [], data: [], colors: [], total: 0 };
let expandedCatIndex = null;
let chartMouseLeaveAttached = false;

// Viewport-aware reserve space around the donut for outer-label callouts.
// On phones the 150px side reserves from desktop would leave barely any
// donut visible, so scale with viewport width.
function getChartPadding() {
  const w = window.innerWidth;
  if (w <= 380) return { top: 14, bottom: 14, left: 52, right: 52 };
  if (w <= 520) return { top: 18, bottom: 18, left: 72, right: 72 };
  if (w <= 720) return { top: 22, bottom: 22, left: 100, right: 100 };
  if (w <= 900) return { top: 26, bottom: 26, left: 120, right: 120 };
  return { top: 30, bottom: 30, left: 150, right: 150 };
}

// Scale outer-label typography and callout geometry to the chart's rendered
// width so the labels stay legible without spilling off-canvas on mobile.
function getLabelMetrics(chartWidth) {
  if (chartWidth <= 360) {
    return { nameFont: 11, pctFont: 9,  emojiFont: 13, labelH: 20, anchor: 3, elbow: 10, tick: 8,  padding: 4, pctGap: 9  };
  }
  if (chartWidth <= 520) {
    return { nameFont: 13, pctFont: 10, emojiFont: 15, labelH: 22, anchor: 3, elbow: 12, tick: 10, padding: 4, pctGap: 10 };
  }
  if (chartWidth <= 720) {
    return { nameFont: 15, pctFont: 12, emojiFont: 16, labelH: 24, anchor: 4, elbow: 14, tick: 11, padding: 5, pctGap: 11 };
  }
  return { nameFont: 18, pctFont: 15, emojiFont: 18, labelH: 28, anchor: 4, elbow: 18, tick: 13, padding: 5, pctGap: 11 };
}

// Get items for a category, sorted by amount desc
function getCategoryItems(cat) {
  return budgetItems
    .filter(i => i.amount < 0 && i.category === cat)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

// Generate shaded variants of a base hex color for item slices
function itemShade(hex, index, count) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (count <= 1) return hex;
  // Spread from slightly darker to slightly lighter
  const t = index / (count - 1);           // 0 → 1
  const mix = 0.7 + t * 0.3;              // 0.7 → 1.0 (darker → base)
  const lighten = t * 0.25;               // add white towards end
  const nr = Math.min(255, Math.round(r * mix + 255 * lighten));
  const ng = Math.min(255, Math.round(g * mix + 255 * lighten));
  const nb = Math.min(255, Math.round(b * mix + 255 * lighten));
  return `rgb(${nr},${ng},${nb})`;
}

// Build the single-dataset slice arrays for a given expanded category (or null for collapsed)
function buildChartSlices(catLabels, catData, catColors, expandIdx) {
  const sliceData = [];
  const sliceBg = [];
  const sliceBorder = [];
  const sliceMeta = [];  // { type:'cat'|'item', catIndex, label, emoji? }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const border = isDark ? '#1e2535' : '#eef1f6';

  catLabels.forEach((cat, ci) => {
    const items = ci === expandIdx ? getCategoryItems(cat) : [];
    if (ci === expandIdx && items.length > 0) {
      const baseColor = catColors[ci];
      items.forEach((item, ii) => {
        sliceData.push(Math.abs(item.amount));
        sliceBg.push(itemShade(baseColor, ii, items.length));
        sliceBorder.push(border);
        sliceMeta.push({ type: 'item', catIndex: ci, label: item.name, emoji: item.emoji });
      });
    } else {
      // Either this isn't the expanded category, or it has no expandable items (e.g. Ahorro) —
      // keep it as a single category slice so it stays visible.
      sliceData.push(catData[ci]);
      sliceBg.push(catColors[ci]);
      sliceBorder.push(border);
      sliceMeta.push({ type: 'cat', catIndex: ci, label: cat });
    }
  });

  return { sliceData, sliceBg, sliceBorder, sliceMeta };
}

function applySlices(expandIdx) {
  const { labels, data, colors } = chartCatData;
  const { sliceData, sliceBg, sliceBorder, sliceMeta } = buildChartSlices(labels, data, colors, expandIdx);
  const ds = budgetChart.data.datasets[0];
  ds.data = sliceData;
  ds.backgroundColor = sliceBg;
  ds.borderColor = sliceBorder;
  ds._meta = sliceMeta;
  budgetChart.data.labels = sliceMeta.map(m => m.label);
  budgetChart.update();
}

// ── Empty state plugin ──
const emptyStatePlugin = {
  id: 'emptyState',
  afterDraw(chart) {
    const dataset = chart.data.datasets[0];
    const total = dataset.data.reduce((a, b) => a + b, 0);
    if (total > 0) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const outerR = Math.min(chartArea.width, chartArea.height) / 2 - 6;
    const innerR = outerR * 0.45;

    ctx.save();

    // Placeholder gray ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(163,177,198,0.18)';
    ctx.fill('evenodd');

    // Centered message
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDark ? '#7f8ea3' : '#8697a8';
    ctx.fillText('Sin gastos aún', cx, cy - 8);

    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDark ? '#5b6a80' : '#a3b1c6';
    ctx.fillText('Agrega montos para ver el gráfico', cx, cy + 14);

    ctx.restore();
  }
};

// ── Outer label plugin ──
const outerLabelPlugin = {
  id: 'outerLabels',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const dataset = chart.data.datasets[0];
    const metaArcs = chart.getDatasetMeta(0).data;
    const sliceMeta = dataset._meta;
    if (!sliceMeta || !metaArcs.length) return;

    const total = dataset.data.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#c8d6e5' : '#44566c';
    const m = getLabelMetrics(chart.width);

    ctx.save();

    // ── Pass 1: collect label data for all category slices ──
    const labelInfos = [];

    metaArcs.forEach((arc, i) => {
      const sm = sliceMeta[i];
      if (!sm || sm.type !== 'cat') return;

      const pct = (dataset.data[i] / total) * 100;
      const angle  = (arc.startAngle + arc.endAngle) / 2;
      const outerR = arc.outerRadius;
      const color  = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[i] : '#999';

      const x1 = cx + Math.cos(angle) * (outerR + m.anchor);
      const y1 = cy + Math.sin(angle) * (outerR + m.anchor);
      const x2 = cx + Math.cos(angle) * (outerR + m.elbow);
      const y2 = cy + Math.sin(angle) * (outerR + m.elbow);

      const isRight = Math.cos(angle) >= 0;

      labelInfos.push({ sm, pct, angle, color, x1, y1, x2, y2, isRight, finalY: y2 });
    });

    // ── Pass 2: resolve vertical overlaps per side ──
    ['left', 'right'].forEach(side => {
      const group = labelInfos
        .filter(l => side === 'right' ? l.isRight : !l.isRight)
        .sort((a, b) => a.finalY - b.finalY);
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1];
        const curr = group[i];
        if (curr.finalY - prev.finalY < m.labelH) {
          curr.finalY = prev.finalY + m.labelH;
        }
      }
    });

    // ── Pass 3: draw labels ──
    const nameFont = `600 ${m.nameFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const pctFont  = `500 ${m.pctFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const CHAR_W   = m.nameFont * 0.6;

    labelInfos.forEach(l => {
      const { sm, pct, color, x1, y1, x2, isRight, finalY } = l;

      const x3 = isRight
        ? Math.min(x2 + m.tick, chart.width - 4)
        : Math.max(x2 - m.tick, 4);

      const textX   = x3 + (isRight ? m.padding : -m.padding);
      const availPx = isRight ? (chart.width - textX - 2) : (textX - 2);
      const maxChars = Math.max(2, Math.floor(Math.max(availPx, CHAR_W * 3) / CHAR_W));
      const raw      = sm.label;
      const label    = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw;
      const pctLabel = pct.toFixed(1) + '%';

      // Polyline: start → elbow → horizontal tick (at adjusted Y)
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, finalY);
      ctx.lineTo(x3, finalY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.65;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(x1, y1, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.textAlign    = isRight ? 'left' : 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font         = nameFont;
      ctx.fillStyle    = textColor;
      ctx.fillText(label, textX, finalY - 1);

      ctx.font      = pctFont;
      ctx.fillStyle = isDark ? '#7f8ea3' : '#8697a8';
      ctx.fillText(pctLabel, textX, finalY + m.pctGap);
    });

    // Draw category/item emoji at the centroid of each slice
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${m.emojiFont}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    metaArcs.forEach((arc, i) => {
      const sm = sliceMeta[i];
      if (!sm) return;
      const pct = (dataset.data[i] / total) * 100;
      if (pct < 2) return;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const outerR = arc.outerRadius;
      const midR = outerR * 0.62;
      const x = cx + Math.cos(angle) * midR;
      const y = cy + Math.sin(angle) * midR;
      const emoji = sm.type === 'item'
        ? (sm.emoji || '🏷️')
        : getCategoryEmoji(sm.label);
      ctx.fillText(emoji, x, y);
    });

    ctx.restore();
  }
};

function renderBudgetChart() {
  const computed = computeChartData();
  chartCatData = computed;
  const { labels, data, colors, total } = computed;
  const canvas = document.getElementById('budgetPieChart');

  expandedCatIndex = null;
  const { sliceData, sliceBg, sliceBorder, sliceMeta } = buildChartSlices(labels, data, colors, null);

  if (budgetChart) {
    const ds = budgetChart.data.datasets[0];
    ds.data = sliceData;
    ds.backgroundColor = sliceBg;
    ds.borderColor = sliceBorder;
    ds._meta = sliceMeta;
    budgetChart.data.labels = sliceMeta.map(m => m.label);
    budgetChart.update();
  } else {
    budgetChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: sliceMeta.map(m => m.label),
        datasets: [{
          data: sliceData,
          backgroundColor: sliceBg,
          borderColor: sliceBorder,
          borderWidth: 3,
          hoverOffset: 6,
          _meta: sliceMeta
        }]
      },
      plugins: [emptyStatePlugin, outerLabelPlugin],
      options: {
        cutout: '45%',
        maintainAspectRatio: false,
        responsive: true,
        layout: { padding: getChartPadding() },
        animation: { duration: 300 },
        onResize: (chart) => {
          chart.options.layout.padding = getChartPadding();
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: ctx => {
                const c = ctx[0];
                const meta = c.dataset._meta?.[c.dataIndex];
                if (meta?.type === 'item') return `${meta.emoji}  ${meta.label}`;
                return c.label;
              },
              label: ctx => {
                const pct = chartCatData.total > 0 ? ((ctx.parsed / chartCatData.total) * 100).toFixed(1) : '0.0';
                return ` ${ctx.parsed.toLocaleString('es-CL')}  (${pct}%)`;
              }
            }
          }
        },
        onHover: (_event, elements) => {
          if (elements.length > 0) {
            const el = elements[0];
            const meta = budgetChart.data.datasets[0]._meta?.[el.dataIndex];
            if (!meta) return;

            if (meta.type === 'cat') {
              // Hovering a category slice → expand it
              if (expandedCatIndex !== meta.catIndex) {
                expandedCatIndex = meta.catIndex;
                applySlices(expandedCatIndex);
                highlightLegendCard(meta.catIndex);
              }
            } else {
              // Hovering an item slice → show the parent category card
              highlightLegendCard(meta.catIndex);
            }
          } else {
            // Mouse over empty area (hole or gap) → collapse
            if (expandedCatIndex !== null) {
              expandedCatIndex = null;
              applySlices(null);
              highlightLegendCard(null);
            }
          }
        }
      }
    });
  }

  // Attach mouseleave once to collapse on exit
  if (!chartMouseLeaveAttached) {
    chartMouseLeaveAttached = true;
    canvas.addEventListener('mouseleave', () => {
      if (expandedCatIndex !== null) {
        expandedCatIndex = null;
        applySlices(null);
      }
      highlightLegendCard(null);
    });

    // Re-apply viewport-aware padding on orientation/resize so mobile labels
    // stay in-frame when the user rotates the device.
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (!budgetChart) return;
        budgetChart.options.layout.padding = getChartPadding();
        budgetChart.resize();
        budgetChart.update('none');
      });
    });
  }

}

function highlightLegendCard() {}

function refreshBudget() {
  renderBudgetAccordion();
  renderBudgetChart();
  renderSummaryStats();
  renderSummaryCards();
  saveBudgetItems();
}

// ── Category Dropdown ──
function renderCatOptions(filterText) {
  const list = document.getElementById('catOptionsList');
  if (!list) return;
  const lc       = (filterText || '').toLowerCase().trim();
  const filtered = lc ? categoryRegistry.filter(c => c.toLowerCase().includes(lc)) : categoryRegistry;

  const optHtml = filtered.map(cat => {
    const color = getCategoryColor(cat);
    const safeColor = textSafeColor(color);
    const bg    = hexToRgba(color, 0.13);
    const bdr   = hexToRgba(color, 0.35);
    return `<div class="cat-option" data-cat="${escapeHtml(cat)}">
      <span class="cat-drag-handle">⠿</span>
      <span class="cat-opt-pill" style="background:${bg};color:${safeColor};border:1px solid ${bdr};">${escapeHtml(cat)}</span>
      <button class="cat-opt-del" data-cat="${escapeHtml(cat)}" title="Delete category">×</button>
    </div>`;
  }).join('');

  const trimmed   = (filterText || '').trim();
  const canCreate = trimmed && !categoryRegistry.some(c => c.toLowerCase() === trimmed.toLowerCase());
  const createHtml = canCreate
    ? `<div class="cat-create-opt" data-create="${escapeHtml(trimmed)}">
         Create <strong class="cat-create-label">"${escapeHtml(trimmed)}"</strong>
       </div>`
    : '';

  list.innerHTML = optHtml + createHtml;
}

function openCatDrop(itemId, anchorEl) {
  activeCatItemId = itemId;
  const drop   = document.getElementById('catDropdown');
  const search = document.getElementById('catDropSearch');

  search.value = '';
  renderCatOptions('');
  drop.style.display = 'flex';

  const rect  = anchorEl.getBoundingClientRect();
  const dropW = Math.max(rect.width, 230);
  let top  = rect.bottom + 4;
  let left = rect.left;

  if (left + dropW > window.innerWidth  - 8) left = window.innerWidth  - dropW - 8;
  if (top  + 320   > window.innerHeight - 8) top  = rect.top - 320 - 4;
  if (left < 8) left = 8;

  drop.style.top   = `${top}px`;
  drop.style.left  = `${left}px`;
  drop.style.width = `${dropW}px`;

  setTimeout(() => search.focus(), 0);
}

function closeCatDrop() {
  activeCatItemId = null;
  const drop = document.getElementById('catDropdown');
  if (drop) drop.style.display = 'none';
}

function selectCategory(itemId, cat) {
  const item = budgetItems.find(i => i.id === itemId);
  if (!item) return;
  item.category = cat;
  addCategoryToRegistry(cat);
  refreshBudget();
  closeCatDrop();
}


// ── Emoji Picker ──
let emojiPickerCallback = null;
let emojiPickerInitialized = false;

function openEmojiPicker(anchorEl, cb) {
  emojiPickerCallback = cb;
  const overlay = document.getElementById('emojiPickerOverlay');
  overlay.style.display = 'block';

  if (!emojiPickerInitialized) {
    emojiPickerInitialized = true;
    const picker = overlay.querySelector('emoji-picker');
    picker.addEventListener('emoji-click', e => {
      const unicode = e.detail?.unicode;
      if (unicode && emojiPickerCallback) emojiPickerCallback(unicode);
      closeEmojiPicker();
    });
  }

  const rect = anchorEl.getBoundingClientRect();
  const w = 340, h = 380;
  let top = rect.bottom + 4;
  let left = rect.left;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = rect.top - h - 4;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  overlay.style.top = top + 'px';
  overlay.style.left = left + 'px';
}
function closeEmojiPicker() {
  emojiPickerCallback = null;
  const overlay = document.getElementById('emojiPickerOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Rename category ──
function renameCategory(oldCat, newCat) {
  newCat = (newCat || '').trim();
  if (!newCat || newCat === oldCat) return false;

  budgetItems.forEach(i => { if (i.category === oldCat) i.category = newCat; });

  const idx = categoryRegistry.indexOf(oldCat);
  if (idx >= 0) categoryRegistry.splice(idx, 1);
  if (!categoryRegistry.includes(newCat)) categoryRegistry.push(newCat);
  saveCategoryRegistry();

  if (categoryColors[oldCat] && !categoryColors[newCat]) categoryColors[newCat] = categoryColors[oldCat];
  delete categoryColors[oldCat];
  saveCategoryColors();

  if (categoryEmojis[oldCat] && !categoryEmojis[newCat]) categoryEmojis[newCat] = categoryEmojis[oldCat];
  delete categoryEmojis[oldCat];
  saveCategoryEmojis();

  if (openCategory === oldCat) openCategory = newCat;
  refreshBudget();
  return true;
}

// ── Events ──
function initBudgetEvents() {
  const accordion = document.getElementById('budgetAccordion');
  const catDrop   = document.getElementById('catDropdown');
  const catSearch = document.getElementById('catDropSearch');

  // "Add new category" button at the bottom of the accordion
  accordion.addEventListener('click', e => {
    const addCatBtn = e.target.closest('.acc-add-category');
    if (addCatBtn) {
      e.stopPropagation();
      let name = 'New category';
      let suffix = 1;
      while (categoryRegistry.includes(name)) { name = `New category ${suffix++}`; }
      addCategoryToRegistry(name);
      const newItem = { id: nextId++, emoji: '💰', name: 'New item', amount: 0, category: name };
      budgetItems.push(newItem);
      openCategory = name;
      refreshBudget();
      const nameInput = accordion.querySelector(`.acc-cat-name-input[data-cat="${CSS.escape(name)}"]`);
      if (nameInput) { nameInput.focus(); nameInput.select(); }
      return;
    }
  });

  // Accordion clicks — headers toggle open/close; rows handle interactions
  accordion.addEventListener('click', e => {
    // Per-category trash button → confirm, then delete category + all its items
    const delCatBtn = e.target.closest('.acc-delete-cat');
    if (delCatBtn) {
      e.stopPropagation();
      const cat = delCatBtn.dataset.cat || '';
      if (!cat) return;
      showConfirm('¿Seguro que quieres borrar esta categoría?', () => deleteCategory(cat));
      return;
    }

    // Per-category "+" button → add new item to that category
    const addBtn = e.target.closest('.acc-add-item');
    if (addBtn) {
      e.stopPropagation();
      const cat = addBtn.dataset.cat || '';
      const newItem = { id: nextId++, emoji: '💰', name: 'New item', amount: 0, category: cat };
      budgetItems.push(newItem);
      openCategory = cat;
      refreshBudget();
      const nameInput = document.querySelector(`tr[data-id="${newItem.id}"] input[data-field="name"]`);
      if (nameInput) { nameInput.focus(); nameInput.select(); }
      return;
    }

    // Empty-state "Agregar primer gasto" button → add the first item to an empty category
    const emptyAddBtn = e.target.closest('.acc-empty-add');
    if (emptyAddBtn) {
      e.stopPropagation();
      const cat = emptyAddBtn.dataset.cat || '';
      const newItem = { id: nextId++, emoji: '💰', name: 'New item', amount: 0, category: cat };
      budgetItems.push(newItem);
      openCategory = cat;
      refreshBudget();
      const nameInput = document.querySelector(`tr[data-id="${newItem.id}"] input[data-field="name"]`);
      if (nameInput) { nameInput.focus(); nameInput.select(); }
      return;
    }

    // Category emoji → open emoji picker (doesn't toggle accordion)
    const catEmojiBtn = e.target.closest('.acc-cat-emoji');
    if (catEmojiBtn && catEmojiBtn.dataset.cat) {
      e.stopPropagation();
      const cat = catEmojiBtn.dataset.cat;
      openEmojiPicker(catEmojiBtn, emoji => {
        categoryEmojis[cat] = emoji;
        saveCategoryEmojis();
        refreshBudget();
      });
      return;
    }

    // Clicks on the name input must not toggle the accordion
    if (e.target.closest('.acc-cat-name-input')) { e.stopPropagation(); return; }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) { const id = parseInt(deleteBtn.dataset.id); budgetItems = budgetItems.filter(i => i.id !== id); refreshBudget(); return; }

    const catClear = e.target.closest('.cat-pill-clear');
    if (catClear) {
      e.stopPropagation();
      const item = budgetItems.find(i => i.id === parseInt(catClear.dataset.id));
      if (item) { item.category = ''; refreshBudget(); }
      return;
    }

    const catSel = e.target.closest('.cat-selector');
    if (catSel) {
      e.stopPropagation();
      const id = parseInt(catSel.dataset.id);
      if (activeCatItemId === id) { closeCatDrop(); } else { closePicker(); openCatDrop(id, catSel); }
      return;
    }

    // Accordion header toggle
    const header = e.target.closest('.acc-header');
    if (header) {
      const group = header.closest('.acc-group');
      const cat   = group.dataset.cat;
      if (openCategory === cat) {
        group.classList.remove('open');
        openCategory = null;
      } else {
        accordion.querySelectorAll('.acc-group.open').forEach(g => g.classList.remove('open'));
        group.classList.add('open');
        openCategory = cat;
      }
    }
  });

  // Category dropdown clicks
  catDrop.addEventListener('click', e => {
    const delBtn = e.target.closest('.cat-opt-del');
    if (delBtn) { e.stopPropagation(); deleteCategoryFromRegistry(delBtn.dataset.cat); renderCatOptions(catSearch.value); return; }

    const option = e.target.closest('.cat-option');
    if (option) { selectCategory(activeCatItemId, option.dataset.cat); return; }

    const createOpt = e.target.closest('.cat-create-opt');
    if (createOpt) { addCategoryToRegistry(createOpt.dataset.create); selectCategory(activeCatItemId, createOpt.dataset.create); return; }
  });

  // Category search
  catSearch.addEventListener('input', () => renderCatOptions(catSearch.value));
  catSearch.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCatDrop(); return; }
    if (e.key === 'Enter') {
      const val = catSearch.value.trim();
      if (!val) return;
      const match = categoryRegistry.find(c => c.toLowerCase() === val.toLowerCase());
      if (match) selectCategory(activeCatItemId, match);
      else { addCategoryToRegistry(val); selectCategory(activeCatItemId, val); }
    }
  });

  // Amount: show raw number on focus, formatted on blur
  accordion.addEventListener('focusin', e => {
    const input = e.target.closest('input[data-field="amount"]');
    if (!input) return;
    input.value = Math.abs(parseFloat(input.dataset.raw) || 0) || '';
    input.select();
  });

  accordion.addEventListener('focusout', e => {
    const input = e.target.closest('input[data-field="amount"]');
    if (!input) return;
    const item = budgetItems.find(i => i.id === parseInt(input.dataset.id));
    if (!item) return;
    const entered = Math.abs(parseFloat(input.value) || 0);
    item.amount       = -entered;
    input.dataset.raw = item.amount;
    input.value       = formatCLP(item.amount);
    const catGroup = accordion.querySelector(`.acc-group[data-cat="${CSS.escape(item.category || '')}"]`);
    if (catGroup) {
      const catTotal = budgetItems.filter(i => i.category === item.category).reduce((s, i) => s + i.amount, 0);
      const totalEl = catGroup.querySelector('.acc-header .acc-total');
      if (totalEl) totalEl.textContent = formatCLP(catTotal);
    }
    renderBudgetChart();
    renderSummaryStats();
    renderSummaryCards();
    saveBudgetItems();
  });

  // Name: live update
  accordion.addEventListener('input', e => {
    const input = e.target.closest('input[data-field="name"]');
    if (!input) return;
    const item = budgetItems.find(i => i.id === parseInt(input.dataset.id));
    if (!item) return;
    item.name = input.value;
    saveBudgetItems();
  });

  // Category name: rename on Enter / blur
  accordion.addEventListener('keydown', e => {
    const input = e.target.closest('.acc-cat-name-input');
    if (!input) return;
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { input.value = input.dataset.cat; input.blur(); }
  });
  accordion.addEventListener('focusout', e => {
    const input = e.target.closest('.acc-cat-name-input');
    if (!input) return;
    const oldCat = input.dataset.cat;
    const newCat = input.value.trim();
    if (!newCat || newCat === oldCat) { input.value = oldCat; return; }
    renameCategory(oldCat, newCat);
  });
  // Prevent accordion toggle when focusing/clicking name input
  accordion.addEventListener('mousedown', e => {
    if (e.target.closest('.acc-cat-name-input') || e.target.closest('.acc-cat-emoji')) {
      e.stopPropagation();
    }
  });

  // Ingresos card — editable
  const ingresosInput = document.getElementById('ingresosInput');
  ingresosInput.addEventListener('focus', () => {
    ingresosInput.value = ingresosValue || '';
    ingresosInput.select();
  });
  // Live recalculation: Ahorro (card + chart slice) updates on every keystroke, not just on blur
  ingresosInput.addEventListener('input', () => {
    const raw = parseInt(ingresosInput.value.replace(/\D/g, ''), 10) || 0;
    ingresosValue = raw;
    localStorage.setItem('ingresos', raw);
    renderSummaryCards();
    renderBudgetChart();
  });
  ingresosInput.addEventListener('blur', () => {
    // Re-format the input to locale style on blur
    renderSummaryCards();
  });
  ingresosInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') ingresosInput.blur();
  });

  // ── Drag & drop items between categories ──
  let dragItemId = null;
  accordion.addEventListener('dragstart', e => {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    dragItemId = parseInt(row.dataset.id);
    row.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', String(dragItemId)); } catch {}
    e.dataTransfer.effectAllowed = 'move';
  });
  accordion.addEventListener('dragend', e => {
    const row = e.target.closest('tr[data-id]');
    if (row) row.classList.remove('dragging');
    accordion.querySelectorAll('.acc-group.drop-target').forEach(g => g.classList.remove('drop-target'));
    dragItemId = null;
  });
  accordion.addEventListener('dragover', e => {
    const group = e.target.closest('.acc-group');
    if (!group || dragItemId == null) return;
    if (group.dataset.locked === 'true') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    accordion.querySelectorAll('.acc-group.drop-target').forEach(g => { if (g !== group) g.classList.remove('drop-target'); });
    group.classList.add('drop-target');
  });
  accordion.addEventListener('dragleave', e => {
    const group = e.target.closest('.acc-group');
    if (!group) return;
    if (!group.contains(e.relatedTarget)) group.classList.remove('drop-target');
  });
  accordion.addEventListener('drop', e => {
    const group = e.target.closest('.acc-group');
    if (!group) return;
    if (group.dataset.locked === 'true') return;
    e.preventDefault();
    const id = dragItemId ?? parseInt(e.dataTransfer.getData('text/plain'));
    const item = budgetItems.find(i => i.id === id);
    group.classList.remove('drop-target');
    if (!item) return;
    const newCat = group.dataset.cat || '';
    if (item.category === newCat) return;
    item.category = newCat;
    openCategory = newCat;
    refreshBudget();
  });

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.cat-selector') && !e.target.closest('#catDropdown')) closeCatDrop();
    if (!e.target.closest('#emojiPickerOverlay') && !e.target.closest('.acc-cat-emoji')) closeEmojiPicker();
  });

  // Theme sync
  themeToggle.addEventListener('click', () => {
    setTimeout(() => {
      if (budgetChart) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        budgetChart.data.datasets[0].borderColor = isDark ? '#1e2535' : '#eef1f6';
        budgetChart.update();
      }
    }, 0);
  });
}

function initBudgetPage() {
  loadBudgetItems();
  loadCategoryRegistry();
  refreshBudget();
  initBudgetEvents();
}

initBudgetPage();

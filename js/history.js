/**
 * History Module
 * Lee el historial desde SQLite, aplica filtros y pagina los eventos.
 */
import { apiRequest, buildQuery } from './api.js';
import { currentUser } from './auth.js';
import { formatArgentinaDateTime, argentinaDateKey } from './argentina-time.js';

const HISTORY_PAGE_SIZE = 30;
let historyOffset = 0;
let historyHasMore = false;
let historyLoading = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isActionEntry(entry) {
  const actionTypes = ['Contacto', 'Usuario', 'Configuración', 'Acción'];
  const actionBadges = ['VALIDADA', 'RECHAZADA', 'ALTA', 'BAJA', 'AJUSTE', 'EDICIÓN'];
  return entry.categoria === 'Acción' || actionTypes.includes(entry.tipo) || actionBadges.includes(entry.badge);
}

function iconForType(entry) {
  if (isActionEntry(entry)) {
    const isRejected = entry.badge === 'RECHAZADA' || entry.badge === 'BAJA';
    const stroke = isRejected ? '#C0392B' : '#2E86C1';
    const bg = isRejected ? '#FDECEA' : '#EBF5FB';
    return {
      bg,
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
  }

  if (entry.tipo === 'Alerta automática') {
    const stroke = entry.riesgo === 'Rojo' ? '#C0392B' : '#E67E22';
    return {
      bg: entry.riesgo === 'Rojo' ? '#FDECEA' : '#FEF3E2',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="${stroke}" stroke-width="2"/><path d="M12 9v4M12 17h.01" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`
    };
  }

  if (entry.tipo === 'Alerta manual') {
    return {
      bg: '#EBF5FB',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#2E86C1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
  }

  if (entry.tipo === 'Incidencia') {
    return {
      bg: '#E9F7EF',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M9 16h4" stroke="#27AE60" stroke-width="2" stroke-linecap="round"/><rect x="4" y="4" width="16" height="16" rx="2" stroke="#27AE60" stroke-width="2"/></svg>`
    };
  }

  return {
    bg: '#EBF5FB',
    svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="#2E86C1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };
}

function badgeClass(entry) {
  if (['ROJO', 'RECHAZADA', 'BAJA'].includes(entry.badge)) return 'badge-rojo';
  if (['NARANJA', 'OBSERVACIÓN'].includes(entry.badge)) return 'badge-naranja';
  if (['NORMAL', 'VALIDADA', 'FINALIZADA'].includes(entry.badge)) return 'badge-verde';
  if (['EMITIDA', 'REVISIÓN', 'ALTA', 'AJUSTE', 'EDICIÓN'].includes(entry.badge)) return 'badge-celeste';
  return 'badge-gris';
}

function ensureActionsFilter(filterBar) {
  const typeSelect = filterBar?.querySelector('select:nth-of-type(3)');
  if (!typeSelect) return;
  if (Array.from(typeSelect.options).some(option => option.value === 'Acción' || option.textContent === 'Acción')) return;

  const option = document.createElement('option');
  option.value = 'Acción';
  option.textContent = 'Acción';
  typeSelect.appendChild(option);
}

function ensureActionsSummary(summaryGrid) {
  if (!summaryGrid) return null;

  summaryGrid.style.gridTemplateColumns = 'repeat(5,minmax(0,1fr))';

  let card = summaryGrid.querySelector('[data-rf10-actions-card]');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-rf10-actions-card', 'true');
    card.style.cssText = 'padding:14px;border-left:4px solid var(--verde-lt);';
    card.innerHTML = `
      <div class="card-title">Acciones registradas</div>
      <div data-rf10-actions-count style="font-size:22px;font-weight:800;color:var(--verde-lt);">0</div>
      <div style="font-size:11px;color:var(--texto-sub);">Validaciones y gestión</div>
    `;
    summaryGrid.appendChild(card);
  }

  return card;
}

function summaryCardByTitle(summaryGrid, title) {
  return Array.from(summaryGrid?.querySelectorAll(':scope > .card') || []).find(card =>
    String(card.querySelector('.card-title')?.textContent || '').trim() === title
  ) || null;
}

function setSummarySubtitle(summaryGrid, title, text) {
  const card = summaryCardByTitle(summaryGrid, title);
  const subtitle = card?.querySelector('div:last-child');
  if (subtitle) subtitle.textContent = text;
}

function updateSummarySubtitles(summaryGrid) {
  if (!summaryGrid) return;
  setSummarySubtitle(summaryGrid, 'Mediciones', 'Registros según filtros');
  setSummarySubtitle(summaryGrid, 'Alertas automáticas', 'Según filtros aplicados');
  setSummarySubtitle(summaryGrid, 'Alertas manuales', 'Según filtros aplicados');
  setSummarySubtitle(summaryGrid, 'Incidencias', 'Según filtros aplicados');
}

function historyFilters(filterBar) {
  return {
    zona: filterBar.querySelector('select:nth-of-type(1)')?.value || 'Todas',
    riesgo: filterBar.querySelector('select:nth-of-type(2)')?.value || 'Todos',
    tipo: filterBar.querySelector('select:nth-of-type(3)')?.value || 'Todos',
    desde: filterBar.querySelectorAll('input[type="date"]')[0]?.value || '',
    hasta: filterBar.querySelectorAll('input[type="date"]')[1]?.value || '',
  };
}

function ensureLoadMoreControl(container) {
  let button = container.querySelector('[data-history-load-more]');
  let wrap = button?.parentElement || null;

  if (!button) {
    const candidate = Array.from(container.querySelectorAll('button')).find(btn =>
      String(btn.textContent || '').toLowerCase().includes('cargar más eventos')
    );
    if (candidate) {
      button = candidate;
      wrap = candidate.parentElement;
    }
  }

  if (!button) {
    wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;margin-top:16px;';
    button = document.createElement('button');
    button.className = 'btn btn-ghost btn-sm';
    button.textContent = 'Cargar más eventos...';
    wrap.appendChild(button);
    container.appendChild(wrap);
  }

  button.setAttribute('data-history-load-more', '1');
  button.removeAttribute('onclick');
  button.onclick = () => loadMoreHistory();
  return { wrap, button };
}

function updateLoadMoreControl(container) {
  const { wrap, button } = ensureLoadMoreControl(container);
  if (!wrap || !button) return;

  wrap.style.display = historyHasMore ? 'block' : 'none';
  button.disabled = historyLoading;
  button.textContent = historyLoading ? 'Cargando...' : 'Cargar más eventos...';
}

function renderHistoryEntry(container, entry, beforeElement) {
  const icon = iconForType(entry);
  const entryDiv = document.createElement('div');
  entryDiv.className = 'hist-entry';
  if (entry.alerta_id) entryDiv.dataset.alertaId = String(entry.alerta_id);
  entryDiv.innerHTML = `
    <div style="width:42px;height:42px;background:${icon.bg};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      ${icon.svg}
    </div>
    <div class="hist-type-badge" style="background:${icon.bg};color:var(--texto-base);">${escapeHtml(entry.tipo)}</div>
    <div class="hist-meta">
      <div class="hist-desc">${escapeHtml(entry.desc)}</div>
      <div class="hist-detail">${escapeHtml(entry.detail)}</div>
      <div class="hist-datetime">Fecha y hora: ${escapeHtml(formatArgentinaDateTime(entry.creado_en))}</div>
    </div>
    <div class="hist-nivel" style="color:var(--azul-mid);">${escapeHtml(entry.nivel || '—')}</div>
    <span class="badge ${badgeClass(entry)}">${escapeHtml(entry.badge)}</span>
  `;
  container.insertBefore(entryDiv, beforeElement);
}

function updateHistorySummary(container, stats = {}) {
  const summaryGrid = container.querySelector('div[style*="grid-template-columns"]');
  if (!summaryGrid) return;

  const measurementCard = summaryCardByTitle(summaryGrid, 'Mediciones');
  const automaticCard = summaryCardByTitle(summaryGrid, 'Alertas automáticas');
  const manualCard = summaryCardByTitle(summaryGrid, 'Alertas manuales');
  const incidentCard = summaryCardByTitle(summaryGrid, 'Incidencias');

  const kpiMediciones = measurementCard?.querySelector('div[style*="font-size:22px"]');
  const kpiAutos = automaticCard?.querySelector('div[style*="font-size:22px"]');
  const kpiManuales = manualCard?.querySelector('div[style*="font-size:22px"]');
  const kpiIncidencias = incidentCard?.querySelector('div[style*="font-size:22px"]');

  if (kpiMediciones) kpiMediciones.textContent = stats.mediciones ?? 0;
  if (kpiAutos) kpiAutos.textContent = stats.automaticas ?? 0;
  if (kpiManuales) kpiManuales.textContent = stats.manuales ?? 0;
  if (kpiIncidencias) kpiIncidencias.textContent = stats.incidencias ?? 0;

  const actionsCard = ensureActionsSummary(summaryGrid);
  const actionsCount = actionsCard?.querySelector('[data-rf10-actions-count]');
  if (actionsCount) actionsCount.textContent = stats.acciones ?? 0;

  updateSummarySubtitles(summaryGrid);
}

export async function renderHistory(options = {}) {
  const append = Boolean(options?.append);
  const container = document.querySelector('#s-historial .content');
  if (!container || historyLoading) return;

  const filterBar = container.querySelector('.filter-bar');
  if (!filterBar) return;

  ensureActionsFilter(filterBar);
  const loadControl = ensureLoadMoreControl(container);

  if (!append) {
    historyOffset = 0;
    historyHasMore = false;
    container.querySelectorAll('.hist-entry').forEach(el => el.remove());
  }

  if (!currentUser()) return;

  historyLoading = true;
  updateLoadMoreControl(container);

  const filters = historyFilters(filterBar);
  const offset = append ? historyOffset : 0;

  let data;
  try {
    data = await apiRequest(`/historial${buildQuery({
      ...filters,
      offset,
      limit: HISTORY_PAGE_SIZE,
    })}`);
  } catch (error) {
    if (!currentUser()) return;

    const errorDiv = document.createElement('div');
    errorDiv.className = 'hist-entry';
    errorDiv.style.justifyContent = 'center';
    errorDiv.style.color = 'var(--rojo)';
    errorDiv.textContent = error.message;
    container.insertBefore(errorDiv, loadControl.wrap);
    return;
  } finally {
    historyLoading = false;
  }

  const eventos = data.eventos || [];

  if (!append && eventos.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'hist-entry';
    emptyDiv.style.justifyContent = 'center';
    emptyDiv.style.color = 'var(--texto-sub)';
    emptyDiv.textContent = 'No se encontraron eventos en el historial que coincidan con los filtros aplicados.';
    container.insertBefore(emptyDiv, loadControl.wrap);
  } else {
    eventos.forEach(entry => renderHistoryEntry(container, entry, loadControl.wrap));
  }

  historyOffset = offset + eventos.length;
  historyHasMore = Boolean(data.hasMore);
  updateHistorySummary(container, data.stats || {});
  updateLoadMoreControl(container);
}

export async function loadMoreHistory() {
  if (!historyHasMore || historyLoading) return;
  await renderHistory({ append: true });
}

export function clearHistoryFilters() {
  const filterBar = document.querySelector('#s-historial .filter-bar');
  if (!filterBar) return;
  filterBar.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
  filterBar.querySelectorAll('input[type="date"]').forEach(input => { input.value = ''; });
  renderHistory();
}

window.renderHistory = renderHistory;
window.loadMoreHistory = loadMoreHistory;
window.applyHistoryFilters = renderHistory;
window.clearHistoryFilters = clearHistoryFilters;

export function initHistoryFilters() {
  const now = new Date();
  const todayStr = argentinaDateKey(now);
  const dateInputs = document.querySelectorAll('#s-historial input[type="date"]');
  const filterBar = document.querySelector('#s-historial .filter-bar');

  ensureActionsFilter(filterBar);

  if (dateInputs.length >= 2) {
    const yesterdayStr = argentinaDateKey(new Date(now.getTime() - 86400000));
    dateInputs[0].value = yesterdayStr;
    dateInputs[1].value = todayStr;
  }

  const filterBtn = filterBar?.querySelector('button');
  filterBtn?.setAttribute('onclick', 'applyHistoryFilters()');

  const container = document.querySelector('#s-historial .content');
  if (container) {
    historyHasMore = false;
    updateLoadMoreControl(container);
  }
}

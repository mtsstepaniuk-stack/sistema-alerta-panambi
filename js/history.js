/**
 * History Module
 * Lee el historial desde SQLite y aplica filtros desde la interfaz.
 */
import { apiRequest, buildQuery } from './api.js';

function iconForType(entry) {
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


function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function badgeClass(entry) {
  if (entry.badge === 'ROJO') return 'badge-rojo';
  if (['NARANJA', 'OBSERVACIÓN'].includes(entry.badge)) return 'badge-naranja';
  if (['NORMAL', 'VALIDADA'].includes(entry.badge)) return 'badge-verde';
  if (['EMITIDA', 'REVISIÓN', 'ALTA'].includes(entry.badge)) return 'badge-celeste';
  return 'badge-gris';
}

export async function renderHistory() {
  const container = document.querySelector('#s-historial .content');
  if (!container) return;

  const filterBar = container.querySelector('.filter-bar');
  if (!filterBar) return;

  const selectZona = filterBar.querySelector('select:nth-of-type(1)')?.value || 'Todas';
  const selectRiesgo = filterBar.querySelector('select:nth-of-type(2)')?.value || 'Todos';
  const selectTipo = filterBar.querySelector('select:nth-of-type(3)')?.value || 'Todos';
  const dateFrom = filterBar.querySelectorAll('input[type="date"]')[0]?.value;
  const dateTo = filterBar.querySelectorAll('input[type="date"]')[1]?.value;

  container.querySelectorAll('.hist-entry').forEach(el => el.remove());
  const loadMoreBtnWrap = container.querySelector('div[style*="text-align:center"]');

  let data;
  try {
    data = await apiRequest(`/historial${buildQuery({ zona: selectZona, riesgo: selectRiesgo, tipo: selectTipo, desde: dateFrom, hasta: dateTo })}`);
  } catch (error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'hist-entry';
    errorDiv.style.justifyContent = 'center';
    errorDiv.style.color = 'var(--rojo)';
    errorDiv.innerHTML = error.message;
    container.insertBefore(errorDiv, loadMoreBtnWrap);
    return;
  }

  const eventos = data.eventos || [];

  if (eventos.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'hist-entry';
    emptyDiv.style.justifyContent = 'center';
    emptyDiv.style.color = 'var(--texto-sub)';
    emptyDiv.innerHTML = 'No se encontraron eventos en el historial que coincidan con los filtros aplicados.';
    container.insertBefore(emptyDiv, loadMoreBtnWrap);
  } else {
    eventos.forEach(entry => {
      const icon = iconForType(entry);
      const entryDiv = document.createElement('div');
      entryDiv.className = 'hist-entry';
      entryDiv.innerHTML = `
        <div style="width:42px;height:42px;background:${icon.bg};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${icon.svg}
        </div>
        <div class="hist-type-badge" style="background:${icon.bg};color:var(--texto-base);">${entry.tipo}</div>
        <div class="hist-meta">
          <div class="hist-desc">${entry.desc}</div>
          <div class="hist-detail">${entry.detail}</div>
          <div class="hist-datetime">Fecha y hora: ${formatDateTime(entry.creado_en)}</div>
        </div>
        <div class="hist-nivel" style="color:var(--azul-mid);">${entry.nivel || '—'}</div>
        <span class="badge ${badgeClass(entry)}">${entry.badge}</span>
      `;
      container.insertBefore(entryDiv, loadMoreBtnWrap);
    });
  }

  const summaryGrid = container.querySelector('div[style*="grid-template-columns"]');
  const stats = data.stats || {};
  if (summaryGrid) {
    const kpiMediciones = summaryGrid.querySelector('div:nth-child(1) div[style*="font-size:22px"]');
    const kpiAutos = summaryGrid.querySelector('div:nth-child(2) div[style*="font-size:22px"]');
    const kpiManuales = summaryGrid.querySelector('div:nth-child(3) div[style*="font-size:22px"]');
    const kpiIncidencias = summaryGrid.querySelector('div:nth-child(4) div[style*="font-size:22px"]');

    if (kpiMediciones) kpiMediciones.textContent = stats.mediciones || 0;
    if (kpiAutos) kpiAutos.textContent = stats.automaticas || 0;
    if (kpiManuales) kpiManuales.textContent = stats.manuales || 0;
    if (kpiIncidencias) kpiIncidencias.textContent = stats.incidencias || 0;
  }
}

export function clearHistoryFilters() {
  const filterBar = document.querySelector('#s-historial .filter-bar');
  if (!filterBar) return;
  filterBar.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
  filterBar.querySelectorAll('input[type="date"]').forEach(input => { input.value = ''; });
  renderHistory();
}

window.applyHistoryFilters = renderHistory;
window.clearHistoryFilters = clearHistoryFilters;

export function initHistoryFilters() {
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInputs = document.querySelectorAll('#s-historial input[type="date"]');

  if (dateInputs.length >= 2) {
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    dateInputs[0].value = yesterdayStr;
    dateInputs[1].value = todayStr;
  }

  const filterBtn = document.querySelector('#s-historial .filter-bar button');
  filterBtn?.setAttribute('onclick', 'applyHistoryFilters()');
}

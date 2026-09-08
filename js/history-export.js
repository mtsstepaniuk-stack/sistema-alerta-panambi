/**
 * Exportación real del Historial a CSV.
 * Descarga todos los eventos que coinciden con los filtros visibles,
 * recorriendo la paginación del backend en tandas de 100 registros.
 */
import { apiRequest, buildQuery } from './api.js';
import { formatArgentinaDateTime, argentinaDateKey } from './argentina-time.js';

const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_PAGES = 500;

function currentFilters() {
  const filterBar = document.querySelector('#s-historial .filter-bar');
  if (!filterBar) return null;

  return {
    zona: filterBar.querySelector('select:nth-of-type(1)')?.value || 'Todas',
    riesgo: filterBar.querySelector('select:nth-of-type(2)')?.value || 'Todos',
    tipo: filterBar.querySelector('select:nth-of-type(3)')?.value || 'Todos',
    desde: filterBar.querySelectorAll('input[type="date"]')[0]?.value || '',
    hasta: filterBar.querySelectorAll('input[type="date"]')[1]?.value || '',
  };
}

function csvValue(value) {
  let text = String(value ?? '');

  // Evita que Excel interprete contenido del historial como una fórmula.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;

  text = text.replace(/\r?\n/g, ' ').replaceAll('"', '""');
  return `"${text}"`;
}

async function fetchAllFilteredEvents(filters) {
  const all = [];
  let offset = 0;

  for (let page = 0; page < MAX_EXPORT_PAGES; page++) {
    const data = await apiRequest(`/historial${buildQuery({
      ...filters,
      offset,
      limit: EXPORT_PAGE_SIZE,
    })}`);

    const events = Array.isArray(data.eventos) ? data.eventos : [];
    all.push(...events);

    if (!data.hasMore || events.length === 0) break;
    offset += events.length;
  }

  return all;
}

function buildCsv(events) {
  const headers = [
    'Fecha y hora',
    'Tipo',
    'Descripción',
    'Detalle',
    'Nivel',
    'Estado',
    'Zona',
    'Riesgo',
    'ID alerta',
  ];

  const rows = events.map(event => [
    formatArgentinaDateTime(event.creado_en),
    event.tipo || '',
    event.desc || '',
    event.detail || '',
    event.nivel || '',
    event.badge || '',
    event.zona || '',
    event.riesgo || '',
    event.alerta_id || '',
  ]);

  return [headers, ...rows]
    .map(row => row.map(csvValue).join(';'))
    .join('\r\n');
}

function downloadCsv(csv) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `historial_sat_panambi_${argentinaDateKey(new Date())}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportHistoryCSV() {
  const button = document.querySelector('#s-historial [data-sat-history-export="1"]');
  const filters = currentFilters();

  if (!filters) {
    window.alert('No se pudieron leer los filtros del Historial.');
    return;
  }

  const originalText = button?.textContent || '⬇ Exportar CSV';
  if (button) {
    button.disabled = true;
    button.textContent = '⏳ Exportando...';
  }

  try {
    const events = await fetchAllFilteredEvents(filters);

    if (events.length === 0) {
      window.alert('No hay eventos para exportar con los filtros seleccionados.');
      return;
    }

    downloadCsv(buildCsv(events));
  } catch (error) {
    window.alert(`No se pudo exportar el historial: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function wireExportButton() {
  const button = Array.from(document.querySelectorAll('#s-historial .page-header button')).find(btn =>
    String(btn.textContent || '').toLowerCase().includes('exportar csv')
  );
  if (!button) return;

  button.removeAttribute('onclick');
  button.setAttribute('data-sat-history-export', '1');
  button.setAttribute('title', 'Descargar historial filtrado en formato CSV');

  if (button.dataset.satHistoryExportReady === '1') return;
  button.dataset.satHistoryExportReady = '1';
  button.addEventListener('click', exportHistoryCSV);
}

window.exportHistoryCSV = exportHistoryCSV;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireExportButton, { once: true });
} else {
  wireExportButton();
}

window.addEventListener('sat:navigate', wireExportButton);

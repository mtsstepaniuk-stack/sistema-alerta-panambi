/*
 * Mapa cartográfico corregido para el prototipo.
 *
 * Los sensores son SIMULADOS. Se ubican sobre el cauce del Río Uruguay y
 * aguas arriba de Panambí para representar la lógica de alerta temprana:
 * detectar una crecida antes de que llegue al área urbana.
 *
 * Referencias geográficas usadas para orientar el trazado:
 * - Panambí / Puerto Panambí: aprox. -27.72, -54.91
 * - sector del proyecto Panambí aguas arriba: aprox. -27.65, -54.90
 *
 * No se dibujan áreas de cobertura: un sensor se representa únicamente
 * mediante su marcador circular.
 */

const OSM_TILES_UPSTREAM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const UPSTREAM_SENSORS = [
  { id: 'S-01', lat: -27.6548, lng: -54.9046, punto: 'Monitoreo aguas arriba 1' },
  { id: 'S-02', lat: -27.6681, lng: -54.9054, punto: 'Monitoreo aguas arriba 2' },
  { id: 'S-03', lat: -27.6816, lng: -54.9065, punto: 'Monitoreo aguas arriba 3' },
  { id: 'S-04', lat: -27.6950, lng: -54.9078, punto: 'Monitoreo aguas arriba 4' },
  { id: 'S-05', lat: -27.7082, lng: -54.9092, punto: 'Monitoreo aguas arriba 5' },
  { id: 'S-06', lat: -27.7187, lng: -54.9105, punto: 'Ingreso a Panambí' },
];

let upstreamInlineMap = null;
let upstreamModalMap = null;
let upstreamLastData = null;
let upstreamObserver = null;
let upstreamTimer = null;

function sensorRiskColor(risk) {
  if (risk === 'Rojo') return '#c0392b';
  if (risk === 'Naranja') return '#e67e22';
  if (risk === 'Amarillo') return '#f1c40f';
  if (risk === 'Vecinal') return '#8e44ad';
  return '#27ae60';
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function injectUpstreamStyles() {
  if (document.getElementById('sat-upstream-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'sat-upstream-map-styles';
  style.textContent = `
    #real-map .sat-upstream-map {
      width: 100%;
      height: 100%;
      min-height: 380px;
      border-radius: 9px;
      background: #dbe8ef;
    }

    .sat-upstream-expand button {
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 4px;
      background: #fff;
      color: #263746;
      font-size: 18px;
      line-height: 34px;
      cursor: pointer;
      display: grid;
      place-items: center;
      padding: 0;
      box-shadow: 0 1px 5px rgba(0,0,0,.28);
    }

    .sat-upstream-expand button:hover { background: #f3f6f8; }

    .sat-upstream-popup { min-width: 190px; }
    .sat-upstream-popup strong { display: block; margin-bottom: 5px; font-size: 14px; }
    .sat-upstream-popup div { margin: 2px 0; }
    .sat-upstream-popup .sat-note { margin-top: 6px; color: #667; font-size: 10px; line-height: 1.35; }

    .sat-upstream-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
      background: rgba(5, 18, 32, .72);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
    }

    .sat-upstream-dialog {
      width: min(1180px, 95vw);
      height: min(800px, 90vh);
      min-height: 520px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 16px;
      background: #102238;
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 28px 80px rgba(0,0,0,.55);
    }

    .sat-upstream-header {
      min-height: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 16px 0 20px;
      color: #fff;
      border-bottom: 1px solid rgba(255,255,255,.1);
    }

    .sat-upstream-title strong { display:block; font-size:14px; }
    .sat-upstream-title span { display:block; margin-top:2px; color:#9fb7cd; font-size:11px; }

    .sat-upstream-close {
      width: 38px;
      height: 38px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      background: rgba(255,255,255,.07);
      color: #fff;
      font-size: 25px;
      cursor: pointer;
    }

    .sat-upstream-close:hover { background: rgba(255,255,255,.14); }

    .sat-upstream-body {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      background: #dbe8ef;
    }

    .sat-upstream-modal-map {
      width: 100%;
      height: 100%;
      background: #dbe8ef;
    }

    .sat-upstream-info {
      position: absolute;
      left: 14px;
      bottom: 14px;
      z-index: 800;
      max-width: min(520px, 72%);
      padding: 8px 10px;
      border-radius: 7px;
      background: rgba(16,34,56,.92);
      border: 1px solid rgba(255,255,255,.12);
      color: #dbe8f4;
      font-size: 10px;
      line-height: 1.35;
      pointer-events: none;
    }

    body.sat-upstream-modal-open { overflow: hidden !important; }

    @media (max-width: 700px) {
      .sat-upstream-modal { padding: 10px; }
      .sat-upstream-dialog { width: 100%; height: 92vh; min-height: 0; border-radius: 12px; }
      .sat-upstream-info { max-width: 78%; }
    }
  `;
  document.head.appendChild(style);
}

async function waitForLeaflet() {
  for (let i = 0; i < 80; i += 1) {
    if (window.L) return window.L;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Leaflet no terminó de cargar.');
}

async function loadSensorData() {
  const response = await fetch('/api/dashboard', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo consultar el dashboard.');
  const payload = await response.json();
  return payload?.data ?? payload;
}

function sensorDataById(data) {
  const source = Array.isArray(data?.sensores) ? data.sensores : [];
  return new Map(source.map(item => [String(item.sensor || item.id || ''), item]));
}

function addBaseLayer(L, map) {
  L.tileLayer(OSM_TILES_UPSTREAM, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function addOnlySensors(L, map, data, expanded = false) {
  const byId = sensorDataById(data);
  const bounds = [];

  UPSTREAM_SENSORS.forEach(point => {
    const current = byId.get(point.id) || {};
    const risk = current.riesgo || 'Verde';
    const color = sensorRiskColor(risk);
    const level = Number(current.nivel_m ?? current.nivel ?? 0);
    const state = current.estado || 'Activo';

    const marker = L.circleMarker([point.lat, point.lng], {
      radius: expanded ? 10 : 9,
      color: '#ffffff',
      weight: 2.5,
      fillColor: color,
      fillOpacity: 1,
    }).addTo(map);

    marker.bindTooltip(`${esc(point.id)} · ${esc(point.punto)}`, {
      direction: 'top',
      offset: [0, -7],
    });

    marker.bindPopup(`
      <div class="sat-upstream-popup">
        <strong>${esc(point.id)} — ${esc(point.punto)}</strong>
        <div><b>Nivel:</b> ${Number.isFinite(level) ? level.toFixed(2) : '—'} m</div>
        <div><b>Riesgo:</b> ${esc(risk)}</div>
        <div><b>Estado:</b> ${esc(state)}</div>
        <div class="sat-note">Punto simulado ubicado sobre el Río Uruguay y aguas arriba de Panambí para representar detección anticipada.</div>
      </div>
    `);

    bounds.push([point.lat, point.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, {
      padding: expanded ? [70, 70] : [35, 35],
      maxZoom: expanded ? 14 : 13,
    });
  } else {
    map.setView([-27.69, -54.907], 12);
  }
}

function closeUpstreamModal() {
  const overlay = document.getElementById('sat-upstream-modal');
  if (!overlay) return;
  if (upstreamModalMap) {
    try { upstreamModalMap.remove(); } catch (_) {}
    upstreamModalMap = null;
  }
  overlay.remove();
  document.body.classList.remove('sat-upstream-modal-open');
  document.removeEventListener('keydown', upstreamEscapeHandler);
}

function upstreamEscapeHandler(event) {
  if (event.key === 'Escape') closeUpstreamModal();
}

async function openUpstreamModal(data = upstreamLastData) {
  closeUpstreamModal();
  document.getElementById('sat-map-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sat-upstream-modal';
  overlay.className = 'sat-upstream-modal';
  overlay.innerHTML = `
    <div class="sat-upstream-dialog" role="dialog" aria-modal="true" aria-label="Mapa ampliado de sensores aguas arriba">
      <div class="sat-upstream-header">
        <div class="sat-upstream-title">
          <strong>Monitoreo del Río Uruguay — Panambí</strong>
          <span>Sensores simulados ubicados aguas arriba para detección anticipada</span>
        </div>
        <button type="button" class="sat-upstream-close" aria-label="Cerrar mapa">×</button>
      </div>
      <div class="sat-upstream-body">
        <div id="sat-upstream-modal-map" class="sat-upstream-modal-map"></div>
        <div class="sat-upstream-info">Los marcadores representan puntos de monitoreo simulados. Su ubicación es referencial y se usa para mostrar la lógica de alerta temprana; no corresponde a sensores reales instalados.</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add('sat-upstream-modal-open');

  const dialog = overlay.querySelector('.sat-upstream-dialog');
  overlay.querySelector('.sat-upstream-close')?.addEventListener('click', closeUpstreamModal);
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) closeUpstreamModal();
  });
  dialog?.addEventListener('mousedown', event => event.stopPropagation());
  document.addEventListener('keydown', upstreamEscapeHandler);

  const L = await waitForLeaflet();
  const mapNode = overlay.querySelector('#sat-upstream-modal-map');

  requestAnimationFrame(() => {
    upstreamModalMap = L.map(mapNode, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      preferCanvas: true,
    });
    addBaseLayer(L, upstreamModalMap);
    addOnlySensors(L, upstreamModalMap, data || {}, true);
    upstreamModalMap.invalidateSize(true);
    setTimeout(() => upstreamModalMap?.invalidateSize(true), 180);
    setTimeout(() => upstreamModalMap?.invalidateSize(true), 500);
  });
}

function addExpandButton(L, map, data) {
  const Expand = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'sat-upstream-expand leaflet-bar');
      const button = L.DomUtil.create('button', '', wrap);
      button.type = 'button';
      button.title = 'Ampliar mapa';
      button.setAttribute('aria-label', 'Ampliar mapa');
      button.textContent = '⤢';
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.on(button, 'click', event => {
        L.DomEvent.stop(event);
        openUpstreamModal(data);
      });
      return wrap;
    },
  });
  map.addControl(new Expand());
}

async function renderUpstreamMap() {
  const host = document.getElementById('real-map');
  if (!host) return;
  if (host.querySelector('.sat-upstream-map') && upstreamInlineMap) {
    upstreamInlineMap.invalidateSize(false);
    return;
  }

  try {
    const [L, data] = await Promise.all([waitForLeaflet(), loadSensorData()]);
    upstreamLastData = data;

    if (upstreamInlineMap) {
      try { upstreamInlineMap.remove(); } catch (_) {}
      upstreamInlineMap = null;
    }

    // Reemplazar el mapa anterior. Mantener la clase sat-leaflet-map impide que
    // el módulo legado vuelva a insertar sus zonas de cobertura.
    host.innerHTML = '<div class="sat-leaflet-map sat-upstream-map" aria-label="Mapa de sensores simulados aguas arriba sobre el Río Uruguay"></div>';
    const node = host.querySelector('.sat-upstream-map');

    upstreamInlineMap = L.map(node, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      preferCanvas: true,
    });

    addBaseLayer(L, upstreamInlineMap);
    addOnlySensors(L, upstreamInlineMap, data, false);
    addExpandButton(L, upstreamInlineMap, data);

    requestAnimationFrame(() => upstreamInlineMap?.invalidateSize(true));
    setTimeout(() => upstreamInlineMap?.invalidateSize(true), 180);
    setTimeout(() => upstreamInlineMap?.invalidateSize(true), 500);
  } catch (error) {
    console.error('[Mapa sensores aguas arriba]', error);
  }
}

function scheduleUpstreamRender(delay = 180) {
  clearTimeout(upstreamTimer);
  upstreamTimer = setTimeout(renderUpstreamMap, delay);
}

function startUpstreamMap() {
  injectUpstreamStyles();
  scheduleUpstreamRender(250);

  if (upstreamObserver) upstreamObserver.disconnect();
  upstreamObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const target = mutation.target;
      const host = target?.closest?.('#real-map') || (target?.id === 'real-map' ? target : null);
      if (!host) continue;
      if (!host.querySelector('.sat-upstream-map')) scheduleUpstreamRender(220);
      break;
    }
  });
  upstreamObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    upstreamInlineMap?.invalidateSize(false);
    upstreamModalMap?.invalidateSize(false);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUpstreamMap, { once: true });
} else {
  startUpstreamMap();
}

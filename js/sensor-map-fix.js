/*
 * Mapa operativo del prototipo.
 *
 * Los sensores son SIMULADOS y se ubican sobre el cauce del Río Uruguay,
 * aguas arriba de Panambí, para representar detección anticipada.
 *
 * Las zonas se muestran con marcadores separados dentro del área de Panambí.
 * No representan cobertura de sensores ni límites oficiales de inundación:
 * únicamente indican la ubicación aproximada de cada zona operativa y su
 * estado calculado a partir de las mediciones simuladas.
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

/*
 * Puntos de referencia de las zonas del prototipo.
 * Se ubican del lado argentino y separados de los sensores del río.
 */
const OPERATIONAL_ZONES = [
  { nombre: 'Ribera Norte', lat: -27.7168, lng: -54.9158 },
  { nombre: 'Bajo Uruguay', lat: -27.7219, lng: -54.9156 },
  { nombre: 'Costa Sur', lat: -27.7282, lng: -54.9152 },
  { nombre: 'Zona Alta', lat: -27.7225, lng: -54.9213 },
  { nombre: 'Puente', lat: -27.7302, lng: -54.9134 },
  { nombre: 'Arroyo', lat: -27.7257, lng: -54.9190 },
];

const RISK_PRIORITY = {
  Verde: 0,
  Vecinal: 1,
  Amarillo: 2,
  Naranja: 3,
  Rojo: 4,
};

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

function zoneStatus(risk) {
  if (risk === 'Rojo') return 'Afectada — nivel crítico';
  if (risk === 'Naranja') return 'Afectada';
  if (risk === 'Amarillo') return 'Potencialmente afectada';
  if (risk === 'Vecinal') return 'En revisión';
  return 'Normal';
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
  if (document.getElementById('sat-upstream-map-styles-v2')) return;
  document.getElementById('sat-upstream-map-styles')?.remove();

  const style = document.createElement('style');
  style.id = 'sat-upstream-map-styles-v2';
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

    .sat-upstream-popup { min-width: 195px; }
    .sat-upstream-popup strong { display: block; margin-bottom: 5px; font-size: 14px; }
    .sat-upstream-popup div { margin: 2px 0; }
    .sat-upstream-popup .sat-note {
      margin-top: 7px;
      padding-top: 6px;
      border-top: 1px solid #e5e9ed;
      color: #667;
      font-size: 10px;
      line-height: 1.35;
    }

    .sat-zone-div-icon {
      background: transparent !important;
      border: 0 !important;
    }
    .sat-zone-pin {
      width: 16px;
      height: 16px;
      border: 2px solid #fff;
      border-radius: 3px;
      transform: rotate(45deg);
      box-shadow: 0 1px 5px rgba(0,0,0,.48);
    }
    .sat-zone-tooltip {
      font-weight: 700;
      font-size: 11px;
    }

    .sat-map-symbol-legend {
      background: rgba(255,255,255,.96);
      color: #243746;
      border-radius: 7px;
      padding: 8px 10px;
      box-shadow: 0 1px 5px rgba(0,0,0,.28);
      font-size: 10px;
      line-height: 1.45;
    }
    .sat-map-symbol-legend strong {
      display: block;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .sat-map-symbol-row {
      display: flex;
      align-items: center;
      gap: 7px;
      white-space: nowrap;
      margin: 2px 0;
    }
    .sat-legend-sensor {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #2e86c1;
      border: 1px solid #fff;
      box-shadow: 0 0 0 1px #789;
    }
    .sat-legend-zone {
      width: 10px;
      height: 10px;
      background: #e67e22;
      border: 1px solid #fff;
      box-shadow: 0 0 0 1px #789;
      transform: rotate(45deg);
    }

    .sat-upstream-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
      background: rgba(5,18,32,.72);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
    }
    .sat-upstream-dialog {
      width: min(1180px,95vw);
      height: min(800px,90vh);
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
      max-width: min(610px,76%);
      padding: 8px 10px;
      border-radius: 7px;
      background: rgba(16,34,56,.92);
      border: 1px solid rgba(255,255,255,.12);
      color: #dbe8f4;
      font-size: 10px;
      line-height: 1.4;
      pointer-events: none;
    }
    body.sat-upstream-modal-open { overflow: hidden !important; }

    @media (max-width: 700px) {
      .sat-upstream-modal { padding: 10px; }
      .sat-upstream-dialog { width:100%; height:92vh; min-height:0; border-radius:12px; }
      .sat-upstream-info { max-width:82%; }
      .sat-map-symbol-legend { display:none; }
    }
  `;
  document.head.appendChild(style);
}

async function waitForLeaflet() {
  for (let i = 0; i < 80; i += 1) {
    if (window.L?.map) return window.L;
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

function operationalZoneStates(data) {
  const states = new Map(
    OPERATIONAL_ZONES.map(zone => [zone.nombre, { ...zone, riesgo: 'Verde', sensor: '—', nivel_m: null }])
  );

  const sensors = Array.isArray(data?.sensores) ? data.sensores : [];
  sensors.forEach(sensor => {
    const zoneName = String(sensor.zona || '').trim();
    if (!states.has(zoneName)) return;

    const current = states.get(zoneName);
    const risk = sensor.riesgo || 'Verde';
    if ((RISK_PRIORITY[risk] ?? 0) >= (RISK_PRIORITY[current.riesgo] ?? 0)) {
      current.riesgo = risk;
      current.sensor = String(sensor.sensor || sensor.id || '—');
      const level = Number(sensor.nivel_m ?? sensor.nivel);
      current.nivel_m = Number.isFinite(level) ? level : null;
    }
  });

  return Array.from(states.values());
}

function updateMapRiskBadge(zones) {
  const badge = document.getElementById('map-risk-badge');
  if (!badge) return;
  const count = zones.filter(zone => zone.riesgo !== 'Verde').length;
  badge.textContent = count === 0
    ? 'SIN ZONAS EN RIESGO'
    : `${count} ZONA${count === 1 ? '' : 'S'} EN RIESGO`;
  badge.className = `badge ${count > 0 ? 'badge-rojo' : 'badge-verde'}`;
  badge.title = 'Estado calculado a partir de las mediciones simuladas de los sensores.';
}

function addBaseLayer(L, map) {
  L.tileLayer(OSM_TILES_UPSTREAM, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function addSymbolLegend(L, map) {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'sat-map-symbol-legend');
    div.innerHTML = `
      <strong>Referencias</strong>
      <div class="sat-map-symbol-row"><i class="sat-legend-sensor"></i> Sensor sobre el río</div>
      <div class="sat-map-symbol-row"><i class="sat-legend-zone"></i> Zona operativa</div>
      <div style="margin-top:4px;color:#667;">Color = nivel de riesgo</div>
    `;
    return div;
  };
  legend.addTo(map);
}

function addMapContent(L, map, data, expanded = false) {
  const byId = sensorDataById(data);
  const zones = operationalZoneStates(data);
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
        <div class="sat-note">Sensor simulado sobre el Río Uruguay. No representa una instalación real.</div>
      </div>
    `);

    bounds.push([point.lat, point.lng]);
  });

  zones.forEach(zone => {
    const color = sensorRiskColor(zone.riesgo);
    const icon = L.divIcon({
      className: 'sat-zone-div-icon',
      html: `<div class="sat-zone-pin" style="background:${color}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    const marker = L.marker([zone.lat, zone.lng], { icon, keyboard: true }).addTo(map);
    const status = zoneStatus(zone.riesgo);

    marker.bindTooltip(`${esc(zone.nombre)} · ${esc(status)}`, {
      direction: 'top',
      offset: [0, -8],
      className: 'sat-zone-tooltip',
    });

    marker.bindPopup(`
      <div class="sat-upstream-popup">
        <strong>${esc(zone.nombre)}</strong>
        <div><b>Estado:</b> ${esc(status)}</div>
        <div><b>Riesgo:</b> ${esc(zone.riesgo)}</div>
        <div><b>Sensor asociado:</b> ${esc(zone.sensor)}</div>
        <div><b>Nivel registrado:</b> ${zone.nivel_m === null ? '—' : `${zone.nivel_m.toFixed(2)} m`}</div>
        <div class="sat-note">El rombo marca una referencia aproximada de la zona. No delimita un polígono oficial ni un área exacta de inundación.</div>
      </div>
    `);

    bounds.push([zone.lat, zone.lng]);
  });

  updateMapRiskBadge(zones);
  addSymbolLegend(L, map);

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
    <div class="sat-upstream-dialog" role="dialog" aria-modal="true" aria-label="Mapa ampliado de monitoreo y zonas de Panambí">
      <div class="sat-upstream-header">
        <div class="sat-upstream-title">
          <strong>Monitoreo del Río Uruguay — Panambí</strong>
          <span>Sensores simulados aguas arriba y zonas operativas según las mediciones</span>
        </div>
        <button type="button" class="sat-upstream-close" aria-label="Cerrar mapa">×</button>
      </div>
      <div class="sat-upstream-body">
        <div id="sat-upstream-modal-map" class="sat-upstream-modal-map"></div>
        <div class="sat-upstream-info">Los círculos representan sensores simulados sobre el río. Los rombos representan puntos de referencia de las zonas de Panambí y cambian de color según el riesgo calculado. No se dibujan límites de inundación inventados.</div>
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

  try {
    const L = await waitForLeaflet();
    const mapNode = overlay.querySelector('#sat-upstream-modal-map');
    const mapData = data || await loadSensorData();

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
      addMapContent(L, upstreamModalMap, mapData, true);
      upstreamModalMap.invalidateSize(true);
      setTimeout(() => upstreamModalMap?.invalidateSize(true), 180);
      setTimeout(() => upstreamModalMap?.invalidateSize(true), 500);
    });
  } catch (error) {
    console.error('[Mapa ampliado]', error);
  }
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

  try {
    const [L, data] = await Promise.all([waitForLeaflet(), loadSensorData()]);
    upstreamLastData = data;

    if (upstreamInlineMap) {
      try { upstreamInlineMap.remove(); } catch (_) {}
      upstreamInlineMap = null;
    }

    host.innerHTML = '<div class="sat-leaflet-map sat-upstream-map" aria-label="Mapa de sensores sobre el Río Uruguay y zonas operativas de Panambí"></div>';
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
    addMapContent(L, upstreamInlineMap, data, false);
    addExpandButton(L, upstreamInlineMap, data);

    requestAnimationFrame(() => upstreamInlineMap?.invalidateSize(true));
    setTimeout(() => upstreamInlineMap?.invalidateSize(true), 180);
    setTimeout(() => upstreamInlineMap?.invalidateSize(true), 500);
  } catch (error) {
    console.error('[Mapa operativo Panambí]', error);
  }
}

function scheduleUpstreamRender(delay = 180) {
  clearTimeout(upstreamTimer);
  upstreamTimer = setTimeout(renderUpstreamMap, delay);
}

function startUpstreamMap() {
  injectUpstreamStyles();
  scheduleUpstreamRender(250);

  upstreamObserver?.disconnect();
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

  window.addEventListener('sat:navigate', () => {
    if (document.getElementById('s-dash')?.classList.contains('active')) {
      scheduleUpstreamRender(120);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUpstreamMap, { once: true });
} else {
  startUpstreamMap();
}

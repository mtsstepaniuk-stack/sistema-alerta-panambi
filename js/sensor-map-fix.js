/*
 * Mapa operativo del prototipo.
 *
 * - Sensores: círculos pequeños y fijos sobre el Río Uruguay.
 * - Alertas: marcadores grandes de color sobre la zona afectada.
 * - Actualización: consulta silenciosa cada pocos segundos mientras el mapa
 *   está visible para reflejar altas y cambios de estado sin recargar la página.
 *
 * Las ubicaciones son aproximadas y forman parte de la simulación académica.
 */

const OSM_TILES_UPSTREAM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIVE_REFRESH_MS = 8000;
const ACTIVE_ALERT_STATES = new Set(['Pendiente', 'Validada', 'Emitida']);
const PANAMBI_CENTER = { lat: -27.7235, lng: -54.9172 };

const UPSTREAM_SENSORS = [
  { id: 'S-01', lat: -27.6548, lng: -54.9046, punto: 'Monitoreo aguas arriba 1' },
  { id: 'S-02', lat: -27.6681, lng: -54.9054, punto: 'Monitoreo aguas arriba 2' },
  { id: 'S-03', lat: -27.6816, lng: -54.9065, punto: 'Monitoreo aguas arriba 3' },
  { id: 'S-04', lat: -27.6950, lng: -54.9078, punto: 'Monitoreo aguas arriba 4' },
  { id: 'S-05', lat: -27.7082, lng: -54.9092, punto: 'Monitoreo aguas arriba 5' },
  { id: 'S-06', lat: -27.7187, lng: -54.9105, punto: 'Ingreso a Panambí' },
];

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
let liveRefreshTimer = null;
let liveRefreshInFlight = false;

const layerState = new WeakMap();

function riskColor(risk) {
  if (risk === 'Rojo') return '#c0392b';
  if (risk === 'Naranja') return '#e67e22';
  if (risk === 'Amarillo') return '#f1c40f';
  if (risk === 'Vecinal') return '#8e44ad';
  return '#27ae60';
}

function zoneStatus(risk) {
  if (risk === 'Rojo') return 'Nivel crítico';
  if (risk === 'Naranja') return 'Riesgo alto';
  if (risk === 'Amarillo') return 'Preventivo';
  if (risk === 'Vecinal') return 'En revisión';
  return 'Normal';
}

function alertStateLabel(state) {
  if (state === 'Pendiente') return 'Pendiente de validación';
  if (state === 'Validada') return 'Validada';
  if (state === 'Emitida') return 'Emitida';
  return state || 'Activa';
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatAlertTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function zoneReferenceForAlert(alert) {
  const raw = normalizeText(alert?.zona || alert?.inc_zona || '');

  const exact = OPERATIONAL_ZONES.find(zone => normalizeText(zone.nombre) === raw);
  if (exact) return exact;

  if (raw.includes('ribera')) return OPERATIONAL_ZONES[0];
  if (raw.includes('bajo')) return OPERATIONAL_ZONES[1];
  if (raw.includes('costa')) return OPERATIONAL_ZONES[2];
  if (raw.includes('alta')) return OPERATIONAL_ZONES[3];
  if (raw.includes('puente') || raw.includes('puerto')) return OPERATIONAL_ZONES[4];
  if (raw.includes('arroyo')) return OPERATIONAL_ZONES[5];

  return { nombre: alert?.zona || 'Panambí', ...PANAMBI_CENTER };
}

function activeAlerts(data) {
  const alerts = Array.isArray(data?.recentAlerts) ? data.recentAlerts : [];
  return alerts.filter(alert => ACTIVE_ALERT_STATES.has(String(alert.estado || '')));
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

function injectUpstreamStyles() {
  document.getElementById('sat-upstream-map-styles')?.remove();
  document.getElementById('sat-upstream-map-styles-v2')?.remove();
  if (document.getElementById('sat-upstream-map-styles-v3')) return;

  const style = document.createElement('style');
  style.id = 'sat-upstream-map-styles-v3';
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

    .sat-upstream-popup { min-width: 205px; }
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

    .sat-zone-div-icon,
    .sat-live-alert-icon {
      background: transparent !important;
      border: 0 !important;
    }

    .sat-zone-pin {
      width: 13px;
      height: 13px;
      border: 2px solid #fff;
      border-radius: 3px;
      background: #607d8b;
      transform: rotate(45deg);
      box-shadow: 0 1px 5px rgba(0,0,0,.38);
      opacity: .9;
    }

    .sat-zone-tooltip {
      font-weight: 700;
      font-size: 11px;
    }

    .sat-live-alert-pin {
      --alert-color: #c0392b;
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 3px solid #fff;
      background: var(--alert-color);
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 17px;
      font-weight: 900;
      line-height: 1;
      box-shadow: 0 4px 12px rgba(0,0,0,.38), 0 0 0 2px color-mix(in srgb, var(--alert-color) 60%, transparent);
    }

    .sat-live-alert-pin.is-expanded {
      width: 36px;
      height: 36px;
      font-size: 20px;
      border-width: 3px;
    }

    .sat-live-alert-pin.is-pending::after {
      content: '';
      position: absolute;
      inset: -9px;
      border: 2px solid var(--alert-color);
      border-radius: 50%;
      opacity: .85;
      animation: sat-alert-pulse 1.55s ease-out infinite;
    }

    @keyframes sat-alert-pulse {
      0% { transform: scale(.72); opacity: .9; }
      75%, 100% { transform: scale(1.28); opacity: 0; }
    }

    .sat-live-alert-tooltip {
      font-weight: 800;
      font-size: 11px;
    }

    .sat-live-alert-popup { min-width: 225px; max-width: 285px; }
    .sat-live-alert-popup .sat-alert-title {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 7px;
      font-size: 14px;
      font-weight: 800;
    }
    .sat-live-alert-popup .sat-alert-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 10px;
    }
    .sat-live-alert-popup .sat-alert-detail {
      margin-top: 7px;
      padding-top: 7px;
      border-top: 1px solid #e5e9ed;
      color: #52606d;
      font-size: 11px;
      line-height: 1.4;
    }
    .sat-live-alert-popup .sat-alert-action {
      width: 100%;
      margin-top: 9px;
      padding: 7px 9px;
      border: 0;
      border-radius: 7px;
      background: #1f5fa8;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }
    .sat-live-alert-popup .sat-alert-action:hover { background: #194f8d; }

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
      margin: 3px 0;
    }
    .sat-legend-sensor {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #2e86c1;
      border: 1px solid #fff;
      box-shadow: 0 0 0 1px #789;
    }
    .sat-legend-zone {
      width: 9px;
      height: 9px;
      background: #607d8b;
      border: 1px solid #fff;
      box-shadow: 0 0 0 1px #789;
      transform: rotate(45deg);
    }
    .sat-legend-alert {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #c0392b;
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px #9aa8b3;
      position: relative;
    }

    .sat-live-update-control {
      background: rgba(255,255,255,.96);
      color: #435364;
      border-radius: 6px;
      padding: 5px 8px;
      box-shadow: 0 1px 5px rgba(0,0,0,.22);
      font-size: 9px;
      font-weight: 700;
      white-space: nowrap;
    }
    .sat-live-update-control::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-right: 5px;
      border-radius: 50%;
      background: #27ae60;
      vertical-align: 1px;
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
      max-width: min(650px,76%);
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

    @media (prefers-reduced-motion: reduce) {
      .sat-live-alert-pin.is-pending::after { animation: none !important; }
    }

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

async function loadSensorData(background = false) {
  const suffix = background ? '?sat_background=1' : '';
  const response = await fetch(`/api/dashboard${suffix}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo consultar el dashboard.');
  const payload = await response.json();
  return payload?.data ?? payload;
}

function updateMapRiskBadge(alerts) {
  const badge = document.getElementById('map-risk-badge');
  if (!badge) return;

  const uniqueZones = new Set(alerts.map(alert => String(alert.zona || 'Panambí')));
  const count = uniqueZones.size;

  badge.textContent = count === 0
    ? 'SIN ALERTAS ACTIVAS'
    : `${count} ZONA${count === 1 ? '' : 'S'} CON ALERTA`;
  badge.className = `badge ${count > 0 ? 'badge-rojo' : 'badge-verde'}`;
  badge.title = 'Se actualiza automáticamente con las alertas pendientes, validadas o emitidas.';
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
      <div class="sat-map-symbol-row"><i class="sat-legend-sensor"></i> Sensor fijo</div>
      <div class="sat-map-symbol-row"><i class="sat-legend-zone"></i> Zona de referencia</div>
      <div class="sat-map-symbol-row"><i class="sat-legend-alert"></i> Alerta activa</div>
      <div style="margin-top:4px;color:#667;">Las alertas pendientes pulsan.</div>
    `;
    return div;
  };
  legend.addTo(map);
}

function addLiveUpdateControl(L, map) {
  const control = L.control({ position: 'topleft' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'sat-live-update-control');
    div.dataset.liveMapUpdate = '1';
    div.textContent = 'En vivo · actualizando';
    return div;
  };
  control.addTo(map);
}

function updateLiveTimestamp(map) {
  const container = map?.getContainer?.();
  if (!container) return;
  const control = container.parentElement?.querySelector?.('[data-live-map-update="1"]')
    || container.querySelector?.('[data-live-map-update="1"]');
  if (!control) return;
  const now = new Date();
  control.textContent = `En vivo · ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function clearDynamicLayers(map) {
  const previous = layerState.get(map);
  if (!previous) return;
  [previous.sensors, previous.zones, previous.alerts].forEach(layer => {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  });
}

function alertPopupHtml(alert, color) {
  const risk = alert.riesgo || (alert.origen === 'Vecinal' ? 'Vecinal' : 'Sin clasificar');
  const message = alert.detalle || alert.mensaje || alert.inc_descripcion || 'Sin detalle adicional.';
  const level = Number(alert.nivel_m ?? alert.nivel);
  const levelLine = Number.isFinite(level)
    ? `<div><b>Nivel:</b> ${level.toFixed(2)} m</div>`
    : '';
  const sensorLine = alert.sensor
    ? `<div><b>Sensor:</b> ${esc(alert.sensor)}</div>`
    : '';

  const actionButton = alert.estado === 'Pendiente'
    ? `<button class="sat-alert-action" type="button" onclick="window.satOpenAlertFromMap?.(${Number(alert.id) || 0})">Revisar alerta</button>`
    : `<button class="sat-alert-action" type="button" onclick="window.satOpenAlertHistoryFromMap?.()">Ver historial</button>`;

  return `
    <div class="sat-live-alert-popup">
      <div class="sat-alert-title">
        <span class="sat-alert-dot" style="background:${color}"></span>
        <span>Alerta ${esc(risk)}</span>
      </div>
      <div><b>Estado:</b> ${esc(alertStateLabel(alert.estado))}</div>
      <div><b>Zona:</b> ${esc(alert.zona || 'Panambí')}</div>
      <div><b>Origen:</b> ${esc(alert.origen || 'Sistema')}</div>
      <div><b>Hora:</b> ${esc(formatAlertTime(alert.actualizada_en || alert.creada_en))}</div>
      ${sensorLine}
      ${levelLine}
      <div class="sat-alert-detail">${esc(message)}</div>
      ${actionButton}
    </div>
  `;
}

function addAlertMarkers(L, group, alerts, expanded, bounds) {
  const offsetsByZone = new Map();

  alerts.forEach(alert => {
    const base = zoneReferenceForAlert(alert);
    const zoneKey = normalizeText(base.nombre || alert.zona || 'panambi');
    const offsetIndex = offsetsByZone.get(zoneKey) || 0;
    offsetsByZone.set(zoneKey, offsetIndex + 1);

    const ring = Math.floor(offsetIndex / 8) + 1;
    const angle = (offsetIndex % 8) * (Math.PI / 4);
    const offsetSize = offsetIndex === 0 ? 0 : 0.00032 * ring;
    const lat = base.lat + Math.cos(angle) * offsetSize;
    const lng = base.lng + Math.sin(angle) * offsetSize;

    const risk = alert.riesgo || (alert.origen === 'Vecinal' ? 'Vecinal' : 'Verde');
    const color = riskColor(risk);
    const pendingClass = alert.estado === 'Pendiente' ? ' is-pending' : '';
    const expandedClass = expanded ? ' is-expanded' : '';

    const icon = L.divIcon({
      className: 'sat-live-alert-icon',
      html: `<div class="sat-live-alert-pin${pendingClass}${expandedClass}" style="--alert-color:${color}"><span>!</span></div>`,
      iconSize: expanded ? [42, 42] : [36, 36],
      iconAnchor: expanded ? [21, 21] : [18, 18],
      popupAnchor: [0, expanded ? -18 : -15],
    });

    const marker = L.marker([lat, lng], {
      icon,
      keyboard: true,
      riseOnHover: true,
      zIndexOffset: 1000,
    }).addTo(group);

    marker.bindTooltip(
      `ALERTA ${esc(String(risk).toUpperCase())} · ${esc(alert.zona || 'Panambí')} · ${esc(alertStateLabel(alert.estado))}`,
      {
        direction: 'top',
        offset: [0, expanded ? -20 : -17],
        className: 'sat-live-alert-tooltip',
      }
    );
    marker.bindPopup(alertPopupHtml(alert, color), { maxWidth: 310 });
    bounds?.push([lat, lng]);
  });
}

function renderDynamicLayers(L, map, data, expanded = false, fit = false) {
  if (!map) return;

  clearDynamicLayers(map);

  const sensorsLayer = L.layerGroup().addTo(map);
  const zonesLayer = L.layerGroup().addTo(map);
  const alertsLayer = L.layerGroup().addTo(map);
  const byId = sensorDataById(data);
  const zones = operationalZoneStates(data);
  const alerts = activeAlerts(data);
  const bounds = [];

  UPSTREAM_SENSORS.forEach(point => {
    const current = byId.get(point.id) || {};
    const level = Number(current.nivel_m ?? current.nivel);
    const risk = current.riesgo || 'Verde';
    const state = current.estado || 'Activo';

    const marker = L.circleMarker([point.lat, point.lng], {
      radius: expanded ? 6.5 : 5.5,
      color: '#ffffff',
      weight: 2,
      fillColor: '#2e86c1',
      fillOpacity: 1,
    }).addTo(sensorsLayer);

    marker.bindTooltip(`${esc(point.id)} · ${esc(point.punto)}`, {
      direction: 'top',
      offset: [0, -5],
    });

    marker.bindPopup(`
      <div class="sat-upstream-popup">
        <strong>${esc(point.id)} — ${esc(point.punto)}</strong>
        <div><b>Nivel:</b> ${Number.isFinite(level) ? `${level.toFixed(2)} m` : '—'}</div>
        <div><b>Riesgo detectado:</b> <span style="color:${riskColor(risk)};font-weight:800">${esc(risk)}</span></div>
        <div><b>Estado:</b> ${esc(state)}</div>
        <div class="sat-note">Sensor simulado sobre el Río Uruguay para detección anticipada. No representa una instalación real.</div>
      </div>
    `);

    bounds.push([point.lat, point.lng]);
  });

  zones.forEach(zone => {
    const icon = L.divIcon({
      className: 'sat-zone-div-icon',
      html: '<div class="sat-zone-pin"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const marker = L.marker([zone.lat, zone.lng], { icon, keyboard: true }).addTo(zonesLayer);
    marker.bindTooltip(`${esc(zone.nombre)} · ${esc(zoneStatus(zone.riesgo))}`, {
      direction: 'top',
      offset: [0, -7],
      className: 'sat-zone-tooltip',
    });
    marker.bindPopup(`
      <div class="sat-upstream-popup">
        <strong>${esc(zone.nombre)}</strong>
        <div><b>Estado estimado:</b> ${esc(zoneStatus(zone.riesgo))}</div>
        <div><b>Riesgo por sensores:</b> ${esc(zone.riesgo)}</div>
        <div><b>Sensor asociado:</b> ${esc(zone.sensor)}</div>
        <div><b>Nivel registrado:</b> ${zone.nivel_m === null ? '—' : `${zone.nivel_m.toFixed(2)} m`}</div>
        <div class="sat-note">El rombo es sólo una referencia aproximada de la zona. Las alertas activas se muestran con marcadores grandes de color.</div>
      </div>
    `);
    bounds.push([zone.lat, zone.lng]);
  });

  addAlertMarkers(L, alertsLayer, alerts, expanded, bounds);
  layerState.set(map, { sensors: sensorsLayer, zones: zonesLayer, alerts: alertsLayer });
  updateMapRiskBadge(alerts);
  updateLiveTimestamp(map);

  if (fit && bounds.length) {
    map.fitBounds(bounds, {
      padding: expanded ? [70, 70] : [35, 35],
      maxZoom: expanded ? 14 : 13,
    });
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

window.satOpenAlertFromMap = (alertId) => {
  closeUpstreamModal();
  window.navigate?.('s-validar');
  setTimeout(() => window.selectPendingAlert?.(Number(alertId)), 160);
};

window.satOpenAlertHistoryFromMap = () => {
  closeUpstreamModal();
  window.navigate?.('s-historial');
};

async function openUpstreamModal(data = upstreamLastData) {
  closeUpstreamModal();
  document.getElementById('sat-map-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sat-upstream-modal';
  overlay.className = 'sat-upstream-modal';
  overlay.innerHTML = `
    <div class="sat-upstream-dialog" role="dialog" aria-modal="true" aria-label="Mapa ampliado de monitoreo y alertas de Panambí">
      <div class="sat-upstream-header">
        <div class="sat-upstream-title">
          <strong>Monitoreo del Río Uruguay — Panambí</strong>
          <span>Sensores fijos y alertas activas con actualización automática</span>
        </div>
        <button type="button" class="sat-upstream-close" aria-label="Cerrar mapa">×</button>
      </div>
      <div class="sat-upstream-body">
        <div id="sat-upstream-modal-map" class="sat-upstream-modal-map"></div>
        <div class="sat-upstream-info">Los círculos azules pequeños son sensores simulados y permanecen fijos. Los marcadores grandes de color son alertas activas; las pendientes pulsan y desaparecen del mapa si son rechazadas. El mapa se actualiza automáticamente.</div>
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
    const mapData = data || await loadSensorData(false);
    upstreamLastData = mapData;

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
      addSymbolLegend(L, upstreamModalMap);
      addLiveUpdateControl(L, upstreamModalMap);
      renderDynamicLayers(L, upstreamModalMap, mapData, true, true);
      upstreamModalMap.invalidateSize(true);
      setTimeout(() => upstreamModalMap?.invalidateSize(true), 180);
      setTimeout(() => upstreamModalMap?.invalidateSize(true), 500);
    });
  } catch (error) {
    console.error('[Mapa ampliado]', error);
  }
}

function addExpandButton(L, map) {
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
        openUpstreamModal(upstreamLastData);
      });
      return wrap;
    },
  });
  map.addControl(new Expand());
}

function dashboardIsVisible() {
  return document.getElementById('s-dash')?.classList.contains('active') === true;
}

function hasSession() {
  return Boolean(localStorage.getItem('sat-token'));
}

async function renderUpstreamMap() {
  const host = document.getElementById('real-map');
  if (!host || !dashboardIsVisible() || !hasSession()) return;

  try {
    const [L, data] = await Promise.all([waitForLeaflet(), loadSensorData(false)]);
    upstreamLastData = data;

    if (upstreamInlineMap) {
      try { upstreamInlineMap.remove(); } catch (_) {}
      upstreamInlineMap = null;
    }

    host.innerHTML = '<div class="sat-leaflet-map sat-upstream-map" aria-label="Mapa en vivo de sensores y alertas de Panambí"></div>';
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
    addSymbolLegend(L, upstreamInlineMap);
    addLiveUpdateControl(L, upstreamInlineMap);
    addExpandButton(L, upstreamInlineMap);
    renderDynamicLayers(L, upstreamInlineMap, data, false, true);

    requestAnimationFrame(() => upstreamInlineMap?.invalidateSize(true));
    setTimeout(() => upstreamInlineMap?.invalidateSize(true), 180);
    setTimeout(() => upstreamInlineMap?.invalidateSize(true), 500);
  } catch (error) {
    console.error('[Mapa operativo Panambí]', error);
  }
}

async function refreshLiveMap() {
  if (liveRefreshInFlight || !hasSession()) return;

  const inlineVisible = dashboardIsVisible() && upstreamInlineMap;
  const modalVisible = Boolean(upstreamModalMap && document.getElementById('sat-upstream-modal'));
  if (!inlineVisible && !modalVisible) return;

  liveRefreshInFlight = true;
  try {
    const data = await loadSensorData(true);
    upstreamLastData = data;
    const L = window.L;
    if (!L) return;

    if (inlineVisible && upstreamInlineMap) {
      renderDynamicLayers(L, upstreamInlineMap, data, false, false);
    }
    if (modalVisible && upstreamModalMap) {
      renderDynamicLayers(L, upstreamModalMap, data, true, false);
    }
  } catch (error) {
    console.warn('[Mapa en vivo] No se pudo actualizar:', error.message);
  } finally {
    liveRefreshInFlight = false;
  }
}

function startLiveRefresh() {
  if (liveRefreshTimer) return;
  liveRefreshTimer = setInterval(refreshLiveMap, LIVE_REFRESH_MS);
}

function scheduleUpstreamRender(delay = 180) {
  clearTimeout(upstreamTimer);
  upstreamTimer = setTimeout(renderUpstreamMap, delay);
}

function startUpstreamMap() {
  injectUpstreamStyles();
  startLiveRefresh();

  if (dashboardIsVisible() && hasSession()) {
    scheduleUpstreamRender(120);
  }

  upstreamObserver?.disconnect();
  upstreamObserver = new MutationObserver(mutations => {
    if (!dashboardIsVisible() || !hasSession()) return;

    for (const mutation of mutations) {
      const target = mutation.target;
      const host = target?.closest?.('#real-map') || (target?.id === 'real-map' ? target : null);
      if (!host) continue;
      if (!host.querySelector('.sat-upstream-map')) scheduleUpstreamRender(180);
      break;
    }
  });
  upstreamObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    upstreamInlineMap?.invalidateSize(false);
    upstreamModalMap?.invalidateSize(false);
  });

  window.addEventListener('sat:navigate', () => {
    if (dashboardIsVisible() && hasSession()) {
      if (document.getElementById('real-map')?.querySelector('.sat-upstream-map') && upstreamInlineMap) {
        upstreamInlineMap.invalidateSize(false);
        refreshLiveMap();
      } else {
        scheduleUpstreamRender(100);
      }
    }
  });

  window.addEventListener('focus', () => {
    if (dashboardIsVisible() || upstreamModalMap) refreshLiveMap();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUpstreamMap, { once: true });
} else {
  startUpstreamMap();
}

const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/*
 * Mapa del prototipo.
 * Las coordenadas de sensores y zonas son referenciales; no representan
 * instalaciones reales ni límites oficiales de zonas inundables.
 */
const SENSOR_LAYOUT = {
  'S-01': { lat: -27.7178, lng: -54.9178, zona: 'Ribera Norte' },
  'S-02': { lat: -27.7214, lng: -54.9168, zona: 'Bajo Uruguay' },
  'S-03': { lat: -27.7275, lng: -54.9158, zona: 'Costa Sur' },
  'S-04': { lat: -27.7225, lng: -54.9218, zona: 'Zona Alta' },
  'S-05': { lat: -27.7304, lng: -54.9135, zona: 'Puente' },
  'S-06': { lat: -27.7255, lng: -54.9187, zona: 'Arroyo' },
};

/*
 * Áreas operativas compactas, dibujadas del lado argentino del río.
 * Se mantienen pequeñas a propósito: son sectores de referencia del prototipo,
 * no polígonos catastrales ni mapas oficiales de inundación.
 */
const ZONE_LAYOUT = [
  {
    nombre: 'Ribera Norte', sensor: 'S-01',
    coords: [
      [-27.7168, -54.9197], [-27.7169, -54.9172],
      [-27.7191, -54.9170], [-27.7193, -54.9195],
    ],
  },
  {
    nombre: 'Bajo Uruguay', sensor: 'S-02',
    coords: [
      [-27.7200, -54.9188], [-27.7201, -54.9162],
      [-27.7227, -54.9160], [-27.7229, -54.9186],
    ],
  },
  {
    nombre: 'Costa Sur', sensor: 'S-03',
    coords: [
      [-27.7262, -54.9176], [-27.7264, -54.9150],
      [-27.7290, -54.9148], [-27.7292, -54.9174],
    ],
  },
  {
    nombre: 'Zona Alta', sensor: 'S-04',
    coords: [
      [-27.7207, -54.9242], [-27.7208, -54.9200],
      [-27.7241, -54.9198], [-27.7242, -54.9240],
    ],
  },
  {
    nombre: 'Puente', sensor: 'S-05',
    coords: [
      [-27.7292, -54.9150], [-27.7293, -54.9127],
      [-27.7313, -54.9126], [-27.7314, -54.9149],
    ],
  },
  {
    nombre: 'Arroyo', sensor: 'S-06',
    coords: [
      [-27.7243, -54.9205], [-27.7244, -54.9174],
      [-27.7268, -54.9172], [-27.7270, -54.9202],
    ],
  },
];

let leafletPromise = null;
let inlineMap = null;
let modalMap = null;
let lastData = null;
let renderTimer = null;
let mutationObserver = null;
let resizeObserver = null;

function riskColor(risk) {
  if (risk === 'Rojo') return '#c0392b';
  if (risk === 'Naranja') return '#e67e22';
  if (risk === 'Amarillo') return '#f1c40f';
  if (risk === 'Vecinal') return '#8e44ad';
  return '#27ae60';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/*
 * Leaflet normalmente toma estos estilos de leaflet.css. Se incluyen también
 * las reglas estructurales indispensables de forma local para evitar que un CDN
 * lento deje los mosaicos apilados/cortados en una esquina del mapa.
 */
function injectStyles() {
  if (document.getElementById('sat-map-styles-v4')) return;

  document.getElementById('interactive-map-styles')?.remove();
  document.getElementById('interactive-map-styles-v3')?.remove();

  const style = document.createElement('style');
  style.id = 'sat-map-styles-v4';
  style.textContent = `
    /* Leaflet: estructura crítica (fallback local) */
    .leaflet-pane,
    .leaflet-tile,
    .leaflet-marker-icon,
    .leaflet-marker-shadow,
    .leaflet-tile-container,
    .leaflet-pane > svg,
    .leaflet-pane > canvas,
    .leaflet-zoom-box,
    .leaflet-image-layer,
    .leaflet-layer {
      position: absolute;
      left: 0;
      top: 0;
    }
    .leaflet-container {
      overflow: hidden;
      position: relative;
      outline: 0;
      -webkit-tap-highlight-color: transparent;
      font-family: Arial, Helvetica, sans-serif;
      background: #dbe8ef;
    }
    .leaflet-tile,
    .leaflet-marker-icon,
    .leaflet-marker-shadow {
      user-select: none;
      -webkit-user-drag: none;
    }
    .leaflet-tile { visibility: hidden; max-width: none !important; max-height: none !important; }
    .leaflet-tile-loaded { visibility: inherit; }
    .leaflet-marker-icon, .leaflet-marker-shadow { display: block; }
    .leaflet-container .leaflet-overlay-pane svg,
    .leaflet-container .leaflet-marker-pane img,
    .leaflet-container .leaflet-shadow-pane img,
    .leaflet-container .leaflet-tile-pane img,
    .leaflet-container img.leaflet-image-layer,
    .leaflet-container .leaflet-tile {
      max-width: none !important;
      max-height: none !important;
      width: auto;
      padding: 0;
    }
    .leaflet-pane { z-index: 400; }
    .leaflet-tile-pane { z-index: 200; }
    .leaflet-overlay-pane { z-index: 400; }
    .leaflet-shadow-pane { z-index: 500; }
    .leaflet-marker-pane { z-index: 600; }
    .leaflet-tooltip-pane { z-index: 650; }
    .leaflet-popup-pane { z-index: 700; }
    .leaflet-map-pane canvas { z-index: 100; }
    .leaflet-map-pane svg { z-index: 200; }
    .leaflet-control { position: relative; z-index: 800; pointer-events: auto; }
    .leaflet-top, .leaflet-bottom { position: absolute; z-index: 1000; pointer-events: none; }
    .leaflet-top { top: 0; }
    .leaflet-right { right: 0; }
    .leaflet-bottom { bottom: 0; }
    .leaflet-left { left: 0; }
    .leaflet-control { float: left; clear: both; }
    .leaflet-right .leaflet-control { float: right; }
    .leaflet-top .leaflet-control { margin-top: 10px; }
    .leaflet-bottom .leaflet-control { margin-bottom: 10px; }
    .leaflet-left .leaflet-control { margin-left: 10px; }
    .leaflet-right .leaflet-control { margin-right: 10px; }
    .leaflet-bar { box-shadow: 0 1px 5px rgba(0,0,0,.35); border-radius: 4px; }
    .leaflet-bar a {
      background: #fff;
      border-bottom: 1px solid #ccc;
      width: 30px;
      height: 30px;
      line-height: 30px;
      display: block;
      text-align: center;
      text-decoration: none;
      color: #222;
      font-size: 18px;
    }
    .leaflet-bar a:first-child { border-top-left-radius: 4px; border-top-right-radius: 4px; }
    .leaflet-bar a:last-child { border-bottom: 0; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px; }
    .leaflet-bar a:hover { background: #f4f4f4; }
    .leaflet-control-attribution {
      margin: 0;
      padding: 0 5px;
      color: #333;
      background: rgba(255,255,255,.82);
      font-size: 10px;
    }
    .leaflet-control-attribution a { color: #0078a8; text-decoration: none; }
    .leaflet-popup { position: absolute; text-align: center; margin-bottom: 20px; }
    .leaflet-popup-content-wrapper {
      padding: 1px;
      text-align: left;
      border-radius: 10px;
      background: white;
      color: #333;
      box-shadow: 0 3px 14px rgba(0,0,0,.35);
    }
    .leaflet-popup-content { margin: 13px 18px; line-height: 1.4; }
    .leaflet-popup-tip-container { width: 40px; height: 20px; position: absolute; left: 50%; margin-left: -20px; overflow: hidden; pointer-events: none; }
    .leaflet-popup-tip { width: 17px; height: 17px; padding: 1px; margin: -10px auto 0; transform: rotate(45deg); background: white; box-shadow: 3px 3px 8px rgba(0,0,0,.18); }
    .leaflet-popup-close-button { position:absolute; top:0; right:0; padding:4px 4px 0 0; border:none; text-align:center; width:24px; height:24px; font:16px/24px Tahoma,Verdana,sans-serif; color:#757575; text-decoration:none; background:transparent; }
    .leaflet-tooltip {
      position: absolute;
      padding: 6px;
      background: white;
      border: 1px solid #fff;
      border-radius: 4px;
      color: #222;
      white-space: nowrap;
      user-select: none;
      pointer-events: none;
      box-shadow: 0 1px 4px rgba(0,0,0,.25);
      font-size: 11px;
    }

    /* Contenedor del dashboard */
    #real-map {
      position: relative !important;
      width: 100% !important;
      height: 380px !important;
      min-height: 380px !important;
      overflow: hidden !important;
      border-radius: 9px !important;
      background: #dbe8ef !important;
      isolation: isolate;
    }
    #real-map .sat-leaflet-map {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      min-height: 380px;
      border-radius: 9px;
      background: #dbe8ef;
    }
    #real-map .sat-map-loading,
    #real-map .sat-map-error {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      background: #edf3f7;
      color: #29445b;
      font-size: 14px;
      z-index: 2;
    }
    #real-map .sat-map-error { color: #8a2f2f; }

    .sat-map-legend {
      background: rgba(255,255,255,.96);
      color: #243746;
      padding: 8px 10px;
      border-radius: 7px;
      box-shadow: 0 1px 5px rgba(0,0,0,.28);
      font-size: 11px;
      line-height: 1.5;
    }
    .sat-map-legend strong { display:block; margin-bottom:3px; font-size:11px; }
    .sat-map-legend span { display:flex; align-items:center; gap:6px; white-space:nowrap; }
    .sat-map-legend i { width:9px; height:9px; border-radius:50%; display:inline-block; }

    .sat-expand-control button {
      width: 34px;
      height: 34px;
      border: 0;
      background: #fff;
      color: #263746;
      font-size: 19px;
      line-height: 34px;
      cursor: pointer;
      border-radius: 4px;
      box-shadow: 0 1px 5px rgba(0,0,0,.30);
      display: grid;
      place-items: center;
      padding: 0;
    }
    .sat-expand-control button:hover { background: #f4f7f9; }

    .sat-sensor-popup { min-width: 175px; }
    .sat-sensor-popup strong { display:block; font-size:14px; margin-bottom:4px; }
    .sat-sensor-popup div { margin:2px 0; }
    .sat-zone-tooltip { font-weight: 700; }

    /* Modal ampliado */
    .sat-map-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(5,18,32,.72);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
    }
    .sat-map-modal-dialog {
      width: min(1180px, 94vw);
      height: min(800px, 88vh);
      min-height: 520px;
      background: #102238;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 28px 80px rgba(0,0,0,.55);
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .sat-map-modal-header {
      height: 58px;
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px 0 20px;
      background: #102238;
      color: #fff;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }
    .sat-map-modal-title { display:flex; flex-direction:column; gap:2px; }
    .sat-map-modal-title strong { font-size:14px; }
    .sat-map-modal-title span { font-size:11px; color:#9fb7cd; }
    .sat-map-modal-close {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.07);
      color: #fff;
      cursor: pointer;
      font-size: 25px;
      line-height: 34px;
    }
    .sat-map-modal-close:hover { background: rgba(255,255,255,.14); }
    .sat-map-modal-body {
      flex: 1 1 auto;
      min-height: 0;
      position: relative;
      background: #dbe8ef;
    }
    .sat-map-modal-map {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: #dbe8ef;
    }
    .sat-map-modal-note {
      position: absolute;
      left: 14px;
      bottom: 14px;
      z-index: 1100;
      max-width: min(520px, 70%);
      background: rgba(16,34,56,.92);
      color: #dbe8f4;
      border: 1px solid rgba(255,255,255,.12);
      padding: 8px 10px;
      border-radius: 7px;
      font-size: 10px;
      pointer-events: none;
    }
    body.sat-map-modal-open { overflow: hidden !important; }

    @media (max-width: 700px) {
      #real-map { height: 330px !important; min-height: 330px !important; }
      #real-map .sat-leaflet-map { min-height: 330px; }
      .sat-map-modal-overlay { padding: 10px; }
      .sat-map-modal-dialog { width:100%; height:92vh; min-height:0; border-radius:12px; }
      .sat-map-modal-note { max-width:78%; }
    }
  `;
  document.head.appendChild(style);
}

function ensureLeafletCss() {
  let link = document.querySelector(`link[href="${LEAFLET_CSS}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
  return link;
}

function ensureLeaflet() {
  injectStyles();
  ensureLeafletCss();

  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      if (window.L?.map) {
        resolve(window.L);
        return;
      }
      existing.addEventListener('load', () => {
        if (window.L?.map) resolve(window.L);
        else reject(new Error('Leaflet cargó sin exponer la API esperada.'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Leaflet.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => {
      if (window.L?.map) resolve(window.L);
      else reject(new Error('Leaflet cargó sin exponer la API esperada.'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar Leaflet.'));
    document.head.appendChild(script);
  });

  return leafletPromise;
}

async function loadDashboardData() {
  const response = await fetch('/api/dashboard', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo consultar el estado del sistema.');
  const payload = await response.json();
  return payload?.data ?? payload;
}

function normalizedSensors(data) {
  const source = Array.isArray(data?.sensores)
    ? data.sensores
    : (Array.isArray(data?.sensors) ? data.sensors : []);

  const byCode = new Map(source.map(sensor => [String(sensor.sensor || sensor.id || ''), sensor]));

  return Object.entries(SENSOR_LAYOUT).map(([code, layout]) => {
    const sensor = byCode.get(code) || {};
    return {
      ...sensor,
      sensor: code,
      zona: layout.zona,
      lat: layout.lat,
      lng: layout.lng,
      nivel_m: Number(sensor.nivel_m ?? sensor.nivel ?? 0),
      riesgo: sensor.riesgo || 'Verde',
      estado: sensor.estado || 'Activo',
    };
  });
}

function riskForZone(zone, sensors) {
  return sensors.find(sensor => sensor.sensor === zone.sensor)?.riesgo || 'Verde';
}

function addTileLayer(L, map) {
  return L.tileLayer(OSM_TILES, {
    minZoom: 3,
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function addLegend(L, map) {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'sat-map-legend');
    div.innerHTML = `
      <strong>Nivel de riesgo</strong>
      <span><i style="background:#c0392b"></i>Alto</span>
      <span><i style="background:#e67e22"></i>Medio</span>
      <span><i style="background:#f1c40f"></i>Preventivo</span>
      <span><i style="background:#27ae60"></i>Normal</span>
    `;
    return div;
  };
  legend.addTo(map);
}

function addMapContent(L, map, data, { expanded = false } = {}) {
  const sensors = normalizedSensors(data);
  const bounds = [];

  ZONE_LAYOUT.forEach(zone => {
    const risk = riskForZone(zone, sensors);
    const color = riskColor(risk);
    const polygon = L.polygon(zone.coords, {
      color,
      weight: expanded ? 2.8 : 2,
      opacity: .92,
      fillColor: color,
      fillOpacity: expanded ? .13 : .09,
      smoothFactor: 1,
    }).addTo(map);

    polygon.bindTooltip(`${escapeHtml(zone.nombre)} · ${escapeHtml(risk)} · zona operativa aprox.`, {
      sticky: !expanded,
      permanent: expanded,
      direction: 'center',
      className: 'sat-zone-tooltip',
      opacity: .96,
    });

    zone.coords.forEach(point => bounds.push(point));
  });

  sensors.forEach(sensor => {
    const color = riskColor(sensor.riesgo);
    const marker = L.circleMarker([sensor.lat, sensor.lng], {
      radius: expanded ? 10 : 8.5,
      color: '#ffffff',
      weight: 2.5,
      fillColor: color,
      fillOpacity: 1,
    }).addTo(map);

    marker.bindTooltip(`${escapeHtml(sensor.sensor)} · ${escapeHtml(sensor.zona)}`, {
      direction: 'top',
      offset: [0, -7],
    });

    marker.bindPopup(`
      <div class="sat-sensor-popup">
        <strong>${escapeHtml(sensor.sensor)} — ${escapeHtml(sensor.zona)}</strong>
        <div><b>Nivel:</b> ${Number(sensor.nivel_m).toFixed(2)} m</div>
        <div><b>Riesgo:</b> ${escapeHtml(sensor.riesgo)}</div>
        <div><b>Estado:</b> ${escapeHtml(sensor.estado)}</div>
        <div style="margin-top:5px;font-size:10px;color:#667">Ubicación aproximada del prototipo.</div>
      </div>
    `);

    bounds.push([sensor.lat, sensor.lng]);
  });

  addLegend(L, map);

  if (bounds.length) {
    map.fitBounds(bounds, {
      padding: expanded ? [70, 70] : [32, 32],
      maxZoom: expanded ? 16 : 15,
    });
  } else {
    map.setView([-27.7235, -54.9175], 14);
  }
}

function forceMapLayout(map) {
  if (!map) return;
  requestAnimationFrame(() => map.invalidateSize(true));
  setTimeout(() => map?.invalidateSize(true), 80);
  setTimeout(() => map?.invalidateSize(true), 250);
  setTimeout(() => map?.invalidateSize(true), 700);
}

function closeMapModal() {
  const overlay = document.getElementById('sat-map-modal');
  if (!overlay) return;

  if (modalMap) {
    try { modalMap.remove(); } catch (_) { /* ya desmontado */ }
    modalMap = null;
  }

  overlay.remove();
  document.body.classList.remove('sat-map-modal-open');
  document.removeEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(event) {
  if (event.key === 'Escape') closeMapModal();
}

async function openMapModal(data = lastData) {
  if (document.getElementById('sat-map-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'sat-map-modal';
  overlay.className = 'sat-map-modal-overlay';
  overlay.innerHTML = `
    <div class="sat-map-modal-dialog" role="dialog" aria-modal="true" aria-label="Mapa ampliado de Panambí">
      <div class="sat-map-modal-header">
        <div class="sat-map-modal-title">
          <strong>Mapa interactivo de Panambí</strong>
          <span>Sensores simulados y zonas operativas de referencia</span>
        </div>
        <button class="sat-map-modal-close" type="button" aria-label="Cerrar mapa">×</button>
      </div>
      <div class="sat-map-modal-body">
        <div class="sat-map-modal-map" id="sat-map-modal-map"></div>
        <div class="sat-map-modal-note">Las áreas coloreadas son zonas operativas aproximadas del prototipo y no representan límites oficiales ni un mapa real de inundación.</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add('sat-map-modal-open');

  const dialog = overlay.querySelector('.sat-map-modal-dialog');
  overlay.querySelector('.sat-map-modal-close')?.addEventListener('click', closeMapModal);
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) closeMapModal();
  });
  dialog?.addEventListener('mousedown', event => event.stopPropagation());
  document.addEventListener('keydown', handleModalKeydown);

  try {
    const L = await ensureLeaflet();
    const mapData = data || await loadDashboardData();
    const mapNode = overlay.querySelector('#sat-map-modal-map');

    /* Dos frames garantizan que el flex del modal ya tenga tamaño real antes de crear Leaflet. */
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    if (!mapNode || mapNode.clientWidth < 100 || mapNode.clientHeight < 100) {
      throw new Error('El contenedor del mapa ampliado no obtuvo un tamaño válido.');
    }

    modalMap = L.map(mapNode, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      preferCanvas: true,
    });

    addTileLayer(L, modalMap);
    addMapContent(L, modalMap, mapData, { expanded: true });
    forceMapLayout(modalMap);
  } catch (error) {
    console.error('[Mapa ampliado]', error);
    const body = overlay.querySelector('.sat-map-modal-body');
    if (body) {
      body.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:#8a2f2f;background:#edf3f7;padding:24px;text-align:center">No se pudo cargar el mapa ampliado. Cerralo y volvé a intentarlo.</div>';
    }
  }
}

function addExpandControl(L, map, data) {
  const ExpandControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const wrapper = L.DomUtil.create('div', 'sat-expand-control');
      const button = L.DomUtil.create('button', '', wrapper);
      button.type = 'button';
      button.title = 'Ampliar mapa';
      button.setAttribute('aria-label', 'Ampliar mapa');
      button.textContent = '⤢';

      L.DomEvent.disableClickPropagation(wrapper);
      L.DomEvent.disableScrollPropagation(wrapper);
      L.DomEvent.on(button, 'click', event => {
        L.DomEvent.stop(event);
        openMapModal(data);
      });
      return wrapper;
    },
  });

  map.addControl(new ExpandControl());
}

async function renderInlineMap() {
  const host = document.getElementById('real-map');
  if (!host) return;

  const rect = host.getBoundingClientRect();
  if (rect.width < 100 || rect.height < 100) {
    scheduleRender(180);
    return;
  }

  if (host.querySelector('.sat-leaflet-map') && inlineMap) {
    forceMapLayout(inlineMap);
    return;
  }

  host.innerHTML = '<div class="sat-map-loading">Cargando mapa interactivo de Panambí…</div>';

  try {
    const [L, data] = await Promise.all([ensureLeaflet(), loadDashboardData()]);
    lastData = data;

    if (inlineMap) {
      try { inlineMap.remove(); } catch (_) { /* mapa anterior reemplazado */ }
      inlineMap = null;
    }

    host.innerHTML = '<div class="sat-leaflet-map" aria-label="Mapa interactivo de Panambí con sensores y zonas operativas"></div>';
    const mapNode = host.querySelector('.sat-leaflet-map');

    await new Promise(resolve => requestAnimationFrame(resolve));

    inlineMap = L.map(mapNode, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      preferCanvas: true,
    });

    addTileLayer(L, inlineMap);
    addMapContent(L, inlineMap, data, { expanded: false });
    addExpandControl(L, inlineMap, data);
    forceMapLayout(inlineMap);
  } catch (error) {
    console.error('[Mapa interactivo]', error);
    host.innerHTML = '<div class="sat-map-error">No se pudo cargar el mapa interactivo. Verificá la conexión a Internet y volvé a intentar.</div>';
  }
}

function scheduleRender(delay = 60) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderInlineMap(), delay);
}

function attachResizeObserver() {
  const host = document.getElementById('real-map');
  if (!host || typeof ResizeObserver === 'undefined') return;

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    if (entry.contentRect.width >= 100 && entry.contentRect.height >= 100) {
      if (inlineMap) forceMapLayout(inlineMap);
      else scheduleRender(40);
    }
  });
  resizeObserver.observe(host);
}

function start() {
  injectStyles();
  ensureLeafletCss();
  attachResizeObserver();

  mutationObserver?.disconnect();
  mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const directHost = mutation.target?.id === 'real-map' ? mutation.target : null;
      const nestedHost = mutation.target?.closest?.('#real-map');
      const host = directHost || nestedHost;
      if (!host) continue;

      /* dashboard.js todavía escribe su mapa estático; lo reemplazamos sólo si hace falta. */
      if (!host.querySelector('.sat-leaflet-map')) scheduleRender(25);
      break;
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    if (inlineMap) forceMapLayout(inlineMap);
    if (modalMap) forceMapLayout(modalMap);
  });

  window.addEventListener('sat:navigate', () => {
    attachResizeObserver();
    scheduleRender(60);
  });

  scheduleRender(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

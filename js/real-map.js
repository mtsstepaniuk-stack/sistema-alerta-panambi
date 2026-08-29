const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Coordenadas corregidas para que todos los sensores simulados queden del lado argentino,
// alrededor del área urbana de Panambí y su costa sobre el Río Uruguay.
const SENSOR_LAYOUT = {
  'S-01': { lat: -27.7178, lng: -54.9178, zona: 'Ribera Norte' },
  'S-02': { lat: -27.7214, lng: -54.9168, zona: 'Bajo Uruguay' },
  'S-03': { lat: -27.7275, lng: -54.9158, zona: 'Costa Sur' },
  'S-04': { lat: -27.7225, lng: -54.9218, zona: 'Zona Alta' },
  'S-05': { lat: -27.7304, lng: -54.9135, zona: 'Puente' },
  'S-06': { lat: -27.7255, lng: -54.9187, zona: 'Arroyo' },
};

// Las zonas son áreas operativas aproximadas del prototipo, no límites catastrales/oficiales.
// Se representan como radios alrededor de los puntos de monitoreo para evitar polígonos
// arbitrarios atravesando el río o territorio brasileño.
const ZONE_LAYOUT = [
  { nombre: 'Ribera Norte', sensor: 'S-01', radius: 260 },
  { nombre: 'Bajo Uruguay', sensor: 'S-02', radius: 250 },
  { nombre: 'Costa Sur', sensor: 'S-03', radius: 270 },
  { nombre: 'Zona Alta', sensor: 'S-04', radius: 300 },
  { nombre: 'Puente', sensor: 'S-05', radius: 190 },
  { nombre: 'Arroyo', sensor: 'S-06', radius: 230 },
];

let leafletPromise = null;
let inlineMap = null;
let modalMap = null;
let observer = null;
let renderTimer = null;
let lastData = null;

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

function injectStyles() {
  if (document.getElementById('interactive-map-styles-v3')) return;

  document.getElementById('interactive-map-styles')?.remove();

  const style = document.createElement('style');
  style.id = 'interactive-map-styles-v3';
  style.textContent = `
    #real-map {
      position: relative !important;
      width: 100% !important;
      height: 380px !important;
      min-height: 380px !important;
      overflow: hidden !important;
      border-radius: 9px !important;
      background: #dbe8ef !important;
    }

    #real-map .sat-leaflet-map,
    .sat-map-modal-map {
      width: 100%;
      height: 100%;
      min-height: 100%;
      background: #dbe8ef;
    }

    #real-map .sat-leaflet-map { border-radius: 9px; }

    #real-map .sat-map-loading,
    #real-map .sat-map-error {
      width: 100%;
      height: 100%;
      min-height: 380px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      background: #edf3f7;
      color: #29445b;
      font-size: 14px;
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
      font-size: 18px;
      line-height: 34px;
      cursor: pointer;
      border-radius: 4px;
      box-shadow: 0 1px 5px rgba(0,0,0,.3);
      display: grid;
      place-items: center;
      padding: 0;
    }

    .sat-expand-control button:hover { background: #f4f7f9; }

    .sat-sensor-popup { min-width: 175px; }
    .sat-sensor-popup strong { display:block; font-size:14px; margin-bottom:4px; }
    .sat-sensor-popup div { margin:2px 0; }

    .sat-zone-tooltip {
      font-weight: 700;
      border: 0 !important;
      box-shadow: 0 1px 5px rgba(0,0,0,.20) !important;
    }

    .sat-map-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(5, 18, 32, .70);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
      animation: satModalFade .16s ease-out;
    }

    @keyframes satModalFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .sat-map-modal-dialog {
      width: min(1120px, 94vw);
      height: min(780px, 88vh);
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

    .sat-map-modal-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sat-map-modal-title strong { font-size: 14px; }
    .sat-map-modal-title span { font-size: 11px; color: #9fb7cd; }

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

    .sat-map-modal-note {
      position: absolute;
      left: 14px;
      bottom: 14px;
      z-index: 700;
      max-width: min(500px, 70%);
      background: rgba(16,34,56,.90);
      color: #dbe8f4;
      border: 1px solid rgba(255,255,255,.12);
      padding: 8px 10px;
      border-radius: 7px;
      font-size: 10px;
      pointer-events: none;
    }

    body.sat-map-modal-open { overflow: hidden !important; }

    @media (max-width: 700px) {
      .sat-map-modal-overlay { padding: 10px; }
      .sat-map-modal-dialog {
        width: 100%;
        height: 92vh;
        min-height: 0;
        border-radius: 12px;
      }
      .sat-map-modal-note { max-width: 76%; }
    }
  `;
  document.head.appendChild(style);
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    let cssLink = document.querySelector(`link[href="${LEAFLET_CSS}"]`);
    if (!cssLink) {
      cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = LEAFLET_CSS;
      document.head.appendChild(cssLink);
    }

    const finish = () => {
      if (window.L) {
        resolve(window.L);
        return;
      }

      const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.L), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Leaflet.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('No se pudo cargar Leaflet.'));
      document.head.appendChild(script);
    };

    if (cssLink.sheet) finish();
    else {
      cssLink.addEventListener('load', finish, { once: true });
      cssLink.addEventListener('error', () => reject(new Error('No se pudo cargar el estilo del mapa.')), { once: true });
      setTimeout(finish, 1200);
    }
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
      zona: sensor.zona || layout.zona,
      // Se fuerza el layout cartográfico corregido aunque el backend del prototipo tenga
      // coordenadas históricas incorrectas.
      lat: layout.lat,
      lng: layout.lng,
      nivel_m: Number(sensor.nivel_m ?? sensor.nivel ?? 0),
      riesgo: sensor.riesgo || 'Verde',
      estado: sensor.estado || 'Activo',
    };
  });
}

function zoneRisk(zone, sensors) {
  const sensor = sensors.find(item => item.sensor === zone.sensor);
  return sensor?.riesgo || 'Verde';
}

function addTileLayer(L, map) {
  const layer = L.tileLayer(OSM_TILES, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  });
  layer.addTo(map);
  return layer;
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

function addExpandControl(L, map, data) {
  const ExpandControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const wrapper = L.DomUtil.create('div', 'sat-expand-control leaflet-bar');
      const button = L.DomUtil.create('button', '', wrapper);
      button.type = 'button';
      button.title = 'Ampliar mapa';
      button.setAttribute('aria-label', 'Ampliar mapa');
      button.textContent = '↗';
      L.DomEvent.disableClickPropagation(wrapper);
      L.DomEvent.on(button, 'click', event => {
        L.DomEvent.stop(event);
        openMapModal(data);
      });
      return wrapper;
    },
  });
  map.addControl(new ExpandControl());
}

function addMapContent(L, map, data, { expanded = false } = {}) {
  const sensors = normalizedSensors(data);
  const bounds = [];

  // Zonas operativas aproximadas: círculos centrados en cada sensor.
  ZONE_LAYOUT.forEach(zone => {
    const sensor = sensors.find(item => item.sensor === zone.sensor);
    if (!sensor) return;
    const risk = zoneRisk(zone, sensors);
    const color = riskColor(risk);

    const circle = L.circle([sensor.lat, sensor.lng], {
      radius: zone.radius,
      color,
      weight: expanded ? 3 : 2,
      opacity: .95,
      fillColor: color,
      fillOpacity: expanded ? .14 : .11,
    }).addTo(map);

    circle.bindTooltip(`${escapeHtml(zone.nombre)} · ${escapeHtml(risk)}`, {
      sticky: true,
      className: 'sat-zone-tooltip',
    });

    bounds.push([sensor.lat, sensor.lng]);
  });

  sensors.forEach(sensor => {
    const color = riskColor(sensor.riesgo);
    const marker = L.circleMarker([sensor.lat, sensor.lng], {
      radius: expanded ? 10 : 9,
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
      padding: expanded ? [70, 70] : [42, 42],
      maxZoom: expanded ? 15 : 14,
    });
  } else {
    map.setView([-27.7223, -54.9149], 14);
  }
}

function closeMapModal() {
  const overlay = document.getElementById('sat-map-modal');
  if (!overlay) return;

  if (modalMap) {
    try { modalMap.remove(); } catch (_) {}
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
        <div class="sat-map-modal-note">Las áreas coloreadas son zonas operativas aproximadas del prototipo. No representan límites oficiales de barrios ni zonas de inundación reales.</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add('sat-map-modal-open');

  const dialog = overlay.querySelector('.sat-map-modal-dialog');
  const closeButton = overlay.querySelector('.sat-map-modal-close');
  closeButton.addEventListener('click', closeMapModal);

  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) closeMapModal();
  });
  dialog.addEventListener('mousedown', event => event.stopPropagation());
  document.addEventListener('keydown', handleModalKeydown);

  try {
    const L = await ensureLeaflet();
    const mapNode = overlay.querySelector('#sat-map-modal-map');
    modalMap = L.map(mapNode, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      preferCanvas: true,
    });

    addTileLayer(L, modalMap);
    addMapContent(L, modalMap, data || await loadDashboardData(), { expanded: true });

    // Esperar al layout del modal evita el típico mapa reducido a una esquina.
    requestAnimationFrame(() => {
      modalMap?.invalidateSize(true);
      setTimeout(() => modalMap?.invalidateSize(true), 120);
      setTimeout(() => modalMap?.invalidateSize(true), 400);
    });
  } catch (error) {
    console.error('[Mapa ampliado]', error);
    const body = overlay.querySelector('.sat-map-modal-body');
    if (body) body.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:#8a2f2f;background:#edf3f7;padding:24px;text-align:center">No se pudo cargar el mapa ampliado.</div>';
  }
}

async function renderInlineMap() {
  const host = document.getElementById('real-map');
  if (!host) return;

  // Si ya existe nuestro mapa y no fue reemplazado por dashboard.js, sólo recalcular tamaño.
  if (host.querySelector('.sat-leaflet-map') && inlineMap) {
    inlineMap.invalidateSize(false);
    return;
  }

  host.innerHTML = '<div class="sat-map-loading">Cargando mapa interactivo de Panambí…</div>';

  try {
    const [L, data] = await Promise.all([ensureLeaflet(), loadDashboardData()]);
    lastData = data;

    if (inlineMap) {
      try { inlineMap.remove(); } catch (_) {}
      inlineMap = null;
    }

    host.innerHTML = '<div class="sat-leaflet-map" aria-label="Mapa interactivo de Panambí con sensores y zonas de riesgo"></div>';
    const mapNode = host.querySelector('.sat-leaflet-map');

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

    requestAnimationFrame(() => inlineMap?.invalidateSize(true));
    setTimeout(() => inlineMap?.invalidateSize(true), 120);
    setTimeout(() => inlineMap?.invalidateSize(true), 450);
  } catch (error) {
    console.error('[Mapa interactivo]', error);
    host.innerHTML = '<div class="sat-map-error">No se pudo cargar el mapa interactivo. Verificá la conexión a Internet y volvé a intentar.</div>';
  }
}

function scheduleRender(delay = 80) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderInlineMap(), delay);
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const host = mutation.target?.closest?.('#real-map') || (mutation.target?.id === 'real-map' ? mutation.target : null);
      if (!host) continue;

      // dashboard.js vuelve a escribir el contenido estático: restauramos el mapa real.
      if (!host.querySelector('.sat-leaflet-map')) {
        scheduleRender(30);
      }
      break;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRender(0);

  window.addEventListener('resize', () => {
    inlineMap?.invalidateSize(false);
    modalMap?.invalidateSize(false);
  });
}

injectStyles();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver, { once: true });
} else {
  startObserver();
}

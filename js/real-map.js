const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const FALLBACK_SENSORS = {
  'S-01': { lat: -27.7210, lng: -54.9158, zona: 'Ribera Norte' },
  'S-02': { lat: -27.7265, lng: -54.9137, zona: 'Bajo Uruguay' },
  'S-03': { lat: -27.7348, lng: -54.9104, zona: 'Costa Sur' },
  'S-04': { lat: -27.7240, lng: -54.8997, zona: 'Zona Alta' },
  'S-05': { lat: -27.7187, lng: -54.9073, zona: 'Puente' },
  'S-06': { lat: -27.7301, lng: -54.9040, zona: 'Arroyo' },
};

const FALLBACK_ZONES = [
  { nombre: 'Ribera Norte', riesgo: 'Rojo', coords: [[-27.7179, -54.9195], [-27.7188, -54.9126], [-27.7240, -54.9131], [-27.7246, -54.9201]] },
  { nombre: 'Bajo Uruguay', riesgo: 'Naranja', coords: [[-27.7240, -54.9166], [-27.7248, -54.9105], [-27.7302, -54.9108], [-27.7304, -54.9169]] },
  { nombre: 'Costa Sur', riesgo: 'Naranja', coords: [[-27.7315, -54.9148], [-27.7314, -54.9079], [-27.7375, -54.9082], [-27.7377, -54.9150]] },
  { nombre: 'Zona Alta', riesgo: 'Verde', coords: [[-27.7193, -54.9048], [-27.7194, -54.8958], [-27.7260, -54.8958], [-27.7258, -54.9052]] },
  { nombre: 'Puente', riesgo: 'Amarillo', coords: [[-27.7166, -54.9103], [-27.7165, -54.9050], [-27.7211, -54.9050], [-27.7212, -54.9104]] },
  { nombre: 'Arroyo', riesgo: 'Naranja', coords: [[-27.7270, -54.9070], [-27.7272, -54.9010], [-27.7335, -54.9009], [-27.7336, -54.9071]] },
];

let leafletPromise = null;
let mapInstance = null;
let renderInProgress = false;
let rerenderTimer = null;

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

function injectMapStyles() {
  if (document.getElementById('interactive-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'interactive-map-styles';
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
    #real-map .sat-leaflet-map {
      width: 100%;
      height: 100%;
      min-height: 380px;
      border-radius: 9px;
      z-index: 1;
    }
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
    #real-map .leaflet-control-attribution { font-size: 10px; }
    #real-map .sat-map-legend {
      background: rgba(255,255,255,.95);
      color: #243746;
      padding: 8px 10px;
      border-radius: 7px;
      box-shadow: 0 1px 5px rgba(0,0,0,.28);
      font-size: 11px;
      line-height: 1.5;
    }
    #real-map .sat-map-legend strong { display:block; margin-bottom:3px; font-size:11px; }
    #real-map .sat-map-legend span { display:flex; align-items:center; gap:6px; white-space:nowrap; }
    #real-map .sat-map-legend i { width:9px; height:9px; border-radius:50%; display:inline-block; }
    #real-map .sat-fullscreen-control button {
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
    }
    #real-map:fullscreen,
    #real-map:-webkit-full-screen {
      width: 100vw !important;
      height: 100vh !important;
      min-height: 100vh !important;
      border-radius: 0 !important;
      background: #dbe8ef !important;
    }
    #real-map:fullscreen .sat-leaflet-map,
    #real-map:-webkit-full-screen .sat-leaflet-map {
      min-height: 100vh !important;
      border-radius: 0 !important;
    }
    .sat-sensor-popup { min-width: 170px; }
    .sat-sensor-popup strong { display:block; font-size:14px; margin-bottom:4px; }
    .sat-sensor-popup div { margin:2px 0; }
  `;
  document.head.appendChild(style);
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Leaflet.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.defer = true;
    script.onload = () => resolve(window.L);
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
  const source = Array.isArray(data?.sensores) ? data.sensores : (Array.isArray(data?.sensors) ? data.sensors : []);
  const byCode = new Map(source.map(sensor => [String(sensor.sensor || sensor.id || ''), sensor]));

  return Object.entries(FALLBACK_SENSORS).map(([code, fallback]) => {
    const sensor = byCode.get(code) || {};
    return {
      ...sensor,
      sensor: sensor.sensor || sensor.id || code,
      zona: sensor.zona || fallback.zona,
      lat: Number(sensor.lat ?? fallback.lat),
      lng: Number(sensor.lng ?? sensor.lon ?? fallback.lng),
      nivel_m: Number(sensor.nivel_m ?? sensor.nivel ?? 0),
      riesgo: sensor.riesgo || 'Verde',
      estado: sensor.estado || 'Activo',
    };
  });
}

function normalizedZones(data) {
  const source = Array.isArray(data?.zonas) ? data.zonas
    : (Array.isArray(data?.zonas_mapa) ? data.zonas_mapa
      : (Array.isArray(data?.zonasRiesgo) ? data.zonasRiesgo : []));

  if (!source.length) return FALLBACK_ZONES;

  const fallbackByName = new Map(FALLBACK_ZONES.map(zone => [zone.nombre, zone]));
  return source
    .map(zone => {
      const name = zone.nombre || zone.zona;
      const fallback = fallbackByName.get(name);
      return {
        nombre: name || fallback?.nombre || 'Zona',
        riesgo: zone.riesgo || zone.riesgo_base || fallback?.riesgo || 'Verde',
        coords: zone.coords || zone.coordenadas || fallback?.coords || [],
      };
    })
    .filter(zone => Array.isArray(zone.coords) && zone.coords.length >= 3);
}

function addFullscreenControl(L, map, host) {
  const FullscreenControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const wrapper = L.DomUtil.create('div', 'sat-fullscreen-control leaflet-bar');
      const button = L.DomUtil.create('button', '', wrapper);
      button.type = 'button';
      button.title = 'Ver mapa en pantalla completa';
      button.setAttribute('aria-label', 'Ver mapa en pantalla completa');
      button.textContent = '⛶';
      L.DomEvent.disableClickPropagation(wrapper);
      L.DomEvent.on(button, 'click', () => {
        if (!document.fullscreenElement) {
          host.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
        setTimeout(() => map.invalidateSize(), 250);
      });
      return wrapper;
    },
  });
  map.addControl(new FullscreenControl());
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

async function renderInteractiveMap() {
  const host = document.getElementById('real-map');
  if (!host || renderInProgress) return;
  if (host.querySelector('.leaflet-container')) return;

  renderInProgress = true;
  host.dataset.interactiveMap = 'loading';
  host.innerHTML = '<div class="sat-map-loading">Cargando mapa interactivo de Panambí…</div>';

  try {
    const [L, data] = await Promise.all([ensureLeaflet(), loadDashboardData()]);
    const sensors = normalizedSensors(data);
    const zones = normalizedZones(data);

    if (mapInstance) {
      try { mapInstance.remove(); } catch (_) { /* mapa anterior ya reemplazado */ }
      mapInstance = null;
    }

    host.innerHTML = '<div class="sat-leaflet-map" aria-label="Mapa interactivo de Panambí con sensores y zonas de riesgo"></div>';
    const mapNode = host.querySelector('.sat-leaflet-map');
    const map = L.map(mapNode, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
    });
    mapInstance = map;

    L.tileLayer(OSM_TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);

    const boundsPoints = [];

    zones.forEach(zone => {
      const color = riskColor(zone.riesgo);
      const polygon = L.polygon(zone.coords, {
        color,
        weight: 2,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.13,
      }).addTo(map);
      polygon.bindTooltip(`${escapeHtml(zone.nombre)} · ${escapeHtml(zone.riesgo)}`, { sticky: true });
      zone.coords.forEach(point => boundsPoints.push(point));
    });

    sensors.forEach(sensor => {
      if (!Number.isFinite(sensor.lat) || !Number.isFinite(sensor.lng)) return;
      const color = riskColor(sensor.riesgo);
      const marker = L.circleMarker([sensor.lat, sensor.lng], {
        radius: 9,
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
        </div>
      `);
      boundsPoints.push([sensor.lat, sensor.lng]);
    });

    addLegend(L, map);
    addFullscreenControl(L, map, host);

    if (boundsPoints.length) {
      map.fitBounds(boundsPoints, { padding: [22, 22], maxZoom: 15 });
    } else {
      map.setView([-27.726, -54.909], 14);
    }

    host.dataset.interactiveMap = 'ready';
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 250);
  } catch (error) {
    console.error('[Mapa interactivo]', error);
    host.dataset.interactiveMap = 'error';
    host.innerHTML = '<div class="sat-map-error">No se pudo cargar el mapa interactivo. Verificá la conexión a Internet y volvé a intentar.</div>';
  } finally {
    renderInProgress = false;
  }
}

function scheduleRender(delay = 60) {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    const host = document.getElementById('real-map');
    if (!host) return;
    if (!host.querySelector('.leaflet-container')) renderInteractiveMap();
  }, delay);
}

function watchForStaticMapReplacements() {
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const host = mutation.target?.closest?.('#real-map') || (mutation.target?.id === 'real-map' ? mutation.target : null);
      if (host && !host.querySelector('.leaflet-container')) {
        scheduleRender();
        break;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRender(0);
}

injectMapStyles();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchForStaticMapReplacements, { once: true });
} else {
  watchForStaticMapReplacements();
}

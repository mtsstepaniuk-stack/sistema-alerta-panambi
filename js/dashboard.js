/**
 * Actualiza datos principales desde SQLite.
 */
import { apiRequest } from './api.js';

let mapInstance = null;
let mapLayers = [];

function classForAlert(alerta) {
  if (alerta?.origen === 'Vecinal' || alerta?.colorKey === 'lila') return 'alert-item-lila';
  if (alerta?.riesgo === 'Rojo') return 'alert-item-rojo';
  if (alerta?.riesgo === 'Naranja' || alerta?.riesgo === 'Amarillo') return 'alert-item-naranja';
  if (alerta?.riesgo === 'Verde') return 'alert-item-celeste';
  return '';
}

function badgeClass(alerta) {
  if (alerta?.origen === 'Vecinal' || alerta?.colorKey === 'lila') return 'badge-lila';
  if (alerta.estado === 'Pendiente') {
    if (alerta.riesgo === 'Rojo') return 'badge-rojo';
    if (alerta.riesgo === 'Naranja' || alerta.riesgo === 'Amarillo') return 'badge-naranja';
  }
  if (alerta.estado === 'Validada') return 'badge-verde';
  if (alerta.estado === 'Emitida') return 'badge-celeste';
  if (alerta.estado === 'Rechazada') return 'badge-gris';
  return 'badge-gris';
}

function colorForRisk(riesgo) {
  if (riesgo === 'Vecinal') return '#8E44AD';
  if (riesgo === 'Rojo') return '#C0392B';
  if (riesgo === 'Naranja') return '#E67E22';
  if (riesgo === 'Amarillo') return '#F1C40F';
  return '#27AE60';
}

function markerClass(riesgo) {
  if (riesgo === 'Rojo') return 'rojo';
  if (riesgo === 'Naranja') return 'naranja';
  if (riesgo === 'Amarillo') return 'amarillo';
  if (riesgo === 'Vecinal') return 'lila';
  return 'verde';
}

function formatAlertTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function renderDashboardBanner(count, recentAlerts = []) {
  const banner = document.querySelector('#s-dash .alert-banner');
  if (!banner) return;

  if (count <= 0) {
    banner.style.display = 'none';
    return;
  }

  const firstPending = recentAlerts.find(alerta => alerta.estado === 'Pendiente');
  banner.style.display = 'flex';
  banner.style.opacity = '1';
  banner.classList.toggle('alert-banner-lila', firstPending?.origen === 'Vecinal');

  const title = banner.querySelector('.alert-banner-title');
  const desc = banner.querySelector('.alert-banner-desc');

  if (title) {
    title.textContent = firstPending?.origen === 'Vecinal'
      ? `REPORTE VECINAL PENDIENTE — ${firstPending.zona}`
      : (firstPending ? `ALERTA ${firstPending.riesgo.toUpperCase()} ACTIVA — ${firstPending.zona}` : 'ALERTA ACTIVA');
  }

  if (desc) {
    desc.textContent = firstPending
      ? `${firstPending.detalle || firstPending.mensaje} · ${count} alerta${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'} de validación.`
      : `${count} alerta${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'} de validación.`;
  }
}


export function renderDashboardAlerts(alertas = []) {
  const list = document.querySelector('#s-dash .alert-list');
  const headerBadge = document.querySelector('#s-dash .dash-right .card-header .badge');
  if (!list) return;

  const pendingCount = alertas.filter(alerta => alerta.estado === 'Pendiente').length;
  if (headerBadge) {
    headerBadge.textContent = `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;
    headerBadge.className = `badge ${pendingCount > 0 ? 'badge-rojo' : 'badge-verde'}`;
  }

  if (alertas.length === 0) {
    list.innerHTML = `
      <div class="alert-item alert-item-celeste">
        <div class="alert-item-top">
          <span class="alert-item-title">Sin alertas registradas</span>
          <span class="alert-item-time">—</span>
        </div>
        <div class="alert-item-desc">Todavía no hay eventos cargados en la base de datos local.</div>
        <div style="margin-top:6px;"><span class="badge badge-gris">INFO</span></div>
      </div>
    `;
    return;
  }

  list.innerHTML = alertas.map(alerta => {
    const clickable = alerta.estado === 'Pendiente' ? `onclick="navigate('s-validar'); setTimeout(() => window.selectPendingAlert?.(${alerta.id}), 120)"` : '';
    return `
      <div class="alert-item ${classForAlert(alerta)}" ${clickable}>
        <div class="alert-item-top">
          <span class="alert-item-title">${alerta.origen} · ${alerta.zona}</span>
          <span class="alert-item-time">${formatAlertTime(alerta.actualizada_en || alerta.creada_en)}</span>
        </div>
        <div class="alert-item-desc">${alerta.detalle || alerta.mensaje}</div>
        <div style="margin-top:6px;"><span class="badge ${badgeClass(alerta)}">${alerta.badge}</span></div>
      </div>
    `;
  }).join('');
}

function renderSensors(sensores = []) {
  const grid = document.querySelector('#s-dash .sensor-grid');
  if (!grid || sensores.length === 0) return;

  grid.innerHTML = sensores.map(sensor => {
    const color = colorForRisk(sensor.riesgo);
    const dotClass = sensor.estado === 'Intermitente' ? 'sensor-dot-warn' : 'sensor-dot-ok';
    return `
      <div class="sensor-item">
        <div class="sensor-name">${sensor.sensor} ${sensor.zona}</div>
        <div class="sensor-value" style="color:${color};">${Number(sensor.nivel_m).toFixed(2)} m</div>
        <div class="sensor-status-line"><div class="sensor-dot ${dotClass}"></div><span class="sensor-status-text">${sensor.estado}</span></div>
      </div>
    `;
  }).join('');
}


function staticPositionForSensor(sensor) {
  const zona = String(sensor.zona || '').toLowerCase();
  const code = String(sensor.sensor || '').toLowerCase();

  // Ubicaciones aproximadas sobre la ribera del Río Uruguay en Panambí.
  if (zona.includes('ribera') || code.includes('01')) return { x: 69, y: 24 };
  if (zona.includes('bajo') || code.includes('02')) return { x: 66, y: 43 };
  if (zona.includes('costa') || code.includes('03')) return { x: 65, y: 78 };
  if (zona.includes('alta') || code.includes('04')) return { x: 57, y: 34 };
  if (zona.includes('puente') || code.includes('05')) return { x: 59, y: 91 };
  if (zona.includes('arroyo') || code.includes('06')) return { x: 63, y: 61 };
  return { x: 66, y: 52 };
}

function renderRealMap(sensores = [], zonas = []) {
  const el = document.getElementById('real-map');
  if (!el) return;

  const zoneByName = new Map((zonas || []).map(z => [String(z.nombre || '').toLowerCase(), z]));
  const sensorMarkers = (sensores || []).map(sensor => {
    const pos = staticPositionForSensor(sensor);
    const riskClass = markerClass(sensor.riesgo);
    const zona = zoneByName.get(String(sensor.zona || '').toLowerCase());
    const riesgo = sensor.riesgo || zona?.riesgo || 'Verde';
    return `
      <button class="sensor-marker-static ${riskClass}" style="left:${pos.x}%;top:${pos.y}%;" title="${sensor.sensor} — ${sensor.zona} — ${Number(sensor.nivel_m || 0).toFixed(2)} m">
        <span>${sensor.sensor}</span>
      </button>
    `;
  }).join('');

  el.innerHTML = `
    <div class="static-map-canvas" role="img" aria-label="Mapa referencial de Panambí con zonas y sensores sobre la vera del Río Uruguay">
      <svg class="static-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <!-- Fondo tipo mapa -->
        <rect width="100" height="100" fill="#d8f0dd"/>
        <path d="M76 -4 C80 15 76 29 72 41 C68 53 71 70 66 104 L104 104 L104 -4 Z" fill="#7bcddd"/>
        <path d="M75 -4 C79 16 75 29 71 41 C67 53 70 70 65 104" fill="none" stroke="#3b7790" stroke-width="0.45" opacity=".75"/>
        <path d="M91 -2 L77 13 L71 30 L78 43 L71 61 L83 88 L73 104" fill="none" stroke="#2c5567" stroke-width="0.35" opacity=".55"/>

        <!-- Vegetación y relieve -->
        <path d="M0 0 H70 C58 8 51 13 42 10 C30 7 18 8 8 17 C5 19 2 20 0 19 Z" fill="#c7edce"/>
        <path d="M0 16 C17 14 22 22 31 24 C47 30 52 19 68 27 L68 44 C57 40 50 44 40 42 C28 40 18 31 0 33 Z" fill="#c7edce"/>
        <path d="M0 68 C18 63 27 71 38 69 C50 67 54 75 64 73 L64 101 H0 Z" fill="#c7edce"/>

        <!-- Ruta provincial y accesos -->
        <path d="M-6 58 C18 57 28 50 41 47 C52 44 58 38 66 31 C72 25 75 14 68 2" fill="none" stroke="#667f98" stroke-width="2.3" stroke-linecap="round"/>
        <path d="M-6 58 C18 57 28 50 41 47 C52 44 58 38 66 31 C72 25 75 14 68 2" fill="none" stroke="#9fb4c7" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M58 91 C54 82 53 72 58 65 C62 58 64 51 66 42" fill="none" stroke="#7f95aa" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M58 91 C54 82 53 72 58 65 C62 58 64 51 66 42" fill="none" stroke="#edf2f4" stroke-width=".65" stroke-linecap="round" opacity=".8"/>

        <!-- Manzana urbana de Panambí -->
        <path d="M31 38 L54 31 L65 43 L61 67 L35 74 L23 58 Z" fill="#f8f8f4" stroke="#d4dde4" stroke-width=".55"/>
        <path d="M31 38 L54 31 M27 45 L60 36 M24 52 L64 45 M24 59 L62 54 M29 66 L60 62" stroke="#cbd7e0" stroke-width=".55"/>
        <path d="M37 36 L30 70 M44 34 L39 72 M51 32 L48 70 M58 39 L55 66" stroke="#cbd7e0" stroke-width=".55"/>

        <!-- Costanera / vera del río -->
        <path d="M68 14 C72 27 67 39 65 49 C63 62 64 75 60 91" fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".95"/>
        <path d="M68 14 C72 27 67 39 65 49 C63 62 64 75 60 91" fill="none" stroke="#6b8aa2" stroke-width=".35" opacity=".7"/>

        <!-- Marcadores de referencia -->
        <rect x="47" y="24" width="5" height="5" rx="1" fill="#79a857" stroke="#fff" stroke-width=".4"/>
        <text x="49.5" y="27.8" text-anchor="middle" font-size="3.2" font-weight="800" fill="#fff">2</text>
        <rect x="13" y="53" width="5" height="5" rx="1" fill="#79a857" stroke="#fff" stroke-width=".4"/>
        <text x="15.5" y="56.8" text-anchor="middle" font-size="3.2" font-weight="800" fill="#fff">2</text>
        <circle cx="57" cy="86" r="3.6" fill="#7a8b95" stroke="#fff" stroke-width=".7"/>
        <text x="57" y="87.2" text-anchor="middle" font-size="3" font-weight="800" fill="#fff">⚓</text>

        <!-- Etiquetas del mapa -->
        <text x="41" y="56" class="map-town-label" text-anchor="middle">Panambí</text>
        <text x="14" y="83" class="map-place-label">Paso Internacional Puerto</text>
        <text x="14" y="88" class="map-place-label">Panambí - Porto Veracruz</text>
        <text x="68" y="8" class="map-place-purple" text-anchor="middle">Mirador Punta</text>
        <text x="68" y="13" class="map-place-purple" text-anchor="middle">Porá</text>
        <text x="82" y="54" class="map-river-label" transform="rotate(87 82 54)">Río Uruguay</text>
      </svg>

      <!-- Zonas aproximadas -->
      <div class="zone-label zone-ribera">Ribera Norte</div>
      <div class="zone-label zone-bajo">Bajo Uruguay</div>
      <div class="zone-label zone-costa">Costa Sur</div>
      <div class="zone-label zone-alta">Zona Alta</div>
      <div class="zone-label zone-puente">Puerto / Puente</div>
      <div class="zone-label zone-arroyo">Arroyo</div>

      <!-- Sensores -->
      ${sensorMarkers}
      <div class="static-map-legend">
        <span><i class="legend-dot rojo"></i>Riesgo alto</span>
        <span><i class="legend-dot naranja"></i>Riesgo medio</span>
        <span><i class="legend-dot amarillo"></i>Preventivo</span>
        <span><i class="legend-dot verde"></i>Normal</span>
      </div>
    </div>
  `;

  const risky = zonas.filter(z => z.riesgo !== 'Verde').length;
  const badge = document.getElementById('map-risk-badge');
  if (badge) {
    badge.textContent = risky === 1 ? '1 zona en riesgo' : `${risky} zonas en riesgo`;
    badge.className = `badge ${risky > 0 ? 'badge-rojo' : 'badge-verde'}`;
  }
}


export async function initDashboard() {
  try {
    const data = await apiRequest('/dashboard');
    updatePendingBadges(data.pendingAlerts);
    renderDashboardBanner(data.pendingAlerts, data.recentAlerts || []);
    renderDashboardAlerts(data.recentAlerts || []);
    renderSensors(data.sensores || []);
    renderRealMap(data.sensores || [], data.zonas || []);

    const latest = data.latest;
    const kpiValues = document.querySelectorAll('#s-dash .kpi-value');
    if (latest) {
      if (kpiValues[0]) {
        kpiValues[0].innerHTML = `${Number(latest.nivel).toFixed(2)}<span style="font-size:14px;color:var(--texto-sub)"> m</span>`;
      }
      const delta = document.querySelector('#s-dash .kpi-delta');
      if (delta) {
        const trend = Number(latest.tendencia);
        delta.textContent = `${trend >= 0 ? '▲ +' : '▼ '}${trend.toFixed(2)} m en 1h`;
      }
    }

    if (kpiValues[3] && data.sensores) kpiValues[3].innerHTML = `${data.sensores.filter(s => s.estado === 'Activo').length}<span style="font-size:16px;color:var(--texto-sub)">/${data.sensores.length}</span>`;
    if (kpiValues[4]) kpiValues[4].textContent = data.pendingAlerts ?? 0;
  } catch (error) {
    console.warn('No se pudo cargar dashboard:', error.message);
  }
}

export function updatePendingBadges(count) {
  document.querySelectorAll('.nav-badge').forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  });

  const countHeader = document.querySelector('#s-validar .page-sub');
  if (countHeader) {
    countHeader.textContent = count === 0
      ? 'No quedan alertas pendientes de revisión'
      : `Alerta pendiente · Quedan ${count} pendiente${count === 1 ? '' : 's'}`;
  }
}

window.initDashboard = initDashboard;

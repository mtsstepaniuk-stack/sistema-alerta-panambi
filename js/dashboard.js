/**
 * Actualiza datos principales desde SQLite.
 */
import { apiRequest } from './api.js';
import { formatArgentinaTime } from './argentina-time.js';

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

function formatAlertTime(value) {
  return formatArgentinaTime(value) || '—';
}

function renderDashboardBanner(pendingCount, recentAlerts = []) {
  const banner = document.querySelector('#s-dash .alert-banner');
  if (!banner) return;

  const firstPending = recentAlerts.find(alerta => alerta.estado === 'Pendiente');
  const activeManual = recentAlerts.find(alerta => alerta.origen === 'Manual' && alerta.estado === 'Emitida');
  const highlighted = firstPending || activeManual;

  if (!highlighted) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  banner.style.opacity = '1';
  banner.classList.toggle('alert-banner-lila', highlighted?.origen === 'Vecinal');

  const title = banner.querySelector('.alert-banner-title');
  const desc = banner.querySelector('.alert-banner-desc');

  if (firstPending) {
    if (title) {
      title.textContent = firstPending.origen === 'Vecinal'
        ? `REPORTE VECINAL PENDIENTE — ${firstPending.zona}`
        : `ALERTA ${firstPending.riesgo.toUpperCase()} ACTIVA — ${firstPending.zona}`;
    }

    if (desc) {
      desc.textContent = `${firstPending.detalle || firstPending.mensaje} · ${pendingCount} alerta${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} de validación.`;
    }
    return;
  }

  if (title) {
    title.textContent = `ALERTA MANUAL ${String(activeManual.riesgo || '').toUpperCase()} ACTIVA — ${activeManual.zona}`;
  }
  if (desc) {
    desc.textContent = `${activeManual.mensaje || activeManual.detalle || 'Alerta manual emitida.'} · Permanece activa en el mapa hasta ser finalizada.`;
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
    const clickable = alerta.estado === 'Pendiente'
      ? `onclick="navigate('s-validar'); setTimeout(() => window.selectPendingAlert?.(${alerta.id}), 120)"`
      : '';

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

export async function initDashboard() {
  try {
    const data = await apiRequest('/dashboard');
    updatePendingBadges(data.pendingAlerts);
    renderDashboardBanner(data.pendingAlerts, data.recentAlerts || []);
    renderDashboardAlerts(data.recentAlerts || []);
    renderSensors(data.sensores || []);

    // El mapa lo administra exclusivamente sensor-map-fix.js.
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

    if (kpiValues[3] && data.sensores) {
      kpiValues[3].innerHTML = `${data.sensores.filter(s => s.estado === 'Activo').length}<span style="font-size:16px;color:var(--texto-sub)">/${data.sensores.length}</span>`;
    }

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

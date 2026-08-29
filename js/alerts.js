/**
 * Alerts Module
 * Coordina validación de alertas y emisión manual con persistencia local.
 */

import { doAction, closeModal, showToast } from './modals.js';
import { apiRequest, buildQuery } from './api.js';
import { updatePendingBadges, initDashboard } from './dashboard.js';
import { renderHistory } from './history.js';
import { currentUser } from './auth.js';

let pendingAlerts = 0;
let currentPendingAlert = null;
let pendingAlertList = [];
let emitRecipients = [];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function alertColor(alerta) {
  if (alerta?.origen === 'Vecinal' || alerta?.colorKey === 'lila') return '#8E44AD';
  if (alerta?.riesgo === 'Rojo') return 'var(--rojo)';
  if (alerta?.riesgo === 'Naranja' || alerta?.riesgo === 'Amarillo') return 'var(--naranja)';
  return 'var(--verde-lt)';
}

function validationColorClass(alerta) {
  if (alerta?.origen === 'Vecinal' || alerta?.colorKey === 'lila') return 'lila';
  if (alerta?.riesgo === 'Rojo') return 'rojo';
  if (alerta?.riesgo === 'Naranja') return 'naranja';
  if (alerta?.riesgo === 'Amarillo') return 'amarillo';
  return 'verde';
}

function badgeClass(alerta) {
  if (alerta?.origen === 'Vecinal' || alerta?.colorKey === 'lila') return 'badge-lila';
  if (alerta?.riesgo === 'Rojo') return 'badge-rojo';
  if (alerta?.riesgo === 'Naranja' || alerta?.riesgo === 'Amarillo') return 'badge-naranja';
  if (alerta?.riesgo === 'Verde') return 'badge-verde';
  return 'badge-gris';
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

function validationBlocks() {
  const content = document.querySelector('#s-validar .content');
  if (!content) return [];
  return Array.from(content.children).filter(el => {
    return !el.classList.contains('page-header')
      && el.id !== 'validar-empty-state'
      && el.id !== 'validar-alert-list';
  });
}

function ensureEmptyState() {
  const content = document.querySelector('#s-validar .content');
  if (!content) return null;

  let empty = document.getElementById('validar-empty-state');
  if (!empty) {
    empty = document.createElement('div');
    empty.id = 'validar-empty-state';
    empty.className = 'card';
    empty.style.display = 'none';
    empty.style.textAlign = 'center';
    empty.style.padding = '44px 24px';
    empty.innerHTML = `
      <div style="font-size:44px;margin-bottom:12px;">✅</div>
      <div style="font-size:20px;font-weight:800;color:var(--texto-base);margin-bottom:6px;">No hay alertas pendientes</div>
      <div style="font-size:13px;color:var(--texto-sub);margin-bottom:18px;">Las alertas automáticas y vecinales procesadas quedan guardadas en Historial y en SQLite.</div>
      <button class="btn btn-primary" onclick="navigate('s-dash')">Volver al panel</button>
    `;
    const header = content.querySelector('.page-header');
    header?.after(empty);
  }
  return empty;
}

function ensureAlertList() {
  const content = document.querySelector('#s-validar .content');
  if (!content) return null;
  let list = document.getElementById('validar-alert-list');
  if (!list) {
    list = document.createElement('div');
    list.id = 'validar-alert-list';
    list.className = 'validation-alert-list';
    const header = content.querySelector('.page-header');
    header?.after(list);
  }
  return list;
}

function renderValidationAlertList(alertas = []) {
  const list = ensureAlertList();
  if (!list) return;

  if (alertas.length === 0) {
    list.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  list.style.display = 'flex';
  list.innerHTML = alertas.map(alerta => {
    const inc = alerta.incidencia || {};
    const hasFile = Boolean(inc.imagen_path);
    const selected = currentPendingAlert?.id === alerta.id ? 'active' : '';
    const title = alerta.origen === 'Vecinal'
      ? `Reporte vecinal — ${escapeHtml(inc.tipo || alerta.zona)}`
      : `${escapeHtml(alerta.origen)} — ${escapeHtml(alerta.zona)}`;
    return `
      <div class="validation-alert-card ${validationColorClass(alerta)} ${selected}" onclick="selectPendingAlert(${alerta.id})">
        <div class="alert-item-top">
          <span class="alert-item-title">${title}</span>
          <span class="alert-item-time">${formatDateTime(alerta.creada_en)}</span>
        </div>
        <div class="alert-item-desc">${escapeHtml(alerta.detalle || alerta.mensaje)}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
          <span class="badge ${badgeClass(alerta)}">${escapeHtml(alerta.badge || 'PENDIENTE')}</span>
          ${hasFile ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); viewIncidentAttachment('${escapeHtml(inc.imagen_path)}')">Ver archivo adjunto</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function dataCardHtml(alerta) {
  const color = alertColor(alerta);
  const inc = alerta.incidencia;
  if (alerta.origen === 'Vecinal' && inc) {
    return `
      <div class="card-title" style="margin-bottom:16px;">Datos del reporte vecinal</div>
      <div class="incident-details-grid">
        <div class="incident-detail-box"><div class="incident-detail-label">Código</div><div class="incident-detail-value">${escapeHtml(inc.codigo || alerta.codigo)}</div></div>
        <div class="incident-detail-box"><div class="incident-detail-label">Zona</div><div class="incident-detail-value">${escapeHtml(inc.zona || alerta.zona)}</div></div>
        <div class="incident-detail-box"><div class="incident-detail-label">Vecino</div><div class="incident-detail-value">${escapeHtml(inc.vecino_nombre || '—')}</div></div>
        <div class="incident-detail-box"><div class="incident-detail-label">DNI</div><div class="incident-detail-value">${escapeHtml(inc.dni || '—')}</div></div>
        <div class="incident-detail-box"><div class="incident-detail-label">Tipo</div><div class="incident-detail-value">${escapeHtml(inc.tipo || '—')}</div></div>
        <div class="incident-detail-box"><div class="incident-detail-label">Fecha y hora</div><div class="incident-detail-value">${formatDateTime(inc.creada_en || alerta.creada_en)}</div></div>
        <div class="incident-detail-box full"><div class="incident-detail-label">Ubicación / referencia</div><div class="incident-detail-value">${escapeHtml(inc.ubicacion || '—')}</div></div>
        <div class="incident-detail-box full"><div class="incident-detail-label">Descripción</div><div class="incident-detail-value">${escapeHtml(inc.descripcion || alerta.mensaje)}</div></div>
        <div class="incident-detail-box full">
          <div class="incident-detail-label">Foto adjunta</div>
          <div class="incident-detail-value">
            ${inc.imagen_path
              ? `<button class="btn btn-outline btn-sm" onclick="viewIncidentAttachment('${escapeHtml(inc.imagen_path)}')">📎 Ver archivo adjunto</button><span style="margin-left:8px;color:var(--texto-sub);font-weight:500;">${escapeHtml(inc.imagen_nombre || '')}</span>`
              : 'Sin imagen adjunta'}
          </div>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:12px;">
        <span class="badge badge-lila" style="font-size:13px;padding:6px 16px;">REPORTE VECINAL</span>
        <div style="font-size:12px;color:var(--texto-sub);">Requiere verificación de Defensa Civil antes de notificar.</div>
      </div>
    `;
  }

  return `
    <div class="card-title" style="margin-bottom:16px;">Datos de la alerta</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:var(--gris-bg);border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:var(--texto-sub);font-weight:600;margin-bottom:4px;">Nivel del río</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;color:${color};">${escapeHtml(alerta.nivelDisplay)}</div>
      </div>
      <div style="background:var(--gris-bg);border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:var(--texto-sub);font-weight:600;margin-bottom:4px;">Umbral superado</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;color:var(--naranja);">${escapeHtml(alerta.umbralDisplay)}</div>
      </div>
      <div style="background:var(--gris-bg);border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:var(--texto-sub);font-weight:600;margin-bottom:4px;">Zona afectada</div>
        <div style="font-size:14px;font-weight:700;color:var(--texto-base);">${escapeHtml(alerta.zona)}</div>
      </div>
      <div style="background:var(--gris-bg);border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:var(--texto-sub);font-weight:600;margin-bottom:4px;">Sensor responsable</div>
        <div style="font-size:14px;font-weight:700;color:var(--texto-base);">${escapeHtml(alerta.sensor)} ✔ Activo</div>
      </div>
    </div>
    <div style="margin-top:14px;">
      <div style="font-size:12px;font-weight:600;color:var(--texto-sub);margin-bottom:4px;">Nivel de riesgo sugerido</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="badge ${badgeClass(alerta)}" style="font-size:13px;padding:6px 16px;">${escapeHtml(alerta.riesgo.toUpperCase())}</span>
        <div style="flex:1;">
          <div class="riesgo-bar"><div class="riesgo-fill" style="width:${Number(alerta.porcentaje || 0)}%;"></div></div>
          <div style="font-size:10px;color:var(--texto-sub);">${Number(alerta.porcentaje || 0)}% del nivel máximo registrado</div>
        </div>
      </div>
    </div>
  `;
}

function updateValidationScreen(alerta, totalPending) {
  const empty = ensureEmptyState();
  const blocks = validationBlocks();
  const pageTitle = document.querySelector('#s-validar .page-title');
  const pageSub = document.querySelector('#s-validar .page-sub');

  if (!alerta) {
    currentPendingAlert = null;
    renderValidationAlertList([]);
    if (pageTitle) pageTitle.textContent = 'Validar Alerta';
    if (pageSub) pageSub.textContent = 'No quedan alertas pendientes de revisión';
    blocks.forEach(block => { block.style.display = 'none'; });
    if (empty) empty.style.display = 'block';
    return;
  }

  currentPendingAlert = alerta;
  blocks.forEach(block => { block.style.display = ''; });
  if (empty) empty.style.display = 'none';
  renderValidationAlertList(pendingAlertList);

  const color = alertColor(alerta);
  const isVecinal = alerta.origen === 'Vecinal';
  if (pageTitle) pageTitle.textContent = 'Validar Alertas Pendientes';
  if (pageSub) pageSub.textContent = `${alerta.codigo} — ${alerta.origen} · quedan ${totalPending} pendiente${totalPending === 1 ? '' : 's'}`;

  const infoBox = document.querySelector('#s-validar .content > div[style*="linear-gradient"]');
  if (infoBox) {
    infoBox.style.borderColor = color;
    infoBox.style.background = isVecinal ? 'linear-gradient(90deg,#F3E8FF,#FBF7FF)' : 'linear-gradient(90deg,#FDECEA,#FEF9F9)';
    infoBox.innerHTML = `
      <div style="width:44px;height:44px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="white" stroke-width="2" fill="white" opacity=".3"/><path d="M12 9v4M12 17h.01" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div>
        <div style="font-size:15px;font-weight:800;color:${color};">${isVecinal ? 'REPORTE VECINAL PENDIENTE' : `ALERTA ${alerta.riesgo.toUpperCase()} ${alerta.origen.toUpperCase()}`} — ${escapeHtml(alerta.zona)}</div>
        <div style="font-size:13px;color:#5D1A1A;margin-top:3px;">${escapeHtml(alerta.mensaje)}</div>
      </div>
    `;
  }

  const dataCard = document.querySelector('#s-validar .validar-grid .card');
  if (dataCard) {
    dataCard.innerHTML = dataCardHtml(alerta);
  }

  const validateDesc = document.querySelector('#m-validar .modal-desc');
  if (validateDesc) {
    validateDesc.innerHTML = isVecinal
      ? `Al validar, el reporte vecinal quedará confirmado y se notificará a los contactos activos correspondientes a <strong>${escapeHtml(alerta.zona)}</strong>.`
      : `Al validar, la alerta será notificada a los contactos activos correspondientes a <strong>${escapeHtml(alerta.zona)}</strong>. Esta acción quedará registrada con tu usuario, fecha y hora actual.`;
  }

  const obs = document.getElementById('val-obs');
  if (obs) obs.value = '';
}

export function selectPendingAlert(id) {
  const alerta = pendingAlertList.find(item => Number(item.id) === Number(id));
  if (!alerta) return;
  updateValidationScreen(alerta, pendingAlerts);
}

export async function renderPendingAlert() {
  try {
    const data = await apiRequest('/alertas?estado=Pendiente');
    pendingAlertList = data.alertas || [];
    pendingAlerts = data.pendingAlerts ?? pendingAlertList.length;
    updatePendingBadges(pendingAlerts);
    const selected = currentPendingAlert ? pendingAlertList.find(a => a.id === currentPendingAlert.id) : null;
    updateValidationScreen(selected || pendingAlertList[0], pendingAlerts);
  } catch (error) {
    showToast(error.message, true);
  }
}

function cleanRiskText(value = '') {
  return value.replace(/[🔴🟠🟡]/g, '').replace('— Riesgo Alto', '').replace('— Riesgo Medio', '').replace('— Preventiva', '').trim();
}

function selectedChannels() {
  const labels = Array.from(document.querySelectorAll('#emit-step-1 label'));
  return labels
    .filter(label => label.querySelector('input[type="checkbox"]')?.checked)
    .map(label => label.textContent.trim().replace(/\s+/g, ' '));
}

function selectedRecipientIds() {
  return Array.from(document.querySelectorAll('#emit-dest-tbody input[type="checkbox"]:checked'))
    .map(cb => Number(cb.dataset.id))
    .filter(Boolean);
}

function selectedRecipientCount() {
  return selectedRecipientIds().length;
}

function updateDestinationSummary() {
  const zonaValue = document.getElementById('emit-zona')?.value || 'Seleccionar...';
  const selected = selectedRecipientCount();
  const summary = document.getElementById('emit-dest-summary');
  if (summary) {
    summary.innerHTML = `Se notificará a <strong>${selected} contacto${selected === 1 ? '' : 's'}</strong> de la zona ${zonaValue}. El listado se filtra desde la base de datos local.`;
  }
  updateEmitSummary();
}

function applyRecipientFilters() {
  const enabledTypes = new Set(
    Array.from(document.querySelectorAll('#emit-dest-filters input[type="checkbox"]'))
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.tipo)
  );

  document.querySelectorAll('#emit-dest-tbody tr[data-tipo]').forEach(row => {
    const visible = enabledTypes.has(row.dataset.tipo);
    row.classList.toggle('emit-row-hidden', !visible);
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = visible;
  });
  updateDestinationSummary();
}

async function loadEmitRecipients() {
  const zonaValue = document.getElementById('emit-zona')?.value || '';
  const tbody = document.getElementById('emit-dest-tbody');
  if (!tbody) return;

  if (!zonaValue || zonaValue === 'Seleccionar...') {
    emitRecipients = [];
    tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--texto-sub);font-size:13px;">Seleccione una zona afectada.</td></tr>';
    updateDestinationSummary();
    return;
  }

  tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--texto-sub);font-size:13px;">Cargando destinatarios...</td></tr>';

  try {
    const data = await apiRequest(`/contactos/destinatarios${buildQuery({ zona: zonaValue })}`);
    emitRecipients = data.contactos || [];
    const resumen = data.resumen || {};

    document.querySelectorAll('#emit-dest-filters label').forEach(label => {
      const cb = label.querySelector('input[type="checkbox"]');
      if (!cb) return;
      const tipo = cb.dataset.tipo;
      const text = tipo === 'Vecino ribereño' ? 'Vecinos ribereños' : (tipo === 'Institución' ? 'Instituciones' : 'Autoridades');
      label.childNodes[label.childNodes.length - 1].textContent = ` ${text} (${resumen[tipo] || 0})`;
      cb.checked = true;
    });

    if (emitRecipients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--texto-sub);font-size:13px;">No hay contactos activos para esta zona.</td></tr>';
    } else {
      tbody.innerHTML = emitRecipients.map(contacto => `
        <tr data-tipo="${escapeHtml(contacto.tipo)}" style="border-bottom:1px solid var(--gris-border);">
          <td style="padding:8px 12px;font-size:13px;">${escapeHtml(contacto.nombre)}</td>
          <td style="padding:8px 12px;font-size:12px;">${escapeHtml(contacto.tipo)}</td>
          <td style="padding:8px 12px;font-size:12px;">${escapeHtml(contacto.zona)}</td>
          <td style="padding:8px 12px;font-size:12px;">${escapeHtml(contacto.canal)}</td>
          <td style="padding:8px 12px;"><input type="checkbox" data-id="${contacto.id}" checked onchange="updateEmitRecipientsCount()"></td>
        </tr>
      `).join('');
    }
    updateDestinationSummary();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--rojo);font-size:13px;">${escapeHtml(error.message)}</td></tr>`;
  }
}

function updateEmitSummary() {
  const riesgoValue = document.getElementById('emit-riesgo')?.value || 'Seleccionar...';
  const zonaValue = document.getElementById('emit-zona')?.value || 'Seleccionar...';
  const mensaje = document.getElementById('emit-msg')?.value?.trim() || '—';
  const riesgo = cleanRiskText(riesgoValue);
  const canales = selectedChannels().join(' · ') || 'Sin canal seleccionado';
  const count = selectedRecipientCount();

  const badge = document.getElementById('emit-res-riesgo');
  if (badge) {
    badge.textContent = riesgo === 'Seleccionar...' ? 'SIN SELECCIONAR' : riesgo.toUpperCase();
    badge.className = 'badge ' + (riesgo.includes('Roja') ? 'badge-rojo' : riesgo.includes('Naranja') || riesgo.includes('Amarilla') ? 'badge-naranja' : 'badge-gris');
  }
  const zona = document.getElementById('emit-res-zona');
  if (zona) zona.textContent = zonaValue;
  const contactos = document.getElementById('emit-res-contactos');
  if (contactos) contactos.textContent = `${count} contacto${count === 1 ? '' : 's'}`;
  const canalesEl = document.getElementById('emit-res-canales');
  if (canalesEl) canalesEl.textContent = canales;
  const msg = document.getElementById('emit-res-msg');
  if (msg) msg.textContent = mensaje.length > 180 ? `${mensaje.slice(0, 180)}...` : mensaje;

  const title = document.getElementById('emit-confirm-title');
  if (title) title.textContent = `Emitir alerta a ${count} contacto${count === 1 ? '' : 's'}`;
  const desc = document.getElementById('emit-confirm-desc');
  if (desc) desc.innerHTML = `Esta acción enviará la <strong>${escapeHtml(riesgo)}</strong> a ${count} contacto${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'} de ${escapeHtml(zonaValue)}. No se puede deshacer.`;
}

export function resetEmitForm() {
  const riesgo = document.getElementById('emit-riesgo');
  const zona = document.getElementById('emit-zona');
  const mensaje = document.getElementById('emit-msg');
  if (riesgo) riesgo.selectedIndex = 0;
  if (zona) zona.selectedIndex = 0;
  if (mensaje) mensaje.value = '';
  emitRecipients = [];
  const tbody = document.getElementById('emit-dest-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--texto-sub);font-size:13px;">Seleccione una zona afectada.</td></tr>';
  document.querySelectorAll('#emit-step-1 input[type="checkbox"], #emit-step-2 input[type="checkbox"]').forEach(cb => { cb.checked = true; });
  emitStep(1);
  updateEmitSummary();
}

export function emitStep(n) {
  if (n < 1 || n > 3) return;
  if (n === 2) loadEmitRecipients();
  if (n === 3) updateEmitSummary();

  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`emit-step-${i}`);
    const st = document.getElementById(`estep-${i}`);

    if (el) el.style.display = (i === n ? 'block' : 'none');

    if (st) {
      st.className = 'emit-step';
      if (i < n) st.classList.add('done');
      if (i === n) st.classList.add('active');
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function decreaseAlertBadge(countFromServer = null) {
  if (countFromServer !== null) {
    pendingAlerts = countFromServer;
  } else if (pendingAlerts > 0) {
    pendingAlerts--;
  }

  updatePendingBadges(pendingAlerts);

  const banner = document.querySelector('.alert-banner');
  if (banner && pendingAlerts <= 0) {
    banner.style.transition = 'opacity 0.4s, height 0.4s';
    banner.style.opacity = '0';
    setTimeout(() => { banner.style.display = 'none'; }, 400);
  }
}

export async function handleAlertAction(modalId, message) {
  const actionByModal = {
    'm-validar': 'Validada',
    'm-rechazar': 'Rechazada'
  };

  if (!currentPendingAlert) {
    showToast('No hay alertas pendientes para procesar.', true);
    closeModal(modalId);
    return;
  }

  const observacion = document.getElementById('val-obs')?.value?.trim() || '';

  try {
    const data = await apiRequest('/alertas/accion', {
      method: 'POST',
      body: JSON.stringify({
        alertaId: currentPendingAlert.id,
        accion: actionByModal[modalId] || 'Validada',
        operador: currentUser()?.nombre || 'Operador',
        observacion
      })
    });

    doAction(modalId, message);
    decreaseAlertBadge(data.pendingAlerts);
    await renderPendingAlert();
    await initDashboard();
    await renderHistory();
  } catch (error) {
    showToast(error.message, true);
  }
}

export async function emitManualAlert() {
  const riesgo = document.getElementById('emit-riesgo')?.value;
  const zona = document.getElementById('emit-zona')?.value;
  const mensaje = document.getElementById('emit-msg')?.value.trim();
  const destinatariosIds = selectedRecipientIds();

  if (!riesgo || riesgo === 'Seleccionar...' || !zona || zona === 'Seleccionar...' || !mensaje) {
    showToast('Complete riesgo, zona y mensaje antes de emitir.', true);
    return;
  }

  if (destinatariosIds.length === 0) {
    showToast('Debe seleccionar al menos un destinatario.', true);
    return;
  }

  try {
    const data = await apiRequest('/alertas/manuales', {
      method: 'POST',
      body: JSON.stringify({
        riesgo,
        zona,
        mensaje,
        operador: currentUser()?.nombre || 'Operador',
        destinatarios_ids: destinatariosIds
      })
    });
    closeModal('m-emit-confirm');
    showToast(`✅ Alerta enviada a ${data.notificados} contactos.`);
    await initDashboard();
    await renderHistory();
    resetEmitForm();
    window.navigate('s-dash');
  } catch (error) {
    showToast(error.message, true);
  }
}

export function viewIncidentAttachment(path) {
  if (!path) {
    showToast('El reporte no tiene archivo adjunto.', true);
    return;
  }
  window.open(path, '_blank', 'noopener');
}

window.emitStep = emitStep;
window.handleAlertAction = handleAlertAction;
window.emitManualAlert = emitManualAlert;
window.resetEmitForm = resetEmitForm;
window.updateEmitRecipientsCount = updateDestinationSummary;
window.applyRecipientFilters = applyRecipientFilters;
window.renderPendingAlert = renderPendingAlert;
window.selectPendingAlert = selectPendingAlert;
window.viewIncidentAttachment = viewIncidentAttachment;

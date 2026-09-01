/**
 * Funciones finales del prototipo:
 * - auditoría visible de alertas;
 * - mantener alerta pendiente y exigir motivo al rechazar;
 * - gestión completa de roles;
 * - administración y control técnico de sensores.
 */

import { apiRequest } from './api.js';
import { showToast, openModal, closeModal } from './modals.js';
import { currentUser, isAdmin, isTechnical } from './auth.js';

const ROLE_OPTIONS = [
  'Operador Defensa Civil',
  'Operador Municipalidad',
  'Personal Técnico',
  'Administrador',
];

const SENSOR_ZONES = [
  'Ribera Norte',
  'Bajo Uruguay',
  'Costa Sur',
  'Zona Alta',
  'Puente',
  'Arroyo',
];

let managedUsers = [];
let managedSensors = [];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function canUseSensorPanel() {
  const user = currentUser();
  return isAdmin(user) || isTechnical(user);
}

/* =====================================================
   VALIDACIÓN / AUDITORÍA DE ALERTAS
===================================================== */
function selectedPendingAlertId() {
  const active = document.querySelector('#validar-alert-list .validation-alert-card.active')
    || document.querySelector('#validar-alert-list .validation-alert-card');
  if (!active) return null;
  const onclick = active.getAttribute('onclick') || '';
  const match = onclick.match(/selectPendingAlert\((\d+)\)/);
  return match ? Number(match[1]) : null;
}

function ensureValidationEnhancements() {
  const observation = document.getElementById('val-obs');
  if (observation) {
    const group = observation.closest('.input-group');
    const label = group?.querySelector('label');
    if (label) label.textContent = 'Motivo / observación';
    if (group && !group.querySelector('.validation-required-note')) {
      const note = document.createElement('div');
      note.className = 'validation-required-note';
      note.style.cssText = 'font-size:11px;color:var(--texto-sub);margin-top:6px;line-height:1.4;';
      note.textContent = 'Obligatorio para rechazar una alerta o dejarla pendiente con observación.';
      group.appendChild(note);
    }
  }

  const actionRow = document.querySelector('#s-validar .val-action-row');
  if (actionRow && !document.getElementById('keep-alert-pending-btn')) {
    const button = document.createElement('button');
    button.id = 'keep-alert-pending-btn';
    button.type = 'button';
    button.className = 'btn btn-outline btn-lg btn-full';
    button.style.cssText = 'border-color:var(--naranja);color:var(--naranja);';
    button.innerHTML = '⏸ Mantener pendiente';
    button.addEventListener('click', keepAlertPending);
    actionRow.appendChild(button);
  }

  const rejectModal = document.querySelector('#m-rechazar .modal-desc');
  if (rejectModal) {
    rejectModal.textContent = 'Para rechazar la alerta es obligatorio indicar el motivo en Observaciones. La acción y el usuario quedarán auditados.';
  }

  if (!window.__rejectValidationWrapped && typeof window.handleAlertAction === 'function') {
    const originalHandle = window.handleAlertAction;
    window.handleAlertAction = async (modalId, message) => {
      if (modalId === 'm-rechazar') {
        const reason = document.getElementById('val-obs')?.value?.trim() || '';
        if (!reason) {
          showToast('Debe indicar el motivo del rechazo.', true);
          document.getElementById('val-obs')?.focus();
          closeModal('m-rechazar');
          return;
        }
      }
      return originalHandle(modalId, message);
    };
    window.__rejectValidationWrapped = true;
  }
}

async function keepAlertPending() {
  const alertId = selectedPendingAlertId();
  const observation = document.getElementById('val-obs')?.value?.trim() || '';

  if (!alertId) {
    showToast('No hay una alerta pendiente seleccionada.', true);
    return;
  }
  if (!observation) {
    showToast('Escriba una observación para mantener la alerta pendiente.', true);
    document.getElementById('val-obs')?.focus();
    return;
  }

  try {
    await apiRequest('/alertas/accion', {
      method: 'POST',
      body: JSON.stringify({ alertaId: alertId, accion: 'Pendiente', observacion })
    });
    showToast('Alerta mantenida pendiente. Observación registrada.');
    const obs = document.getElementById('val-obs');
    if (obs) obs.value = '';
    await window.renderPendingAlert?.();
    await window.initDashboard?.();
    await window.renderHistory?.();
    await renderAlertAudit();
  } catch (error) {
    showToast(error.message, true);
  }
}

function ensureAuditPanel() {
  if (document.getElementById('alert-audit-panel')) return;
  const content = document.querySelector('#s-historial .content');
  if (!content) return;

  const panel = document.createElement('div');
  panel.id = 'alert-audit-panel';
  panel.className = 'card';
  panel.style.cssText = 'padding:0;overflow:hidden;margin-bottom:16px;';
  panel.innerHTML = `
    <div style="padding:14px 18px;border-bottom:1px solid var(--gris-border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <div class="card-title">Auditoría de acciones sobre alertas</div>
        <div style="font-size:11px;color:var(--texto-sub);margin-top:3px;">Usuario, rol, cambio de estado, observación y fecha/hora.</div>
      </div>
      <button class="btn btn-outline btn-sm" type="button" onclick="renderAlertAudit()">Actualizar auditoría</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Alerta</th><th>Acción</th><th>Usuario</th><th>Rol</th><th>Cambio</th><th>Observación</th><th>Fecha y hora</th></tr></thead>
        <tbody id="alert-audit-tbody"><tr><td colspan="7" style="text-align:center;padding:16px;color:var(--texto-sub);">Cargando...</td></tr></tbody>
      </table>
    </div>
  `;

  const summary = content.querySelector('div[style*="grid-template-columns"]');
  if (summary) summary.after(panel);
  else content.appendChild(panel);
}

async function renderAlertAudit() {
  ensureAuditPanel();
  const tbody = document.getElementById('alert-audit-tbody');
  if (!tbody || !currentUser()) return;

  try {
    const data = await apiRequest('/auditoria-alertas');
    const rows = (data.auditoria || []).slice(0, 30);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--texto-sub);">Todavía no hay acciones auditadas sobre alertas.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(item => `
      <tr>
        <td><strong>ALT-${String(item.alerta_id).padStart(4, '0')}</strong></td>
        <td><span class="badge ${item.accion.includes('Rech') ? 'badge-rojo' : item.accion.includes('Pend') ? 'badge-naranja' : 'badge-celeste'}">${escapeHtml(item.accion)}</span></td>
        <td>${escapeHtml(item.usuario)}</td>
        <td>${escapeHtml(item.rol)}</td>
        <td>${escapeHtml(item.estado_anterior)} → ${escapeHtml(item.estado_nuevo)}</td>
        <td>${escapeHtml(item.observacion || '—')}</td>
        <td>${formatDateTime(item.creada_en)}</td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--rojo);">${escapeHtml(error.message)}</td></tr>`;
  }
}

/* =====================================================
   ADMINISTRACIÓN DE USUARIOS Y ROLES
===================================================== */
function ensureTechnicalRoleOption() {
  const select = document.getElementById('usr-rol');
  if (!select) return;
  ROLE_OPTIONS.forEach(role => {
    if (Array.from(select.options).some(option => option.value === role || option.textContent === role)) return;
    const option = document.createElement('option');
    option.value = role;
    option.textContent = role;
    select.appendChild(option);
  });
}

function ensureRoleModal() {
  if (document.getElementById('m-edit-user-role')) return;
  const modal = document.createElement('div');
  modal.id = 'm-edit-user-role';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-icon" style="background:#EAF2FB;">👤</div>
      <div class="modal-title">Cambiar rol de usuario</div>
      <div class="modal-desc" id="edit-role-user-name">—</div>
      <input type="hidden" id="edit-role-user-id">
      <div class="input-group" style="margin-top:14px;">
        <label>Rol *</label>
        <select id="edit-role-value">
          ${ROLE_OPTIONS.map(role => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" onclick="closeModal('m-edit-user-role')">Cancelar</button>
        <button class="btn btn-primary" type="button" onclick="saveUserRole()">Guardar rol</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function userRoleBadge(role) {
  if (role === 'Administrador') return 'badge-rojo';
  if (role === 'Personal Técnico') return 'badge-naranja';
  return 'badge-celeste';
}

async function renderUsersFinal() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  ensureTechnicalRoleOption();
  ensureRoleModal();

  if (!isAdmin()) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--texto-sub);padding:22px;">Se requiere usuario administrador.</td></tr>';
    return;
  }

  try {
    const data = await apiRequest('/usuarios');
    managedUsers = data.usuarios || [];
    if (!managedUsers.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--texto-sub);padding:22px;">No hay usuarios registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = managedUsers.map(user => {
      const isCurrent = Number(currentUser()?.id) === Number(user.id);
      const protectedUser = user.usuario === 'admin' || isCurrent;
      return `
        <tr>
          <td><strong>${escapeHtml(user.nombre)}</strong></td>
          <td>${escapeHtml(user.usuario)}</td>
          <td><span class="badge ${userRoleBadge(user.rol)}">${escapeHtml(user.rol)}</span></td>
          <td><span class="badge badge-verde">Activo</span></td>
          <td>
            <div class="table-actions">
              ${protectedUser
                ? '<span style="font-size:12px;color:var(--texto-sub);">Protegido</span>'
                : `<button class="btn btn-outline btn-sm" onclick="openUserRoleEditor(${Number(user.id)})">Cambiar rol</button>
                   <button class="btn btn-danger btn-sm" onclick="deleteUserFinal(${Number(user.id)})">Eliminar</button>`}
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function createUserFinal() {
  const nombre = document.getElementById('usr-nombre')?.value.trim();
  const usuario = document.getElementById('usr-usuario')?.value.trim();
  const password = document.getElementById('usr-password')?.value;
  const rol = document.getElementById('usr-rol')?.value;

  if (!nombre || !usuario || !password || !rol) {
    showToast('Complete nombre, usuario, contraseña y rol.', true);
    return;
  }
  if (password.length < 4) {
    showToast('La contraseña debe tener al menos 4 caracteres.', true);
    return;
  }

  try {
    await apiRequest('/usuarios', {
      method: 'POST',
      body: JSON.stringify({ nombre, usuario, password, rol })
    });
    document.getElementById('usr-nombre').value = '';
    document.getElementById('usr-usuario').value = '';
    document.getElementById('usr-password').value = '';
    document.getElementById('usr-rol').selectedIndex = 0;
    showToast('Usuario agregado correctamente.');
    await renderUsersFinal();
  } catch (error) {
    showToast(error.message, true);
  }
}

function openUserRoleEditor(id) {
  ensureRoleModal();
  const user = managedUsers.find(item => Number(item.id) === Number(id));
  if (!user) {
    showToast('Usuario no encontrado.', true);
    return;
  }
  document.getElementById('edit-role-user-id').value = user.id;
  document.getElementById('edit-role-user-name').textContent = `${user.nombre} (${user.usuario})`;
  document.getElementById('edit-role-value').value = user.rol;
  openModal('m-edit-user-role');
}

async function saveUserRole() {
  const id = Number(document.getElementById('edit-role-user-id')?.value);
  const rol = document.getElementById('edit-role-value')?.value;
  if (!id || !rol) return;
  try {
    await apiRequest(`/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ rol })
    });
    closeModal('m-edit-user-role');
    showToast('Rol actualizado correctamente.');
    await renderUsersFinal();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteUserFinal(id) {
  const user = managedUsers.find(item => Number(item.id) === Number(id));
  const name = user?.nombre || 'este usuario';
  if (!confirm(`¿Eliminar a ${name} del sistema?`)) return;
  try {
    await apiRequest(`/usuarios/${id}`, { method: 'DELETE' });
    showToast('Usuario eliminado correctamente.');
    await renderUsersFinal();
  } catch (error) {
    showToast(error.message, true);
  }
}

/* =====================================================
   SENSORES / PUNTOS DE MONITOREO
===================================================== */
function ensureSensorStyles() {
  if (document.getElementById('sensor-final-styles')) return;
  const style = document.createElement('style');
  style.id = 'sensor-final-styles';
  style.textContent = `
    .sensor-role-only { display: none; }
    body.admin-role .sensor-role-only,
    body.technical-role .sensor-role-only { display: flex; }
    .sensor-admin-only { display: none !important; }
    body.admin-role .sensor-admin-only { display: inline-flex !important; }
    .sensor-status-dot { width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px; }
    .sensor-actions { display:flex;gap:6px;flex-wrap:wrap; }
    #s-sensores .sensor-kpis { display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:12px;margin-bottom:16px; }
    #s-sensores .sensor-kpi { padding:14px 16px; }
    #s-sensores .sensor-kpi-value { font-size:24px;font-weight:800;margin-top:5px; }
    @media (max-width:900px){ #s-sensores .sensor-kpis { grid-template-columns:repeat(2,1fr); } }
    @media (max-width:560px){ #s-sensores .sensor-kpis { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}

function ensureSensorScreen() {
  if (document.getElementById('s-sensores')) return;
  const template = document.getElementById('s-usuarios') || document.getElementById('s-contactos');
  if (!template) return;

  const screen = template.cloneNode(true);
  screen.id = 's-sensores';
  screen.classList.remove('active');

  const status = screen.querySelector('.topbar-status');
  if (status) status.innerHTML = '<div class="status-dot normal"></div><span class="status-text">MONITOREO TÉCNICO</span>';

  const content = screen.querySelector('.content');
  if (content) {
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Sensores y Puntos de Monitoreo</div>
          <div class="page-sub">Estado operativo, conectividad y configuración de los puntos de medición</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="renderSensors()">Actualizar estado</button>
          <button class="btn btn-primary sensor-admin-only" onclick="openSensorEditor()">+ Agregar sensor</button>
        </div>
      </div>

      <div class="sensor-kpis">
        <div class="card sensor-kpi"><div class="card-title">Total registrados</div><div class="sensor-kpi-value" id="sensor-stat-total">0</div></div>
        <div class="card sensor-kpi"><div class="card-title">Activos</div><div class="sensor-kpi-value" id="sensor-stat-active">0</div></div>
        <div class="card sensor-kpi"><div class="card-title">Conectados</div><div class="sensor-kpi-value" id="sensor-stat-connected">0</div></div>
        <div class="card sensor-kpi"><div class="card-title">Requieren atención</div><div class="sensor-kpi-value" id="sensor-stat-attention">0</div></div>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div style="padding:14px 18px;border-bottom:1px solid var(--gris-border);display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
          <div>
            <div class="card-title">Estado técnico</div>
            <div style="font-size:11px;color:var(--texto-sub);margin-top:3px;">La conectividad se calcula según la antigüedad de la última lectura. El botón Probar registra una verificación técnica.</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Zona</th><th>Última lectura</th><th>Nivel</th><th>Conectividad</th><th>Funcionamiento</th><th>Último test</th><th>Acciones</th></tr></thead>
            <tbody id="sensor-tbody"><tr><td colspan="8" style="text-align:center;padding:20px;color:var(--texto-sub);">Cargando sensores...</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
  }

  document.body.appendChild(screen);
}

function ensureSensorNavItems() {
  document.querySelectorAll('.sidebar').forEach(sidebar => {
    if (sidebar.querySelector('.sensor-nav-item')) return;
    const item = document.createElement('div');
    item.className = 'nav-item sensor-nav-item sensor-role-only';
    item.setAttribute('onclick', "navigate('s-sensores')");
    item.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      Sensores
    `;
    const history = Array.from(sidebar.querySelectorAll('.nav-item')).find(el => (el.getAttribute('onclick') || '').includes('s-historial'));
    if (history) history.before(item);
    else sidebar.appendChild(item);
  });
}

function ensureSensorModal() {
  if (document.getElementById('m-sensor-editor')) return;
  const modal = document.createElement('div');
  modal.id = 'm-sensor-editor';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:620px;">
      <div class="modal-icon" style="background:#EAF7F6;">📡</div>
      <div class="modal-title" id="sensor-modal-title">Agregar sensor</div>
      <input type="hidden" id="sensor-edit-id">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="input-group"><label>Código *</label><input id="sensor-code" type="text" placeholder="Ej: S-07"></div>
        <div class="input-group"><label>Zona *</label><select id="sensor-zone">${SENSOR_ZONES.map(zone => `<option value="${zone}">${zone}</option>`).join('')}</select></div>
        <div class="input-group"><label>Latitud *</label><input id="sensor-lat" type="number" step="0.00001" value="-27.72500"></div>
        <div class="input-group"><label>Longitud *</label><input id="sensor-lng" type="number" step="0.00001" value="-54.91000"></div>
        <div class="input-group"><label>Nivel base (m) *</label><input id="sensor-base" type="number" min="0.1" max="20" step="0.01" value="3.00"></div>
        <div class="input-group" style="display:flex;justify-content:flex-end;flex-direction:column;"><label style="display:flex;align-items:center;gap:8px;"><input id="sensor-active" type="checkbox" checked style="width:auto;"> Punto activo</label></div>
        <div class="input-group" style="grid-column:1/-1;"><label>Descripción</label><input id="sensor-description" type="text" placeholder="Referencia del punto de monitoreo"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" onclick="closeModal('m-sensor-editor')">Cancelar</button>
        <button class="btn btn-primary" type="button" onclick="saveSensor()">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function connectivityBadge(value) {
  if (value === 'Conectado') return 'badge-verde';
  if (value === 'Intermitente') return 'badge-naranja';
  if (value === 'Desactivado') return 'badge-gris';
  return 'badge-rojo';
}

function operationBadge(value) {
  if (value === 'Operativo') return 'badge-verde';
  if (value === 'Fuera de servicio') return 'badge-gris';
  return 'badge-naranja';
}

async function renderSensors() {
  if (!canUseSensorPanel()) return;
  const tbody = document.getElementById('sensor-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--texto-sub);">Actualizando estado...</td></tr>';

  try {
    const data = await apiRequest('/sensores/estado');
    managedSensors = data.sensores || [];
    const stats = data.stats || {};
    document.getElementById('sensor-stat-total').textContent = stats.total ?? 0;
    document.getElementById('sensor-stat-active').textContent = stats.activos ?? 0;
    document.getElementById('sensor-stat-connected').textContent = stats.conectados ?? 0;
    document.getElementById('sensor-stat-attention').textContent = stats.atencion ?? 0;

    if (!managedSensors.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--texto-sub);">No hay sensores configurados.</td></tr>';
      return;
    }

    tbody.innerHTML = managedSensors.map(sensor => {
      const adminButtons = isAdmin()
        ? `<button class="btn btn-outline btn-sm" onclick="openSensorEditor(${Number(sensor.id)})">Editar</button>
           ${sensor.activo
             ? `<button class="btn btn-ghost btn-sm" style="color:var(--rojo);" onclick="deactivateSensor(${Number(sensor.id)})">Dar de baja</button>`
             : `<button class="btn btn-outline btn-sm" onclick="reactivateSensor(${Number(sensor.id)})">Reactivar</button>`}`
        : '';
      return `
        <tr>
          <td><strong>${escapeHtml(sensor.codigo)}</strong></td>
          <td>${escapeHtml(sensor.zona)}</td>
          <td>${sensor.ultima_lectura ? `${formatDateTime(sensor.ultima_lectura)}${sensor.edad_lectura_min != null ? `<div style="font-size:10px;color:var(--texto-sub);">hace ${sensor.edad_lectura_min} min</div>` : ''}` : '—'}</td>
          <td>${sensor.nivel_actual == null ? '—' : `${Number(sensor.nivel_actual).toFixed(2)} m`}</td>
          <td><span class="badge ${connectivityBadge(sensor.conectividad)}">${escapeHtml(sensor.conectividad)}</span></td>
          <td><span class="badge ${operationBadge(sensor.funcionamiento)}">${escapeHtml(sensor.funcionamiento)}</span></td>
          <td>${sensor.ultimo_test_en ? `${formatDateTime(sensor.ultimo_test_en)}<div style="font-size:10px;color:var(--texto-sub);">${escapeHtml(sensor.ultimo_test_resultado || '')}</div>` : 'Sin probar'}</td>
          <td><div class="sensor-actions"><button class="btn btn-primary btn-sm" onclick="testSensor(${Number(sensor.id)})">Probar</button>${adminButtons}</div></td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--rojo);">${escapeHtml(error.message)}</td></tr>`;
  }
}

function openSensorEditor(id = null) {
  if (!isAdmin()) {
    showToast('Solo el Administrador puede modificar sensores.', true);
    return;
  }
  ensureSensorModal();
  const sensor = id ? managedSensors.find(item => Number(item.id) === Number(id)) : null;
  document.getElementById('sensor-edit-id').value = sensor?.id || '';
  document.getElementById('sensor-modal-title').textContent = sensor ? `Editar ${sensor.codigo}` : 'Agregar sensor';
  const code = document.getElementById('sensor-code');
  code.value = sensor?.codigo || '';
  code.disabled = Boolean(sensor);
  document.getElementById('sensor-zone').value = sensor?.zona || SENSOR_ZONES[0];
  document.getElementById('sensor-lat').value = sensor?.lat ?? -27.725;
  document.getElementById('sensor-lng').value = sensor?.lng ?? -54.91;
  document.getElementById('sensor-base').value = sensor?.nivel_base ?? 3;
  document.getElementById('sensor-description').value = sensor?.descripcion || '';
  document.getElementById('sensor-active').checked = sensor ? Boolean(sensor.activo) : true;
  openModal('m-sensor-editor');
}

async function saveSensor() {
  if (!isAdmin()) return;
  const id = Number(document.getElementById('sensor-edit-id')?.value || 0);
  const payload = {
    codigo: document.getElementById('sensor-code')?.value.trim(),
    zona: document.getElementById('sensor-zone')?.value,
    lat: Number(document.getElementById('sensor-lat')?.value),
    lng: Number(document.getElementById('sensor-lng')?.value),
    nivel_base: Number(document.getElementById('sensor-base')?.value),
    descripcion: document.getElementById('sensor-description')?.value.trim() || '',
    activo: document.getElementById('sensor-active')?.checked ?? true,
  };

  if (!payload.codigo || !payload.zona || !Number.isFinite(payload.lat) || !Number.isFinite(payload.lng) || !Number.isFinite(payload.nivel_base)) {
    showToast('Complete código, zona, coordenadas y nivel base.', true);
    return;
  }

  try {
    if (id) {
      await apiRequest(`/sensores/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Sensor actualizado correctamente.');
    } else {
      await apiRequest('/sensores', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Sensor agregado correctamente.');
    }
    closeModal('m-sensor-editor');
    await renderSensors();
    await window.initDashboard?.();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deactivateSensor(id) {
  if (!confirm('¿Dar de baja este punto de monitoreo? Dejará de participar en nuevas lecturas.')) return;
  try {
    await apiRequest(`/sensores/${id}`, { method: 'DELETE' });
    showToast('Sensor dado de baja.');
    await renderSensors();
    await window.initDashboard?.();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function reactivateSensor(id) {
  const sensor = managedSensors.find(item => Number(item.id) === Number(id));
  if (!sensor) return;
  try {
    await apiRequest(`/sensores/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        zona: sensor.zona,
        lat: sensor.lat,
        lng: sensor.lng,
        nivel_base: sensor.nivel_base,
        descripcion: sensor.descripcion || '',
        activo: true,
      })
    });
    showToast('Sensor reactivado.');
    await renderSensors();
    await window.initDashboard?.();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function testSensor(id) {
  try {
    const data = await apiRequest(`/sensores/${id}/test`, { method: 'POST', body: '{}' });
    showToast(data.resultado || 'Prueba técnica registrada.');
    await renderSensors();
  } catch (error) {
    showToast(error.message, true);
  }
}

/* =====================================================
   INTEGRACIÓN GENERAL
===================================================== */
function refreshFinalRoleVisibility() {
  const allowed = canUseSensorPanel();
  document.querySelectorAll('.sensor-role-only').forEach(item => {
    item.style.display = allowed ? 'flex' : 'none';
  });
  document.querySelectorAll('.sensor-admin-only').forEach(item => {
    item.style.setProperty('display', isAdmin() ? 'inline-flex' : 'none', 'important');
  });
  if (!allowed && document.getElementById('s-sensores')?.classList.contains('active')) {
    window.navigate?.('s-dash');
  }
}

function wrapNavigation() {
  if (window.__finalNavigateWrapped || typeof window.navigate !== 'function') return;
  const originalNavigate = window.navigate;
  window.navigate = function finalNavigate(id) {
    if (id === 's-sensores' && !canUseSensorPanel()) {
      showToast('La sección Sensores requiere rol Administrador o Personal Técnico.', true);
      return originalNavigate('s-dash');
    }
    const result = originalNavigate(id);
    if (id === 's-sensores') setTimeout(renderSensors, 60);
    if (id === 's-historial') setTimeout(renderAlertAudit, 80);
    if (id === 's-usuarios') setTimeout(renderUsersFinal, 60);
    if (id === 's-validar') setTimeout(ensureValidationEnhancements, 60);
    return result;
  };
  window.__finalNavigateWrapped = true;
}

window.renderAlertAudit = renderAlertAudit;
window.keepAlertPending = keepAlertPending;
window.renderUsers = renderUsersFinal;
window.createUser = createUserFinal;
window.openUserRoleEditor = openUserRoleEditor;
window.saveUserRole = saveUserRole;
window.deleteUserFinal = deleteUserFinal;
window.renderSensors = renderSensors;
window.openSensorEditor = openSensorEditor;
window.saveSensor = saveSensor;
window.deactivateSensor = deactivateSensor;
window.reactivateSensor = reactivateSensor;
window.testSensor = testSensor;
window.refreshFinalRoleVisibility = refreshFinalRoleVisibility;

document.addEventListener('DOMContentLoaded', () => {
  ensureSensorStyles();
  ensureSensorScreen();
  ensureSensorNavItems();
  ensureSensorModal();
  ensureRoleModal();
  ensureTechnicalRoleOption();
  ensureValidationEnhancements();
  ensureAuditPanel();
  wrapNavigation();
  refreshFinalRoleVisibility();

  const observer = new MutationObserver(refreshFinalRoleVisibility);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

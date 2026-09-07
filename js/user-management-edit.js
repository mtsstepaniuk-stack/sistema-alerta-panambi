/**
 * Edición administrativa completa de usuarios.
 * Permite al Administrador corregir nombre, usuario, rol y restablecer la
 * contraseña de cuentas registradas. La cuenta principal `admin` conserva
 * sus credenciales protegidas para las pruebas académicas.
 */
import { apiRequest } from './api.js';
import { showToast, openModal, closeModal } from './modals.js';
import { currentUser, isAdmin, refreshUserMenu } from './auth.js';

const ROLE_OPTIONS = [
  'Operador Defensa Civil',
  'Operador Municipalidad',
  'Personal Técnico',
  'Administrador',
];

let managedUsers = [];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roleBadge(role) {
  if (role === 'Administrador') return 'badge-rojo';
  if (role === 'Personal Técnico') return 'badge-naranja';
  return 'badge-celeste';
}

function ensureEditModal() {
  if (document.getElementById('m-edit-user-full')) return;

  const modal = document.createElement('div');
  modal.id = 'm-edit-user-full';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:560px;">
      <div class="modal-icon" style="background:#EAF2FB;">👤</div>
      <div class="modal-title">Editar usuario</div>
      <div class="modal-desc" id="edit-user-summary">Modificá los datos de la cuenta seleccionada.</div>
      <input type="hidden" id="edit-user-id">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
        <div class="input-group">
          <label>Nombre *</label>
          <input id="edit-user-name" type="text" autocomplete="off">
        </div>
        <div class="input-group">
          <label>Usuario *</label>
          <input id="edit-user-username" type="text" autocomplete="off">
        </div>
        <div class="input-group" style="grid-column:1/-1;">
          <label>Nueva contraseña</label>
          <input id="edit-user-password" type="password" autocomplete="new-password" minlength="4" placeholder="Dejar vacío para conservar la actual">
          <div id="edit-user-password-help" style="font-size:10px;color:var(--texto-sub);margin-top:6px;line-height:1.4;">Usalo para restablecer la contraseña si el usuario la olvidó. Mínimo 4 caracteres.</div>
        </div>
        <div class="input-group" style="grid-column:1/-1;">
          <label>Rol *</label>
          <select id="edit-user-role">
            ${ROLE_OPTIONS.map(role => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="edit-user-protected-note" style="display:none;margin-top:12px;padding:9px 11px;border-radius:8px;background:rgba(230,126,34,.10);color:var(--naranja);font-size:10px;font-weight:700;line-height:1.4;">
        La cuenta admin mantiene fijo el usuario, la contraseña y el rol para las pruebas del sistema.
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" onclick="closeModal('m-edit-user-full')">Cancelar</button>
        <button class="btn btn-primary" type="button" onclick="saveManagedUserEdit()">Guardar cambios</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal('m-edit-user-full');
  });
  document.body.appendChild(modal);
}

async function renderManagedUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

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

    const currentId = Number(currentUser()?.id || 0);
    tbody.innerHTML = managedUsers.map(user => {
      const protectedDelete = user.usuario === 'admin' || Number(user.id) === currentId;
      return `
        <tr>
          <td><strong>${escapeHtml(user.nombre)}</strong></td>
          <td>${escapeHtml(user.usuario)}</td>
          <td><span class="badge ${roleBadge(user.rol)}">${escapeHtml(user.rol)}</span></td>
          <td><span class="badge badge-verde">Activo</span></td>
          <td>
            <div class="table-actions">
              <button class="btn btn-outline btn-sm" type="button" onclick="openManagedUserEdit(${Number(user.id)})">Editar</button>
              ${protectedDelete
                ? '<span style="font-size:11px;color:var(--texto-sub);">Protegido</span>'
                : `<button class="btn btn-danger btn-sm" type="button" onclick="deleteManagedUser(${Number(user.id)})">Eliminar</button>`}
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    showToast(error.message, true);
  }
}

function openManagedUserEdit(id) {
  ensureEditModal();
  const user = managedUsers.find(item => Number(item.id) === Number(id));
  if (!user) {
    showToast('Usuario no encontrado.', true);
    return;
  }

  const isMainAdmin = String(user.usuario).toLowerCase() === 'admin';
  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-user-summary').textContent = `${user.nombre} · ${user.usuario}`;
  document.getElementById('edit-user-name').value = user.nombre || '';
  document.getElementById('edit-user-username').value = user.usuario || '';
  document.getElementById('edit-user-password').value = '';
  document.getElementById('edit-user-role').value = user.rol || ROLE_OPTIONS[0];

  const username = document.getElementById('edit-user-username');
  const password = document.getElementById('edit-user-password');
  const role = document.getElementById('edit-user-role');
  const help = document.getElementById('edit-user-password-help');
  const note = document.getElementById('edit-user-protected-note');

  username.disabled = isMainAdmin;
  password.disabled = isMainAdmin;
  role.disabled = isMainAdmin;
  password.placeholder = isMainAdmin ? 'Contraseña protegida' : 'Dejar vacío para conservar la actual';
  help.textContent = isMainAdmin
    ? 'La contraseña de la cuenta admin está protegida.'
    : 'Usalo para restablecer la contraseña si el usuario la olvidó. Mínimo 4 caracteres.';
  note.style.display = isMainAdmin ? 'block' : 'none';

  openModal('m-edit-user-full');
}

async function saveManagedUserEdit() {
  const id = Number(document.getElementById('edit-user-id')?.value || 0);
  const user = managedUsers.find(item => Number(item.id) === id);
  if (!id || !user) return;

  const isMainAdmin = String(user.usuario).toLowerCase() === 'admin';
  const nombre = document.getElementById('edit-user-name')?.value.trim() || '';
  const usuario = isMainAdmin ? 'admin' : (document.getElementById('edit-user-username')?.value.trim() || '');
  const password = isMainAdmin ? '' : (document.getElementById('edit-user-password')?.value || '');
  const rol = isMainAdmin ? 'Administrador' : (document.getElementById('edit-user-role')?.value || '');

  if (!nombre || !usuario || !rol) {
    showToast('Nombre, usuario y rol son obligatorios.', true);
    return;
  }
  if (password && password.length < 4) {
    showToast('La nueva contraseña debe tener al menos 4 caracteres.', true);
    return;
  }

  try {
    const data = await apiRequest(`/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre, usuario, rol, ...(password ? { password } : {}) })
    });

    closeModal('m-edit-user-full');
    showToast(password ? 'Usuario y contraseña actualizados correctamente.' : 'Usuario actualizado correctamente.');

    if (Number(currentUser()?.id) === id && data.usuario) {
      localStorage.setItem('sat-user', JSON.stringify(data.usuario));
      refreshUserMenu();
    }

    await renderManagedUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteManagedUser(id) {
  const user = managedUsers.find(item => Number(item.id) === Number(id));
  const name = user?.nombre || 'este usuario';
  if (!confirm(`¿Eliminar a ${name} del sistema?`)) return;

  try {
    await apiRequest(`/usuarios/${id}`, { method: 'DELETE' });
    showToast('Usuario eliminado correctamente.');
    await renderManagedUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

function installOverrides() {
  if (window.__satFullUserEditorInstalled) return;
  window.__satFullUserEditorInstalled = true;

  // final-rfs registra primero sus extensiones. Se envuelve la navegación al
  // final para que esta tabla sea la última en renderizarse al abrir Usuarios.
  const previousNavigate = window.navigate;
  if (typeof previousNavigate === 'function') {
    window.navigate = function navigateWithFullUserEdit(id) {
      const result = previousNavigate(id);
      if (id === 's-usuarios') setTimeout(renderManagedUsers, 140);
      return result;
    };
  }

  const previousCreateUser = window.createUser;
  if (typeof previousCreateUser === 'function') {
    window.createUser = async function createUserAndRefresh(...args) {
      const result = await previousCreateUser(...args);
      await renderManagedUsers();
      return result;
    };
  }

  window.renderUsers = renderManagedUsers;
  window.openManagedUserEdit = openManagedUserEdit;
  window.saveManagedUserEdit = saveManagedUserEdit;
  window.deleteManagedUser = deleteManagedUser;

  if (document.getElementById('s-usuarios')?.classList.contains('active')) {
    renderManagedUsers();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(installOverrides, 0), { once: true });
} else {
  setTimeout(installOverrides, 0);
}

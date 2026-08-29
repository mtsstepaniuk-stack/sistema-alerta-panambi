/**
 * Administración de usuarios del sistema.
 */
import { apiRequest } from './api.js';
import { showToast } from './modals.js';
import { currentUser, isAdmin } from './auth.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (!isAdmin()) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--texto-sub);padding:22px;">Se requiere usuario administrador.</td></tr>`;
    return;
  }

  try {
    const data = await apiRequest('/usuarios');
    const users = data.usuarios || [];

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--texto-sub);padding:22px;">No hay usuarios registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const isCurrent = currentUser()?.id === user.id;
      const isProtected = user.usuario === 'admin' || isCurrent;
      return `
        <tr>
          <td><strong>${escapeHtml(user.nombre)}</strong></td>
          <td>${escapeHtml(user.usuario)}</td>
          <td><span class="badge ${user.rol === 'Administrador' ? 'badge-rojo' : 'badge-celeste'}">${escapeHtml(user.rol)}</span></td>
          <td><span class="badge badge-verde">Activo</span></td>
          <td>
            ${isProtected
              ? '<span style="font-size:12px;color:var(--texto-sub);">Protegido</span>'
              : `<button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})">Eliminar</button>`}
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    showToast(error.message, true);
  }
}

export async function createUser() {
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
    await renderUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

export async function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario del sistema?')) return;

  try {
    await apiRequest(`/usuarios/${id}`, { method: 'DELETE' });
    showToast('Usuario eliminado correctamente.');
    await renderUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

window.renderUsers = renderUsers;
window.createUser = createUser;
window.deleteUser = deleteUser;

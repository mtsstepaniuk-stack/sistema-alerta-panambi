/**
 * Login y menú de usuario contra backend local.
 */
import { apiRequest } from './api.js';
import { showToast } from './modals.js';

function initials(name = 'Usuario') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U';
}

/**
 * Evita que las credenciales de demostración aparezcan escritas al abrir la página.
 * También elimina los valores definidos originalmente en el HTML para que el usuario
 * tenga que completar usuario y contraseña manualmente.
 */
function prepareLoginInputs() {
  const userInput = document.getElementById('login-user');
  const passInput = document.getElementById('login-pass');

  if (userInput) {
    userInput.removeAttribute('value');
    userInput.defaultValue = '';
    userInput.value = '';
    userInput.setAttribute('autocomplete', 'off');
  }

  if (passInput) {
    passInput.removeAttribute('value');
    passInput.defaultValue = '';
    passInput.value = '';
    passInput.setAttribute('autocomplete', 'new-password');
  }
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('sat-user') || 'null');
  } catch {
    return null;
  }
}

export function isAdmin(user = currentUser()) {
  return user?.usuario === 'admin' || user?.rol === 'Administrador';
}

export function isTechnical(user = currentUser()) {
  return user?.rol === 'Personal Técnico';
}

function refreshRoleClass(user = currentUser()) {
  document.body.classList.toggle('admin-role', Boolean(user && isAdmin(user)));
  document.body.classList.toggle('technical-role', Boolean(user && isTechnical(user)));
}

export function refreshUserMenu() {
  const user = currentUser();
  refreshRoleClass(user);

  document.querySelectorAll('.topbar-user').forEach(box => {
    box.removeAttribute('onclick');
    box.className = 'topbar-user topbar-user-logout';

    if (!user) {
      box.innerHTML = '';
      return;
    }

    box.innerHTML = `
      <div class="topbar-current-user">
        <div class="topbar-avatar">${initials(user.nombre)}</div>
        <div>
          <span class="topbar-username">${user.nombre}</span>
          <span class="topbar-user-role">${user.rol || 'Usuario'}</span>
        </div>
      </div>
      <button type="button" class="logout-top-btn" onclick="logout()">Salir</button>
    `;
  });

  window.refreshFinalRoleVisibility?.();
}

export async function login() {
  const usuario = document.getElementById('login-user')?.value.trim();
  const password = document.getElementById('login-pass')?.value;

  if (!usuario || !password) {
    showToast('Ingrese usuario y contraseña.', true);
    return;
  }

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, password })
    });
    localStorage.setItem('sat-user', JSON.stringify(data.user));
    localStorage.setItem('sat-token', data.token || '');
    document.body.classList.remove('public-report-mode');
    refreshUserMenu();
    window.navigate('s-dash');
    showToast(`Bienvenido, ${data.user.nombre}.`);
  } catch (error) {
    showToast(error.message, true);
  }
}

export function logout() {
  localStorage.removeItem('sat-user');
  localStorage.removeItem('sat-token');
  document.body.classList.remove('public-report-mode', 'admin-role', 'technical-role');
  refreshUserMenu();
  window.navigate('s-login');
  prepareLoginInputs();
  showToast('Sesión cerrada correctamente.');
}

window.login = login;
window.logout = logout;
window.refreshUserMenu = refreshUserMenu;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', prepareLoginInputs, { once: true });
} else {
  prepareLoginInputs();
}

window.addEventListener('pageshow', prepareLoginInputs);

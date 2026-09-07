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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function ensureAccountStyles() {
  if (document.getElementById('sat-account-menu-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-account-menu-styles';
  style.textContent = `
    .topbar-user.topbar-user-menu {
      position: relative;
      padding: 0 !important;
      border-radius: 12px;
      overflow: visible;
      background: transparent !important;
    }

    .sat-user-menu-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 42px;
      padding: 4px 9px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease;
    }

    .sat-user-menu-trigger:hover,
    .sat-user-menu-trigger:focus-visible,
    .topbar-user-menu.is-open .sat-user-menu-trigger {
      background: rgba(255,255,255,.09);
      border-color: rgba(255,255,255,.10);
      outline: none;
    }

    .sat-user-menu-chevron {
      width: 14px;
      height: 14px;
      margin-left: 2px;
      color: rgba(255,255,255,.55);
      transition: transform .16s ease;
      flex: 0 0 14px;
    }

    .sat-user-menu-trigger[aria-expanded="true"] .sat-user-menu-chevron {
      transform: rotate(180deg);
    }

    .sat-user-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 1300;
      width: 255px;
      padding: 7px;
      border: 1px solid var(--gris-border);
      border-radius: 12px;
      background: var(--card-bg);
      color: var(--texto-base);
      box-shadow: 0 16px 42px rgba(4, 16, 28, .30);
    }

    .sat-user-dropdown[hidden] { display: none !important; }

    .sat-user-dropdown-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px 10px;
    }

    .sat-user-dropdown-head .topbar-avatar {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
    }

    .sat-user-dropdown-name {
      color: var(--texto-base);
      font-size: 12px;
      font-weight: 800;
      line-height: 1.25;
    }

    .sat-user-dropdown-role {
      margin-top: 2px;
      color: var(--texto-sub);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.25;
    }

    .sat-user-menu-separator {
      height: 1px;
      margin: 4px 3px;
      background: var(--gris-border);
      opacity: .7;
    }

    .sat-user-menu-item {
      width: 100%;
      min-height: 38px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--texto-base);
      font-family: 'Inter', Arial, sans-serif;
      font-size: 11px;
      font-weight: 700;
      text-align: left;
      cursor: pointer;
      transition: background .14s ease, color .14s ease;
    }

    .sat-user-menu-item:hover,
    .sat-user-menu-item:focus-visible {
      background: rgba(46,134,193,.10);
      color: var(--azul-mid);
      outline: none;
    }

    .sat-user-menu-item svg {
      width: 17px;
      height: 17px;
      flex: 0 0 17px;
    }

    .sat-user-menu-item.is-danger { color: #c0392b; }
    .sat-user-menu-item.is-danger:hover,
    .sat-user-menu-item.is-danger:focus-visible {
      background: rgba(192,57,43,.10);
      color: #e74c3c;
    }

    .sat-account-overlay {
      position: fixed;
      inset: 0;
      z-index: 4200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(5, 18, 32, .68);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    .sat-account-overlay.open { display: flex; }

    .sat-account-dialog {
      width: min(460px, calc(100vw - 32px));
      max-height: min(720px, calc(100vh - 40px));
      overflow: auto;
      border: 1px solid var(--gris-border);
      border-radius: 16px;
      background: var(--card-bg);
      color: var(--texto-base);
      box-shadow: 0 24px 70px rgba(0,0,0,.40);
    }

    .sat-account-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 17px 18px;
      border-bottom: 1px solid var(--gris-border);
    }

    .sat-account-heading {
      display: flex;
      align-items: center;
      gap: 11px;
    }

    .sat-account-heading-icon {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: rgba(46,134,193,.12);
      color: var(--celeste);
    }

    .sat-account-title {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.25;
    }

    .sat-account-subtitle {
      margin-top: 2px;
      color: var(--texto-sub);
      font-size: 10px;
      font-weight: 600;
    }

    .sat-account-close {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 1px solid var(--gris-border);
      border-radius: 9px;
      background: transparent;
      color: var(--texto-sub);
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }

    .sat-account-close:hover { background: rgba(127,143,160,.10); }

    .sat-account-body { padding: 18px; }

    .sat-account-profile {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding: 13px;
      border: 1px solid var(--gris-border);
      border-radius: 12px;
      background: rgba(46,134,193,.05);
    }

    .sat-account-profile-avatar {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--celeste), var(--azul-mid));
      color: #fff;
      font-size: 14px;
      font-weight: 800;
    }

    .sat-account-profile-name {
      font-size: 13px;
      font-weight: 800;
    }

    .sat-account-profile-role {
      margin-top: 2px;
      color: var(--texto-sub);
      font-size: 10px;
      font-weight: 600;
    }

    .sat-account-info-grid {
      display: grid;
      gap: 9px;
    }

    .sat-account-info-row {
      display: grid;
      grid-template-columns: 120px minmax(0,1fr);
      gap: 12px;
      align-items: center;
      min-height: 40px;
      padding: 8px 10px;
      border-radius: 9px;
      background: rgba(127,143,160,.07);
    }

    .sat-account-info-label {
      color: var(--texto-sub);
      font-size: 10px;
      font-weight: 700;
    }

    .sat-account-info-value {
      min-width: 0;
      color: var(--texto-base);
      font-size: 11px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .sat-account-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--verde-lt);
    }

    .sat-account-status::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }

    .sat-password-form {
      display: grid;
      gap: 13px;
    }

    .sat-password-field label {
      display: block;
      margin-bottom: 5px;
      color: var(--texto-base);
      font-size: 10px;
      font-weight: 800;
    }

    .sat-password-field input {
      width: 100%;
      min-height: 40px;
      padding: 9px 11px;
      border: 1px solid var(--gris-border);
      border-radius: 9px;
      background: var(--card-bg);
      color: var(--texto-base);
      font: inherit;
      font-size: 12px;
      outline: none;
    }

    .sat-password-field input:focus {
      border-color: var(--celeste);
      box-shadow: 0 0 0 3px rgba(46,134,193,.12);
    }

    .sat-password-help {
      margin-top: -2px;
      color: var(--texto-sub);
      font-size: 10px;
      line-height: 1.45;
    }

    .sat-account-actions {
      display: flex;
      justify-content: flex-end;
      gap: 9px;
      margin-top: 5px;
      padding-top: 14px;
      border-top: 1px solid var(--gris-border);
    }

    @media (max-width: 700px) {
      .sat-user-dropdown { width: min(255px, calc(100vw - 24px)); }
      .sat-user-menu-trigger { padding-inline: 6px; }
      .sat-user-menu-chevron { display: none; }
      .sat-account-info-row { grid-template-columns: 100px minmax(0,1fr); }
    }
  `;
  document.head.appendChild(style);
}

function closeUserMenus(except = null) {
  document.querySelectorAll('.topbar-user-menu.is-open').forEach(box => {
    if (box === except) return;
    box.classList.remove('is-open');
    const trigger = box.querySelector('.sat-user-menu-trigger');
    const menu = box.querySelector('.sat-user-dropdown');
    trigger?.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  });
}

function closeAccountOverlay(id) {
  document.getElementById(id)?.classList.remove('open');
}

function ensureAccountOverlays() {
  ensureAccountStyles();

  if (!document.getElementById('sat-account-info-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'sat-account-info-overlay';
    overlay.className = 'sat-account-overlay';
    overlay.innerHTML = `
      <div class="sat-account-dialog" role="dialog" aria-modal="true" aria-labelledby="sat-account-info-title">
        <div class="sat-account-header">
          <div class="sat-account-heading">
            <div class="sat-account-heading-icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </div>
            <div>
              <div class="sat-account-title" id="sat-account-info-title">Información de cuenta</div>
              <div class="sat-account-subtitle">Datos de la sesión actual</div>
            </div>
          </div>
          <button type="button" class="sat-account-close" data-close-account="sat-account-info-overlay" aria-label="Cerrar">×</button>
        </div>
        <div class="sat-account-body">
          <div class="sat-account-profile">
            <div class="sat-account-profile-avatar" id="sat-account-profile-avatar">U</div>
            <div>
              <div class="sat-account-profile-name" id="sat-account-profile-name">Usuario</div>
              <div class="sat-account-profile-role" id="sat-account-profile-role">Rol</div>
            </div>
          </div>
          <div class="sat-account-info-grid">
            <div class="sat-account-info-row"><span class="sat-account-info-label">Usuario</span><span class="sat-account-info-value" id="sat-account-info-user">—</span></div>
            <div class="sat-account-info-row"><span class="sat-account-info-label">Nombre</span><span class="sat-account-info-value" id="sat-account-info-name">—</span></div>
            <div class="sat-account-info-row"><span class="sat-account-info-label">Rol</span><span class="sat-account-info-value" id="sat-account-info-role">—</span></div>
            <div class="sat-account-info-row"><span class="sat-account-info-label">ID interno</span><span class="sat-account-info-value" id="sat-account-info-id">—</span></div>
            <div class="sat-account-info-row"><span class="sat-account-info-label">Estado</span><span class="sat-account-info-value"><span class="sat-account-status">Sesión activa</span></span></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById('sat-password-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'sat-password-overlay';
    overlay.className = 'sat-account-overlay';
    overlay.innerHTML = `
      <div class="sat-account-dialog" role="dialog" aria-modal="true" aria-labelledby="sat-password-title">
        <div class="sat-account-header">
          <div class="sat-account-heading">
            <div class="sat-account-heading-icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </div>
            <div>
              <div class="sat-account-title" id="sat-password-title">Cambiar contraseña</div>
              <div class="sat-account-subtitle">Actualizá la clave de tu cuenta</div>
            </div>
          </div>
          <button type="button" class="sat-account-close" data-close-account="sat-password-overlay" aria-label="Cerrar">×</button>
        </div>
        <div class="sat-account-body">
          <form class="sat-password-form" id="sat-password-form" autocomplete="off">
            <div class="sat-password-field">
              <label for="sat-current-password">Contraseña actual</label>
              <input id="sat-current-password" type="password" autocomplete="current-password" required>
            </div>
            <div class="sat-password-field">
              <label for="sat-new-password">Nueva contraseña</label>
              <input id="sat-new-password" type="password" autocomplete="new-password" minlength="4" required>
            </div>
            <div class="sat-password-field">
              <label for="sat-confirm-password">Repetir nueva contraseña</label>
              <input id="sat-confirm-password" type="password" autocomplete="new-password" minlength="4" required>
            </div>
            <div class="sat-password-help">La nueva contraseña debe tener al menos 4 caracteres y no puede ser igual a la actual.</div>
            <div class="sat-account-actions">
              <button type="button" class="btn btn-outline btn-sm" data-close-account="sat-password-overlay">Cancelar</button>
              <button type="submit" class="btn btn-primary btn-sm" id="sat-password-save">Guardar contraseña</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#sat-password-form')?.addEventListener('submit', changePassword);
  }

  if (!window.__satAccountOverlayEventsInstalled) {
    document.addEventListener('click', event => {
      const closeButton = event.target.closest?.('[data-close-account]');
      if (closeButton) {
        closeAccountOverlay(closeButton.dataset.closeAccount);
        return;
      }

      if (event.target.classList?.contains('sat-account-overlay')) {
        event.target.classList.remove('open');
      }

      if (!event.target.closest?.('.topbar-user-menu')) closeUserMenus();
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      closeUserMenus();
      document.querySelectorAll('.sat-account-overlay.open').forEach(overlay => overlay.classList.remove('open'));
    });

    window.__satAccountOverlayEventsInstalled = true;
  }
}

function openAccountInfo() {
  ensureAccountOverlays();
  closeUserMenus();

  const user = currentUser();
  if (!user) return;

  const values = {
    'sat-account-profile-avatar': initials(user.nombre),
    'sat-account-profile-name': user.nombre || 'Usuario',
    'sat-account-profile-role': user.rol || 'Usuario',
    'sat-account-info-user': user.usuario || '—',
    'sat-account-info-name': user.nombre || '—',
    'sat-account-info-role': user.rol || '—',
    'sat-account-info-id': user.id ?? '—',
  };

  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  });

  document.getElementById('sat-account-info-overlay')?.classList.add('open');
}

function openPasswordChange() {
  ensureAccountOverlays();
  closeUserMenus();

  ['sat-current-password', 'sat-new-password', 'sat-confirm-password'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.value = '';
      input.type = 'password';
    }
  });

  document.getElementById('sat-password-overlay')?.classList.add('open');
  setTimeout(() => document.getElementById('sat-current-password')?.focus(), 40);
}

async function changePassword(event) {
  event.preventDefault();

  const currentPassword = document.getElementById('sat-current-password')?.value || '';
  const newPassword = document.getElementById('sat-new-password')?.value || '';
  const confirmPassword = document.getElementById('sat-confirm-password')?.value || '';
  const saveButton = document.getElementById('sat-password-save');

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Complete los tres campos de contraseña.', true);
    return;
  }
  if (newPassword.length < 4) {
    showToast('La nueva contraseña debe tener al menos 4 caracteres.', true);
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('Las nuevas contraseñas no coinciden.', true);
    return;
  }
  if (newPassword === currentPassword) {
    showToast('La nueva contraseña debe ser distinta de la actual.', true);
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando…';
  }

  try {
    await apiRequest('/auth/password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    closeAccountOverlay('sat-password-overlay');
    showToast('Contraseña actualizada correctamente.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Guardar contraseña';
    }
  }
}

function renderUserMenu(box, user) {
  const safeName = escapeHtml(user.nombre || 'Usuario');
  const safeRole = escapeHtml(user.rol || 'Usuario');
  const safeInitials = escapeHtml(initials(user.nombre));

  box.className = 'topbar-user topbar-user-menu';
  box.innerHTML = `
    <button type="button" class="sat-user-menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Abrir menú de cuenta de ${safeName}">
      <div class="topbar-avatar">${safeInitials}</div>
      <div class="topbar-current-user">
        <div>
          <span class="topbar-username">${safeName}</span>
          <span class="topbar-user-role">${safeRole}</span>
        </div>
      </div>
      <svg class="sat-user-menu-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>

    <div class="sat-user-dropdown" role="menu" hidden>
      <div class="sat-user-dropdown-head">
        <div class="topbar-avatar">${safeInitials}</div>
        <div>
          <div class="sat-user-dropdown-name">${safeName}</div>
          <div class="sat-user-dropdown-role">${safeRole}</div>
        </div>
      </div>
      <div class="sat-user-menu-separator"></div>
      <button type="button" class="sat-user-menu-item" data-account-action="info" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Información de cuenta
      </button>
      <button type="button" class="sat-user-menu-item" data-account-action="password" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Cambiar contraseña
      </button>
      <div class="sat-user-menu-separator"></div>
      <button type="button" class="sat-user-menu-item is-danger" data-account-action="logout" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Cerrar sesión
      </button>
    </div>
  `;

  const trigger = box.querySelector('.sat-user-menu-trigger');
  const menu = box.querySelector('.sat-user-dropdown');

  trigger?.addEventListener('click', event => {
    event.stopPropagation();
    const opening = !box.classList.contains('is-open');
    closeUserMenus(opening ? box : null);
    box.classList.toggle('is-open', opening);
    trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (menu) menu.hidden = !opening;
  });

  box.querySelector('[data-account-action="info"]')?.addEventListener('click', openAccountInfo);
  box.querySelector('[data-account-action="password"]')?.addEventListener('click', openPasswordChange);
  box.querySelector('[data-account-action="logout"]')?.addEventListener('click', () => logout());
}

export function refreshUserMenu() {
  const user = currentUser();
  refreshRoleClass(user);
  ensureAccountStyles();

  document.querySelectorAll('.topbar-user').forEach(box => {
    box.removeAttribute('onclick');

    if (!user) {
      box.className = 'topbar-user';
      box.innerHTML = '';
      return;
    }

    renderUserMenu(box, user);
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

export async function logout() {
  closeUserMenus();
  document.querySelectorAll('.sat-account-overlay.open').forEach(overlay => overlay.classList.remove('open'));

  try {
    if (localStorage.getItem('sat-token')) {
      await apiRequest('/auth/logout', { method: 'POST' });
    }
  } catch (error) {
    // Aunque el servidor no responda, el cierre local debe completarse.
    console.warn('No se pudo invalidar la sesión remota:', error.message);
  } finally {
    localStorage.removeItem('sat-user');
    localStorage.removeItem('sat-token');
    localStorage.removeItem('sat-last-screen');
    document.body.classList.remove('public-report-mode', 'admin-role', 'technical-role');
    refreshUserMenu();
    window.navigate('s-login');
    prepareLoginInputs();
    showToast('Sesión cerrada correctamente.');
  }
}

window.login = login;
window.logout = logout;
window.refreshUserMenu = refreshUserMenu;
window.openAccountInfo = openAccountInfo;
window.openPasswordChange = openPasswordChange;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', prepareLoginInputs, { once: true });
} else {
  prepareLoginInputs();
}

window.addEventListener('pageshow', prepareLoginInputs);

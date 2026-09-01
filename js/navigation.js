/**
 * Navigation Module
 * Controls screen visibility and navigation link active states.
 */
import { currentUser, isAdmin } from './auth.js';

function isLoggedIn() {
  return Boolean(currentUser());
}

export function navigate(id) {
  const user = currentUser();

  // El reporte vecinal es público: no pertenece al panel de operadores.
  if (id === 's-reporte' && isLoggedIn()) {
    id = 's-dash';
  }

  // El resto del sistema requiere sesión.
  if (!isLoggedIn() && id !== 's-login' && id !== 's-reporte') {
    id = 's-login';
  }

  // La administración de usuarios es exclusiva del admin.
  if (id === 's-usuarios' && !isAdmin(user)) {
    id = 's-dash';
  }

  const targetScreen = document.getElementById(id);
  if (!targetScreen) {
    console.error(`Screen with ID "${id}" not found.`);
    return;
  }

  if (id !== 's-reporte') {
    document.body.classList.remove('public-report-mode');
  }

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  targetScreen.classList.add('active');

  if (id === 's-dash') {
    setTimeout(() => window.initDashboard?.(), 80);
  }

  if (id === 's-validar') {
    setTimeout(() => window.renderPendingAlert?.(), 80);
  }

  if (id === 's-emit') {
    setTimeout(() => window.resetEmitForm?.(), 0);
  }

  if (id === 's-usuarios') {
    setTimeout(() => window.renderUsers?.(), 0);
  }

  if (id === 's-historial') {
    setTimeout(() => window.renderHistory?.(), 80);
  }

  window.scrollTo({ top: 0, behavior: 'instant' });

  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    const onclickStr = item.getAttribute('onclick') || '';
    if (onclickStr.includes(id)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Los módulos del mapa y otros complementos escuchan este evento para
  // recalcular su contenido después de una navegación con la sesión ya cargada.
  window.dispatchEvent(new CustomEvent('sat:navigate', { detail: { id } }));
}

export function openPublicReport() {
  localStorage.removeItem('sat-user');
  localStorage.removeItem('sat-token');
  document.body.classList.remove('admin-role', 'technical-role');
  document.body.classList.add('public-report-mode');
  window.refreshFinalRoleVisibility?.();
  window.resetReporte?.();
  navigate('s-reporte');
}

export function goLogin() {
  document.body.classList.remove('public-report-mode');
  navigate('s-login');
}

window.navigate = navigate;
window.openPublicReport = openPublicReport;
window.goLogin = goLogin;

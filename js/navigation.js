/**
 * Navigation Module
 * Controls screen visibility and navigation link active states.
 */
import { currentUser, isAdmin } from './auth.js';
import { renderContacts } from './contacts.js';

function isLoggedIn() {
  return Boolean(currentUser());
}

function rememberPrivateScreen(id) {
  if (!isLoggedIn()) return;
  if (id === 's-login' || id === 's-reporte') return;
  localStorage.setItem('sat-last-screen', id);
}

export function restorePrivateScreen() {
  const user = currentUser();
  const token = localStorage.getItem('sat-token');
  if (!user || !token) return false;

  let id = localStorage.getItem('sat-last-screen') || 's-dash';

  // Si la pantalla guardada ya no existe o no pertenece al área privada,
  // se vuelve de forma segura al dashboard.
  if (!document.getElementById(id) || id === 's-login' || id === 's-reporte') {
    id = 's-dash';
  }

  if (id === 's-usuarios' && !isAdmin(user)) {
    id = 's-dash';
  }

  navigate(id);
  return true;
}

export function navigate(id) {
  const user = currentUser();

  const neighbor = user?.rol === 'Vecino';

  // El reporte vecinal requiere una cuenta de vecino autenticada.
  if (id === 's-reporte' && !neighbor) {
    id = isLoggedIn() ? 's-dash' : 's-login';
  }

  // Un vecino autenticado sólo accede a su formulario de reporte.
  if (neighbor && id !== 's-reporte' && id !== 's-login') {
    id = 's-reporte';
  }

  // El resto del sistema requiere sesión.
  if (!isLoggedIn() && id !== 's-login') {
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
  rememberPrivateScreen(id);

  if (id === 's-dash') {
    setTimeout(() => window.initDashboard?.(), 80);
  }

  if (id === 's-validar') {
    setTimeout(() => window.renderPendingAlert?.(), 80);
  }

  if (id === 's-emit') {
    setTimeout(() => window.resetEmitForm?.(), 0);
  }

  if (id === 's-contactos') {
    setTimeout(() => renderContacts(), 80);
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
  // Compatibilidad: el acceso público ya no abre el formulario.
  window.openNeighborRegistration?.();
}

export function goLogin() {
  document.body.classList.remove('public-report-mode');
  if (currentUser()?.rol === 'Vecino') {
    window.logout?.();
    return;
  }
  navigate('s-login');
}

window.navigate = navigate;
window.restorePrivateScreen = restorePrivateScreen;
window.openPublicReport = openPublicReport;
window.goLogin = goLogin;

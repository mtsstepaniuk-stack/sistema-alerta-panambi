/*
 * Mantiene fijo el orden del bloque Gestión en TODAS las pantallas.
 *
 * La causa del intercambio Sensores/Historial era que, en la pantalla que ya
 * estaba activa, algunos ítems del menú no tienen atributo onclick. Por eso las
 * correcciones anteriores no encontraban "Historial" en su propia pantalla y
 * Sensores terminaba agregándose después.
 *
 * Esta versión identifica cada opción por destino O por su texto visible y
 * normaliza físicamente el DOM en el orden definitivo:
 * Contactos · Usuarios · Sensores · Historial.
 */

function normalizeLabel(value = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findNavItem(sidebar, screenId, label) {
  const items = Array.from(sidebar.querySelectorAll(':scope > .nav-item'));

  const byTarget = items.find(item =>
    (item.getAttribute('onclick') || '').includes(screenId)
  );
  if (byTarget) return byTarget;

  const wanted = normalizeLabel(label);
  return items.find(item => {
    const text = normalizeLabel(item.textContent || '');
    return text === wanted || text.startsWith(`${wanted} `);
  }) || null;
}

function findManagementTitle(sidebar) {
  return Array.from(sidebar.querySelectorAll(':scope > .nav-section-title')).find(title =>
    normalizeLabel(title.textContent) === 'gestión'
  ) || null;
}

function ensureOrderStyles() {
  if (document.getElementById('sat-sidebar-order-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-sidebar-order-styles';
  style.textContent = `
    /* Respaldo visual: incluso si otro módulo toca el DOM, Gestión conserva
       siempre este orden. */
    .sidebar > .nav-item[data-sat-nav="contactos"] { order: 700 !important; }
    .sidebar > .nav-item[data-sat-nav="usuarios"]  { order: 800 !important; }
    .sidebar > .nav-item[data-sat-nav="sensores"]  { order: 900 !important; }
    .sidebar > .nav-item[data-sat-nav="historial"] { order: 1000 !important; }
  `;
  document.head.appendChild(style);
}

function normalizeSidebar(sidebar) {
  const managementTitle = findManagementTitle(sidebar);
  if (!managementTitle) return;

  const contacts = findNavItem(sidebar, 's-contactos', 'Contactos');
  const users = findNavItem(sidebar, 's-usuarios', 'Usuarios');
  const sensors = sidebar.querySelector(':scope > .sensor-nav-item')
    || findNavItem(sidebar, 's-sensores', 'Sensores');
  const history = findNavItem(sidebar, 's-historial', 'Historial');

  if (contacts) {
    contacts.dataset.satNav = 'contactos';
    contacts.style.setProperty('order', '700', 'important');
  }
  if (users) {
    users.dataset.satNav = 'usuarios';
    users.style.setProperty('order', '800', 'important');
  }
  if (sensors) {
    sensors.dataset.satNav = 'sensores';
    sensors.style.setProperty('order', '900', 'important');
  }
  if (history) {
    history.dataset.satNav = 'historial';
    history.style.setProperty('order', '1000', 'important');
  }

  // El orden físico del DOM también queda fijo. Esto corrige específicamente
  // la pantalla Historial, cuyo ítem activo no trae onclick en el HTML original.
  const desired = [contacts, users, sensors, history].filter(Boolean);
  if (!desired.length) return;

  let previous = managementTitle;
  const alreadyCorrect = desired.every(item => {
    const correct = previous.nextElementSibling === item;
    previous = item;
    return correct;
  });

  if (!alreadyCorrect) {
    managementTitle.after(...desired);
  }
}

function normalizeSidebarOrder() {
  ensureOrderStyles();
  document.querySelectorAll('.sidebar').forEach(normalizeSidebar);
}

normalizeSidebarOrder();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', normalizeSidebarOrder, { once: true });
}

// Antes de navegar dejamos todas las copias del menú normalizadas.
document.addEventListener('click', event => {
  if (!event.target.closest?.('.sidebar .nav-item')) return;
  normalizeSidebarOrder();
}, true);

// Y después de navegar volvemos a comprobar la pantalla recién visible.
window.addEventListener('sat:navigate', normalizeSidebarOrder);

// Sensores se crea dinámicamente desde final-rfs.js. Cuando aparece, se lo
// coloca inmediatamente entre Usuarios e Historial sin depender del onclick.
let scheduled = false;
const observer = new MutationObserver(mutations => {
  const relevant = mutations.some(mutation =>
    mutation.type === 'childList' &&
    mutation.target instanceof Element &&
    (mutation.target.matches?.('.sidebar') || mutation.target.closest?.('.sidebar'))
  );
  if (!relevant || scheduled) return;

  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    normalizeSidebarOrder();
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

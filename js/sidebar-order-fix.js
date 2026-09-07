/*
 * Mantiene estable el orden visual del bloque Gestión.
 * Cada pantalla privada tiene su propia copia del sidebar y Sensores se agrega
 * dinámicamente. Para que el orden no dependa de qué pantalla esté activa,
 * fijamos la posición VISUAL con flex-order y además normalizamos el DOM.
 */

function ensureOrderStyles() {
  if (document.getElementById('sat-sidebar-order-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-sidebar-order-styles';
  style.textContent = `
    /* El resto del sidebar mantiene order: 0. Estas dos opciones quedan siempre
       al final del bloque Gestión y en este orden, aunque su DOM cambie. */
    .sidebar > .sensor-nav-item,
    .sidebar > .nav-item[onclick*="s-sensores"] {
      order: 900 !important;
    }

    .sidebar > .nav-item[onclick*="s-historial"] {
      order: 901 !important;
    }
  `;
  document.head.appendChild(style);
}

function findNavItem(sidebar, screenId) {
  return Array.from(sidebar.querySelectorAll('.nav-item')).find(item =>
    (item.getAttribute('onclick') || '').includes(screenId)
  ) || null;
}

function normalizeSidebar(sidebar) {
  const sensor = sidebar.querySelector('.sensor-nav-item') || findNavItem(sidebar, 's-sensores');
  const history = findNavItem(sidebar, 's-historial');

  // Si Sensores todavía no fue creado, el CSS ya deja preparada la regla.
  if (!history) return;

  history.style.setProperty('order', '901', 'important');

  if (!sensor) return;

  sensor.style.setProperty('order', '900', 'important');

  // También dejamos el DOM en el mismo orden para accesibilidad y consistencia.
  if (sensor.nextElementSibling !== history) {
    history.before(sensor);
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

// Se corrige antes de navegar y nuevamente después de cambiar de pantalla.
document.addEventListener('click', event => {
  if (!event.target.closest?.('.sidebar .nav-item')) return;
  normalizeSidebarOrder();
}, true);

window.addEventListener('sat:navigate', normalizeSidebarOrder);

// Sensores puede aparecer después del arranque. Este observer solo vuelve a
// aplicar el orden cuando cambian hijos dentro de un sidebar.
const observer = new MutationObserver(mutations => {
  if (!mutations.some(mutation =>
    mutation.type === 'childList' &&
    mutation.target instanceof Element &&
    (mutation.target.matches?.('.sidebar') || mutation.target.closest?.('.sidebar'))
  )) return;

  normalizeSidebarOrder();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

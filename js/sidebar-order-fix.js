/*
 * Mantiene estable el orden de las opciones del bloque Gestión.
 * Cada pantalla privada posee su propia copia del sidebar. Sensores se agrega
 * dinámicamente, por eso el orden debe corregirse ANTES de cambiar de pantalla
 * y también si algún módulo vuelve a tocar el DOM.
 */

function findNavItem(sidebar, screenId) {
  return Array.from(sidebar.querySelectorAll('.nav-item')).find(item =>
    (item.getAttribute('onclick') || '').includes(screenId)
  ) || null;
}

function normalizeSidebar(sidebar) {
  const sensor = sidebar.querySelector('.sensor-nav-item') || findNavItem(sidebar, 's-sensores');
  const history = findNavItem(sidebar, 's-historial');
  if (!sensor || !history) return;

  // Orden definitivo dentro de Gestión: Contactos · Usuarios · Sensores · Historial.
  // history.before(sensor) funciona tanto si Sensores estaba arriba como abajo.
  if (sensor.nextElementSibling !== history) {
    history.before(sensor);
  }
}

function normalizeSidebarOrder() {
  document.querySelectorAll('.sidebar').forEach(normalizeSidebar);
}

// Se ejecuta inmediatamente: no esperamos a navegar para corregir las copias
// de sidebar que ya existen en el DOM.
normalizeSidebarOrder();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', normalizeSidebarOrder, { once: true });
}

// IMPORTANTE: los links usan onclick inline. En fase de captura ordenamos TODOS
// los sidebars antes de que ese onclick cambie la pantalla activa. Así Historial
// y Sensores nunca pueden aparecer intercambiados al entrar a otra pantalla.
document.addEventListener('click', event => {
  if (!event.target.closest?.('.sidebar .nav-item')) return;
  normalizeSidebarOrder();
}, true);

// También corregimos cualquier copia creada o modificada dinámicamente. Se usa
// un bloqueo pequeño para no entrar en bucle cuando nosotros mismos movemos el nodo.
let normalizing = false;
const observer = new MutationObserver(mutations => {
  if (normalizing) return;

  const relevant = mutations.some(mutation => {
    if (mutation.type === 'childList') {
      return mutation.target instanceof Element && (
        mutation.target.matches?.('.sidebar') || mutation.target.closest?.('.sidebar')
      );
    }
    if (mutation.type === 'attributes') {
      return mutation.target instanceof Element && mutation.target.classList?.contains('screen');
    }
    return false;
  });

  if (!relevant) return;
  normalizing = true;
  try {
    normalizeSidebarOrder();
  } finally {
    queueMicrotask(() => { normalizing = false; });
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class'],
});

window.addEventListener('sat:navigate', normalizeSidebarOrder);

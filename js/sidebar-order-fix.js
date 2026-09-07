/*
 * Mantiene estable el orden de las opciones del bloque Gestión.
 * Cada pantalla privada posee su propia copia del sidebar; Sensores se agrega
 * dinámicamente, por eso normalizamos todas las copias para que no cambien de
 * posición al navegar entre Historial y Sensores.
 */

function normalizeSidebarOrder() {
  document.querySelectorAll('.sidebar').forEach(sidebar => {
    const items = Array.from(sidebar.querySelectorAll('.nav-item'));
    const sensor = sidebar.querySelector('.sensor-nav-item')
      || items.find(item => (item.getAttribute('onclick') || '').includes('s-sensores'));
    const history = items.find(item => (item.getAttribute('onclick') || '').includes('s-historial'));

    if (!sensor || !history || sensor.nextElementSibling === history) return;

    // Orden fijo del bloque Gestión: Contactos · Usuarios · Sensores · Historial.
    history.before(sensor);
  });
}

function scheduleNormalize() {
  setTimeout(normalizeSidebarOrder, 0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleNormalize, { once: true });
} else {
  scheduleNormalize();
}

// Algunas pantallas se crean dinámicamente durante el arranque. Una segunda
// pasada corta cubre ese caso sin mantener observers permanentes.
setTimeout(normalizeSidebarOrder, 120);

window.addEventListener('sat:navigate', scheduleNormalize);

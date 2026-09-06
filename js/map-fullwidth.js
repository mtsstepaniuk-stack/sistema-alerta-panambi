// Ajustes de layout del mapa y del dashboard principal.
// El mapa no debe forzar el ancho mínimo de la columna izquierda ni desplazar
// el panel de Alertas recientes fuera de la pantalla.
const styleId = 'sat-map-fullwidth-style';

if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /*
     * Leaflet contiene elementos posicionados y mosaicos con dimensiones
     * propias. En un CSS Grid, la columna flexible debe poder encogerse a 0;
     * de lo contrario puede crecer por su contenido y empujar .dash-right
     * fuera del viewport.
     */
    #s-dash .dash-grid,
    #s-dash .dash-left,
    #s-dash .dash-right,
    #s-dash .dash-left > .card,
    #s-dash #real-map.real-map {
      min-width: 0 !important;
    }

    @media (min-width: 1201px) {
      #s-dash .dash-grid {
        grid-template-columns: minmax(0, 1fr) 320px !important;
      }
    }

    #s-dash #real-map.real-map {
      width: 100% !important;
      max-width: 100% !important;
      height: 380px !important;
      max-height: none !important;
      min-height: 380px !important;
      display: block !important;
      overflow: hidden !important;
      position: relative !important;
    }

    #s-dash #real-map .sat-leaflet-map,
    #s-dash #real-map .sat-upstream-map,
    #s-dash #real-map .leaflet-container {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      min-height: 380px !important;
      min-width: 0 !important;
    }

    @media (max-width: 700px) {
      #s-dash #real-map.real-map {
        height: 340px !important;
        min-height: 340px !important;
      }

      #s-dash #real-map .sat-leaflet-map,
      #s-dash #real-map .sat-upstream-map,
      #s-dash #real-map .leaflet-container {
        min-height: 340px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/*
 * Leaflet calcula qué mosaicos cargar según el tamaño del contenedor en el
 * momento de crear el mapa. Si el grid termina de acomodarse unos milisegundos
 * después, puede quedar el efecto de "mapa cortado". Observamos el tamaño del
 * host y avisamos al mapa mediante el evento resize que ya escucha
 * sensor-map-fix.js.
 */
let mapSizeObserver = null;
let observedMapHost = null;
let lastMapWidth = 0;
let lastMapHeight = 0;

function notifyMapResize() {
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function observeMapSize() {
  const host = document.getElementById('real-map');
  if (!host || typeof ResizeObserver === 'undefined') return;
  if (host === observedMapHost && mapSizeObserver) return;

  mapSizeObserver?.disconnect();
  observedMapHost = host;
  const rect = host.getBoundingClientRect();
  lastMapWidth = rect.width;
  lastMapHeight = rect.height;

  mapSizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (Math.abs(width - lastMapWidth) < 1 && Math.abs(height - lastMapHeight) < 1) return;
    lastMapWidth = width;
    lastMapHeight = height;
    notifyMapResize();
  });
  mapSizeObserver.observe(host);

  // Reajustes de seguridad después de que termine de asentarse el layout.
  [80, 250, 700, 1400].forEach(delay => setTimeout(notifyMapResize, delay));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeMapSize, { once: true });
} else {
  observeMapSize();
}

window.addEventListener('sat:navigate', () => {
  observeMapSize();
  [60, 220, 600].forEach(delay => setTimeout(notifyMapResize, delay));
});

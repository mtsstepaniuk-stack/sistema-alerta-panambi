// Ajustes de layout del mapa y del dashboard principal.
// Mantiene la columna derecha visible, agrega un fallback estructural de
// Leaflet y corrige la deformación horizontal de los textos del gráfico SVG.
const styleId = 'sat-map-fullwidth-style';

if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /*
     * Leaflet depende de estas reglas estructurales para posicionar cada
     * mosaico. Se incluyen localmente como respaldo: si la hoja externa tarda
     * o no carga, los tiles no quedan apilados/separados como bloques.
     */
    .leaflet-pane,
    .leaflet-tile,
    .leaflet-marker-icon,
    .leaflet-marker-shadow,
    .leaflet-tile-container,
    .leaflet-pane > svg,
    .leaflet-pane > canvas,
    .leaflet-zoom-box,
    .leaflet-image-layer,
    .leaflet-layer {
      position: absolute;
      left: 0;
      top: 0;
    }

    .leaflet-container {
      overflow: hidden;
      position: relative;
      outline: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .leaflet-tile,
    .leaflet-marker-icon,
    .leaflet-marker-shadow {
      user-select: none;
      -webkit-user-drag: none;
    }

    .leaflet-tile {
      visibility: hidden;
      max-width: none !important;
      max-height: none !important;
    }

    .leaflet-tile-loaded { visibility: inherit; }
    .leaflet-marker-icon,
    .leaflet-marker-shadow { display: block; }

    .leaflet-container .leaflet-overlay-pane svg,
    .leaflet-container .leaflet-marker-pane img,
    .leaflet-container .leaflet-shadow-pane img,
    .leaflet-container .leaflet-tile-pane img,
    .leaflet-container img.leaflet-image-layer,
    .leaflet-container .leaflet-tile {
      max-width: none !important;
      max-height: none !important;
      width: auto;
      padding: 0;
    }

    .leaflet-pane { z-index: 400; }
    .leaflet-tile-pane { z-index: 200; }
    .leaflet-overlay-pane { z-index: 400; }
    .leaflet-shadow-pane { z-index: 500; }
    .leaflet-marker-pane { z-index: 600; }
    .leaflet-tooltip-pane { z-index: 650; }
    .leaflet-popup-pane { z-index: 700; }
    .leaflet-map-pane canvas { z-index: 100; }
    .leaflet-map-pane svg { z-index: 200; }

    .leaflet-control {
      position: relative;
      z-index: 800;
      pointer-events: auto;
    }

    .leaflet-top,
    .leaflet-bottom {
      position: absolute;
      z-index: 1000;
      pointer-events: none;
    }

    .leaflet-top { top: 0; }
    .leaflet-right { right: 0; }
    .leaflet-bottom { bottom: 0; }
    .leaflet-left { left: 0; }
    .leaflet-control { float: left; clear: both; }
    .leaflet-right .leaflet-control { float: right; }
    .leaflet-top .leaflet-control { margin-top: 10px; }
    .leaflet-bottom .leaflet-control { margin-bottom: 10px; }
    .leaflet-left .leaflet-control { margin-left: 10px; }
    .leaflet-right .leaflet-control { margin-right: 10px; }

    /*
     * Leaflet contiene elementos posicionados y mosaicos con dimensiones
     * propias. En un CSS Grid, la columna flexible debe poder encogerse a 0;
     * de lo contrario puede crecer por su contenido y empujar .dash-right.
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

    /*
     * El SVG del gráfico usa preserveAspectRatio="none" para que la curva
     * ocupe toda la tarjeta. Eso estira también las letras. Aplicamos una
     * corrección horizontal sólo al texto, conservando la curva a ancho total.
     */
    #s-dash .chart-svg text {
      transform-box: fill-box;
      transform-origin: center center;
      transform: scaleX(var(--sat-chart-text-scale-x, 1));
      letter-spacing: 0;
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

let mapSizeObserver = null;
let observedMapHost = null;
let lastMapWidth = 0;
let lastMapHeight = 0;
let chartResizeObserver = null;
let observedChart = null;

function normalizeChartText() {
  const svg = document.querySelector('#s-dash .chart-svg');
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox?.baseVal;
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0 || rect.width <= 0 || rect.height <= 0) return;

  const scaleX = rect.width / viewBox.width;
  const scaleY = rect.height / viewBox.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return;

  // Compensa únicamente la deformación horizontal que produce el SVG.
  const correction = Math.max(0.42, Math.min(1.5, scaleY / scaleX));
  svg.style.setProperty('--sat-chart-text-scale-x', correction.toFixed(4));
}

function observeChartSize() {
  const svg = document.querySelector('#s-dash .chart-svg');
  if (!svg) return;

  normalizeChartText();
  if (typeof ResizeObserver === 'undefined') return;
  if (svg === observedChart && chartResizeObserver) return;

  chartResizeObserver?.disconnect();
  observedChart = svg;
  chartResizeObserver = new ResizeObserver(() => normalizeChartText());
  chartResizeObserver.observe(svg);
}

function notifyMapResize() {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    normalizeChartText();
  });
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

  // Reajustes después de que termine de asentarse el grid y Leaflet.
  [80, 250, 700, 1400].forEach(delay => setTimeout(notifyMapResize, delay));
}

function initDashboardVisualFixes() {
  observeMapSize();
  observeChartSize();
  [50, 180, 500, 1100].forEach(delay => setTimeout(() => {
    normalizeChartText();
    notifyMapResize();
  }, delay));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardVisualFixes, { once: true });
} else {
  initDashboardVisualFixes();
}

window.addEventListener('sat:navigate', () => {
  observeMapSize();
  observeChartSize();
  [60, 220, 600].forEach(delay => setTimeout(notifyMapResize, delay));
});

window.addEventListener('resize', normalizeChartText);

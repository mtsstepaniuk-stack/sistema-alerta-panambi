// Ajustes de layout del mapa y del dashboard principal.
// Mantiene la columna derecha visible, agrega un fallback estructural de
// Leaflet, corrige la deformación horizontal del gráfico y evita que los
// popups recientes del mapa desplacen la vista al abrirse.
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

    /* Tooltip compacto al pasar el mouse. */
    #s-dash .leaflet-tooltip,
    .sat-upstream-modal .leaflet-tooltip {
      background: rgba(255, 255, 255, .98) !important;
      color: #213547 !important;
      border: 1px solid #d6e0e8 !important;
      border-radius: 7px !important;
      box-shadow: 0 4px 14px rgba(18, 38, 58, .22) !important;
      padding: 7px 9px !important;
      font-family: 'Inter', Arial, sans-serif !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      line-height: 1.35 !important;
      letter-spacing: 0 !important;
      text-shadow: none !important;
      white-space: nowrap !important;
    }

    #s-dash .leaflet-tooltip-top::before,
    .sat-upstream-modal .leaflet-tooltip-top::before {
      border-top-color: rgba(255, 255, 255, .98) !important;
    }
    #s-dash .leaflet-tooltip-bottom::before,
    .sat-upstream-modal .leaflet-tooltip-bottom::before {
      border-bottom-color: rgba(255, 255, 255, .98) !important;
    }
    #s-dash .leaflet-tooltip-left::before,
    .sat-upstream-modal .leaflet-tooltip-left::before {
      border-left-color: rgba(255, 255, 255, .98) !important;
    }
    #s-dash .leaflet-tooltip-right::before,
    .sat-upstream-modal .leaflet-tooltip-right::before {
      border-right-color: rgba(255, 255, 255, .98) !important;
    }

    /* Popup al hacer clic: más chico para el mapa embebido. */
    #s-dash .leaflet-popup-content-wrapper,
    .sat-upstream-modal .leaflet-popup-content-wrapper {
      background: #ffffff !important;
      color: #213547 !important;
      border: 1px solid #d6e0e8 !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 28px rgba(18, 38, 58, .28) !important;
    }

    #s-dash .leaflet-popup-content,
    .sat-upstream-modal .leaflet-popup-content {
      margin: 11px 14px !important;
      color: #213547 !important;
      font-family: 'Inter', Arial, sans-serif !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      line-height: 1.4 !important;
      letter-spacing: 0 !important;
      text-shadow: none !important;
    }

    #s-dash .leaflet-popup-content *,
    .sat-upstream-modal .leaflet-popup-content * {
      text-shadow: none !important;
    }

    #s-dash .leaflet-popup-content b,
    #s-dash .leaflet-popup-content strong,
    .sat-upstream-modal .leaflet-popup-content b,
    .sat-upstream-modal .leaflet-popup-content strong {
      color: #172b3d !important;
      font-weight: 800 !important;
    }

    #s-dash .leaflet-popup-tip,
    .sat-upstream-modal .leaflet-popup-tip {
      background: #ffffff !important;
      box-shadow: 3px 3px 8px rgba(18, 38, 58, .12) !important;
    }

    #s-dash .leaflet-popup-close-button,
    .sat-upstream-modal .leaflet-popup-close-button {
      color: #667788 !important;
      font-size: 20px !important;
      font-weight: 700 !important;
      text-shadow: none !important;
    }

    #s-dash .leaflet-popup-close-button:hover,
    .sat-upstream-modal .leaflet-popup-close-button:hover {
      color: #1f5fa8 !important;
    }

    #s-dash .sat-live-alert-popup,
    #s-dash .sat-upstream-popup,
    .sat-upstream-modal .sat-live-alert-popup,
    .sat-upstream-modal .sat-upstream-popup {
      color: #213547 !important;
      font-size: 11px !important;
      line-height: 1.4 !important;
    }

    #s-dash .sat-live-alert-popup,
    .sat-upstream-modal .sat-live-alert-popup {
      min-width: 205px !important;
      max-width: 250px !important;
    }

    #s-dash .sat-live-alert-popup .sat-alert-title,
    .sat-upstream-modal .sat-live-alert-popup .sat-alert-title {
      font-size: 13px !important;
      margin-bottom: 6px !important;
    }

    #s-dash .sat-live-alert-popup .sat-alert-detail,
    .sat-upstream-modal .sat-live-alert-popup .sat-alert-detail {
      color: #52606d !important;
      font-size: 10.5px !important;
    }

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
      z-index: 0 !important;
      isolation: isolate;
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

/*
 * Leaflet por defecto mueve el mapa para intentar mantener el popup completo
 * dentro del viewport. En el mapa pequeño eso termina tapando la propia alerta.
 * Se desactiva el auto-pan globalmente: abrir una alerta ya no cambia centro ni zoom.
 */
function disableLeafletPopupAutoPan() {
  const L = window.L;
  if (!L?.Popup?.prototype?.options) return false;
  L.Popup.prototype.options.autoPan = false;
  L.Popup.prototype.options.keepInView = false;
  return true;
}

function ensurePopupBehavior() {
  if (disableLeafletPopupAutoPan()) return;
  [60, 180, 500, 1200].forEach(delay => setTimeout(disableLeafletPopupAutoPan, delay));
}

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
  ensurePopupBehavior();
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
  ensurePopupBehavior();
  observeMapSize();
  observeChartSize();
  [60, 220, 600].forEach(delay => setTimeout(notifyMapResize, delay));
});

window.addEventListener('resize', normalizeChartText);

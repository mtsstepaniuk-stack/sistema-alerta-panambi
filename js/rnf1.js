/**
 * RNF1 continúa implementado y medido en backend, pero deja de mostrarse como
 * tarjeta técnica dentro de Historial. Esta capa sólo limpia la interfaz y
 * acomoda los resúmenes funcionales para que queden equilibrados.
 */

const STYLE_ID = 'sat-history-summary-clean-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #s-historial .sat-history-summary-grid {
      display: grid !important;
      grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
      gap: 12px !important;
      align-items: stretch !important;
      margin-bottom: 16px !important;
    }

    #s-historial .sat-history-summary-grid > .card {
      min-width: 0;
      min-height: 108px;
      padding: 15px 16px !important;
      display: flex;
      flex-direction: column;
      justify-content: center;
      box-sizing: border-box;
    }

    #s-historial .sat-history-summary-grid > .card .card-title {
      margin-bottom: 5px;
      font-size: 11px;
      line-height: 1.25;
      white-space: normal;
    }

    #s-historial .sat-history-summary-grid > .card > div[style*="font-size:22px"],
    #s-historial .sat-history-summary-grid [data-rf10-actions-count] {
      line-height: 1.15;
      margin: 1px 0 4px;
    }

    #s-historial .sat-history-summary-grid > .card > div:last-child {
      line-height: 1.3;
    }

    @media (max-width: 1180px) {
      #s-historial .sat-history-summary-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }

    @media (max-width: 820px) {
      #s-historial .sat-history-summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }

    @media (max-width: 520px) {
      #s-historial .sat-history-summary-grid {
        grid-template-columns: 1fr !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function findSummaryGrid() {
  const content = document.querySelector('#s-historial .content');
  if (!content) return null;

  return [...content.querySelectorAll('div')].find(el => {
    const titles = [...el.querySelectorAll(':scope > .card .card-title')]
      .map(title => String(title.textContent || '').trim());
    return titles.includes('Mediciones') && titles.includes('Alertas automáticas');
  }) || null;
}

function cleanHistorySummary() {
  injectStyles();

  // El panel técnico RNF1 ya no forma parte de la interfaz de usuario.
  document.getElementById('rnf1-status-panel')?.remove();
  document.getElementById('rnf1-history-layout-styles')?.remove();

  const grid = findSummaryGrid();
  if (!grid) return;

  grid.classList.remove('history-summary-with-rnf1');
  grid.classList.add('sat-history-summary-grid');
  grid.style.alignItems = 'stretch';
}

function start() {
  cleanHistorySummary();

  const observer = new MutationObserver(mutations => {
    if (!mutations.some(mutation => mutation.type === 'childList')) return;
    cleanHistorySummary();
  });
  observer.observe(document.querySelector('#s-historial .content') || document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

window.addEventListener('sat:navigate', cleanHistorySummary);

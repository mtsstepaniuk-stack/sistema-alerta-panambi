/*
 * Experiencia compacta para Validar Alertas Pendientes.
 *
 * La lista pasa a ser la interfaz principal: la alerta seleccionada se destaca,
 * se expande levemente y muestra sus acciones dentro de la propia tarjeta.
 * Los paneles heredados que repetían la misma información quedan ocultos, pero
 * sus modales y flujo de backend se conservan intactos.
 */

function installStyles() {
  if (document.getElementById('sat-validation-card-actions-styles')) return;

  const style = document.createElement('style');
  style.id = 'sat-validation-card-actions-styles';
  style.textContent = `
    /* El detalle grande antiguo repetía la información ya visible en la lista. */
    #s-validar .content > div[style*="linear-gradient"],
    #s-validar .validar-grid {
      display: none !important;
    }

    #s-validar #validar-alert-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 3px 5px 8px;
      overflow: visible;
    }

    #s-validar .validation-alert-card {
      position: relative;
      cursor: pointer;
      min-width: 0;
      transition:
        transform .16s ease,
        box-shadow .16s ease,
        background-color .16s ease,
        border-color .16s ease,
        padding .16s ease;
    }

    /* Un poco más de jerarquía visual en los dos primeros renglones. */
    #s-validar .validation-alert-card .alert-item-title {
      font-size: 15px !important;
      font-weight: 800 !important;
      line-height: 1.3;
    }

    #s-validar .validation-alert-card .alert-item-desc {
      margin-top: 4px;
      font-size: 13px !important;
      line-height: 1.45;
    }

    /* El estado PENDIENTE también debe leerse de un vistazo. */
    #s-validar .validation-alert-card > div .badge {
      font-size: 11.5px !important;
      font-weight: 800 !important;
      padding: 5px 10px !important;
      letter-spacing: .02em;
    }

    #s-validar .validation-alert-card:hover:not(.active) {
      transform: translateY(-1px);
      box-shadow: 0 5px 14px rgba(0,0,0,.08);
    }

    #s-validar .validation-alert-card.active {
      transform: translateY(-1px) scale(1.005);
      padding: 17px 20px !important;
      border-width: 2px !important;
      box-shadow: 0 9px 24px rgba(0,0,0,.16);
      z-index: 2;
    }

    #s-validar .validation-alert-card.active.rojo {
      background: rgba(192,57,43,.13) !important;
      border-color: #C0392B !important;
    }

    #s-validar .validation-alert-card.active.naranja,
    #s-validar .validation-alert-card.active.amarillo {
      background: rgba(230,126,34,.13) !important;
      border-color: #E67E22 !important;
    }

    #s-validar .validation-alert-card.active.lila {
      background: rgba(142,68,173,.13) !important;
      border-color: #8E44AD !important;
    }

    #s-validar .validation-alert-card.active.verde {
      background: rgba(39,174,96,.12) !important;
      border-color: #27AE60 !important;
    }

    #s-validar .sat-card-validation-actions {
      display: none;
      margin-top: 14px;
      padding-top: 13px;
      border-top: 1px solid rgba(127,143,160,.25);
    }

    #s-validar .validation-alert-card.active .sat-card-validation-actions {
      display: block;
      animation: sat-validation-actions-in .16s ease both;
    }

    #s-validar .sat-card-observation-label {
      display: block;
      margin-bottom: 6px;
      color: var(--texto-sub);
      font-size: 11px;
      font-weight: 700;
    }

    #s-validar .sat-card-observation {
      width: 100%;
      min-height: 64px;
      resize: vertical;
      box-sizing: border-box;
      margin: 0 0 10px;
      padding: 9px 11px;
      border: 1px solid var(--gris-border);
      border-radius: 8px;
      background: var(--card-bg);
      color: var(--texto-base);
      font: 12px/1.45 'Inter', sans-serif;
      outline: none;
    }

    #s-validar .sat-card-observation:focus {
      border-color: var(--azul-mid);
      box-shadow: 0 0 0 2px rgba(46,134,193,.12);
    }

    #s-validar .sat-card-action-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    #s-validar .sat-card-action-row .btn {
      min-width: 132px;
    }

    #s-validar .sat-hidden-original-attachment {
      display: none !important;
    }

    @keyframes sat-validation-actions-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 700px) {
      #s-validar .validation-alert-card.active {
        transform: none;
        padding: 15px !important;
      }

      #s-validar .sat-card-action-row .btn {
        flex: 1 1 145px;
      }
    }
  `;

  document.head.appendChild(style);
}

function syncObservation(card) {
  const visible = card?.querySelector('.sat-card-observation');
  const legacy = document.getElementById('val-obs');
  if (legacy && visible) legacy.value = visible.value;
}

function openLegacyAction(card, modalId) {
  syncObservation(card);

  if (typeof window.openModal === 'function') {
    window.openModal(modalId);
    return;
  }

  const selector = modalId === 'm-validar'
    ? '#s-validar .validar-grid button[onclick*="m-validar"]'
    : '#s-validar .validar-grid button[onclick*="m-rechazar"]';
  document.querySelector(selector)?.click();
}

function attachmentPathFromOriginal(card) {
  const original = Array.from(card.querySelectorAll('button')).find(button =>
    String(button.textContent || '').toLowerCase().includes('archivo adjunto')
  );
  if (!original) return '';

  original.classList.add('sat-hidden-original-attachment');
  const onclick = original.getAttribute('onclick') || '';
  const match = onclick.match(/viewIncidentAttachment\(['"]([^'"]+)['"]\)/);
  return match?.[1] || '';
}

function buildActions(card) {
  if (card.querySelector('.sat-card-validation-actions')) return;

  const attachmentPath = attachmentPathFromOriginal(card);
  const host = document.createElement('div');
  host.className = 'sat-card-validation-actions';
  host.innerHTML = `
    <label class="sat-card-observation-label">Observación del operador (opcional)</label>
    <textarea class="sat-card-observation" placeholder="Agregar una observación sobre esta alerta..."></textarea>
    <div class="sat-card-action-row">
      <button type="button" class="btn btn-success btn-sm" data-card-action="validate">✓ Validar alerta</button>
      <button type="button" class="btn btn-outline btn-sm" data-card-action="reject" style="border-color:var(--rojo-lt);color:var(--rojo);">✕ Rechazar alerta</button>
      ${attachmentPath ? '<button type="button" class="btn btn-outline btn-sm" data-card-action="attachment">📎 Ver adjunto</button>' : ''}
    </div>
  `;

  host.addEventListener('click', event => event.stopPropagation());
  host.addEventListener('keydown', event => event.stopPropagation());

  host.querySelector('[data-card-action="validate"]')?.addEventListener('click', () => {
    openLegacyAction(card, 'm-validar');
  });

  host.querySelector('[data-card-action="reject"]')?.addEventListener('click', () => {
    openLegacyAction(card, 'm-rechazar');
  });

  host.querySelector('[data-card-action="attachment"]')?.addEventListener('click', () => {
    if (attachmentPath && typeof window.viewIncidentAttachment === 'function') {
      window.viewIncidentAttachment(attachmentPath);
    }
  });

  card.appendChild(host);
}

function enhanceCards() {
  installStyles();

  const cards = Array.from(document.querySelectorAll('#s-validar .validation-alert-card'));
  cards.forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-selected', card.classList.contains('active') ? 'true' : 'false');
    buildActions(card);

    // Limpieza por compatibilidad con la versión anterior: ya no mostramos
    // el cartel "Seleccionada" porque el fondo, borde y expansión ya indican
    // claramente cuál alerta está activa.
    card.querySelector('.sat-validation-selected-label')?.remove();
  });
}

// Enter o espacio sobre una tarjeta selecciona la alerta, igual que un clic.
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest?.('#s-validar .validation-alert-card');
  if (!card || event.target.closest('.sat-card-validation-actions')) return;
  event.preventDefault();
  card.click();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceCards, { once: true });
} else {
  enhanceCards();
}

let scheduled = false;
const observer = new MutationObserver(mutations => {
  if (scheduled || !mutations.some(mutation => mutation.type === 'childList')) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceCards();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('sat:navigate', enhanceCards);

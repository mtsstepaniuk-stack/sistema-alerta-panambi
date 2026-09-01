/**
 * RF8 — Completa el flujo existente de alerta manual sin reemplazarlo.
 * Agrega fuente de la alerta, valida canales y adjunta esos datos al POST
 * que ya realiza alerts.js.
 */

function selectedChannels() {
  return Array.from(document.querySelectorAll('#emit-step-1 label'))
    .filter(label => label.querySelector('input[type="checkbox"]')?.checked)
    .map(label => label.textContent
      .replace(/[📱💬📞📢]/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

function selectedChannelsDisplay() {
  const iconByChannel = {
    WhatsApp: '📱',
    SMS: '💬',
    Llamada: '📞',
    Altoparlante: '📢',
  };

  const channels = selectedChannels();
  if (!channels.length) return 'Sin canal seleccionado';
  return channels.map(channel => `${iconByChannel[channel] || ''} ${channel}`.trim()).join(' · ');
}

function sourceValue() {
  return document.getElementById('emit-fuente')?.value?.trim() || '';
}

function ensureSourceField() {
  const step = document.getElementById('emit-step-1');
  const card = step?.querySelector('.card');
  if (!card || document.getElementById('emit-fuente')) return;

  const title = card.querySelector('.card-title');
  const group = document.createElement('div');
  group.className = 'input-group';
  group.style.marginBottom = '16px';
  group.innerHTML = `
    <label>Fuente de la alerta *</label>
    <select id="emit-fuente">
      <option value="Defensa Civil — Evaluación operativa" selected>Defensa Civil — Evaluación operativa</option>
      <option value="Reporte vecinal confirmado">Reporte vecinal confirmado</option>
      <option value="Aviso de Prefectura">Aviso de Prefectura</option>
      <option value="Aviso de Policía / Bomberos">Aviso de Policía / Bomberos</option>
      <option value="Instrucción municipal">Instrucción municipal</option>
      <option value="Otra fuente operativa">Otra fuente operativa</option>
    </select>
  `;
  title?.after(group);
}

function ensureSourceSummary() {
  const summaryGrid = document.querySelector('#emit-step-3 .card > div[style*="grid-template-columns"]');
  if (!summaryGrid || document.getElementById('emit-res-fuente')) return;

  const item = document.createElement('div');
  item.style.gridColumn = '1 / -1';
  item.innerHTML = `
    <div style="font-size:11px;color:var(--texto-sub);font-weight:600;margin-bottom:2px;">Fuente</div>
    <div style="font-size:14px;font-weight:700;" id="emit-res-fuente">Defensa Civil — Evaluación operativa</div>
  `;
  summaryGrid.prepend(item);
}

function updateSourceSummary() {
  const value = sourceValue() || 'Sin especificar';
  const output = document.getElementById('emit-res-fuente');
  if (output) output.textContent = value;
}

/*
 * El campo "Canal" de cada contacto originalmente mostraba su canal registrado
 * (por ejemplo WhatsApp o Llamada), aunque el operador hubiera elegido solo SMS
 * para la alerta actual. Eso resultaba confuso. Para RF8 el paso 2 debe reflejar
 * los canales elegidos para ESTA alerta, que son los que finalmente se registran
 * y simulan en el envío.
 */
function syncRecipientChannels() {
  const table = document.querySelector('#emit-step-2 table');
  const tbody = document.getElementById('emit-dest-tbody');
  if (!table || !tbody) return;

  const channelHeader = table.querySelector('thead th:nth-child(4)');
  if (channelHeader && channelHeader.textContent !== 'Canal de esta alerta') {
    channelHeader.textContent = 'Canal de esta alerta';
  }

  const display = selectedChannelsDisplay();
  tbody.querySelectorAll('tr[data-tipo]').forEach(row => {
    const cell = row.querySelector('td:nth-child(4)');
    if (cell && cell.textContent.trim() !== display) {
      cell.textContent = display;
    }
  });
}

function installRecipientChannelSync() {
  const tbody = document.getElementById('emit-dest-tbody');
  if (!tbody || tbody.__rf8ChannelObserver) return;

  const observer = new MutationObserver(() => syncRecipientChannels());
  observer.observe(tbody, { childList: true, subtree: true });
  tbody.__rf8ChannelObserver = observer;

  document.querySelectorAll('#emit-step-1 input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      syncRecipientChannels();
      // Si el operador vuelve al paso 1, cambia canales y regresa al paso 2,
      // la tabla ya queda sincronizada antes incluso de que vuelva a mostrarse.
      setTimeout(syncRecipientChannels, 0);
    });
  });

  syncRecipientChannels();
}

function showLocalError(message) {
  const toast = document.getElementById('global-toast');
  if (!toast) {
    window.alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add('visible', 'error');
  clearTimeout(showLocalError.timer);
  showLocalError.timer = setTimeout(() => toast.classList.remove('visible', 'error'), 3200);
}

function installEmitValidation() {
  const original = window.emitManualAlert;
  if (typeof original !== 'function' || original.__rf8Wrapped) return;

  const wrapped = async function rf8EmitManualAlert() {
    if (!sourceValue()) {
      showLocalError('Seleccione la fuente de la alerta antes de emitir.');
      return;
    }
    if (selectedChannels().length === 0) {
      showLocalError('Seleccione al menos un canal de envío.');
      return;
    }
    return original();
  };
  wrapped.__rf8Wrapped = true;
  window.emitManualAlert = wrapped;
}

function installResetHook() {
  const original = window.resetEmitForm;
  if (typeof original !== 'function' || original.__rf8Wrapped) return;

  const wrapped = function rf8ResetEmitForm(...args) {
    const result = original(...args);
    const source = document.getElementById('emit-fuente');
    if (source) source.selectedIndex = 0;
    updateSourceSummary();
    setTimeout(syncRecipientChannels, 0);
    return result;
  };
  wrapped.__rf8Wrapped = true;
  window.resetEmitForm = wrapped;
}

function installFetchEnrichment() {
  if (window.__satRf8FetchInstalled) return;
  window.__satRf8FetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = String(init?.method || 'GET').toUpperCase();

    if (method === 'POST' && url.includes('/api/alertas/manuales') && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        payload.fuente = sourceValue();
        payload.canales = selectedChannels();
        init = { ...init, body: JSON.stringify(payload) };
      } catch (_) {
        // Si el cuerpo no fuese JSON, se conserva el comportamiento existente.
      }
    }

    return originalFetch(input, init);
  };
}

function initRf8() {
  ensureSourceField();
  ensureSourceSummary();
  updateSourceSummary();
  installRecipientChannelSync();
  installEmitValidation();
  installResetHook();
  installFetchEnrichment();

  document.getElementById('emit-fuente')?.addEventListener('change', updateSourceSummary);

  const step2 = document.getElementById('emit-step-2');
  if (step2) {
    const observer = new MutationObserver(() => {
      if (step2.style.display !== 'none') {
        setTimeout(syncRecipientChannels, 0);
        setTimeout(syncRecipientChannels, 80);
      }
    });
    observer.observe(step2, { attributes: true, attributeFilter: ['style'] });
  }

  const step3 = document.getElementById('emit-step-3');
  if (step3) {
    const observer = new MutationObserver(() => {
      if (step3.style.display !== 'none') updateSourceSummary();
    });
    observer.observe(step3, { attributes: true, attributeFilter: ['style'] });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRf8, { once: true });
} else {
  initRf8();
}

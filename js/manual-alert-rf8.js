/**
 * RF8 — Completa el flujo existente de alerta manual sin reemplazarlo.
 * Agrega fuente de la alerta, valida canales y adjunta esos datos al POST
 * que ya realiza alerts.js.
 *
 * Los canales seleccionados en el Paso 1 también filtran los destinatarios
 * del Paso 2 según los medios disponibles para cada contacto.
 */

function selectedChannels() {
  return Array.from(document.querySelectorAll('#emit-step-1 label'))
    .filter(label => label.querySelector('input[type="checkbox"]')?.checked)
    .map(label => label.textContent
      .replace(/[📱💬📞📢]/g, '')
      .replace('*', '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
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

function ensureChannelRequiredLabel() {
  const step = document.getElementById('emit-step-1');
  if (!step) return;

  const labels = Array.from(step.querySelectorAll('.input-group > label'));
  const channelLabel = labels.find(label => label.textContent.trim().startsWith('Canal de envío'));
  if (channelLabel && !channelLabel.textContent.includes('*')) {
    channelLabel.textContent = 'Canal de envío *';
  }
}

function ensureChannelLegend() {
  const tbody = document.getElementById('emit-dest-tbody');
  const table = tbody?.closest('table');
  const tableWrap = table?.parentElement;
  if (!tableWrap || document.getElementById('emit-channel-legend')) return;

  const legend = document.createElement('div');
  legend.id = 'emit-channel-legend';
  legend.style.cssText = [
    'margin-top:10px',
    'padding:10px 12px',
    'border:1px solid var(--gris-border)',
    'border-radius:8px',
    'background:var(--gris-bg)',
    'font-size:12px',
    'color:var(--texto-sub)',
    'display:flex',
    'align-items:center',
    'gap:14px',
    'flex-wrap:wrap'
  ].join(';');

  legend.innerHTML = `<span>💬 = SMS 📱 = WhatsApp 📞 = Llamada 📢 = Altoparlante</span>`;

  tableWrap.after(legend);
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

function markInvalid(element) {
  if (!element) return;
  element.style.borderColor = 'var(--rojo)';
  element.style.boxShadow = '0 0 0 3px rgba(192,57,43,.12)';
}

function clearInvalid(element) {
  if (!element) return;
  element.style.borderColor = '';
  element.style.boxShadow = '';
}

function validateStepOne() {
  const fuente = document.getElementById('emit-fuente');
  const riesgo = document.getElementById('emit-riesgo');
  const zona = document.getElementById('emit-zona');
  const mensaje = document.getElementById('emit-msg');

  [fuente, riesgo, zona, mensaje].forEach(clearInvalid);

  const missing = [];

  if (!fuente?.value?.trim()) {
    missing.push({ element: fuente, label: 'fuente de la alerta' });
  }
  if (!riesgo?.value || riesgo.value === 'Seleccionar...') {
    missing.push({ element: riesgo, label: 'nivel de riesgo' });
  }
  if (!zona?.value || zona.value === 'Seleccionar...') {
    missing.push({ element: zona, label: 'zona afectada' });
  }
  if (!mensaje?.value?.trim()) {
    missing.push({ element: mensaje, label: 'mensaje de la alerta' });
  }

  if (missing.length) {
    missing.forEach(item => markInvalid(item.element));
    missing[0].element?.focus();
    showLocalError(`Complete los campos obligatorios: ${missing.map(item => item.label).join(', ')}.`);
    return false;
  }

  if (selectedChannels().length === 0) {
    showLocalError('Seleccione al menos un canal de envío antes de continuar.');
    return false;
  }

  return true;
}

function installRequiredFieldCleanup() {
  ['emit-fuente', 'emit-riesgo', 'emit-zona'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', event => clearInvalid(event.currentTarget));
  });
  document.getElementById('emit-msg')?.addEventListener('input', event => clearInvalid(event.currentTarget));
}

function installEmitValidation() {
  const original = window.emitManualAlert;
  if (typeof original !== 'function' || original.__rf8Wrapped) return;

  const wrapped = async function rf8EmitManualAlert() {
    if (!validateStepOne()) return;
    return original();
  };
  wrapped.__rf8Wrapped = true;
  window.emitManualAlert = wrapped;
}

function installStepValidation() {
  const original = window.emitStep;
  if (typeof original !== 'function' || original.__rf8ChannelWrapped) return;

  const wrapped = function rf8EmitStep(step) {
    if (Number(step) === 2 && !validateStepOne()) return;
    return original(step);
  };
  wrapped.__rf8ChannelWrapped = true;
  window.emitStep = wrapped;
}

function installResetHook() {
  const original = window.resetEmitForm;
  if (typeof original !== 'function' || original.__rf8Wrapped) return;

  const wrapped = function rf8ResetEmitForm(...args) {
    const result = original(...args);
    const source = document.getElementById('emit-fuente');
    if (source) source.selectedIndex = 0;
    ['emit-fuente', 'emit-riesgo', 'emit-zona', 'emit-msg'].forEach(id => clearInvalid(document.getElementById(id)));
    updateSourceSummary();
    return result;
  };
  wrapped.__rf8Wrapped = true;
  window.resetEmitForm = wrapped;
}

function enrichRecipientUrl(url) {
  const channels = selectedChannels();
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set('canales', channels.join(','));
  return `${parsed.pathname}${parsed.search}`;
}

function installFetchEnrichment() {
  if (window.__satRf8FetchInstalled) return;
  window.__satRf8FetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = String(init?.method || 'GET').toUpperCase();

    if (method === 'GET' && url.includes('/api/contactos/destinatarios')) {
      const enrichedUrl = enrichRecipientUrl(url);
      if (typeof input === 'string') {
        input = enrichedUrl;
      } else if (input instanceof Request) {
        input = new Request(enrichedUrl, input);
      }
    }

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
  ensureChannelRequiredLabel();
  ensureChannelLegend();
  ensureSourceSummary();
  updateSourceSummary();
  installRequiredFieldCleanup();
  installEmitValidation();
  installStepValidation();
  installResetHook();
  installFetchEnrichment();

  document.getElementById('emit-fuente')?.addEventListener('change', updateSourceSummary);

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

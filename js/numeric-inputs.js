/**
 * Validación global de campos numéricos.
 * - DNI y teléfonos: solo dígitos.
 * - input[type="number"]: solo sintaxis decimal válida, sin letras ni notación exponencial.
 * Se aplica también a campos creados dinámicamente por modales.
 */

function isDigitsOnlyField(input) {
  if (!(input instanceof HTMLInputElement)) return false;
  const text = `${input.id || ''} ${input.name || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
  return input.type === 'tel' || /(^|[-_\s])(dni|telefono|teléfono|phone)([-_\s]|$)/i.test(text);
}

function allowsNegative(input) {
  const min = input.getAttribute('min');
  if (min !== null && min !== '' && Number(min) < 0) return true;
  const text = `${input.id || ''} ${input.name || ''}`.toLowerCase();
  return /(lat|lng|long|longitude|latitud|longitud)/.test(text);
}

function sanitizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function sanitizeDecimal(value, allowNegative = false) {
  let raw = String(value || '').replace(',', '.');
  const negative = allowNegative && raw.trim().startsWith('-');
  raw = raw.replace(/[^0-9.]/g, '');

  const firstDot = raw.indexOf('.');
  if (firstDot !== -1) {
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
  }

  return `${negative ? '-' : ''}${raw}`;
}

function configureNumericInput(input) {
  if (!(input instanceof HTMLInputElement)) return;

  if (isDigitsOnlyField(input)) {
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.setAttribute('autocomplete', input.id?.includes('telefono') ? 'tel' : 'off');
    if ((input.id || '').toLowerCase().includes('dni')) input.setAttribute('maxlength', '8');
    return;
  }

  if (input.type === 'number') {
    input.setAttribute('inputmode', 'decimal');
  }
}

function sanitizeInput(input) {
  if (!(input instanceof HTMLInputElement)) return;

  if (isDigitsOnlyField(input)) {
    const clean = sanitizeDigits(input.value);
    if (input.value !== clean) input.value = clean;
    return;
  }

  if (input.type === 'number') {
    const clean = sanitizeDecimal(input.value, allowsNegative(input));
    if (input.value !== clean) input.value = clean;
  }
}

function configureExistingInputs(root = document) {
  root.querySelectorAll?.('input').forEach(configureNumericInput);
}

// Delegación: funciona también para inputs creados después del DOMContentLoaded.
document.addEventListener('focusin', event => {
  if (event.target instanceof HTMLInputElement) configureNumericInput(event.target);
});

document.addEventListener('input', event => {
  if (event.target instanceof HTMLInputElement) sanitizeInput(event.target);
});

document.addEventListener('paste', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (!isDigitsOnlyField(input)) return;

  event.preventDefault();
  const digits = sanitizeDigits(event.clipboardData?.getData('text') || '');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(digits, start, end, 'end');
  sanitizeInput(input);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => configureExistingInputs(), { once: true });
} else {
  configureExistingInputs();
}

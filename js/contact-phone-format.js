/*
 * Formato y validación de teléfonos en Gestión de Contactos.
 *
 * Objetivos:
 * - impedir que se ingresen cadenas arbitrariamente largas;
 * - limitar el teléfono a un máximo de 13 dígitos;
 * - mostrar los números con un formato legible;
 * - mantener el teléfono opcional (vacío = contacto incompleto).
 *
 * Formatos admitidos para la demo argentina:
 *   3764893301      -> 376 489-3301
 *   543764893301    -> +54 376 489-3301
 *   5493764893301   -> +54 9 376 489-3301
 */

import { showToast } from './modals.js';

const MAX_PHONE_DIGITS = 13;
const MIN_NATIONAL_DIGITS = 10;

function phoneDigits(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS);
}

function formatNationalTen(digits) {
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const suffix = digits.slice(6, 10);

  let output = area;
  if (prefix) output += ` ${prefix}`;
  if (suffix) output += `-${suffix}`;
  return output;
}

function formatPhoneDigits(digits = '') {
  const clean = String(digits).replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS);
  if (!clean) return '';

  // Celular argentino en formato internacional: +54 9 AAA BBB-CCCC.
  if (clean.startsWith('549')) {
    const rest = clean.slice(3);
    if (!rest) return '+54 9';
    return `+54 9 ${formatNationalTen(rest)}`.trim();
  }

  // Teléfono argentino con código de país: +54 AAA BBB-CCCC.
  if (clean.startsWith('54') && clean.length > 2) {
    const rest = clean.slice(2);
    return `+54 ${formatNationalTen(rest)}`.trim();
  }

  // Mientras se escribe 5 / 54, no forzamos todavía el prefijo visual.
  if (clean === '5' || clean === '54') return clean;

  return formatNationalTen(clean);
}

function isValidPhone(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw === '—') return true;

  const digits = String(value).replace(/\D/g, '');

  // Número nacional argentino: AAA BBB-CCCC.
  if (digits.length === MIN_NATIONAL_DIGITS) return true;

  // Con +54: +54 AAA BBB-CCCC.
  if (digits.length === 12 && digits.startsWith('54')) return true;

  // Celular internacional: +54 9 AAA BBB-CCCC.
  if (digits.length === 13 && digits.startsWith('549')) return true;

  return false;
}

function normalizeInput(input) {
  if (!input) return;
  const digits = phoneDigits(input.value);
  input.value = formatPhoneDigits(digits);
}

function configurePhoneInput(input) {
  if (!input || input.dataset.satPhoneReady === '1') return;
  input.dataset.satPhoneReady = '1';

  input.type = 'tel';
  input.inputMode = 'tel';
  input.autocomplete = 'tel';
  input.maxLength = 20;
  input.placeholder = 'Ej: +54 9 376 489-3301';

  input.addEventListener('input', () => normalizeInput(input));
  input.addEventListener('blur', () => normalizeInput(input));

  // También normaliza un valor que ya hubiese sido cargado al crear el campo.
  normalizeInput(input);
}

function enhancePhoneInputs() {
  configurePhoneInput(document.getElementById('new-c-telefono'));
  configurePhoneInput(document.getElementById('edit-c-telefono'));
}

function formatPhoneForDisplay(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw === '—') return raw || '—';
  if (!isValidPhone(raw)) return raw;
  return formatPhoneDigits(String(raw).replace(/\D/g, ''));
}

function formatContactTablePhones() {
  document.querySelectorAll('#s-contactos tbody tr').forEach(row => {
    const cell = row.cells?.[3];
    if (!cell) return;

    const raw = cell.textContent.trim();
    const formatted = formatPhoneForDisplay(raw);
    if (formatted && formatted !== raw) cell.textContent = formatted;
  });
}

function validateBeforeSave(button) {
  const onclick = button?.getAttribute('onclick') || '';
  const editing = onclick.includes('saveEditedContact');
  const creating = onclick.includes('saveNewContact');
  if (!editing && !creating) return true;

  const input = document.getElementById(editing ? 'edit-c-telefono' : 'new-c-telefono');
  if (!input) return true;

  normalizeInput(input);
  if (isValidPhone(input.value)) return true;

  showToast('Ingresá un teléfono válido, por ejemplo +54 9 376 489-3301.', true);
  input.focus();
  return false;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    enhancePhoneInputs();
    formatContactTablePhones();
  }, { once: true });
} else {
  enhancePhoneInputs();
  formatContactTablePhones();
}

// Bloquea el guardado antes de que se ejecute el onclick original si el número
// no tiene una longitud/formato de teléfono válido.
document.addEventListener('click', event => {
  const saveButton = event.target.closest?.(
    'button[onclick*="saveNewContact"], button[onclick*="saveEditedContact"]'
  );

  if (saveButton && !validateBeforeSave(saveButton)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  // contacts.js carga el valor del teléfono en el modal de edición durante el
  // mismo clic; lo formateamos inmediatamente después.
  const editButton = event.target.closest?.('button[onclick*="editContact"]');
  if (editButton) {
    setTimeout(() => {
      enhancePhoneInputs();
      normalizeInput(document.getElementById('edit-c-telefono'));
    }, 0);
  }
}, true);

window.addEventListener('sat:navigate', () => {
  enhancePhoneInputs();
  formatContactTablePhones();
});

// Contactos y el modal de edición se renderizan dinámicamente. Observamos sólo
// cambios de nodos y aplicamos el formato de manera idempotente.
let scheduled = false;
const observer = new MutationObserver(mutations => {
  if (scheduled || !mutations.some(mutation => mutation.type === 'childList')) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhancePhoneInputs();
    formatContactTablePhones();
  });
});

observer.observe(document.documentElement, { childList: true, subtree: true });

/**
 * Incidents Module
 * Registra reportes vecinales en SQLite y genera alerta pendiente.
 */

import { apiRequest } from './api.js';
import { showToast } from './modals.js';

let selectedImage = null;

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type.startsWith('image/')) return reject(new Error('Solo se permiten archivos de imagen.'));
    if (file.size > 3 * 1024 * 1024) return reject(new Error('La imagen no puede superar los 3 MB.'));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.readAsDataURL(file);
  });
}

function initImageInput() {
  const input = document.getElementById('rep-img');
  const text = document.getElementById('rep-img-text');
  const preview = document.getElementById('rep-img-preview');
  const area = document.getElementById('rep-img-area');
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      selectedImage = await readImageFile(file);
      if (text) text.textContent = `Imagen seleccionada: ${file.name}`;
      if (preview) {
        preview.src = selectedImage.data;
        preview.style.display = 'block';
      }
      if (area) area.style.borderColor = 'var(--celeste)';
    } catch (error) {
      selectedImage = null;
      input.value = '';
      showToast(error.message, true);
    }
  });
}

export async function sendReporte() {
  const nombreEl = document.getElementById('rep-nombre');
  const dniEl = document.getElementById('rep-dni');
  const zonaEl = document.getElementById('rep-zona');
  const tipoEl = document.getElementById('rep-tipo');
  const descEl = document.getElementById('rep-desc');
  const locEl = document.getElementById('rep-loc');
  const errEl = document.getElementById('rep-error');
  const successEl = document.getElementById('rep-success');
  const formBodyEl = document.getElementById('mobile-form-body');
  const formFooterEl = document.getElementById('mobile-form-footer');
  const backSmallEl = document.getElementById('rep-back-small');

  if (!nombreEl || !dniEl || !zonaEl || !tipoEl || !descEl || !locEl || !errEl || !successEl || !formBodyEl || !formFooterEl) return;

  const nombre = nombreEl.value.trim();
  const dni = dniEl.value.replace(/\D/g, '');
  const zona = zonaEl.value;
  const tipo = tipoEl.value;
  const descripcion = descEl.value.trim();
  const ubicacion = locEl.value.trim();

  if (!nombre || !dni || !zona || !tipo || !descripcion || !ubicacion) {
    errEl.textContent = 'Completar nombre, DNI, zona, tipo, descripción y ubicación.';
    errEl.classList.add('show');
    return;
  }

  if (dni.length < 7 || dni.length > 8) {
    errEl.textContent = 'El DNI debe tener 7 u 8 números.';
    errEl.classList.add('show');
    return;
  }

  try {
    errEl.classList.remove('show');
    const data = await apiRequest('/incidencias', {
      method: 'POST',
      body: JSON.stringify({ nombre, dni, zona, tipo, descripcion, ubicacion, imagen: selectedImage })
    });

    formBodyEl.style.display = 'none';
    formFooterEl.style.display = 'none';
    if (backSmallEl) backSmallEl.style.display = 'none';

    const codeSpan = successEl.querySelector('strong');
    if (codeSpan) codeSpan.textContent = data.codigo;

    successEl.classList.add('show');
    showToast('Reporte recibido. Defensa Civil lo verá como alerta pendiente.');
  } catch (error) {
    errEl.textContent = error.message;
    errEl.classList.add('show');
  }
}

export function resetReporte() {
  const nombreEl = document.getElementById('rep-nombre');
  const dniEl = document.getElementById('rep-dni');
  const zonaEl = document.getElementById('rep-zona');
  const tipoEl = document.getElementById('rep-tipo');
  const descEl = document.getElementById('rep-desc');
  const locEl = document.getElementById('rep-loc');
  const imgEl = document.getElementById('rep-img');
  const imgText = document.getElementById('rep-img-text');
  const imgPreview = document.getElementById('rep-img-preview');
  const imgArea = document.getElementById('rep-img-area');
  const errEl = document.getElementById('rep-error');
  const successEl = document.getElementById('rep-success');
  const formBodyEl = document.getElementById('mobile-form-body');
  const formFooterEl = document.getElementById('mobile-form-footer');
  const backSmallEl = document.getElementById('rep-back-small');

  selectedImage = null;
  if (nombreEl) nombreEl.value = '';
  if (dniEl) dniEl.value = '';
  if (zonaEl) zonaEl.value = '';
  if (tipoEl) tipoEl.value = '';
  if (descEl) descEl.value = '';
  if (locEl) locEl.value = '';
  if (imgEl) imgEl.value = '';
  if (imgText) imgText.textContent = 'Tocar para adjuntar foto o seleccionar archivo';
  if (imgPreview) {
    imgPreview.removeAttribute('src');
    imgPreview.style.display = 'none';
  }
  if (imgArea) imgArea.style.borderColor = '';
  if (errEl) errEl.classList.remove('show');
  if (formBodyEl) formBodyEl.style.display = '';
  if (formFooterEl) formFooterEl.style.display = '';
  if (successEl) successEl.classList.remove('show');
  if (backSmallEl) backSmallEl.style.display = '';
}

export function volverPantallaPrincipal() {
  resetReporte();
  document.body.classList.remove('public-report-mode');
  window.navigate('s-login');
}

window.sendReporte = sendReporte;
window.resetReporte = resetReporte;
window.volverPantallaPrincipal = volverPantallaPrincipal;

document.addEventListener('DOMContentLoaded', initImageInput);

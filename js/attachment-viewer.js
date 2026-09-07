/*
 * Visor interno para los archivos adjuntos de reportes vecinales.
 * Reemplaza la apertura en una pestaña nueva por una ventana modal integrada
 * con el mismo lenguaje visual que la ampliación del mapa.
 */

import { showToast } from './modals.js';

const VIEWER_ID = 'sat-attachment-viewer';
const STYLE_ID = 'sat-attachment-viewer-styles';

function fileNameFromPath(path = '') {
  try {
    const clean = String(path).split('?')[0].split('#')[0];
    const name = clean.split('/').filter(Boolean).pop() || 'Archivo adjunto';
    return decodeURIComponent(name);
  } catch {
    return 'Archivo adjunto';
  }
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sat-attachment-viewer {
      position: fixed;
      inset: 0;
      z-index: 2147483300;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 28px;
      background: rgba(5,18,32,.72);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
    }

    .sat-attachment-viewer.is-open {
      display: flex;
    }

    .sat-attachment-dialog {
      width: min(1050px, 94vw);
      height: min(760px, 88vh);
      min-height: 420px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 16px;
      background: var(--card-bg, #102238);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 28px 80px rgba(0,0,0,.55);
    }

    .sat-attachment-header {
      min-height: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 16px 0 20px;
      background: #102238;
      color: #fff;
      border-bottom: 1px solid rgba(255,255,255,.1);
      flex: 0 0 58px;
    }

    .sat-attachment-title {
      min-width: 0;
    }

    .sat-attachment-title strong {
      display: block;
      font-size: 14px;
      font-weight: 800;
    }

    .sat-attachment-title span {
      display: block;
      max-width: min(700px, 68vw);
      margin-top: 2px;
      overflow: hidden;
      color: #9fb7cd;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sat-attachment-close {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      background: rgba(255,255,255,.07);
      color: #fff;
      font-size: 25px;
      line-height: 1;
      cursor: pointer;
    }

    .sat-attachment-close:hover,
    .sat-attachment-close:focus-visible {
      background: rgba(255,255,255,.14);
      outline: none;
    }

    .sat-attachment-body {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      overflow: hidden;
      background: #0b1c2e;
    }

    .sat-attachment-image {
      display: block;
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 10px;
      box-shadow: 0 10px 34px rgba(0,0,0,.32);
      background: #fff;
    }

    .sat-attachment-loading,
    .sat-attachment-error {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #c5d7e7;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
    }

    .sat-attachment-error {
      display: none;
      color: #f5b7b1;
    }

    @media (max-width: 700px) {
      .sat-attachment-viewer {
        padding: 12px;
      }

      .sat-attachment-dialog {
        width: 100%;
        height: min(82vh, 680px);
        min-height: 360px;
        border-radius: 13px;
      }

      .sat-attachment-header {
        padding-left: 14px;
      }

      .sat-attachment-title span {
        max-width: 58vw;
      }

      .sat-attachment-body {
        padding: 10px;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureViewer() {
  injectStyles();

  let viewer = document.getElementById(VIEWER_ID);
  if (viewer) return viewer;

  viewer = document.createElement('div');
  viewer.id = VIEWER_ID;
  viewer.className = 'sat-attachment-viewer';
  viewer.setAttribute('aria-hidden', 'true');
  viewer.innerHTML = `
    <div class="sat-attachment-dialog" role="dialog" aria-modal="true" aria-labelledby="sat-attachment-viewer-title">
      <div class="sat-attachment-header">
        <div class="sat-attachment-title">
          <strong id="sat-attachment-viewer-title">Archivo adjunto del reporte vecinal</strong>
          <span id="sat-attachment-file-name">—</span>
        </div>
        <button class="sat-attachment-close" type="button" aria-label="Cerrar visor" title="Cerrar">×</button>
      </div>
      <div class="sat-attachment-body">
        <div class="sat-attachment-loading">Cargando archivo adjunto…</div>
        <div class="sat-attachment-error">No se pudo mostrar el archivo adjunto.</div>
        <img class="sat-attachment-image" alt="Archivo adjunto del reporte vecinal" style="display:none;">
      </div>
    </div>
  `;

  viewer.querySelector('.sat-attachment-close')?.addEventListener('click', closeAttachmentViewer);
  viewer.addEventListener('click', event => {
    if (event.target === viewer) closeAttachmentViewer();
  });

  document.body.appendChild(viewer);
  return viewer;
}

function closeAttachmentViewer() {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;

  viewer.classList.remove('is-open');
  viewer.setAttribute('aria-hidden', 'true');

  const image = viewer.querySelector('.sat-attachment-image');
  if (image) {
    image.removeAttribute('src');
    image.style.display = 'none';
  }
}

function openAttachmentViewer(path) {
  if (!path) {
    showToast('El reporte no tiene archivo adjunto.', true);
    return;
  }

  const viewer = ensureViewer();
  const image = viewer.querySelector('.sat-attachment-image');
  const loading = viewer.querySelector('.sat-attachment-loading');
  const error = viewer.querySelector('.sat-attachment-error');
  const fileName = viewer.querySelector('#sat-attachment-file-name');

  if (!image) return;

  if (fileName) fileName.textContent = fileNameFromPath(path);
  if (loading) loading.style.display = 'flex';
  if (error) error.style.display = 'none';
  image.style.display = 'none';

  image.onload = () => {
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
    image.style.display = 'block';
  };

  image.onerror = () => {
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'flex';
    image.style.display = 'none';
  };

  image.src = path;
  viewer.classList.add('is-open');
  viewer.setAttribute('aria-hidden', 'false');
  viewer.querySelector('.sat-attachment-close')?.focus();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById(VIEWER_ID)?.classList.contains('is-open')) {
    closeAttachmentViewer();
  }
});

function installAttachmentViewerOverride() {
  window.viewIncidentAttachment = openAttachmentViewer;
  window.closeIncidentAttachment = closeAttachmentViewer;
}

// alerts.js define originalmente esta función para abrir una pestaña nueva.
// Reaplicamos el override después de la evaluación de módulos para que el visor
// interno sea siempre la implementación final, independientemente del orden de carga.
installAttachmentViewerOverride();
queueMicrotask(installAttachmentViewerOverride);
[0, 100, 500].forEach(delay => setTimeout(installAttachmentViewerOverride, delay));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installAttachmentViewerOverride, { once: true });
}

/**
 * Seguridad del portal vecinal.
 * Registro con identidad única dentro del SAT, Turnstile y preparación del
 * formulario de incidencias para vecinos autenticados.
 */
import { apiRequest } from './api.js';
import { showToast } from './modals.js';

let config = null;
let registerWidgetId = null;
let reportWidgetId = null;
const TURNSTILE_SITE_KEY_FALLBACK = '0x4AAAAAAFHy-GMbFmE81XFg';

function user() {
  try { return JSON.parse(localStorage.getItem('sat-user') || 'null'); }
  catch { return null; }
}

function isNeighbor() {
  return user()?.rol === 'Vecino';
}

async function loadConfig() {
  if (config) return config;
  const response = await fetch('/api/public-config', { cache: 'no-store' });
  config = await response.json();
  return config;
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sat-turnstile]');
    if (existing) {
      const wait = setInterval(() => {
        if (window.turnstile) { clearInterval(wait); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(wait); window.turnstile ? resolve() : reject(new Error('No se pudo cargar CAPTCHA.')); }, 6000);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.satTurnstile = '1';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar CAPTCHA.'));
    document.head.appendChild(script);
  });
}

function styles() {
  if (document.getElementById('neighbor-security-styles')) return;
  const style = document.createElement('style');
  style.id = 'neighbor-security-styles';
  style.textContent = `
    .neighbor-login-note{margin:10px 0 0;padding:0;background:transparent;border:0;font-size:11px;line-height:1.45;color:inherit}
    .neighbor-register-overlay{position:fixed;inset:0;z-index:10000;background:rgba(10,28,46,.72);display:none;align-items:center;justify-content:center;padding:18px}
    .neighbor-register-overlay.open{display:flex}
    .neighbor-register-card{width:min(520px,100%);max-height:94vh;overflow:auto;background:var(--blanco,#fff);border-radius:16px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .neighbor-register-card h2{margin:0 0 5px;color:var(--azul-oscuro)}
    .neighbor-register-card .sub{font-size:12px;color:var(--texto-sub);margin-bottom:18px;line-height:1.5}
    .neighbor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .neighbor-grid .wide{grid-column:1/-1}
    .neighbor-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
    .neighbor-captcha{min-height:65px;margin-top:12px}
    .neighbor-security-hint{font-size:11px;color:var(--texto-sub);line-height:1.45;margin-top:8px}
    @media(max-width:600px){.neighbor-grid{grid-template-columns:1fr}.neighbor-grid .wide{grid-column:auto}.neighbor-register-card{padding:18px}}
  `;
  document.head.appendChild(style);
}

function ensureRegistrationModal() {
  if (document.getElementById('neighbor-register-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'neighbor-register-modal';
  modal.className = 'neighbor-register-overlay';
  modal.innerHTML = `
    <div class="neighbor-register-card" role="dialog" aria-modal="true" aria-labelledby="neighbor-register-title">
      <h2 id="neighbor-register-title">Registro de vecino</h2>
      <div class="sub">Para enviar reportes vecinales necesitás una cuenta. El DNI y el correo sólo pueden asociarse a una cuenta dentro del SAT.</div>
      <div class="neighbor-grid">
        <div class="input-group wide"><label>Nombre y apellido *</label><input id="neighbor-name" autocomplete="name" maxlength="80"></div>
        <div class="input-group"><label>DNI *</label><input id="neighbor-dni" inputmode="numeric" maxlength="8" pattern="[0-9]{7,8}" placeholder="7 u 8 números"></div>
        <div class="input-group"><label>Teléfono</label><input id="neighbor-phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="+54 9 376 ..."></div>
        <div class="input-group wide"><label>Correo electrónico *</label><input id="neighbor-email" type="email" maxlength="120" autocomplete="email" placeholder="vecino@correo.com"></div>
        <div class="input-group"><label>Zona *</label>
          <select id="neighbor-zone">
            <option value="">Seleccionar...</option><option>Ribera Norte</option><option>Bajo Uruguay</option>
            <option>Costa Sur</option><option>Zona Alta</option><option>Puente</option><option>Arroyo</option><option>Otra zona</option>
          </select>
        </div>
        <div class="input-group"><label>Contraseña *</label><input id="neighbor-password" type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="8 a 72 caracteres"></div>
      </div>
      <div id="neighbor-register-captcha" class="neighbor-captcha"></div>
      <div id="neighbor-register-error" class="error-msg"></div>
      
      <div class="neighbor-actions">
        <button class="btn btn-ghost" type="button" onclick="closeNeighborRegistration()">Cancelar</button>
        <button class="btn btn-primary" type="button" onclick="registerNeighbor()">Crear cuenta</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) closeNeighborRegistration(); });
}

async function renderCaptcha(target, kind) {
  const cfg = await loadConfig();
  const host = document.getElementById(target);
  if (!host) return null;
  const siteKey = cfg.turnstileSiteKey || TURNSTILE_SITE_KEY_FALLBACK;
  if (!siteKey) {
    host.innerHTML = '';
    throw new Error('No se pudo cargar la verificación. Recargá la página e intentá nuevamente.');
  }
  await loadTurnstileScript();
  if (kind === 'register' && registerWidgetId !== null) window.turnstile.remove(registerWidgetId);
  if (kind === 'report' && reportWidgetId !== null) window.turnstile.remove(reportWidgetId);
  host.innerHTML = '';
  const id = window.turnstile.render(host, {
    sitekey: siteKey,
    theme: 'auto',
    'error-callback': () => showToast('No se pudo validar el CAPTCHA. Recargá la página e intentá nuevamente.', true),
  });
  if (kind === 'register') registerWidgetId = id;
  else reportWidgetId = id;
  return id;
}

export async function openNeighborRegistration() {
  styles();
  ensureRegistrationModal();
  document.getElementById('neighbor-register-modal')?.classList.add('open');
  try { await renderCaptcha('neighbor-register-captcha', 'register'); }
  catch (error) { showToast(error.message, true); }
}

export function closeNeighborRegistration() {
  document.getElementById('neighbor-register-modal')?.classList.remove('open');
}

export async function registerNeighbor() {
  const error = document.getElementById('neighbor-register-error');
  const token = registerWidgetId !== null && window.turnstile ? window.turnstile.getResponse(registerWidgetId) : '';
  const payload = {
    nombre: document.getElementById('neighbor-name')?.value.trim(),
    dni: document.getElementById('neighbor-dni')?.value.replace(/\D/g, ''),
    telefono: document.getElementById('neighbor-phone')?.value.trim(),
    email: document.getElementById('neighbor-email')?.value.trim(),
    zona: document.getElementById('neighbor-zone')?.value,
    password: document.getElementById('neighbor-password')?.value,
    turnstileToken: token,
  };
  try {
    error?.classList.remove('show');
    const data = await apiRequest('/vecinos/registro', { method:'POST', body:JSON.stringify(payload) });
    closeNeighborRegistration();
    const loginUser = document.getElementById('login-user');
    if (loginUser) loginUser.value = payload.email;
    showToast(data.message || 'Cuenta creada. Inicie sesión con su correo.');
  } catch (e) {
    if (error) { error.textContent = e.message; error.classList.add('show'); }
    if (registerWidgetId !== null && window.turnstile) window.turnstile.reset(registerWidgetId);
  }
}

export async function prepareNeighborReport() {
  if (!isNeighbor()) return;
  const u = user();
  const name = document.getElementById('rep-nombre');
  const dni = document.getElementById('rep-dni');
  if (name) { name.value = u.nombre || ''; name.readOnly = true; }
  if (dni) { dni.value = u.dni || ''; dni.readOnly = true; }
  const back = document.getElementById('rep-back-small');
  if (back) {
    back.textContent = '← Salir';
    back.setAttribute('onclick', 'exitNeighborSession()');
    back.style.display = 'inline-flex';
  }
  let host = document.getElementById('neighbor-report-captcha');
  if (!host) {
    host = document.createElement('div');
    host.id = 'neighbor-report-captcha';
    host.className = 'neighbor-captcha';
    document.getElementById('mobile-form-body')?.appendChild(host);
  }
  try { await renderCaptcha('neighbor-report-captcha', 'report'); }
  catch (error) { showToast(error.message, true); }
}

export function getNeighborReportCaptchaToken() {
  if (reportWidgetId === null || !window.turnstile) return '';
  return window.turnstile.getResponse(reportWidgetId) || '';
}

export function exitNeighborSession() {
  localStorage.removeItem('sat-token');
  localStorage.removeItem('sat-user');
  localStorage.removeItem('sat-last-screen');
  document.body.classList.remove('public-report-mode');
  window.navigate?.('s-login');
}

export function resetNeighborReportCaptcha() {
  if (reportWidgetId !== null && window.turnstile) window.turnstile.reset(reportWidgetId);
}

function init() {
  styles();
  ensureRegistrationModal();
  const oldButton = document.querySelector('.login-report-btn');
  if (oldButton) {
    oldButton.setAttribute('onclick', 'openNeighborRegistration()');
    oldButton.innerHTML = 'Crear cuenta de vecino';
  }
  const loginBox = document.querySelector('.login-box');
  if (loginBox && !loginBox.querySelector('.neighbor-login-note')) {
    const note = document.createElement('div');
    note.className = 'neighbor-login-note';
    note.innerHTML = '<strong>Vecinos:</strong> registrate una sola vez y luego iniciá sesión con tu correo para enviar reportes.';
    oldButton?.insertAdjacentElement('afterend', note);
  }
  window.addEventListener('sat:navigate', event => {
    if (event.detail?.id === 's-reporte' && isNeighbor()) setTimeout(prepareNeighborReport, 40);
  });
  if (document.getElementById('s-reporte')?.classList.contains('active') && isNeighbor()) prepareNeighborReport();
}

window.openNeighborRegistration = openNeighborRegistration;
window.closeNeighborRegistration = closeNeighborRegistration;
window.registerNeighbor = registerNeighbor;
window.getNeighborReportCaptchaToken = getNeighborReportCaptchaToken;
window.resetNeighborReportCaptcha = resetNeighborReportCaptcha;
window.exitNeighborSession = exitNeighborSession;
window.prepareNeighborReport = prepareNeighborReport;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();

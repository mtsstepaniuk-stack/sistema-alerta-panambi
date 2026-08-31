/**
 * Estimación operativa del tiempo de llegada para el prototipo.
 * Consume la estimación calculada por el backend a partir del historial
 * y las tendencias recientes de los sensores simulados.
 */

let lastRenderedKey = '';
let loading = false;

function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '—';
}

function renderEstimate(estimate = {}) {
  const values = document.querySelectorAll('#s-dash .kpi-value');
  const deltas = document.querySelectorAll('#s-dash .kpi-delta');
  if (values.length < 3) return;

  const etaValue = values[2];
  const etaDelta = deltas[2];
  const trendValue = values[1];
  const trendDelta = deltas[1];

  const hours = estimate.horas;
  const minutes = Number(estimate.minutos);
  const rate = Number(estimate.ritmo_m_h || 0);

  if (hours === 0 || Number(hours) === 0) {
    etaValue.textContent = 'Ahora';
  } else if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) {
    etaValue.textContent = '—';
  } else if (Number(hours) < 1 && Number.isFinite(minutes)) {
    etaValue.innerHTML = `${Math.max(1, minutes)}<span style="font-size:14px;color:var(--texto-sub)"> min</span>`;
  } else {
    etaValue.innerHTML = `${Number(hours).toFixed(1)}<span style="font-size:14px;color:var(--texto-sub)"> h</span>`;
  }

  if (etaDelta) {
    if (estimate.umbral_objetivo_m !== null && estimate.umbral_objetivo_m !== undefined) {
      etaDelta.textContent = `${estimate.zona || 'Zona monitoreada'} · próximo umbral ${formatNumber(estimate.umbral_objetivo_m)} m`;
    } else {
      etaDelta.textContent = estimate.estado || 'Sin estimación disponible';
    }
  }

  etaValue.title = `Estimación operativa del prototipo. Método: ${estimate.metodo || 'historial y tendencia de sensores'}.`;

  if (trendValue) {
    if (rate > 0.005) trendValue.textContent = 'Subiendo';
    else if (rate < -0.005) trendValue.textContent = 'Bajando';
    else trendValue.textContent = 'Estable';
  }

  if (trendDelta) {
    const prefix = rate > 0 ? '+' : '';
    trendDelta.textContent = `Ritmo estimado: ${prefix}${formatNumber(rate, 2)} m/h`;
    trendDelta.classList.toggle('kpi-delta-up', rate > 0.005);
  }
}

async function loadEstimate() {
  if (loading || !document.querySelector('#s-dash')) return;
  loading = true;
  try {
    const response = await fetch('/api/estimacion-llegada', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || !payload.estimacion) return;

    const estimate = payload.estimacion;
    const key = JSON.stringify(estimate);
    if (key === lastRenderedKey && document.querySelector('#s-dash .kpi-value')) return;
    lastRenderedKey = key;
    renderEstimate(estimate);
  } catch (error) {
    console.warn('Estimación de llegada:', error.message);
  } finally {
    loading = false;
  }
}

function dashboardIsActive() {
  return document.getElementById('s-dash')?.classList.contains('active');
}

function initArrivalEstimate() {
  const dashboard = document.getElementById('s-dash');
  if (!dashboard) return;

  const observer = new MutationObserver(() => {
    if (dashboardIsActive()) {
      lastRenderedKey = '';
      setTimeout(loadEstimate, 120);
    }
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ['class'] });

  if (dashboardIsActive()) loadEstimate();

  // Las lecturas se generan cada 15 minutos. Un refresco liviano por minuto
  // mantiene el KPI sincronizado sin generar nuevas mediciones por sí mismo.
  setInterval(() => {
    if (dashboardIsActive()) loadEstimate();
  }, 60_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArrivalEstimate, { once: true });
} else {
  initArrivalEstimate();
}

window.refreshArrivalEstimate = loadEstimate;

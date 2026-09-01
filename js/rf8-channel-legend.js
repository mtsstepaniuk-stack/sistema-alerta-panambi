/**
 * Ajuste visual RF8: leyenda compacta de canales en el Paso 2.
 */

function compactChannelLegend() {
  const legend = document.getElementById('emit-channel-legend');
  if (!legend) return;

  legend.style.display = 'flex';
  legend.style.alignItems = 'center';
  legend.style.gap = '18px';
  legend.style.flexWrap = 'wrap';
  legend.style.justifyContent = 'flex-start';
  legend.innerHTML = `
    <span>💬 = SMS</span>
    <span>📱 = WhatsApp</span>
    <span>📞 = Llamada</span>
    <span>📢 = Altoparlante</span>
  `;
}

function initCompactChannelLegend() {
  compactChannelLegend();

  const step2 = document.getElementById('emit-step-2');
  if (!step2) return;

  const observer = new MutationObserver(() => compactChannelLegend());
  observer.observe(step2, { childList: true, subtree: true, attributes: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCompactChannelLegend, { once: true });
} else {
  initCompactChannelLegend();
}

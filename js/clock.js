/**
 * Clock Module
 * Handles updating the real-time clock in the headerbar.
 */

export function initClock() {
  function updateClock() {
    const now = new Date();
    const str = now.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    ['topbar-clock', 'val-clock'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = str;
    });
  }

  // Update clock every second
  setInterval(updateClock, 1000);
  updateClock();
}

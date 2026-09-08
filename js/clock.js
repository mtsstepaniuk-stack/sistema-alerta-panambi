/**
 * Clock Module
 * Handles updating the real-time clock in the headerbar.
 */

import { ARGENTINA_TIME_ZONE } from './argentina-time.js';

export function initClock() {
  function updateClock() {
    const now = new Date();
    const str = now.toLocaleTimeString('es-AR', {
      timeZone: ARGENTINA_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
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

/**
 * Modals and Toast Notifications Module
 * Handles opening/closing overlays and showing popups.
 */

export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

export function showToast(msg, isError = false) {
  const toast = document.getElementById('global-toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className = 'toast visible' + (isError ? ' error' : '');

  // Reset toast class to hide it after 3.5 seconds
  setTimeout(() => {
    toast.className = 'toast';
  }, 3500);
}

export function doAction(modalId, msg) {
  closeModal(modalId);
  showToast(msg);
}

// Bind to window to allow inline onclick handlers in HTML to function
window.openModal = openModal;
window.closeModal = closeModal;
window.doAction = doAction;
window.showToast = showToast;

// Initialize backdrop click handler to close modals automatically
export function initModalsBackdrop() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });
}

// ============================================================
// CIFRA — Sistema de notificaciones emergentes (Toasts)
// ============================================================

import { escapeHtml } from "../utils/formatters.js";

let toastContainer = null;

// Reutiliza el contenedor mientras siga conectado al documento.
function getToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.querySelector("#toast-container");

    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toast-container";
      toastContainer.className = "toast-container";
      toastContainer.setAttribute("aria-live", "polite");
      toastContainer.setAttribute("aria-atomic", "true");
      document.body.appendChild(toastContainer);
    }
  }

  return toastContainer;
}

// Iconos integrados por categoría para evitar dependencias externas.
const icons = {
  success: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  `,
  error: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  `,
  warning: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `,
};

/**
 * Muestra una notificación emergente con la identidad visual de Cifra.
 * @param {string} message - Texto del mensaje.
 * @param {'success'|'error'|'warning'} [type='error'] - Categoría de la notificación.
 * @param {number} [duration=2500] - Tiempo en ms antes del cierre automático.
 */
export function notify(message, type = "error", duration = 2500) {
  if (!message) return;

  const validTypes = ["success", "error", "warning"];
  const finalType = validTypes.includes(type) ? type : "error";
  const container = getToastContainer();
  const toast = document.createElement("div");

  toast.className = `toast toast-${finalType}`;
  toast.setAttribute("role", finalType === "error" ? "alert" : "status");

  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">
      ${icons[finalType]}
    </span>
    <div class="toast-content">
      <p class="toast-message">${escapeHtml(message)}</p>
    </div>
    <button type="button" class="toast-close" aria-label="Cerrar notificación">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  let timeoutId = null;

  function dismiss() {
    if (toast.classList.contains("is-closing")) return;

    toast.classList.add("is-closing");
    toast.addEventListener(
      "animationend",
      () => {
        toast.remove();
      },
      { once: true },
    );

    // Respaldo si la animación no termina o se omite.
    setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, 300);
  }

  function startTimer() {
    if (duration > 0) {
      timeoutId = setTimeout(dismiss, duration);
    }
  }

  function pauseTimer() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  toast.addEventListener("mouseenter", pauseTimer);
  toast.addEventListener("mouseleave", startTimer);

  container.appendChild(toast);
  startTimer();
}

// Conserva el uso de alertas existentes y deja window.confirm intacto.
if (typeof window !== "undefined") {
  window.alert = (message) => {
    notify(String(message || ""), "error");
  };
}

let abortControllerRef = null;

export function setAbortControllerRef(getAbortController, setAbortController) {
  abortControllerRef = { get: getAbortController, set: setAbortController };
}

export function showMessage(text, type = 'info') {
  const existing = document.getElementById('toast-message');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-message';
  toast.className = `toast toast-${type}`;
  toast.textContent = text;

  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('visible'), 10);

  const duration = type === 'error' ? 8000 : 2500;
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);

  toast.addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  });
}

export function createProgressToast() {
  const existing = document.getElementById('toast-progress');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-progress';
  toast.className = 'toast toast-info';

  const text = document.createElement('span');
  text.textContent = 'Loading...';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'toast-cancel';
  cancelBtn.setAttribute('aria-label', 'Cancel loading');
  cancelBtn.innerHTML = '<span class="icon-mask icon-mask--circle-x" aria-hidden="true"></span>';
  cancelBtn.onclick = () => {
    if (abortControllerRef) {
      const ac = abortControllerRef.get();
      if (ac) {
        ac.abort();
        abortControllerRef.set(null);
      }
    }
    removeProgressToast(toast);
  };

  toast.appendChild(text);
  toast.appendChild(cancelBtn);
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);

  return toast;
}

export function updateProgressToast(toast, text) {
  if (toast) {
    const textSpan = toast.querySelector('span');
    if (textSpan) textSpan.textContent = text;
  }
}

export function removeProgressToast(toast) {
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }
}

// Auto-dismissing warning toast for rate-limit events.
// durationMs controls how long it stays — pass the actual wait time so it
// disappears right as the retry fires.
export function showRateLimitWarning(msg, durationMs = 5000) {
  const existing = document.getElementById('toast-rate-limit');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-rate-limit';
  toast.className = 'toast toast-warning';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);

  toast.addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  });
}

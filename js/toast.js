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
  cancelBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-6.489 5.8a1 1 0 0 0 -1.218 1.567l1.292 1.293l-1.292 1.293l-.083 .094a1 1 0 0 0 1.497 1.32l1.293 -1.292l1.293 1.292l.094 .083a1 1 0 0 0 1.32 -1.497l-1.292 -1.293l1.292 -1.293l.083 -.094a1 1 0 0 0 -1.497 -1.32l-1.293 1.292l-1.293 -1.292l-.094 -.083z" /></svg>';
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

export function defaultState() {
  const today = new Date().toISOString().slice(0,10);
  const yearEnd = today.slice(0,4) + '-12-31';
  return {
    mode: 'overview',
    entities: [],
    periods: [],
    date: { start: today, end: yearEnd },
    prefs: { showNormals: true, showAllBands: false, showGrid: true }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem('gor:v1');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load state', e);
  }
  return defaultState();
}

export function saveState(state) {
  try {
    localStorage.setItem('gor:v1', JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state', e);
  }
}

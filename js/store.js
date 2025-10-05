export function defaultState() {
  const today = new Date().toISOString().slice(0,10);
  const jan1 = today.slice(0,4) + '-01-01';
  return {
    mode: 'comparison',
    entities: [],
    periods: [],
    date: { start: jan1, end: today, endIsToday: true },
    periodic: {
      city: null,
      years: [],
      periodStart: '',
      periodEnd: ''
    },
    prefs: { showNormals: true, showAllBands: false, showGrid: true },
    lastCityLabel: ''
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem('gor:v1');
    if (raw) return normalizeState(JSON.parse(raw));
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

function normalizeState(state) {
  const base = defaultState();
  const incomingDate = state && state.date ? state.date : {};
  const normalizedDate = {
    ...base.date,
    ...incomingDate,
    endIsToday: incomingDate && typeof incomingDate.endIsToday === 'boolean' ? incomingDate.endIsToday : base.date.endIsToday
  };

  // Normalize periodic config
  const incomingPeriodic = state && state.periodic ? state.periodic : {};
  const normalizedPeriodic = {
    ...base.periodic,
    ...incomingPeriodic,
    years: Array.isArray(incomingPeriodic.years) ? incomingPeriodic.years : base.periodic.years
  };

  // Migrate old 'single' mode to 'comparison'
  let mode = state?.mode || base.mode;
  if (mode === 'single') mode = 'comparison';

  return {
    ...base,
    ...state,
    mode,
    date: normalizedDate,
    periodic: normalizedPeriodic,
    prefs: { ...base.prefs, ...(state && state.prefs ? state.prefs : {}) },
    entities: Array.isArray(state?.entities) ? state.entities : base.entities,
    lastCityLabel: typeof state?.lastCityLabel === 'string' ? state.lastCityLabel : base.lastCityLabel
  };
}

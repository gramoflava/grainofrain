import { loadState, saveState } from './store.js';
import { fetchDaily, fetchNormals, getLocationFromIP, clearDailyCache } from './api.js';
import { initRawDataMode, destroyRawDataMode } from './rawdata.js';
import { saveLocation } from './locations.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll, renderCompare, setHydroTab, setTempFocus } from './charts.js';
import { exportPng, copyPngToClipboard } from './export.js';
import { createCitySelector } from './city-selector.js';
import { fillStats, fillStatsPeriodic, fillStatsProgression } from './stats.js';
import { showMessage, createProgressToast, updateProgressToast, removeProgressToast, showRateLimitWarning, setAbortControllerRef } from './toast.js';
import {
  isFiniteNumber, escapeHtml, sanitizeDate, isoToday, isoYearStart,
  addDays, formatCityLabel, getUniqueCityKey, average, sum,
  arrayMax, arrayMin, arrayMean, arraySum,
  applySmoothingAndTrim, detectPlatform
} from './utils.js';

const COLOR_PALETTE = [
  '#1E88E5', // blue
  '#FB8C00', // orange
  '#8E24AA', // purple
  '#00ACC1', // teal
  '#E53935', // red
  '#43A047', // green
  '#F9A825', // amber
  '#3949AB', // indigo
];
const MM_DD_REGEX = /^\d{2}-\d{2}$/;
const MAX_CITIES = 3;
const MAX_SMOOTHING_WINDOW = 14;
const MAX_SMOOTHING_PADDING = Math.floor(MAX_SMOOTHING_WINDOW / 2);

let state = loadState();
const charts = initCharts();
let selectedCities = [];
let periodicCity = null;
let progressionCity = null;
let selectedYears = [];
let abortController = null;
let _loadProgress = null; // { loaded, total } — updated during progression loading
let hasData = false;
let _periodicRaw = null; // { city, years, periodStart, periodEnd, padding, entries: [{daily,startIso,endIso}], normals }
let _comparisonDebounceTimer = null;

setAbortControllerRef(() => abortController, (v) => { abortController = v; });

// DOM elements
const modeSelector = document.getElementById('mode-selector');
const smoothingSelector = document.getElementById('smoothing-selector');
const comparisonControls = document.getElementById('controls-comparison');
const periodicControls = document.getElementById('controls-periodic');
const progressionControls = document.getElementById('controls-progression');
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const statsDom = document.getElementById('stats');
const workspaceDom = document.getElementById('workspace');
const workspaceStub = document.getElementById('workspace-stub');
const rdmContainer = document.getElementById('rdm-container');
const citySearchInput = document.getElementById('city-search');
const cityTagsContainer = document.getElementById('city-tags');
const cityDropdown = document.getElementById('city-dropdown');
const periodicCitySearchInput = document.getElementById('periodic-city-search');
const periodicCityDropdown = document.getElementById('periodic-city-dropdown');
const yearInput = document.getElementById('year-input');
const yearTagsContainer = document.getElementById('year-tags');
const periodStartInput = document.getElementById('period-start');
const periodEndInput = document.getElementById('period-end');
const progressionCitySearchInput = document.getElementById('progression-city-search');
const progressionCityDropdown = document.getElementById('progression-city-dropdown');
const periodTypeSelect = document.getElementById('period-type');
const seasonSelect = document.getElementById('season-select');
const monthSelect = document.getElementById('month-select');
const daySelect = document.getElementById('day-select');
const yearFromInput = document.getElementById('year-from');
const yearToInput = document.getElementById('year-to');

// Initialize
prefillInputs();
bindControls();
setupModeSelector();
setupSmoothingSelector();
setupOverflowBtn();
setupColorPicker();
setupTempFocusSwitch();
setupCitySelectors();
setupYearTagSelector();
setupPeriodTypeSelector();
setupAutoLocationButtons();
startInput.addEventListener('change', () => scheduleComparisonApply(300));
endInput.addEventListener('change', () => scheduleComparisonApply(300));
yearFromInput.addEventListener('change', () => { if (state.mode === 'progression') showModeStub('progression'); });
yearToInput.addEventListener('change', () => { if (state.mode === 'progression') showModeStub('progression'); });
restoreCityTags();
restorePeriodicInputs();
restoreProgressionInputs();
showNoDataPlaceholder();
autoApplyOnLoad();

// Show a separate rate-limit warning toast that auto-dismisses when the retry fires
window.addEventListener('api-rate-limited', (e) => {
  const { waitMs } = e.detail;
  const retryAt = new Date(Date.now() + waitMs);
  const hh = retryAt.getHours().toString().padStart(2, '0');
  const mm = retryAt.getMinutes().toString().padStart(2, '0');
  const ss = retryAt.getSeconds().toString().padStart(2, '0');
  const progressPart = _loadProgress ? ` · ${_loadProgress.loaded}/${_loadProgress.total} loaded` : '';
  showRateLimitWarning(`Rate limited${progressPart} — retrying at ${hh}:${mm}:${ss}`, waitMs);
});

// Resize ECharts on window/orientation change
window.addEventListener('resize', () => {
  if (charts.temp) charts.temp.resize();
  if (charts.hydro) charts.hydro.resize();
});

// Sub-chart tab buttons
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setHydroTab(btn.dataset.tab);
  });
});

// --- Mode & Controls ---

function setupTempFocusSwitch() {
  const btns = document.querySelectorAll('.tab-btn[data-focus]');
  const current = state.prefs.tempFocus || 'mean';
  btns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.focus === current);
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.prefs.tempFocus = btn.dataset.focus;
      saveState(state);
      setTempFocus(btn.dataset.focus);
    });
  });
}

function setupModeSelector() {
  modeSelector.value = state.mode;
  switchMode(state.mode);

  modeSelector.addEventListener('change', (e) => {
    state.mode = e.target.value;
    saveState(state);
    switchMode(state.mode);
    updateSmoothingVisibility();
    const modeOv = document.getElementById('mode-selector-ov');
    if (modeOv) modeOv.value = e.target.value;
  });
}

function setupSmoothingSelector() {
  smoothingSelector.value = state.prefs.smoothing || 0;
  updateSmoothingVisibility();

  smoothingSelector.addEventListener('change', (e) => {
    state.prefs.smoothing = parseInt(e.target.value, 10);
    saveState(state);
    if (state.mode === 'comparison' && hasData) {
      scheduleComparisonApply();
    } else if (state.mode === 'periodic' && hasData) {
      applyPeriodic();
    }
    const smoothingOv = document.getElementById('smoothing-selector-ov');
    if (smoothingOv) smoothingOv.value = e.target.value;
  });
}

function scheduleComparisonApply(delay = 0) {
  if (state.mode !== 'comparison') return;
  clearTimeout(_comparisonDebounceTimer);
  _comparisonDebounceTimer = setTimeout(() => {
    if (selectedCities.length > 0 && startInput.value && endInput.value) {
      applyComparison();
    }
  }, delay);
}

function updateSmoothingVisibility() {
  const visible = state.mode === 'comparison' || state.mode === 'periodic';
  smoothingSelector.style.display = visible ? '' : 'none';
  const smoothingOv = document.getElementById('smoothing-selector-ov');
  if (smoothingOv) smoothingOv.style.display = visible ? '' : 'none';
}

function switchMode(mode) {
  comparisonControls.classList.add('hidden');
  periodicControls.classList.add('hidden');
  progressionControls.classList.add('hidden');

  workspaceDom.classList.add('no-data');
  hasData = false;
  updateExportButtons();

  const isRawData = mode === 'rawdata';
  const chartsDom = document.getElementById('charts');
  const panelDom  = document.getElementById('panel');

  if (isRawData) {
    if (chartsDom) chartsDom.style.display = 'none';
    if (panelDom)  panelDom.style.display  = 'none';
    workspaceStub.classList.add('hidden');
    rdmContainer.classList.remove('hidden');
    initRawDataMode(rdmContainer);
    return;
  }

  // Leaving rawdata mode — restore charts/panel
  destroyRawDataMode();
  if (chartsDom) chartsDom.style.display = '';
  if (panelDom)  panelDom.style.display  = '';
  rdmContainer.classList.add('hidden');

  if (mode === 'comparison') {
    comparisonControls.classList.remove('hidden');
    if (selectedCities.length > 0 && startInput.value && endInput.value) {
      applyComparison();
    } else {
      showWelcomeStub();
    }
  } else if (mode === 'periodic') {
    periodicControls.classList.remove('hidden');
    showModeStub('periodic');
  } else if (mode === 'progression') {
    progressionControls.classList.remove('hidden');
    showModeStub('progression');
  }
  renderOverflowTags();
}

function bindControls() {
  const controlsForm = document.getElementById('controls');
  if (controlsForm) {
    controlsForm.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }

  const downloadBtn = document.getElementById('download');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (!hasData) return;
      try {
        await exportPng('workspace', buildFilename());
        showMessage('✓ Chart downloaded', 'success');
      } catch (err) {
        console.error(err);
        showMessage('Download failed: ' + (err.message || 'Unknown error'), 'error');
      }
    });
  }

  const copyBtn = document.getElementById('copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!hasData) return;
      try {
        await copyPngToClipboard('workspace');
        showMessage('✓ Charts copied to clipboard', 'success');
      } catch (err) {
        console.error(err);
        handleClipboardError(err);
      }
    });
  }

  document.getElementById('reset').addEventListener('click', resetAll);

  const resetOvBtn = document.getElementById('reset-ov');
  if (resetOvBtn) resetOvBtn.addEventListener('click', resetAll);
}

// --- City Selectors (unified) ---

function setupCitySelectors() {
  createCitySelector({
    input: citySearchInput,
    dropdown: cityDropdown,
    controlsId: 'controls-comparison',
    onSelect: addCityTag
  });

  createCitySelector({
    input: periodicCitySearchInput,
    dropdown: periodicCityDropdown,
    controlsId: 'controls-periodic',
    onSelect: selectPeriodicCity
  });

  createCitySelector({
    input: progressionCitySearchInput,
    dropdown: progressionCityDropdown,
    controlsId: 'controls-progression',
    onSelect: selectProgressionCity
  });
}

function hasSelectedCity(city) {
  const key = getUniqueCityKey(city);
  return selectedCities.some(candidate => getUniqueCityKey(candidate) === key);
}

function getCityTagLabel(city) {
  const duplicateNameCount = selectedCities.filter(candidate => candidate?.name === city?.name).length;
  if (duplicateNameCount > 1) return formatCityLabel(city);
  return city?.name || '';
}

function addCityTag(city) {
  if (selectedCities.length >= MAX_CITIES) return;
  if (hasSelectedCity(city)) return;

  saveLocation(city.lat, city.lon, city);
  selectedCities.push(city);
  renderCityTags();
  updateCitySearchState();
  citySearchInput.value = '';
  cityDropdown.classList.remove('visible');
  scheduleComparisonApply();
}

function removeCityTag(index) {
  selectedCities.splice(index, 1);
  renderCityTags();
  updateCitySearchState();
  if (selectedCities.length > 0) {
    scheduleComparisonApply();
  } else {
    showWelcomeStub();
  }
}

function renderCityTags() {
  cityTagsContainer.innerHTML = selectedCities.map((city, index) => {
    const key = getCityColorKey(city);
    const color = assignColor(key);
    const hideClass = index > 0 ? ' hide-md' : '';
    const fullLabel = formatCityLabel(city);
    return `
      <div class="city-tag${hideClass}" data-color-key="${escapeHtml(key)}" style="background:${color}" title="${escapeHtml(fullLabel)}">
        <span class="city-tag-name">${escapeHtml(getCityTagLabel(city))}</span>
        <span class="city-tag-remove" data-index="${index}">×</span>
      </div>
    `;
  }).join('');

  cityTagsContainer.querySelectorAll('.city-tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCityTag(parseInt(btn.getAttribute('data-index'), 10));
    });
  });

  cityTagsContainer.querySelectorAll('.city-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      if (e.target.classList.contains('city-tag-remove')) return;
      e.stopPropagation();
      openColorPicker(tag, tag.dataset.colorKey);
    });
  });

  renderOverflowTags();
}

function updateCitySearchState() {
  const cityInputWrapper = citySearchInput.closest('.city-input-wrapper');
  if (selectedCities.length >= MAX_CITIES) {
    if (cityInputWrapper) cityInputWrapper.classList.add('hidden');
  } else {
    if (cityInputWrapper) cityInputWrapper.classList.remove('hidden');
    citySearchInput.disabled = false;
    citySearchInput.placeholder = `City ${selectedCities.length + 1}/${MAX_CITIES}`;
  }
}

function selectPeriodicCity(city) {
  saveLocation(city.lat, city.lon, city);
  periodicCity = city;
  periodicCitySearchInput.value = city.name || '';
  periodicCityDropdown.classList.remove('visible');
  if (state.mode === 'periodic') showModeStub('periodic');
}

function selectProgressionCity(city) {
  saveLocation(city.lat, city.lon, city);
  progressionCity = city;
  progressionCitySearchInput.value = city.name || '';
  progressionCityDropdown.classList.remove('visible');
  if (state.mode === 'progression') showModeStub('progression');
}

// --- Year Tags ---

function setupYearTagSelector() {
  yearInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addYearTag();
    }
  });
  yearInput.addEventListener('blur', () => addYearTag());
}

function addYearTag() {
  const yearValue = yearInput.value.trim();
  if (!yearValue) return;

  const year = parseInt(yearValue, 10);
  if (isNaN(year) || year < 1940 || year > 2100) {
    showMessage('Year must be between 1940 and 2100', 'error');
    yearInput.value = '';
    return;
  }
  if (selectedYears.length >= 3) {
    showMessage('Maximum 3 years', 'error');
    yearInput.value = '';
    return;
  }
  if (selectedYears.includes(year)) {
    showMessage('Year already added', 'error');
    yearInput.value = '';
    return;
  }

  selectedYears.push(year);
  renderYearTags();
  updateYearInputState();
  yearInput.value = '';
  if (state.mode === 'periodic') showModeStub('periodic');
}

function removeYearTag(index) {
  selectedYears.splice(index, 1);
  renderYearTags();
  updateYearInputState();
  if (state.mode === 'periodic') showModeStub('periodic');
}

function renderYearTags() {
  yearTagsContainer.innerHTML = selectedYears.map((year, index) => {
    const key = getYearColorKey(year);
    const color = assignColor(key);
    const hideClass = index > 0 ? ' hide-md' : '';
    return `
      <div class="year-tag${hideClass}" data-color-key="${escapeHtml(key)}" style="background:${color}">
        <span class="year-tag-name">${year}</span>
        <span class="year-tag-remove" data-index="${index}">×</span>
      </div>
    `;
  }).join('');

  yearTagsContainer.querySelectorAll('.year-tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeYearTag(parseInt(btn.getAttribute('data-index'), 10));
    });
  });

  yearTagsContainer.querySelectorAll('.year-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      if (e.target.classList.contains('year-tag-remove')) return;
      e.stopPropagation();
      openColorPicker(tag, tag.dataset.colorKey);
    });
  });

  renderOverflowTags();
}

function updateYearInputState() {
  if (selectedYears.length >= 3) {
    yearInput.style.display = 'none';
  } else {
    yearInput.style.display = '';
    yearInput.disabled = false;
    yearInput.placeholder = `Year ${selectedYears.length + 1}/3`;
  }
}

// --- Period Type ---

function setupPeriodTypeSelector() {
  const updatePeriodFields = () => {
    const periodType = periodTypeSelect.value;
    seasonSelect.style.display = 'none';
    monthSelect.style.display = 'none';
    daySelect.style.display = 'none';

    if (periodType === 'season') seasonSelect.style.display = '';
    else if (periodType === 'month') monthSelect.style.display = '';
    else if (periodType === 'day') daySelect.style.display = '';
  };

  periodTypeSelect.addEventListener('change', updatePeriodFields);
  updatePeriodFields();
}

// --- Apply (data fetch & render) ---

async function applyComparison() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  const startValue = startInput.value.trim();
  const endValue = endInput.value.trim();
  if (!startValue || !endValue) return showMessage('Fill all fields', 'error');
  if (selectedCities.length === 0) return showMessage('Add at least one city', 'error');

  const startIso = sanitizeDate(startValue);
  if (!startIso) { showMessage('Start date must use YYYY-MM-DD', 'error'); startInput.focus(); return; }
  const endIso = sanitizeDate(endValue);
  if (!endIso) { showMessage('End date must use YYYY-MM-DD', 'error'); endInput.focus(); return; }
  if (startIso > endIso) { showMessage('Start date must be before end date', 'error'); startInput.focus(); return; }

  const today = isoToday();
  const endIsToday = endIso === today;
  startInput.value = startIso;
  endInput.value = endIsToday ? today : endIso;

  const smoothing = state.prefs.smoothing || 0;
  const paddedStart = addDays(startIso, -MAX_SMOOTHING_PADDING);
  const paddedEnd = addDays(endIso, MAX_SMOOTHING_PADDING);

  let loadingToast = null;

  try {
    abortController = new AbortController();
    const signal = abortController.signal;
    const entities = [];
    const allSeries = [];
    const allStats = [];

    if (selectedCities.length > 1) loadingToast = createProgressToast();

    for (let i = 0; i < selectedCities.length; i++) {
      if (selectedCities.length > 1) updateProgressToast(loadingToast, `Loading ${i + 1}/${selectedCities.length}...`);
      if (signal.aborted) throw new Error('Cancelled');

      const geo = selectedCities[i];
      const label = formatCityLabel(geo);

      const daily = await fetchDaily(geo.lat, geo.lon, paddedStart, paddedEnd, signal);

      let normals = null;
      if (state.prefs.showNormals) {
        try { normals = await fetchNormals(geo.lat, geo.lon, signal); } catch (e) { normals = null; }
      }

      let rawSeries = buildSeries(daily, null, null, normals);
      let trimmedRawSeries = applySmoothingAndTrim(rawSeries, 0, startIso, endIso);
      let smoothedSeries = smoothing > 0 ? applySmoothingAndTrim(rawSeries, smoothing, startIso, endIso) : trimmedRawSeries;

      entities.push({
        type: 'city', name: geo.name, country: geo.country || null,
        admin1: geo.admin1 || null, lat: geo.lat, lon: geo.lon, label
      });
      allSeries.push(smoothedSeries);
      allStats.push(computeStats(trimmedRawSeries));
    }

    if (entities.length === 1) {
      renderAll(charts, allSeries[0], assignColor(getCityColorKey(selectedCities[0])), state.prefs, entities[0].label);
      fillStats(statsDom, [allStats[0]], [entities[0].label], startIso, endIso, smoothing);
    } else {
      const labels = entities.map(e => e.label);
      const colors = selectedCities.map(c => assignColor(getCityColorKey(c)));
      renderCompare(charts, allSeries, colors, state.prefs, labels);
      fillStats(statsDom, allStats, labels, startIso, endIso, smoothing);
    }

    if (loadingToast) removeProgressToast(loadingToast);
    showDataView();
    state.entities = entities;
    state.date = { start: startIso, end: endIso, endIsToday };
    saveState(state);
  } catch (e) {
    console.error(e);
    if (loadingToast) removeProgressToast(loadingToast);
    if (e.message !== 'Cancelled') showMessage(e.message || 'An error occurred', 'error');
  } finally {
    abortController = null;
  }
}

async function applyPeriodic() {
  if (!periodicCity) return showMessage('Select a city', 'error');
  if (selectedYears.length === 0) return showMessage('Add at least one year', 'error');

  let periodStart = periodStartInput.value.trim();
  let periodEnd = periodEndInput.value.trim();
  if (!periodStart) { periodStart = '01-01'; periodStartInput.value = periodStart; }
  if (!periodEnd) { periodEnd = '12-31'; periodEndInput.value = periodEnd; }
  if (!MM_DD_REGEX.test(periodStart) || !MM_DD_REGEX.test(periodEnd)) {
    return showMessage('Period must use MM-DD format', 'error');
  }

  const smoothing = state.prefs.smoothing || 0;

  // Reuse cached raw data when params match and stored padding covers current needs
  const cached = _periodicRaw;
  const canReuse = cached &&
    cached.city.lat === periodicCity.lat &&
    cached.city.lon === periodicCity.lon &&
    JSON.stringify(cached.years) === JSON.stringify(selectedYears) &&
    cached.periodStart === periodStart &&
    cached.periodEnd === periodEnd &&
    cached.padding >= MAX_SMOOTHING_PADDING;

  let loadingToast = null;

  try {
    const allSeries = [];
    const allStats = [];
    const labels = [];
    let entries, sharedNormals;

    if (canReuse) {
      entries = cached.entries;
      sharedNormals = cached.normals;
    } else {
      abortController = new AbortController();
      const signal = abortController.signal;
      entries = [];
      sharedNormals = null;

      if (selectedYears.length > 1) loadingToast = createProgressToast();

      for (let i = 0; i < selectedYears.length; i++) {
        if (selectedYears.length > 1) updateProgressToast(loadingToast, `Loading ${i + 1}/${selectedYears.length}...`);
        if (signal.aborted) throw new Error('Cancelled');

        const year = selectedYears[i];
        const startIso = `${year}-${periodStart}`;
        const endIso = `${year}-${periodEnd}`;
        const paddedStart = addDays(startIso, -MAX_SMOOTHING_PADDING);
        const paddedEnd = addDays(endIso, MAX_SMOOTHING_PADDING);

        const daily = await fetchDaily(periodicCity.lat, periodicCity.lon, paddedStart, paddedEnd, signal);

        if (state.prefs.showNormals && i === 0) {
          try { sharedNormals = await fetchNormals(periodicCity.lat, periodicCity.lon, signal); } catch (e) { sharedNormals = null; }
        }

        entries.push({ daily, startIso, endIso });
      }

      _periodicRaw = {
        city: periodicCity,
        years: [...selectedYears],
        periodStart,
        periodEnd,
        padding: MAX_SMOOTHING_PADDING,
        entries,
        normals: sharedNormals
      };
      abortController = null;
    }

    for (let i = 0; i < entries.length; i++) {
      const { daily, startIso, endIso } = entries[i];
      const year = selectedYears[i];
      let rawSeries = buildSeries(daily, null, null, state.prefs.showNormals ? sharedNormals : null);
      let trimmedRawSeries = applySmoothingAndTrim(rawSeries, 0, startIso, endIso);
      let smoothedSeries = smoothing > 0 ? applySmoothingAndTrim(rawSeries, smoothing, startIso, endIso) : trimmedRawSeries;
      
      allSeries.push(smoothedSeries);
      allStats.push(computeStats(trimmedRawSeries));
      labels.push(year.toString());
    }

    if (allSeries.length === 1) {
      renderAll(charts, allSeries[0], assignColor(getYearColorKey(selectedYears[0])), state.prefs, labels[0]);
    } else {
      const colors = selectedYears.map(y => assignColor(getYearColorKey(y)));
      renderCompare(charts, normalizePeriodicCompareSeries(allSeries), colors, state.prefs, labels);
    }

    fillStatsPeriodic(statsDom, allStats, labels, periodicCity.name || 'City', periodStart, periodEnd, smoothing);
    if (loadingToast) removeProgressToast(loadingToast);

    showDataView();
    state.periodic = { city: periodicCity, years: selectedYears, periodStart, periodEnd };
    saveState(state);
  } catch (e) {
    console.error(e);
    if (loadingToast) removeProgressToast(loadingToast);
    if (e.message !== 'Cancelled') showMessage(e.message || 'An error occurred', 'error');
  } finally {
    abortController = null;
  }
}

async function applyProgression() {
  if (!progressionCity) return showMessage('Select a city', 'error');

  const yearFrom = parseInt(yearFromInput.value.trim(), 10);
  const yearTo = parseInt(yearToInput.value.trim(), 10);
  if (isNaN(yearFrom) || isNaN(yearTo)) return showMessage('Fill year range', 'error');
  if (yearFrom > yearTo) return showMessage('From year must be before To year', 'error');

  const yearRange = yearTo - yearFrom + 1;

  const periodType = periodTypeSelect.value;
  let periodConfig = {};
  if (periodType === 'season') {
    periodConfig = { type: 'season', value: seasonSelect.value };
  } else if (periodType === 'month') {
    periodConfig = { type: 'month', value: monthSelect.value };
  } else if (periodType === 'day') {
    const dayValue = daySelect.value.trim();
    if (!MM_DD_REGEX.test(dayValue)) return showMessage('Day must use MM-DD format', 'error');
    periodConfig = { type: 'day', value: dayValue };
  } else {
    periodConfig = { type: 'year' };
  }

  let loadingToast = null;

  try {
    abortController = new AbortController();
    const signal = abortController.signal;
    const allSeries = [];
    const allStats = [];
    const labels = [];
    const totalYears = yearTo - yearFrom + 1;
    let sharedNormals = null;

    if (state.prefs.showNormals) {
      try { sharedNormals = await fetchNormals(progressionCity.lat, progressionCity.lon, signal); } catch (e) { sharedNormals = null; }
    }

    loadingToast = createProgressToast();
    const loadStart = Date.now();
    _loadProgress = { loaded: 0, total: totalYears };

    for (let year = yearFrom; year <= yearTo; year++) {
      if (signal.aborted) throw new Error('Cancelled');

      const currentIndex = year - yearFrom + 1;
      updateProgressToast(loadingToast, `Loading ${year}… (${currentIndex - 1}/${totalYears})`);
      _loadProgress = { loaded: currentIndex - 1, total: totalYears };

      const { startDate, endDate } = getPeriodDates(year, periodConfig);

      const daily = await fetchDaily(progressionCity.lat, progressionCity.lon, startDate, endDate, signal);
      allSeries.push(buildSeries(daily, null, null, sharedNormals));
      allStats.push(computeStats(allSeries[allSeries.length - 1]));
      labels.push(year.toString());
      _loadProgress = { loaded: currentIndex, total: totalYears };
    }

    const aggregatedStats = aggregateProgressionStats(allStats);
    const progressionSeries = aggregateSeriesForProgression(allSeries, labels);

    renderAll(charts, progressionSeries, assignColor(getCityColorKey(progressionCity)), state.prefs, progressionCity.name);
    fillStatsProgression(statsDom, aggregatedStats, progressionCity.name, formatPeriodLabel(periodConfig), yearFrom, yearTo);

    const elapsed = formatDuration(Date.now() - loadStart);
    updateProgressToast(loadingToast, `${totalYears}/${totalYears} loaded in ${elapsed}`);
    setTimeout(() => removeProgressToast(loadingToast), 4000);
    showDataView();

    state.progression = { city: progressionCity, periodConfig, yearFrom, yearTo };
    saveState(state);
  } catch (e) {
    console.error(e);
    if (loadingToast) removeProgressToast(loadingToast);
    if (e.message !== 'Cancelled') {
      showMessage(e.message || 'An error occurred', 'error');
    }
  } finally {
    abortController = null;
    _loadProgress = null;
  }
}

function formatDuration(ms) {
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --- Progression helpers ---

function getPeriodDates(year, periodConfig) {
  if (periodConfig.type === 'year') {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  } else if (periodConfig.type === 'season') {
    const seasons = {
      winter: { start: '12-01', end: isLeapYear(year) ? '02-29' : '02-28' },
      spring: { start: '03-01', end: '05-31' },
      summer: { start: '06-01', end: '08-31' },
      fall: { start: '09-01', end: '11-30' }
    };
    const season = seasons[periodConfig.value];
    if (periodConfig.value === 'winter') {
      return { startDate: `${year - 1}-${season.start}`, endDate: `${year}-${season.end}` };
    }
    return { startDate: `${year}-${season.start}`, endDate: `${year}-${season.end}` };
  } else if (periodConfig.type === 'month') {
    const month = parseInt(periodConfig.value, 10);
    const monthStr = month.toString().padStart(2, '0');
    const daysInMonth = new Date(year, month, 0).getDate();
    return { startDate: `${year}-${monthStr}-01`, endDate: `${year}-${monthStr}-${daysInMonth}` };
  } else if (periodConfig.type === 'day') {
    return { startDate: `${year}-${periodConfig.value}`, endDate: `${year}-${periodConfig.value}` };
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function formatPeriodLabel(periodConfig) {
  if (periodConfig.type === 'year') return 'Whole year';
  if (periodConfig.type === 'season') return periodConfig.value.charAt(0).toUpperCase() + periodConfig.value.slice(1);
  if (periodConfig.type === 'month') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[parseInt(periodConfig.value, 10) - 1];
  }
  if (periodConfig.type === 'day') return periodConfig.value;
}

function normalizePeriodicCompareSeries(allSeries) {
  const axis = [...new Set(allSeries.flatMap(series => (series?.x || []).map(toMonthDayKey)))]
    .filter(Boolean)
    .sort();

  const sharedNormMaps = {
    norm: buildSharedPeriodicFieldMap(allSeries, 'norm'),
    normMax: buildSharedPeriodicFieldMap(allSeries, 'normMax'),
    normMin: buildSharedPeriodicFieldMap(allSeries, 'normMin')
  };

  return allSeries.map(series => {
    const fieldMaps = {
      tempMax: buildPeriodicFieldMap(series.x, series.tempMax),
      tempMin: buildPeriodicFieldMap(series.x, series.tempMin),
      tempMean: buildPeriodicFieldMap(series.x, series.tempMean),
      precip: buildPeriodicFieldMap(series.x, series.precip),
      rain: buildPeriodicFieldMap(series.x, series.rain),
      snow: buildPeriodicFieldMap(series.x, series.snow),
      humidity: buildPeriodicFieldMap(series.x, series.humidity),
      wind: buildPeriodicFieldMap(series.x, series.wind),
      windMax: buildPeriodicFieldMap(series.x, series.windMax),
      windGusts: buildPeriodicFieldMap(series.x, series.windGusts),
      sunshineDuration: buildPeriodicFieldMap(series.x, series.sunshineDuration),
      daylightDuration: buildPeriodicFieldMap(series.x, series.daylightDuration)
    };

    return {
      x: axis,
      dates: axis,
      tempMax: axis.map(key => fieldMaps.tempMax.get(key) ?? null),
      tempMin: axis.map(key => fieldMaps.tempMin.get(key) ?? null),
      tempMean: axis.map(key => fieldMaps.tempMean.get(key) ?? null),
      precip: axis.map(key => fieldMaps.precip.get(key) ?? null),
      rain: axis.map(key => fieldMaps.rain.get(key) ?? null),
      snow: axis.map(key => fieldMaps.snow.get(key) ?? null),
      humidity: axis.map(key => fieldMaps.humidity.get(key) ?? null),
      wind: axis.map(key => fieldMaps.wind.get(key) ?? null),
      windMax: axis.map(key => fieldMaps.windMax.get(key) ?? null),
      windGusts: axis.map(key => fieldMaps.windGusts.get(key) ?? null),
      sunshineDuration: axis.map(key => fieldMaps.sunshineDuration.get(key) ?? null),
      daylightDuration: axis.map(key => fieldMaps.daylightDuration.get(key) ?? null),
      norm: sharedNormMaps.norm.size ? axis.map(key => sharedNormMaps.norm.get(key) ?? null) : null,
      normMax: sharedNormMaps.normMax.size ? axis.map(key => sharedNormMaps.normMax.get(key) ?? null) : null,
      normMin: sharedNormMaps.normMin.size ? axis.map(key => sharedNormMaps.normMin.get(key) ?? null) : null
    };
  });
}

function buildPeriodicFieldMap(dates, values) {
  const map = new Map();
  if (!Array.isArray(dates) || !Array.isArray(values)) return map;

  for (let i = 0; i < dates.length; i++) {
    const key = toMonthDayKey(dates[i]);
    if (!key) continue;
    map.set(key, values[i] ?? null);
  }
  return map;
}

function buildSharedPeriodicFieldMap(allSeries, field) {
  const map = new Map();
  allSeries.forEach(series => {
    if (!Array.isArray(series?.x) || !Array.isArray(series?.[field])) return;
    for (let i = 0; i < series.x.length; i++) {
      const key = toMonthDayKey(series.x[i]);
      const value = series[field][i];
      if (!key || map.has(key) || !isFiniteNumber(value)) continue;
      map.set(key, value);
    }
  });
  return map;
}

function toMonthDayKey(dateStr) {
  if (typeof dateStr !== 'string') return '';
  return dateStr.length >= 10 ? dateStr.slice(5, 10) : dateStr;
}

function aggregateProgressionStats(allStats) {
  return {
    maxT: Math.max(...allStats.map(s => s.maxT).filter(v => isFiniteNumber(v))),
    minT: Math.min(...allStats.map(s => s.minT).filter(v => isFiniteNumber(v))),
    avgT: average(allStats.map(s => s.avgT).filter(v => isFiniteNumber(v))),
    climateDev: average(allStats.map(s => s.climateDev).filter(v => isFiniteNumber(v))),
    precipTotal: sum(allStats.map(s => s.precipTotal).filter(v => isFiniteNumber(v))),
    rainTotal: sum(allStats.map(s => s.rainTotal).filter(v => isFiniteNumber(v))),
    snowTotal: sum(allStats.map(s => s.snowTotal).filter(v => isFiniteNumber(v))),
    precipMax: Math.max(...allStats.map(s => s.precipMax).filter(v => isFiniteNumber(v))),
    humAvg: average(allStats.map(s => s.humAvg).filter(v => isFiniteNumber(v))),
    windMax: Math.max(...allStats.map(s => s.windMax).filter(v => isFiniteNumber(v))),
    windGustsMax: Math.max(...allStats.map(s => s.windGustsMax).filter(v => isFiniteNumber(v))),
    windAvg: average(allStats.map(s => s.windAvg).filter(v => isFiniteNumber(v))),
    sunshineTotal: sum(allStats.map(s => s.sunshineTotal).filter(v => isFiniteNumber(v))),
    daylightTotal: sum(allStats.map(s => s.daylightTotal).filter(v => isFiniteNumber(v))),
    precipDays: sum(allStats.map(s => s.precipDays).filter(v => typeof v === 'number')),
    totalDays: sum(allStats.map(s => s.totalDays).filter(v => typeof v === 'number'))
  };
}

function aggregateSeriesForProgression(allSeries, yearLabels) {
  const aggregated = {
    x: yearLabels,
    dates: yearLabels,
    tempMax: [], tempMin: [], tempMean: [],
    precip: [], rain: [], snow: [],
    humidity: [], wind: [], windMax: [], windGusts: [],
    sunshineDuration: [], daylightDuration: [],
    norm: null
  };

  const firstSeriesWithNorm = allSeries.find(s => s && s.norm);
  if (firstSeriesWithNorm) {
    const normMean = arrayMean(firstSeriesWithNorm.norm);
    aggregated.norm = yearLabels.map(() => normMean);
  }

  allSeries.forEach(series => {
    aggregated.tempMax.push(arrayMax(series.tempMax));
    aggregated.tempMin.push(arrayMin(series.tempMin));
    aggregated.tempMean.push(arrayMean(series.tempMean));
    aggregated.precip.push(arraySum(series.precip));
    aggregated.rain.push(arraySum(series.rain || []));
    aggregated.snow.push(arraySum(series.snow || []));
    aggregated.humidity.push(arrayMean(series.humidity));
    aggregated.wind.push(arrayMean(series.wind));
    aggregated.windMax.push(arrayMax(series.windMax || series.wind));
    aggregated.windGusts.push(arrayMax(series.windGusts || []));
    aggregated.sunshineDuration.push(arrayMean(series.sunshineDuration || []));
    aggregated.daylightDuration.push(arrayMean(series.daylightDuration || []));
  });

  return aggregated;
}

// --- State restore ---

function restoreCityTags() {
  if (state.entities && state.entities.length > 0) {
    selectedCities = state.entities.map(e => ({
      name: e.name, country: e.country, admin1: e.admin1, lat: e.lat, lon: e.lon
    }));
    renderCityTags();
    updateCitySearchState();
  }
}

function restorePeriodicInputs() {
  if (state.periodic?.city) {
    periodicCity = state.periodic.city;
    periodicCitySearchInput.value = periodicCity.name || '';
  }
  if (state.periodic?.years.length > 0) {
    selectedYears = [...state.periodic.years];
    renderYearTags();
    updateYearInputState();
  }
  if (state.periodic?.periodStart) periodStartInput.value = state.periodic.periodStart;
  if (state.periodic?.periodEnd) periodEndInput.value = state.periodic.periodEnd;
}

function restoreProgressionInputs() {
  if (state.progression?.city) {
    progressionCity = state.progression.city;
    progressionCitySearchInput.value = progressionCity.name || '';
  }
  if (state.progression?.yearFrom) yearFromInput.value = state.progression.yearFrom;
  if (state.progression?.yearTo) yearToInput.value = state.progression.yearTo;
  if (state.progression?.periodConfig) {
    const config = state.progression.periodConfig;
    periodTypeSelect.value = config.type;

    seasonSelect.style.display = 'none';
    monthSelect.style.display = 'none';
    daySelect.style.display = 'none';

    if (config.type === 'season') {
      seasonSelect.value = config.value;
      seasonSelect.style.display = '';
    } else if (config.type === 'month') {
      monthSelect.value = config.value;
      monthSelect.style.display = '';
    } else if (config.type === 'day') {
      daySelect.value = config.value;
      daySelect.style.display = '';
    }
  }
}

// --- Date handling ---

function prefillInputs() {
  const today = isoToday();
  const jan1 = isoYearStart(today);

  const savedDate = state.date || {};
  const start = sanitizeDate(savedDate.start) || jan1;
  const endIsToday = savedDate.endIsToday === true;
  let end = sanitizeDate(savedDate.end) || today;
  if (endIsToday) end = today;

  startInput.value = start;
  endInput.value = end;
  state.date = { start, end, endIsToday };
  saveState(state);
}

// --- Auto-location ---

function setupAutoLocationButtons() {
  setupAutoLocationButton('auto-location-btn', async (city) => {
    if (selectedCities.length >= MAX_CITIES) {
      showMessage(`Maximum ${MAX_CITIES} cities`, 'error');
      return;
    }
    if (hasSelectedCity(city)) {
      showMessage('City already added', 'info');
    } else {
      addCityTag(city);
      showMessage(`Added ${city.name}`, 'success');
    }
  });

  setupAutoLocationButton('auto-location-periodic-btn', (city) => {
    selectPeriodicCity(city);
    showMessage(`Selected ${city.name}`, 'success');
  });

  setupAutoLocationButton('auto-location-progression-btn', (city) => {
    selectProgressionCity(city);
    showMessage(`Selected ${city.name}`, 'success');
  });
}

function setupAutoLocationButton(id, onCity) {
  const btn = document.getElementById(id);
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const img = btn.querySelector('img');
    btn.disabled = true;
    if (img) img.style.opacity = '0.5';

    try {
      const city = await getLocationFromIP();
      await onCity(city);
    } catch (err) {
      showMessage(err.message || 'Auto-detect failed', 'error');
    } finally {
      btn.disabled = false;
      if (img) img.style.opacity = '1';
    }
  });
}

async function autoApplyOnLoad() {
  if (state.mode === 'comparison') {
    const hasValidState = state.entities && state.entities.length > 0 && selectedCities.length > 0;
    if (hasValidState) {
      scheduleComparisonApply(100);
    } else {
      await autoDetectLocation();
    }
  }
}

async function autoDetectLocation() {
  try {
    const city = await getLocationFromIP();
    if (!hasSelectedCity(city)) {
      addCityTag(city);
      showMessage(`Detected location: ${city.name}`, 'success');
    }
  } catch (err) {
    console.log('Auto-detect location failed:', err);
  }
}

// --- UI helpers ---

function showNoDataPlaceholder() {
  if (selectedCities.length === 0 && state.mode === 'comparison') {
    showWelcomeStub();
  } else if (state.mode === 'periodic' || state.mode === 'progression') {
    showModeStub(state.mode);
  } else {
    workspaceDom.classList.add('no-data');
    hasData = false;
    updateExportButtons();
  }
}

function showDataView() {
  hideStub();
  workspaceDom.classList.remove('no-data');
  hasData = true;
  updateExportButtons();
}

function showWelcomeStub() {
  workspaceStub.innerHTML = `
    <h2>Grain of Rain</h2>
    <p>Explore historical weather data for any location on Earth.</p>
    <p class="stub-hint">Add a city in the toolbar above to get started.</p>
  `;
  workspaceStub.classList.remove('hidden');
  workspaceDom.classList.add('no-data');
  hasData = false;
  updateExportButtons();
}

function showModeStub(mode) {
  const descriptions = {
    periodic: {
      title: 'Periodic Comparison',
      desc: 'Compare the same date range across different years for one city.',
      notice: 'This mode requests data for each selected year separately.'
    },
    progression: {
      title: 'Year-over-Year Progression',
      desc: 'Track how weather metrics evolved over a range of years for one location.',
      notice: 'This mode requests data for every year in the range \u2014 may take a while for large spans.'
    }
  };
  const info = descriptions[mode];
  const canLoad = mode === 'periodic'
    ? (periodicCity && selectedYears.length > 0)
    : (progressionCity && yearFromInput.value && yearToInput.value);

  workspaceStub.innerHTML = `
    <h2>${info.title}</h2>
    <p>${info.desc}</p>
    <p class="stub-hint">${info.notice}</p>
    ${canLoad ? '<button class="load-data-btn" id="load-data-btn">Load data</button>' : '<p class="stub-hint">Fill in the parameters above to continue.</p>'}
  `;
  workspaceStub.classList.remove('hidden');
  workspaceDom.classList.add('no-data');
  hasData = false;
  updateExportButtons();

  const loadBtn = document.getElementById('load-data-btn');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      if (mode === 'periodic') applyPeriodic();
      else if (mode === 'progression') applyProgression();
    });
  }
}

function hideStub() {
  workspaceStub.classList.add('hidden');
  workspaceStub.innerHTML = '';
}

function updateExportButtons() {
  const downloadBtn = document.getElementById('download');
  const copyBtn = document.getElementById('copy');
  if (downloadBtn) downloadBtn.disabled = !hasData;
  if (copyBtn) copyBtn.disabled = !hasData;
}

function handleClipboardError(err) {
  const platform = detectPlatform();
  let message = 'Unable to copy to clipboard.\n\n';

  if (!navigator.clipboard) {
    message += 'Clipboard API not supported.\n';
    message += '• Use Download button\n';
    message += '• Or access via HTTPS';
  } else if (err.message && err.message.includes('denied')) {
    if (platform.isMac) {
      message += 'Permission denied. Enable in:\n';
      message += 'System Settings → Privacy & Security → Screen Recording';
    } else if (platform.isWindows) {
      message += 'Permission denied. Enable in:\n';
      message += 'Settings → Privacy → Clipboard';
    } else {
      message += 'Permission denied by browser.';
    }
  } else {
    message += err.message || 'Unknown error occurred.';
  }

  showMessage(message, 'error');
}

async function resetAll() {
  await clearDailyCache();
  try { localStorage.removeItem('gor:v1'); } catch (err) { console.warn('Failed to clear saved state', err); }
  try { localStorage.removeItem('gor-locations'); } catch { /* ignore */ }
  window.location.reload();
}

function buildFilename() {
  const mode = state.mode || 'comparison';
  let baseName = 'grainofrain';
  let dateRange = '';

  if (mode === 'comparison' && state.entities.length > 0) {
    if (state.entities.length === 1) {
      const city = state.entities[0].label;
      baseName = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grainofrain';
    } else {
      const cities = state.entities.map(e => e.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).join('-');
      baseName = cities || 'compare';
    }
    const startDate = state.date?.start || '';
    const endDate = state.date?.end || '';
    dateRange = (startDate && endDate) ? `${startDate}-${endDate}` : (startDate || isoToday());
  } else if (mode === 'periodic' && state.periodic?.city) {
    const city = state.periodic.city.name;
    baseName = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grainofrain';
    const years = state.periodic.years.join('-');
    const period = `${state.periodic.periodStart}_${state.periodic.periodEnd}`.replace(/\//g, '-');
    dateRange = `${years}_${period}`;
  } else {
    dateRange = isoToday();
  }

  return `${baseName}-${dateRange}.png`;
}

// --- Color system ---

function getCityColorKey(city) {
  return `city:${getUniqueCityKey(city)}`;
}

function getYearColorKey(year) {
  return `year:${year}`;
}

function assignColor(key) {
  const assignments = state.prefs.colorAssignments;
  if (assignments[key]) return assignments[key];
  const used = new Set(Object.values(assignments));
  const available = COLOR_PALETTE.filter(c => !used.has(c));
  const pool = available.length > 0 ? available : COLOR_PALETTE;
  const color = pool[Math.floor(Math.random() * pool.length)];
  assignments[key] = color;
  saveState(state);
  return color;
}

function setColorAssignment(key, color) {
  state.prefs.colorAssignments[key] = color;
  saveState(state);
}

// --- Color picker ---

let _colorPickerKey = null;

function setupColorPicker() {
  const picker = document.createElement('div');
  picker.id = 'color-picker';
  picker.classList.add('hidden');
  COLOR_PALETTE.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch';
    btn.style.background = color;
    btn.dataset.color = color;
    btn.setAttribute('aria-label', color);
    picker.appendChild(btn);
  });
  document.body.appendChild(picker);

  document.addEventListener('click', (e) => {
    if (!picker.classList.contains('hidden') && !picker.contains(e.target)) {
      picker.classList.add('hidden');
    }
  });
}

function openColorPicker(tagEl, key) {
  const picker = document.getElementById('color-picker');
  if (!picker) return;
  _colorPickerKey = key;
  const currentColor = state.prefs.colorAssignments[key];
  picker.querySelectorAll('.color-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === currentColor);
    btn.onclick = (e) => {
      e.stopPropagation();
      setColorAssignment(_colorPickerKey, btn.dataset.color);
      renderCityTags();
      renderYearTags();
      picker.classList.add('hidden');
      if (state.mode === 'comparison' && hasData) scheduleComparisonApply();
      else if (state.mode === 'periodic' && hasData) applyPeriodic();
    };
  });
  const rect = tagEl.getBoundingClientRect();
  const pickerWidth = 148;
  let left = rect.left;
  if (left + pickerWidth > window.innerWidth - 8) left = window.innerWidth - pickerWidth - 8;
  picker.style.top = `${rect.bottom + window.scrollY + 4}px`;
  picker.style.left = `${left}px`;
  picker.classList.remove('hidden');
}

// --- Overflow tags (secondary tags in hamburger panel) ---

function renderOverflowTags() {
  const overflowTags = document.getElementById('overflow-tags');
  if (!overflowTags) return;

  let html = '';
  if (state.mode === 'comparison' && selectedCities.length > 1) {
    html = selectedCities.slice(1).map((city, i) => {
      const index = i + 1;
      const key = getCityColorKey(city);
      const color = state.prefs.colorAssignments[key] || assignColor(key);
      const fullLabel = formatCityLabel(city);
      return `<div class="city-tag" data-color-key="${escapeHtml(key)}" style="background:${color}" title="${escapeHtml(fullLabel)}">
        <span class="city-tag-name">${escapeHtml(getCityTagLabel(city))}</span>
        <span class="city-tag-remove" data-index="${index}">×</span>
      </div>`;
    }).join('');
  } else if (state.mode === 'periodic' && selectedYears.length > 1) {
    html = selectedYears.slice(1).map((year, i) => {
      const index = i + 1;
      const key = getYearColorKey(year);
      const color = state.prefs.colorAssignments[key] || assignColor(key);
      return `<div class="year-tag" data-color-key="${escapeHtml(key)}" style="background:${color}">
        <span class="year-tag-name">${year}</span>
        <span class="year-tag-remove" data-index="${index}">×</span>
      </div>`;
    }).join('');
  }

  overflowTags.innerHTML = html;

  overflowTags.querySelectorAll('.city-tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCityTag(parseInt(btn.getAttribute('data-index'), 10));
    });
  });
  overflowTags.querySelectorAll('.year-tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeYearTag(parseInt(btn.getAttribute('data-index'), 10));
    });
  });
  overflowTags.querySelectorAll('.city-tag, .year-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      if (e.target.classList.contains('city-tag-remove') || e.target.classList.contains('year-tag-remove')) return;
      e.stopPropagation();
      openColorPicker(tag, tag.dataset.colorKey);
    });
  });
}

// --- Overflow hamburger panel ---

function setupOverflowBtn() {
  const btn = document.getElementById('overflow-btn');
  const panel = document.getElementById('overflow-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    btn.setAttribute('aria-expanded', String(isHidden));
  });

  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn) {
      panel.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  const modeOv = document.getElementById('mode-selector-ov');
  const smoothingOv = document.getElementById('smoothing-selector-ov');

  if (modeOv) {
    modeOv.value = state.mode;
    modeOv.addEventListener('change', (e) => {
      modeSelector.value = e.target.value;
      modeSelector.dispatchEvent(new Event('change'));
    });
  }

  if (smoothingOv) {
    smoothingOv.value = state.prefs.smoothing || 0;
    smoothingOv.addEventListener('change', (e) => {
      smoothingSelector.value = e.target.value;
      smoothingSelector.dispatchEvent(new Event('change'));
    });
  }
}

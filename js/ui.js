import { loadState, saveState } from './store.js';
import { fetchDaily, fetchHourly, dailyMeanFromHourly, fetchNormals, getLocationFromIP } from './api.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll, renderCompare } from './charts.js';
import { exportPng, copyPngToClipboard } from './export.js';
import { createCitySelector } from './city-selector.js';
import { fillStats, fillStatsPeriodic, fillStatsProgression } from './stats.js';
import { showMessage, createProgressToast, updateProgressToast, removeProgressToast, setAbortControllerRef } from './toast.js';
import {
  isFiniteNumber, escapeHtml, sanitizeDate, isoToday, isoYearStart,
  addDays, formatCityLabel, average, sum,
  arrayMax, arrayMin, arrayMean, arraySum,
  applySmoothingAndTrim, detectPlatform
} from './utils.js';

const COLORS = ['#1E88E5', '#E53935', '#43A047'];
const COLOR_NAMES = ['blue', 'red', 'green'];
const MM_DD_REGEX = /^\d{2}-\d{2}$/;
const MAX_CITIES = 3;

let state = loadState();
const charts = initCharts();
let selectedCities = [];
let periodicCity = null;
let progressionCity = null;
let selectedYears = [];
let abortController = null;
let hasData = false;

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
setupCitySelectors();
setupYearTagSelector();
setupPeriodTypeSelector();
setupAutoLocationButtons();
restoreCityTags();
restorePeriodicInputs();
restoreProgressionInputs();
showNoDataPlaceholder();
autoApplyOnLoad();

// --- Mode & Controls ---

function setupModeSelector() {
  modeSelector.value = state.mode;
  switchMode(state.mode);

  modeSelector.addEventListener('change', (e) => {
    state.mode = e.target.value;
    switchMode(state.mode);
    updateSmoothingVisibility();
  });
}

function setupSmoothingSelector() {
  smoothingSelector.value = state.prefs.smoothing || 0;
  updateSmoothingVisibility();

  smoothingSelector.addEventListener('change', (e) => {
    state.prefs.smoothing = parseInt(e.target.value, 10);
    saveState(state);
  });
}

function updateSmoothingVisibility() {
  smoothingSelector.style.display = (state.mode === 'comparison' || state.mode === 'periodic') ? '' : 'none';
}

function switchMode(mode) {
  comparisonControls.classList.add('hidden');
  periodicControls.classList.add('hidden');
  progressionControls.classList.add('hidden');

  workspaceDom.classList.add('no-data');
  hasData = false;
  updateExportButtons();

  if (mode === 'comparison') {
    comparisonControls.classList.remove('hidden');
    if (selectedCities.length > 0 && startInput.value && endInput.value) {
      applyComparison();
    }
  } else if (mode === 'periodic') {
    periodicControls.classList.remove('hidden');
    if (periodicCity && selectedYears.length > 0) {
      applyPeriodic();
    }
  } else if (mode === 'progression') {
    progressionControls.classList.remove('hidden');
    if (progressionCity && yearFromInput.value && yearToInput.value) {
      applyProgression();
    }
  }
}

function bindControls() {
  const controlsForm = document.getElementById('controls');
  if (controlsForm) {
    controlsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      apply();
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

function addCityTag(city) {
  if (selectedCities.length >= MAX_CITIES) return;
  if (selectedCities.some(c => c.name === city.name)) return;

  selectedCities.push(city);
  renderCityTags();
  updateCitySearchState();
  citySearchInput.value = '';
  cityDropdown.classList.remove('visible');
}

function removeCityTag(index) {
  selectedCities.splice(index, 1);
  renderCityTags();
  updateCitySearchState();
}

function renderCityTags() {
  cityTagsContainer.innerHTML = selectedCities.map((city, index) => {
    const colorClass = `tag-${COLOR_NAMES[index]}`;
    return `
      <div class="city-tag ${colorClass}">
        <span>${escapeHtml(city.name)}</span>
        <span class="city-tag-remove" data-index="${index}">×</span>
      </div>
    `;
  }).join('');

  cityTagsContainer.querySelectorAll('.city-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeCityTag(parseInt(btn.getAttribute('data-index'), 10));
    });
  });
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
  periodicCity = city;
  periodicCitySearchInput.value = formatCityLabel(city);
  periodicCityDropdown.classList.remove('visible');
}

function selectProgressionCity(city) {
  progressionCity = city;
  progressionCitySearchInput.value = formatCityLabel(city);
  progressionCityDropdown.classList.remove('visible');
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
}

function removeYearTag(index) {
  selectedYears.splice(index, 1);
  renderYearTags();
  updateYearInputState();
}

function renderYearTags() {
  yearTagsContainer.innerHTML = selectedYears.map((year, index) => {
    const colorClass = `tag-${COLOR_NAMES[index]}`;
    return `
      <div class="year-tag ${colorClass}">
        <span>${year}</span>
        <span class="year-tag-remove" data-index="${index}">×</span>
      </div>
    `;
  }).join('');

  yearTagsContainer.querySelectorAll('.year-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeYearTag(parseInt(btn.getAttribute('data-index'), 10));
    });
  });
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

async function apply() {
  if (state.mode === 'comparison') await applyComparison();
  else if (state.mode === 'periodic') await applyPeriodic();
  else if (state.mode === 'progression') await applyProgression();
}

async function applyComparison() {
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
  const padding = Math.floor(smoothing / 2);
  const paddedStart = addDays(startIso, -padding);
  const paddedEnd = addDays(endIso, padding);

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
      await new Promise(resolve => setTimeout(resolve, 300));

      const hourly = await fetchHourly(geo.lat, geo.lon, paddedStart, paddedEnd, signal);
      const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
      const wind = dailyMeanFromHourly(hourly.time, hourly.wind);

      let normals = null;
      if (state.prefs.showNormals) {
        await new Promise(resolve => setTimeout(resolve, 300));
        try { normals = await fetchNormals(geo.lat, geo.lon, signal); } catch (e) { normals = null; }
      }

      let series = buildSeries(daily, hum, wind, normals);
      if (smoothing > 0) series = applySmoothingAndTrim(series, smoothing, startIso, endIso);

      entities.push({
        type: 'city', name: geo.name, country: geo.country || null,
        admin1: geo.admin1 || null, lat: geo.lat, lon: geo.lon, label
      });
      allSeries.push(series);
      allStats.push(computeStats(series));
    }

    if (entities.length === 1) {
      renderAll(charts, allSeries[0], COLORS[0], state.prefs, entities[0].label);
      fillStats(statsDom, [allStats[0]], [entities[0].label], startIso, endIso, smoothing);
    } else {
      const labels = entities.map(e => e.label);
      renderCompare(charts, allSeries, COLORS, state.prefs, labels);
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
  const padding = Math.floor(smoothing / 2);
  let loadingToast = null;

  try {
    abortController = new AbortController();
    const signal = abortController.signal;
    const allSeries = [];
    const allStats = [];
    const labels = [];
    let sharedNormals = null;

    if (selectedYears.length > 1) loadingToast = createProgressToast();

    for (let i = 0; i < selectedYears.length; i++) {
      if (selectedYears.length > 1) updateProgressToast(loadingToast, `Loading ${i + 1}/${selectedYears.length}...`);
      if (signal.aborted) throw new Error('Cancelled');

      const year = selectedYears[i];
      const startIso = `${year}-${periodStart}`;
      const endIso = `${year}-${periodEnd}`;
      const paddedStart = addDays(startIso, -padding);
      const paddedEnd = addDays(endIso, padding);

      const daily = await fetchDaily(periodicCity.lat, periodicCity.lon, paddedStart, paddedEnd, signal);
      await new Promise(resolve => setTimeout(resolve, 200));

      const hourly = await fetchHourly(periodicCity.lat, periodicCity.lon, paddedStart, paddedEnd, signal);
      const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
      const wind = dailyMeanFromHourly(hourly.time, hourly.wind);

      if (state.prefs.showNormals && i === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        try { sharedNormals = await fetchNormals(periodicCity.lat, periodicCity.lon, signal); } catch (e) { sharedNormals = null; }
      }

      let series = buildSeries(daily, hum, wind, state.prefs.showNormals ? sharedNormals : null);
      if (smoothing > 0) series = applySmoothingAndTrim(series, smoothing, startIso, endIso);

      allSeries.push(series);
      allStats.push(computeStats(series));
      labels.push(year.toString());
    }

    if (allSeries.length === 1) {
      renderAll(charts, allSeries[0], COLORS[0], state.prefs, labels[0]);
    } else {
      renderCompare(charts, allSeries, COLORS, state.prefs, labels);
    }

    fillStatsPeriodic(statsDom, allStats, labels, periodicCity.name, periodStart, periodEnd, smoothing);
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
  if (yearRange > 50) return showMessage('Year range too large (max 50 years to avoid rate limits)', 'error');
  if (yearRange > 20) showMessage(`Loading ${yearRange} years - this may take a while...`, 'info');

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

    for (let year = yearFrom; year <= yearTo; year++) {
      if (signal.aborted) throw new Error('Cancelled');

      const currentIndex = year - yearFrom + 1;
      updateProgressToast(loadingToast, `Loading ${year}... (${currentIndex}/${totalYears})`);

      const { startDate, endDate } = getPeriodDates(year, periodConfig);

      const daily = await fetchDaily(progressionCity.lat, progressionCity.lon, startDate, endDate, signal);
      const hourly = await fetchHourly(progressionCity.lat, progressionCity.lon, startDate, endDate, signal);
      const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
      const wind = dailyMeanFromHourly(hourly.time, hourly.wind);

      allSeries.push(buildSeries(daily, hum, wind, sharedNormals));
      allStats.push(computeStats(allSeries[allSeries.length - 1]));
      labels.push(year.toString());

      if (year < yearTo) await new Promise(resolve => setTimeout(resolve, 300));
    }

    const aggregatedStats = aggregateProgressionStats(allStats);
    const progressionSeries = aggregateSeriesForProgression(allSeries, labels);

    renderAll(charts, progressionSeries, COLORS[0], state.prefs, progressionCity.name);
    fillStatsProgression(statsDom, aggregatedStats, progressionCity.name, formatPeriodLabel(periodConfig), yearFrom, yearTo);

    removeProgressToast(loadingToast);
    showDataView();
    showMessage('✓ Data loaded', 'success');

    state.progression = { city: progressionCity, periodConfig, yearFrom, yearTo };
    saveState(state);
  } catch (e) {
    console.error(e);
    if (loadingToast) removeProgressToast(loadingToast);
    if (e.message === 'Cancelled') {
      // Silently handle cancellation
    } else if (e.message && (e.message.includes('429') || e.message.includes('Too Many Requests'))) {
      showMessage('Rate limited by API. Please wait a moment and try again with a smaller year range.', 'error');
    } else {
      showMessage(e.message || 'An error occurred', 'error');
    }
  } finally {
    abortController = null;
  }
}

// --- Progression helpers ---

function getPeriodDates(year, periodConfig) {
  if (periodConfig.type === 'year') {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  } else if (periodConfig.type === 'season') {
    const seasons = {
      winter: { start: '12-01', end: '02-28' },
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

function formatPeriodLabel(periodConfig) {
  if (periodConfig.type === 'year') return 'Whole year';
  if (periodConfig.type === 'season') return periodConfig.value.charAt(0).toUpperCase() + periodConfig.value.slice(1);
  if (periodConfig.type === 'month') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[parseInt(periodConfig.value, 10) - 1];
  }
  if (periodConfig.type === 'day') return periodConfig.value;
}

function aggregateProgressionStats(allStats) {
  return {
    maxT: Math.max(...allStats.map(s => s.maxT).filter(v => isFiniteNumber(v))),
    minT: Math.min(...allStats.map(s => s.minT).filter(v => isFiniteNumber(v))),
    avgT: average(allStats.map(s => s.avgT).filter(v => isFiniteNumber(v))),
    climateDev: average(allStats.map(s => s.climateDev).filter(v => isFiniteNumber(v))),
    precipTotal: sum(allStats.map(s => s.precipTotal).filter(v => isFiniteNumber(v))),
    precipMax: Math.max(...allStats.map(s => s.precipMax).filter(v => isFiniteNumber(v))),
    humAvg: average(allStats.map(s => s.humAvg).filter(v => isFiniteNumber(v))),
    windMax: Math.max(...allStats.map(s => s.windMax).filter(v => isFiniteNumber(v))),
    windAvg: average(allStats.map(s => s.windAvg).filter(v => isFiniteNumber(v))),
    precipDays: sum(allStats.map(s => s.precipDays).filter(v => typeof v === 'number')),
    totalDays: sum(allStats.map(s => s.totalDays).filter(v => typeof v === 'number'))
  };
}

function aggregateSeriesForProgression(allSeries, yearLabels) {
  const aggregated = {
    x: yearLabels,
    tempMax: [], tempMin: [], tempMean: [],
    precip: [], humidity: [], wind: [], windMax: [],
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
    aggregated.humidity.push(arrayMean(series.humidity));
    aggregated.wind.push(arrayMean(series.wind));
    aggregated.windMax.push(arrayMax(series.wind));
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
    periodicCitySearchInput.value = formatCityLabel(periodicCity);
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
    progressionCitySearchInput.value = formatCityLabel(progressionCity);
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
    if (selectedCities.some(c => c.name === city.name)) {
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
      setTimeout(() => apply(), 100);
    } else {
      await autoDetectLocation();
    }
  }
}

async function autoDetectLocation() {
  try {
    const city = await getLocationFromIP();
    if (!selectedCities.some(c => c.name === city.name)) {
      addCityTag(city);
      showMessage(`Detected location: ${city.name}`, 'success');
      setTimeout(() => apply(), 500);
    }
  } catch (err) {
    console.log('Auto-detect location failed:', err);
  }
}

// --- UI helpers ---

function showNoDataPlaceholder() {
  workspaceDom.classList.add('no-data');
  hasData = false;
  updateExportButtons();
}

function showDataView() {
  workspaceDom.classList.remove('no-data');
  hasData = true;
  updateExportButtons();
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

  if (platform.isSafari) {
    message += 'Safari doesn\'t support clipboard images.\n';
    message += '• Use Download button\n';
    message += '• Or try Chrome/Firefox';
  } else if (!navigator.clipboard) {
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

function resetAll() {
  try { localStorage.removeItem('gor:v1'); } catch (err) { console.warn('Failed to clear saved state', err); }
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

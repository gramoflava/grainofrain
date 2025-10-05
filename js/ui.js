import { loadState, saveState, defaultState } from './store.js';
import { searchCity, fetchDaily, fetchHourly, dailyMeanFromHourly, fetchNormals, suggestCities } from './api.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll, renderCompare } from './charts.js';
import { exportPng, copyPngToClipboard } from './export.js';

const COLORS = ['#1E88E5', '#E53935', '#43A047'];
const COLOR_NAMES = ['blue', 'red', 'green'];

let state = loadState();
const charts = initCharts();
const cityCache = new Map();
let selectedCities = [];
let periodicCity = null;
let hasData = false;

const modeSelector = document.getElementById('mode-selector');
const comparisonControls = document.getElementById('controls-comparison');
const periodicControls = document.getElementById('controls-periodic');
const progressionControls = document.getElementById('controls-progression');

const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const statsDom = document.getElementById('stats');
const chartsDom = document.getElementById('charts');
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

let selectedYears = [];
let progressionCity = null;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MM_DD_REGEX = /^\d{2}-\d{2}$/;
const MAX_CITIES = 3;

prefillInputs();
bindControls();
setupModeSelector();
setupCityTagSelector();
setupPeriodicCitySelector();
setupProgressionCitySelector();
setupYearTagSelector();
setupPeriodTypeSelector();
restoreCityTags();
restorePeriodicInputs();
restoreProgressionInputs();
showNoDataPlaceholder();
autoApplyOnLoad();

async function apply() {
  const currentMode = state.mode;

  if (currentMode === 'comparison') {
    await applyComparison();
  } else if (currentMode === 'periodic') {
    await applyPeriodic();
  } else if (currentMode === 'progression') {
    await applyProgression();
  }
}

async function applyComparison() {
  const startValue = startInput.value.trim();
  const endValue = endInput.value.trim();

  if (!startValue || !endValue) return showMessage('Fill all fields', 'error');

  if (selectedCities.length === 0) {
    return showMessage('Add at least one city', 'error');
  }

  const startIso = sanitizeDate(startValue);
  if (!startIso) {
    showMessage('Start date must use YYYY-MM-DD', 'error');
    startInput.focus();
    return;
  }
  const endIso = sanitizeDate(endValue);
  if (!endIso) {
    showMessage('End date must use YYYY-MM-DD', 'error');
    endInput.focus();
    return;
  }

  if (startIso > endIso) {
    showMessage('Start date must be before end date', 'error');
    startInput.focus();
    return;
  }

  const today = isoToday();
  const endIsToday = endIso === today;

  startInput.value = startIso;
  endInput.value = endIsToday ? today : endIso;

  try {
    const entities = [];
    const allSeries = [];
    const allStats = [];

    for (let i = 0; i < selectedCities.length; i++) {
      const geo = selectedCities[i];
      const label = formatCityLabel(geo);

      const daily = await fetchDaily(geo.lat, geo.lon, startIso, endIso);
      const hourly = await fetchHourly(geo.lat, geo.lon, startIso, endIso);
      const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
      const wind = dailyMeanFromHourly(hourly.time, hourly.wind);

      let normals = null;
      if (state.prefs.showNormals) {
        try { normals = await fetchNormals(geo.lat, geo.lon); } catch (e) { normals = null; }
      }

      const series = buildSeries(daily, hum, wind, normals);
      const stats = computeStats(series);

      entities.push({
        type: 'city',
        name: geo.name,
        country: geo.country || null,
        admin1: geo.admin1 || null,
        lat: geo.lat,
        lon: geo.lon,
        label
      });
      allSeries.push(series);
      allStats.push(stats);

      // Add small delay between city requests
      if (i < selectedCities.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    if (entities.length === 1) {
      renderAll(charts, allSeries[0], COLORS[0], state.prefs);
      fillStats(statsDom, [allStats[0]], [entities[0].label], startIso, endIso);
    } else {
      renderCompare(charts, allSeries, COLORS, state.prefs);
      const labels = entities.map(e => e.label);
      fillStats(statsDom, allStats, labels, startIso, endIso);
    }

    showDataView();
    state.entities = entities;
    state.date = { start: startIso, end: endIso, endIsToday };
    saveState(state);
  } catch (e) {
    console.error(e);
    showMessage(e.message || 'An error occurred', 'error');
  }
}

async function applyProgression() {
  if (!progressionCity) {
    return showMessage('Select a city', 'error');
  }

  const yearFrom = parseInt(yearFromInput.value.trim(), 10);
  const yearTo = parseInt(yearToInput.value.trim(), 10);

  if (isNaN(yearFrom) || isNaN(yearTo)) {
    return showMessage('Fill year range', 'error');
  }

  if (yearFrom > yearTo) {
    return showMessage('From year must be before To year', 'error');
  }

  const yearRange = yearTo - yearFrom + 1;

  if (yearRange > 50) {
    return showMessage('Year range too large (max 50 years to avoid rate limits)', 'error');
  }

  if (yearRange > 20) {
    showMessage(`Loading ${yearRange} years - this may take a while...`, 'info');
  }

  const periodType = periodTypeSelect.value;
  let periodConfig = {};

  if (periodType === 'season') {
    periodConfig = { type: 'season', value: seasonSelect.value };
  } else if (periodType === 'month') {
    periodConfig = { type: 'month', value: monthSelect.value };
  } else if (periodType === 'day') {
    const dayValue = daySelect.value.trim();
    if (!MM_DD_REGEX.test(dayValue)) {
      return showMessage('Day must use MM-DD format', 'error');
    }
    periodConfig = { type: 'day', value: dayValue };
  } else {
    periodConfig = { type: 'year' };
  }

  let loadingToast = null;

  try {
    const allSeries = [];
    const allStats = [];
    const labels = [];
    const totalYears = yearTo - yearFrom + 1;

    // Create persistent loading toast
    loadingToast = createProgressToast();

    for (let year = yearFrom; year <= yearTo; year++) {
      const currentIndex = year - yearFrom + 1;
      updateProgressToast(loadingToast, `Loading ${year}... (${currentIndex}/${totalYears})`);

      const { startDate, endDate } = getPeriodDates(year, periodConfig);

      const daily = await fetchDaily(progressionCity.lat, progressionCity.lon, startDate, endDate);
      const hourly = await fetchHourly(progressionCity.lat, progressionCity.lon, startDate, endDate);
      const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
      const wind = dailyMeanFromHourly(hourly.time, hourly.wind);

      let normals = null;
      if (state.prefs.showNormals && year === yearFrom) {
        // Fetch normals only once
        try { normals = await fetchNormals(progressionCity.lat, progressionCity.lon); } catch (e) { normals = null; }
      }

      const series = buildSeries(daily, hum, wind, normals);
      const stats = computeStats(series);

      allSeries.push(series);
      allStats.push(stats);
      labels.push(year.toString());

      // Add delay between requests to avoid rate limiting (300ms)
      if (year < yearTo) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Aggregate stats for progression view
    const aggregatedStats = aggregateProgressionStats(allStats);

    // For progression, we need to aggregate data points by year
    const progressionSeries = aggregateSeriesForProgression(allSeries, labels);

    if (labels.length === 1) {
      renderAll(charts, progressionSeries, COLORS[0], state.prefs);
    } else {
      renderAll(charts, progressionSeries, COLORS[0], state.prefs);
    }

    fillStatsProgression(statsDom, aggregatedStats, progressionCity.name, formatPeriodLabel(periodConfig), yearFrom, yearTo);

    // Remove loading toast
    removeProgressToast(loadingToast);

    showDataView();
    showMessage('✓ Data loaded', 'success');

    state.progression = {
      city: progressionCity,
      periodConfig,
      yearFrom,
      yearTo
    };
    saveState(state);
  } catch (e) {
    console.error(e);
    // Remove loading toast on error
    if (loadingToast) removeProgressToast(loadingToast);

    if (e.message && (e.message.includes('429') || e.message.includes('Too Many Requests'))) {
      showMessage('Rate limited by API. Please wait a moment and try again with a smaller year range.', 'error');
    } else {
      showMessage(e.message || 'An error occurred', 'error');
    }
  }
}

async function applyPeriodic() {
  if (!periodicCity) {
    return showMessage('Select a city', 'error');
  }

  if (selectedYears.length === 0) {
    return showMessage('Add at least one year', 'error');
  }

  let periodStart = periodStartInput.value.trim();
  let periodEnd = periodEndInput.value.trim();

  // Auto-fill with whole year if not specified
  if (!periodStart) {
    periodStart = '01-01';
    periodStartInput.value = periodStart;
  }
  if (!periodEnd) {
    periodEnd = '12-31';
    periodEndInput.value = periodEnd;
  }

  if (!MM_DD_REGEX.test(periodStart) || !MM_DD_REGEX.test(periodEnd)) {
    return showMessage('Period must use MM-DD format', 'error');
  }

  try {
    const allSeries = [];
    const allStats = [];
    const labels = [];

    for (let i = 0; i < selectedYears.length; i++) {
      const year = selectedYears[i];
      const startIso = `${year}-${periodStart}`;
      const endIso = `${year}-${periodEnd}`;

      const daily = await fetchDaily(periodicCity.lat, periodicCity.lon, startIso, endIso);
      const hourly = await fetchHourly(periodicCity.lat, periodicCity.lon, startIso, endIso);
      const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
      const wind = dailyMeanFromHourly(hourly.time, hourly.wind);

      let normals = null;
      if (state.prefs.showNormals && i === 0) {
        // Fetch normals only once
        try { normals = await fetchNormals(periodicCity.lat, periodicCity.lon); } catch (e) { normals = null; }
      }

      const series = buildSeries(daily, hum, wind, normals);
      const stats = computeStats(series);

      allSeries.push(series);
      allStats.push(stats);
      labels.push(year.toString());

      // Add small delay between requests
      if (i < selectedYears.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    if (allSeries.length === 1) {
      renderAll(charts, allSeries[0], COLORS[0], state.prefs);
    } else {
      renderCompare(charts, allSeries, COLORS, state.prefs);
    }

    fillStatsPeriodic(statsDom, allStats, labels, periodicCity.name, periodStart, periodEnd);

    showDataView();
    state.periodic = {
      city: periodicCity,
      years: selectedYears,
      periodStart,
      periodEnd
    };
    saveState(state);
  } catch (e) {
    console.error(e);
    showMessage(e.message || 'An error occurred', 'error');
  }
}

function setupModeSelector() {
  modeSelector.value = state.mode;
  switchMode(state.mode);

  modeSelector.addEventListener('change', (e) => {
    const newMode = e.target.value;
    state.mode = newMode;
    saveState(state);
    switchMode(newMode);
  });
}

function switchMode(mode) {
  comparisonControls.classList.add('hidden');
  periodicControls.classList.add('hidden');
  progressionControls.classList.add('hidden');

  if (mode === 'comparison') {
    comparisonControls.classList.remove('hidden');
  } else if (mode === 'periodic') {
    periodicControls.classList.remove('hidden');
  } else if (mode === 'progression') {
    progressionControls.classList.remove('hidden');
  }
}

function setupCityTagSelector() {
  citySearchInput.addEventListener('input', handleCitySearch);
  citySearchInput.addEventListener('focus', () => {
    if (citySearchInput.value.trim()) {
      handleCitySearch();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.city-input-wrapper');
    const isComparisonWrapper = wrapper && wrapper.closest('#controls-comparison');
    if (!isComparisonWrapper) {
      cityDropdown.classList.remove('visible');
    }
  });
}

function setupPeriodicCitySelector() {
  periodicCitySearchInput.addEventListener('input', handlePeriodicCitySearch);
  periodicCitySearchInput.addEventListener('focus', () => {
    if (periodicCitySearchInput.value.trim()) {
      handlePeriodicCitySearch();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.city-input-wrapper');
    const isPeriodicWrapper = wrapper && wrapper.closest('#controls-periodic');
    if (!isPeriodicWrapper) {
      periodicCityDropdown.classList.remove('visible');
    }
  });
}

async function handleCitySearch() {
  const query = citySearchInput.value.trim();

  if (query.length < 2) {
    cityDropdown.classList.remove('visible');
    return;
  }

  try {
    const cities = await suggestCities(query);
    displayCitySuggestions(cities);
  } catch (err) {
    console.error('City search error:', err);
    cityDropdown.classList.remove('visible');
  }
}

function displayCitySuggestions(cities) {
  if (!cities || cities.length === 0) {
    cityDropdown.classList.remove('visible');
    return;
  }

  cityDropdown.innerHTML = cities.map(city => {
    const label = formatCityLabel(city);
    cityCache.set(label, city);
    cityCache.set(city.name, city);

    return `
      <div class="city-option" data-city-name="${escapeHtml(city.name)}">
        <div class="city-name">${escapeHtml(city.name)}</div>
        <div class="city-meta">${escapeHtml([city.admin1, city.country].filter(Boolean).join(', '))}</div>
        <div class="city-coords">${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°</div>
      </div>
    `;
  }).join('');

  cityDropdown.querySelectorAll('.city-option').forEach(option => {
    option.addEventListener('click', () => {
      const cityName = option.getAttribute('data-city-name');
      const city = cityCache.get(cityName);
      if (city) {
        addCityTag(city);
      }
    });
  });

  cityDropdown.classList.add('visible');
}

function addCityTag(city) {
  if (selectedCities.length >= MAX_CITIES) return;
  if (selectedCities.some(c => c.name === city.name)) return;

  selectedCities.push(city);
  renderCityTags();
  updateCitySearchState();

  // Clear search
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

  // Attach remove listeners
  cityTagsContainer.querySelectorAll('.city-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'), 10);
      removeCityTag(index);
    });
  });
}

function updateCitySearchState() {
  if (selectedCities.length >= MAX_CITIES) {
    citySearchInput.disabled = true;
    citySearchInput.placeholder = `Maximum ${MAX_CITIES} cities`;
  } else {
    citySearchInput.disabled = false;
    citySearchInput.placeholder = 'Add city...';
  }
}

async function handlePeriodicCitySearch() {
  const query = periodicCitySearchInput.value.trim();

  if (query.length < 2) {
    periodicCityDropdown.classList.remove('visible');
    return;
  }

  try {
    const cities = await suggestCities(query);
    displayPeriodicCitySuggestions(cities);
  } catch (err) {
    console.error('City search error:', err);
    periodicCityDropdown.classList.remove('visible');
  }
}

function displayPeriodicCitySuggestions(cities) {
  if (!cities || cities.length === 0) {
    periodicCityDropdown.classList.remove('visible');
    return;
  }

  periodicCityDropdown.innerHTML = cities.map(city => {
    const label = formatCityLabel(city);
    cityCache.set(label, city);
    cityCache.set(city.name, city);

    return `
      <div class="city-option" data-city-name="${escapeHtml(city.name)}">
        <div class="city-name">${escapeHtml(city.name)}</div>
        <div class="city-meta">${escapeHtml([city.admin1, city.country].filter(Boolean).join(', '))}</div>
        <div class="city-coords">${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°</div>
      </div>
    `;
  }).join('');

  periodicCityDropdown.querySelectorAll('.city-option').forEach(option => {
    option.addEventListener('click', () => {
      const cityName = option.getAttribute('data-city-name');
      const city = cityCache.get(cityName);
      if (city) {
        selectPeriodicCity(city);
      }
    });
  });

  periodicCityDropdown.classList.add('visible');
}

function selectPeriodicCity(city) {
  periodicCity = city;
  periodicCitySearchInput.value = formatCityLabel(city);
  periodicCityDropdown.classList.remove('visible');
}

function setupProgressionCitySelector() {
  progressionCitySearchInput.addEventListener('input', handleProgressionCitySearch);
  progressionCitySearchInput.addEventListener('focus', () => {
    if (progressionCitySearchInput.value.trim()) {
      handleProgressionCitySearch();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.city-input-wrapper');
    const isProgressionWrapper = wrapper && wrapper.closest('#controls-progression');
    if (!isProgressionWrapper) {
      progressionCityDropdown.classList.remove('visible');
    }
  });
}

async function handleProgressionCitySearch() {
  const query = progressionCitySearchInput.value.trim();

  if (query.length < 2) {
    progressionCityDropdown.classList.remove('visible');
    return;
  }

  try {
    const cities = await suggestCities(query);
    displayProgressionCitySuggestions(cities);
  } catch (err) {
    console.error('City search error:', err);
    progressionCityDropdown.classList.remove('visible');
  }
}

function displayProgressionCitySuggestions(cities) {
  if (!cities || cities.length === 0) {
    progressionCityDropdown.classList.remove('visible');
    return;
  }

  progressionCityDropdown.innerHTML = cities.map(city => {
    const label = formatCityLabel(city);
    cityCache.set(label, city);
    cityCache.set(city.name, city);

    return `
      <div class="city-option" data-city-name="${escapeHtml(city.name)}">
        <div class="city-name">${escapeHtml(city.name)}</div>
        <div class="city-meta">${escapeHtml([city.admin1, city.country].filter(Boolean).join(', '))}</div>
        <div class="city-coords">${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°</div>
      </div>
    `;
  }).join('');

  progressionCityDropdown.querySelectorAll('.city-option').forEach(option => {
    option.addEventListener('click', () => {
      const cityName = option.getAttribute('data-city-name');
      const city = cityCache.get(cityName);
      if (city) {
        selectProgressionCity(city);
      }
    });
  });

  progressionCityDropdown.classList.add('visible');
}

function selectProgressionCity(city) {
  progressionCity = city;
  progressionCitySearchInput.value = formatCityLabel(city);
  progressionCityDropdown.classList.remove('visible');
}

function setupPeriodTypeSelector() {
  const updatePeriodFields = () => {
    const periodType = periodTypeSelect.value;

    seasonSelect.style.display = 'none';
    monthSelect.style.display = 'none';
    daySelect.style.display = 'none';

    if (periodType === 'season') {
      seasonSelect.style.display = '';
    } else if (periodType === 'month') {
      monthSelect.style.display = '';
    } else if (periodType === 'day') {
      daySelect.style.display = '';
    }
  };

  periodTypeSelect.addEventListener('change', updatePeriodFields);

  // Initialize on load
  updatePeriodFields();
}

function setupYearTagSelector() {
  yearInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addYearTag();
    }
  });

  yearInput.addEventListener('blur', () => {
    addYearTag();
  });
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

  // Attach remove listeners
  yearTagsContainer.querySelectorAll('.year-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'), 10);
      removeYearTag(index);
    });
  });
}

function updateYearInputState() {
  if (selectedYears.length >= 3) {
    yearInput.disabled = true;
    yearInput.placeholder = 'Max 3';
  } else {
    yearInput.disabled = false;
    yearInput.placeholder = 'Add year...';
  }
}

function restoreCityTags() {
  if (state.entities && state.entities.length > 0) {
    selectedCities = state.entities.map(e => ({
      name: e.name,
      country: e.country,
      admin1: e.admin1,
      lat: e.lat,
      lon: e.lon
    }));
    renderCityTags();
    updateCitySearchState();
  }
}

function restorePeriodicInputs() {
  if (state.periodic && state.periodic.city) {
    periodicCity = state.periodic.city;
    periodicCitySearchInput.value = formatCityLabel(periodicCity);
  }
  if (state.periodic && state.periodic.years.length > 0) {
    selectedYears = [...state.periodic.years];
    renderYearTags();
    updateYearInputState();
  }
  if (state.periodic && state.periodic.periodStart) {
    periodStartInput.value = state.periodic.periodStart;
  }
  if (state.periodic && state.periodic.periodEnd) {
    periodEndInput.value = state.periodic.periodEnd;
  }
}

function restoreProgressionInputs() {
  if (state.progression && state.progression.city) {
    progressionCity = state.progression.city;
    progressionCitySearchInput.value = formatCityLabel(progressionCity);
  }
  if (state.progression && state.progression.yearFrom) {
    yearFromInput.value = state.progression.yearFrom;
  }
  if (state.progression && state.progression.yearTo) {
    yearToInput.value = state.progression.yearTo;
  }
  if (state.progression && state.progression.periodConfig) {
    const config = state.progression.periodConfig;
    periodTypeSelect.value = config.type;

    // Hide all first
    seasonSelect.style.display = 'none';
    monthSelect.style.display = 'none';
    daySelect.style.display = 'none';

    // Show only the relevant one
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

function getPeriodDates(year, periodConfig) {
  if (periodConfig.type === 'year') {
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`
    };
  } else if (periodConfig.type === 'season') {
    const seasons = {
      winter: { start: '12-01', end: '02-28' },
      spring: { start: '03-01', end: '05-31' },
      summer: { start: '06-01', end: '08-31' },
      fall: { start: '09-01', end: '11-30' }
    };
    const season = seasons[periodConfig.value];
    // Winter spans two years
    if (periodConfig.value === 'winter') {
      return {
        startDate: `${year - 1}-${season.start}`,
        endDate: `${year}-${season.end}`
      };
    }
    return {
      startDate: `${year}-${season.start}`,
      endDate: `${year}-${season.end}`
    };
  } else if (periodConfig.type === 'month') {
    const month = parseInt(periodConfig.value, 10);
    const monthStr = month.toString().padStart(2, '0');
    const daysInMonth = new Date(year, month, 0).getDate();
    return {
      startDate: `${year}-${monthStr}-01`,
      endDate: `${year}-${monthStr}-${daysInMonth}`
    };
  } else if (periodConfig.type === 'day') {
    return {
      startDate: `${year}-${periodConfig.value}`,
      endDate: `${year}-${periodConfig.value}`
    };
  }
}

function formatPeriodLabel(periodConfig) {
  if (periodConfig.type === 'year') {
    return 'Whole year';
  } else if (periodConfig.type === 'season') {
    return periodConfig.value.charAt(0).toUpperCase() + periodConfig.value.slice(1);
  } else if (periodConfig.type === 'month') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[parseInt(periodConfig.value, 10) - 1];
  } else if (periodConfig.type === 'day') {
    return periodConfig.value;
  }
}

function aggregateProgressionStats(allStats) {
  // Calculate aggregates across all years
  const result = {
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
  return result;
}

function aggregateSeriesForProgression(allSeries, yearLabels) {
  // Aggregate all series into one series with years as X axis
  const aggregated = {
    x: yearLabels,
    tempMax: [],
    tempMin: [],
    tempMean: [],
    precip: [],
    humidity: [],
    wind: [],
    windMax: [],
    norm: null
  };

  allSeries.forEach(series => {
    // For each year's series, take the mean/max/min values
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

function arrayMax(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? Math.max(...filtered) : null;
}

function arrayMin(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? Math.min(...filtered) : null;
}

function arrayMean(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? average(filtered) : null;
}

function arraySum(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? sum(filtered) : null;
}

function average(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function fillStatsProgression(dom, stats, cityName, periodLabel, yearFrom, yearTo) {
  const titleHtml = `<div class="stats-title"><div class="stats-city">${escapeHtml(cityName)}</div><div class="stats-period">${escapeHtml(periodLabel)} · ${yearFrom}–${yearTo}</div></div>`;

  const metrics = [
    { key: 'maxT', label: 'T↑', tooltip: 'Maximum temperature', format: formatTemp },
    { key: 'avgT', label: 'T~', tooltip: 'Average temperature', format: formatTemp },
    { key: 'minT', label: 'T↓', tooltip: 'Minimum temperature', format: formatTemp },
    { key: 'climateDev', label: 'ΔT', tooltip: 'Temperature deviation from climate norm', format: formatDeviation },
    { key: 'precipTotal', label: '∑ Rain', tooltip: 'Total precipitation', format: formatPrecip },
    { key: 'precipMax', label: 'Rain↑', tooltip: 'Maximum daily precipitation', format: formatPrecip },
    { key: 'humAvg', label: 'RH%', tooltip: 'Average relative humidity', format: formatPercent },
    { key: 'windMax', label: 'Wind↑', tooltip: 'Maximum wind speed', format: formatWind },
    { key: 'windAvg', label: 'Wind~', tooltip: 'Average wind speed', format: formatWind },
    { key: 'precipDays', label: 'Rain days', tooltip: 'Days with precipitation >0.1mm', format: v => v },
    { key: 'totalDays', label: '∑ Days', tooltip: 'Total days in period', format: v => v }
  ];

  let tableHtml = '';
  metrics.forEach(metric => {
    tableHtml += `<div class="stats-row" style="grid-template-columns: auto 1fr;">`;
    tableHtml += `<div class="stats-label" title="${metric.tooltip}">${metric.label}</div>`;
    tableHtml += `<div class="stats-value">${metric.format(stats[metric.key])}</div>`;
    tableHtml += '</div>';
  });

  dom.innerHTML = `${titleHtml}<div class="stats-table">${tableHtml}</div>`;
}

export function bindControls() {
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

export function fillStats(dom, statsArray, cityLabels, startDate = '', endDate = '') {
  const numCities = statsArray.length;
  const isComparison = numCities > 1;

  // Title with period and city
  let titleHtml = '';
  if (isComparison) {
    titleHtml = `<div class="stats-title"><div class="stats-period">${startDate} – ${endDate}</div></div>`;
  } else {
    const cityName = cityLabels[0] || 'City';
    titleHtml = `<div class="stats-title"><div class="stats-city">${escapeHtml(cityName)}</div><div class="stats-period">${startDate} – ${endDate}</div></div>`;
  }

  // Header row with cities (only for comparison)
  let headerHtml = '';
  if (isComparison) {
    headerHtml = `<div class="stats-header-row" style="grid-template-columns: auto repeat(${numCities}, 1fr);">`;
    headerHtml += `<div class="stats-label"></div>`;
    cityLabels.forEach((label, i) => {
      const colorClass = `color-${COLOR_NAMES[i]}`;
      headerHtml += `<div class="stats-value"><span class="${colorClass}">${escapeHtml(label || `City ${i+1}`)}</span></div>`;
    });
    headerHtml += '</div>';
  }

  const metrics = [
    { key: 'maxT', label: 'T↑', tooltip: 'Maximum temperature', format: formatTemp },
    { key: 'avgT', label: 'T~', tooltip: 'Average temperature', format: formatTemp },
    { key: 'minT', label: 'T↓', tooltip: 'Minimum temperature', format: formatTemp },
    { key: 'climateDev', label: 'ΔT', tooltip: 'Temperature deviation from climate norm', format: formatDeviation },
    { key: 'precipTotal', label: '∑ Rain', tooltip: 'Total precipitation', format: formatPrecip },
    { key: 'precipMax', label: 'Rain↑', tooltip: 'Maximum daily precipitation', format: formatPrecip },
    { key: 'humAvg', label: 'RH%', tooltip: 'Average relative humidity', format: formatPercent },
    { key: 'windMax', label: 'Wind↑', tooltip: 'Maximum wind speed', format: formatWind },
    { key: 'windAvg', label: 'Wind~', tooltip: 'Average wind speed', format: formatWind },
    { key: 'precipDays', label: 'Rain days', tooltip: 'Days with precipitation >0.1mm', format: v => v },
    { key: 'totalDays', label: '∑ Days', tooltip: 'Total days in period', format: v => v }
  ];

  let tableHtml = '';
  metrics.forEach(metric => {
    tableHtml += `<div class="stats-row" style="grid-template-columns: auto repeat(${numCities}, 1fr);">`;
    tableHtml += `<div class="stats-label" title="${metric.tooltip}">${metric.label}</div>`;
    statsArray.forEach((stats, i) => {
      tableHtml += `<div class="stats-value">${metric.format(stats[metric.key])}</div>`;
    });
    tableHtml += '</div>';
  });

  const headerSection = headerHtml ? `<div class="stats-header">${headerHtml}</div>` : '';
  dom.innerHTML = `${titleHtml}${headerSection}<div class="stats-table">${tableHtml}</div>`;
}

function fillStatsPeriodic(dom, statsArray, yearLabels, cityName, periodStart, periodEnd) {
  const numYears = statsArray.length;
  const isComparison = numYears > 1;

  // Format period display
  const periodDisplay = `${periodStart} – ${periodEnd}`;

  // Title with city and period
  let titleHtml = `<div class="stats-title"><div class="stats-city">${escapeHtml(cityName)}</div><div class="stats-period">${periodDisplay}</div></div>`;

  // Header row with years
  let headerHtml = '';
  if (isComparison) {
    headerHtml = `<div class="stats-header-row" style="grid-template-columns: auto repeat(${numYears}, 1fr);">`;
    headerHtml += `<div class="stats-label"></div>`;
    yearLabels.forEach((label, i) => {
      const colorClass = `color-${COLOR_NAMES[i]}`;
      headerHtml += `<div class="stats-value"><span class="${colorClass}">${escapeHtml(label)}</span></div>`;
    });
    headerHtml += '</div>';
  }

  const metrics = [
    { key: 'maxT', label: 'T↑', tooltip: 'Maximum temperature', format: formatTemp },
    { key: 'avgT', label: 'T~', tooltip: 'Average temperature', format: formatTemp },
    { key: 'minT', label: 'T↓', tooltip: 'Minimum temperature', format: formatTemp },
    { key: 'climateDev', label: 'ΔT', tooltip: 'Temperature deviation from climate norm', format: formatDeviation },
    { key: 'precipTotal', label: '∑ Rain', tooltip: 'Total precipitation', format: formatPrecip },
    { key: 'precipMax', label: 'Rain↑', tooltip: 'Maximum daily precipitation', format: formatPrecip },
    { key: 'humAvg', label: 'RH%', tooltip: 'Average relative humidity', format: formatPercent },
    { key: 'windMax', label: 'Wind↑', tooltip: 'Maximum wind speed', format: formatWind },
    { key: 'windAvg', label: 'Wind~', tooltip: 'Average wind speed', format: formatWind },
    { key: 'precipDays', label: 'Rain days', tooltip: 'Days with precipitation >0.1mm', format: v => v },
    { key: 'totalDays', label: '∑ Days', tooltip: 'Total days in period', format: v => v }
  ];

  let tableHtml = '';
  metrics.forEach(metric => {
    tableHtml += `<div class="stats-row" style="grid-template-columns: auto repeat(${numYears}, 1fr);">`;
    tableHtml += `<div class="stats-label" title="${metric.tooltip}">${metric.label}</div>`;
    statsArray.forEach((stats, i) => {
      tableHtml += `<div class="stats-value">${metric.format(stats[metric.key])}</div>`;
    });
    tableHtml += '</div>';
  });

  const headerSection = headerHtml ? `<div class="stats-header">${headerHtml}</div>` : '';
  dom.innerHTML = `${titleHtml}${headerSection}<div class="stats-table">${tableHtml}</div>`;
}

function formatTemp(value) {
  return isFiniteNumber(value) ? `${value.toFixed(1)} °C` : 'n/a';
}

function formatPrecip(value) {
  return isFiniteNumber(value) ? `${value.toFixed(1)} mm` : 'n/a';
}

function formatPercent(value) {
  return isFiniteNumber(value) ? `${value.toFixed(1)} %` : 'n/a';
}

function formatWind(value) {
  return isFiniteNumber(value) ? `${value.toFixed(1)} km/h` : 'n/a';
}

function formatDeviation(value) {
  if (!isFiniteNumber(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} °C`;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
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

function prefillInputs() {
  const today = isoToday();
  const jan1 = isoYearStart(today);

  const savedDate = state.date || {};
  const start = sanitizeDate(savedDate.start) || jan1;
  const endIsToday = savedDate.endIsToday === true;
  let end = sanitizeDate(savedDate.end) || today;
  if (endIsToday) {
    end = today;
  }
  startInput.value = start;
  endInput.value = end;
  state.date = { start, end, endIsToday };
  saveState(state);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleDateChange(field, inputEl) {
  const raw = inputEl.value.trim();
  const iso = sanitizeDate(raw);
  const today = isoToday();
  if (!iso) {
    showMessage('Use YYYY-MM-DD format', 'error');
    if (field === 'start') {
      const fallback = state.date?.start || isoYearStart(today);
      inputEl.value = fallback;
    } else {
      const fallbackEnd = state.date?.end || today;
      const endIsToday = state.date?.endIsToday === true;
      inputEl.value = endIsToday ? today : fallbackEnd;
    }
    return;
  }
  if (field === 'end') {
    const endIsToday = iso === today;
    state.date = { ...state.date, end: iso, endIsToday };
    inputEl.value = endIsToday ? today : iso;
  } else {
    state.date = { ...state.date, start: iso };
    inputEl.value = iso;
  }
  saveState(state);
}

function sanitizeDate(value) {
  if (!value) return null;
  const trimmed = value.trim();
  return ISO_DATE_REGEX.test(trimmed) ? trimmed : null;
}

function isoToday() {
  return new Date().toISOString().slice(0,10);
}

function isoYearStart(today) {
  return today.slice(0,4) + '-01-01';
}

function resetAll() {
  try {
    localStorage.removeItem('gor:v1');
  } catch (err) {
    console.warn('Failed to clear saved state', err);
  }
  window.location.reload();
}

function formatCityLabel(city) {
  if (!city) return '';
  return city.name;
}

function autoApplyOnLoad() {
  if (state.mode === 'comparison') {
    const hasValidState = state.entities && state.entities.length > 0 && selectedCities.length > 0;
    if (hasValidState) {
      setTimeout(() => {
        apply();
      }, 100);
    }
  } else if (state.mode === 'periodic') {
    const hasValidState = state.periodic?.city && state.periodic?.years.length > 0;
    if (hasValidState) {
      setTimeout(() => {
        apply();
      }, 100);
    }
  } else if (state.mode === 'progression') {
    const hasValidState = state.progression?.city && state.progression?.yearFrom && state.progression?.yearTo;
    if (hasValidState) {
      setTimeout(() => {
        apply();
      }, 100);
    }
  }
}

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const isMac = /mac|iphone|ipad|ipod/.test(ua);
  const isWindows = /win/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
  const isChrome = /chrome/.test(ua) && !/edge/.test(ua);
  const isFirefox = /firefox/.test(ua);

  return { isMac, isWindows, isSafari, isChrome, isFirefox };
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

function showMessage(text, type = 'info') {
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

function createProgressToast() {
  const existing = document.getElementById('toast-progress');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-progress';
  toast.className = 'toast toast-info';
  toast.textContent = 'Loading...';

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);

  return toast;
}

function updateProgressToast(toast, text) {
  if (toast) {
    toast.textContent = text;
  }
}

function removeProgressToast(toast) {
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }
}

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
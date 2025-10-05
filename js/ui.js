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

const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const statsDom = document.getElementById('stats');
const citySearchInput = document.getElementById('city-search');
const cityTagsContainer = document.getElementById('city-tags');
const cityDropdown = document.getElementById('city-dropdown');

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CITIES = 3;

prefillInputs();
bindControls();
setupCityTagSelector();
restoreCityTags();
autoApplyOnLoad();

async function apply() {
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
    }

    if (entities.length === 1) {
      renderAll(charts, allSeries[0], COLORS[0], state.prefs);
      fillStats(statsDom, [allStats[0]], [entities[0].label], startIso, endIso);
    } else {
      renderCompare(charts, allSeries, COLORS, state.prefs);
      const labels = entities.map(e => e.label);
      fillStats(statsDom, allStats, labels, startIso, endIso);
    }

    state.entities = entities;
    state.date = { start: startIso, end: endIso, endIsToday };
    saveState(state);
  } catch (e) {
    console.error(e);
    showMessage(e.message || 'An error occurred', 'error');
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
    if (!e.target.closest('.city-input-wrapper')) {
      cityDropdown.classList.remove('visible');
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
  const mode = state.mode || 'single';
  let baseName = 'grainofrain';

  if (mode === 'single' && state.entities.length > 0) {
    const city = state.entities[0].label;
    baseName = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grainofrain';
  } else if (mode === 'compare' && state.entities.length > 0) {
    const cities = state.entities.map(e => e.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).join('-');
    baseName = cities || 'compare';
  }

  const startDate = state.date?.start || '';
  const endDate = state.date?.end || '';
  const dateRange = (startDate && endDate) ? `${startDate}-${endDate}` : (startDate || isoToday());

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
  const hasValidState = state.entities && state.entities.length > 0 && selectedCities.length > 0;

  if (hasValidState) {
    setTimeout(() => {
      apply();
    }, 100);
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
    message += '**Safari Limitation**\n\n';
    message += 'Safari doesn\'t support clipboard image copying.\n\n';
    message += '• Use the 💾 Download button instead\n';
    message += '• Or switch to Chrome/Firefox for clipboard support';
  } else if (!navigator.clipboard) {
    message += 'Your browser doesn\'t support clipboard API.\n\n';
    message += '• Use the 💾 Download button instead\n';
    message += '• Or access via HTTPS (required for clipboard)';
  } else if (err.message && err.message.includes('denied')) {
    if (platform.isMac) {
      message += '**Permission denied**\n\n';
      message += 'macOS: System Settings → Privacy & Security → Screen Recording\n';
      message += 'Enable your browser for clipboard access.\n\n';
      message += 'Alternative: Use the 💾 Download button';
    } else if (platform.isWindows) {
      message += '**Permission denied**\n\n';
      message += 'Windows: Settings → Privacy → Clipboard\n';
      message += 'Allow apps to access clipboard.\n\n';
      message += 'Alternative: Use the 💾 Download button';
    } else {
      message += 'Clipboard permission was denied.\n\n';
      message += 'Alternative: Use the 💾 Download button';
    }
  } else {
    message += err.message || 'Unknown error\n\n';
    message += 'Alternative: Use the 💾 Download button';
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
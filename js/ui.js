import { loadState, saveState, defaultState } from './store.js';
import { searchCity, fetchDaily, fetchHourly, dailyMeanFromHourly, fetchNormals, suggestCities } from './api.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll, renderCompare } from './charts.js';
import { exportPng, copyPngToClipboard } from './export.js';

const COLORS = ['#1E88E5', '#E53935', '#43A047'];
const COLOR_NAMES = ['blue', 'red', 'green'];

let state = loadState();
const charts = initCharts();
const cityCaches = [new Map(), new Map(), new Map()];

const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const statsDom = document.getElementById('stats');
const addCityBtn = document.getElementById('add-city-btn');

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

prefillInputs();
bindControls();
setupCityButtons();
setupCityAutocomplete(0);
setupCityAutocomplete(1);
setupCityAutocomplete(2);
setupPersistenceListeners();
autoApplyOnLoad();

async function apply() {
  const startValue = startInput.value.trim();
  const endValue = endInput.value.trim();

  if (!startValue || !endValue) return showMessage('Fill all fields', 'error');

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
    const visibleCities = getVisibleCityCount();

    const entities = [];
    const allSeries = [];
    const allStats = [];

    for (let i = 0; i < visibleCities; i++) {
      const cityInput = document.getElementById(`city-${i}`);
      const cityValue = cityInput.value.trim();

      if (!cityValue) {
        if (i === 0) {
          return showMessage('At least first city is required', 'error');
        }
        continue;
      }

      let geo = cityCaches[i].get(cityValue) || null;
      if (!geo) {
        geo = await searchCity(cityValue);
      }
      const label = formatCityLabel(geo);
      cityCaches[i].set(label, geo);
      cityCaches[i].set(geo.name, geo);
      cityCaches[i].set(cityValue, geo);
      cityInput.value = label;

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

function setupCityButtons() {
  // Add city button
  addCityBtn.addEventListener('click', () => {
    const visibleCount = getVisibleCityCount();
    if (visibleCount < 3) {
      document.querySelector(`[data-city-index="${visibleCount}"]`).style.display = '';
      updateAddButtonState();
    }
  });

  // Remove city buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-remove-index'), 10);
      const cityRow = document.querySelector(`[data-city-index="${index}"]`);
      const cityInput = document.getElementById(`city-${index}`);

      // Clear the input and hide the row
      cityInput.value = '';
      cityRow.style.display = 'none';

      // If removing city 2, also hide city 3 and shift its value up if needed
      if (index === 1) {
        const city3Row = document.querySelector('[data-city-index="2"]');
        const city3Input = document.getElementById('city-2');
        city3Input.value = '';
        city3Row.style.display = 'none';
      }

      updateAddButtonState();
    });
  });

  updateAddButtonState();
}

function getVisibleCityCount() {
  let count = 1; // First city always counts
  if (document.querySelector('[data-city-index="1"]').style.display !== 'none') count++;
  if (document.querySelector('[data-city-index="2"]').style.display !== 'none') count++;
  return count;
}

function updateAddButtonState() {
  const visibleCount = getVisibleCityCount();
  if (visibleCount >= 3) {
    addCityBtn.disabled = true;
  } else {
    addCityBtn.disabled = false;
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

  // Title with period
  let titleHtml = '';
  if (isComparison) {
    titleHtml = `<div class="stats-title">${startDate}..${endDate}</div>`;
  } else {
    const cityName = cityLabels[0] || 'City';
    titleHtml = `<div class="stats-title">${escapeHtml(cityName)}, ${startDate}..${endDate}</div>`;
  }

  // Header row with cities (only for comparison)
  let headerHtml = '';
  if (isComparison) {
    headerHtml = `<div class="stats-header-row" style="grid-template-columns: auto repeat(${numCities}, 1fr);">`;
    headerHtml += `<div class="stats-label"></div>`;
    cityLabels.forEach((label, i) => {
      const colorClass = `color-${COLOR_NAMES[i]}`;
      headerHtml += `<div class="stats-value ${colorClass}">${escapeHtml(label || `City ${i+1}`)}</div>`;
    });
    headerHtml += '</div>';
  }

  const metrics = [
    { key: 'maxT', label: 'Max temp.', format: formatTemp },
    { key: 'avgT', label: 'Avg temp.', format: formatTemp },
    { key: 'minT', label: 'Min temp.', format: formatTemp },
    { key: 'climateDev', label: 'Average temp. dev.', format: formatDeviation },
    { key: 'precipTotal', label: 'Total precip.', format: formatPrecip },
    { key: 'precipMax', label: 'Max daily precip.', format: formatPrecip },
    { key: 'humAvg', label: 'Avg. humidity', format: formatPercent },
    { key: 'windMax', label: 'Max wind', format: formatWind },
    { key: 'windAvg', label: 'Avg. wind', format: formatWind },
    { key: 'precipDays', label: 'Dry days', format: v => v },
    { key: 'totalDays', label: 'Total days', format: v => v }
  ];

  let tableHtml = '';
  metrics.forEach(metric => {
    tableHtml += `<div class="stats-row" style="grid-template-columns: auto repeat(${numCities}, 1fr);"><div class="stats-label">${metric.label}</div>`;
    statsArray.forEach((stats, i) => {
      const colorClass = `color-${COLOR_NAMES[i]}`;
      tableHtml += `<div class="stats-value ${colorClass}">${metric.format(stats[metric.key])}</div>`;
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
  const today = isoToday();
  const mode = state.mode || 'single';
  let baseName = 'grainofrain';

  if (mode === 'single' && state.entities.length > 0) {
    const city = state.entities[0].label;
    baseName = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grainofrain';
  } else if (mode === 'compare') {
    baseName = 'compare';
  }

  return `${baseName}-${today}.png`;
}

function prefillInputs() {
  const today = isoToday();
  const jan1 = isoYearStart(today);

  // Restore saved cities
  let filledCityCount = 0;
  for (let i = 0; i < 3; i++) {
    const cityInput = document.getElementById(`city-${i}`);
    const cityRow = document.querySelector(`[data-city-index="${i}"]`);
    const savedEntity = state.entities[i];

    if (savedEntity && savedEntity.label) {
      cityInput.value = savedEntity.label;
      const cachedGeo = {
        name: savedEntity.name,
        country: savedEntity.country,
        admin1: savedEntity.admin1,
        lat: savedEntity.lat,
        lon: savedEntity.lon,
        label: savedEntity.label
      };
      cityCaches[i].set(savedEntity.label, cachedGeo);
      cityCaches[i].set(savedEntity.name, cachedGeo);

      // Show this city row
      if (i > 0) {
        cityRow.style.display = '';
      }
      filledCityCount++;
    } else {
      cityInput.value = '';
      if (i > 0) {
        cityRow.style.display = 'none';
      }
    }
  }

  // Update add button state based on restored cities
  updateAddButtonState();

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

function setupCityAutocomplete(index) {
  const cityInput = document.getElementById(`city-${index}`);
  const cityDropdown = document.getElementById(`city-dropdown-${index}`);

  let timer = null;
  let selectedIndex = -1;
  let currentMatches = [];

  function closeDropdown() {
    cityDropdown.innerHTML = '';
    cityDropdown.classList.remove('visible');
    cityInput.setAttribute('aria-expanded', 'false');
    selectedIndex = -1;
    currentMatches = [];
  }

  function selectCity(city) {
    const label = formatCityLabel(city);
    cityInput.value = label;
    cityCaches[index].set(label, city);
    cityCaches[index].set(city.name, city);
    closeDropdown();
    cityInput.blur();
  }

  cityInput.addEventListener('input', () => {
    const query = cityInput.value.trim();
    if (timer) clearTimeout(timer);
    if (!query) {
      closeDropdown();
      return;
    }
    timer = setTimeout(async () => {
      if (query.length < 2) {
        closeDropdown();
        return;
      }
      try {
        const matches = await suggestCities(query);
        currentMatches = matches;
        if (matches.length === 0) {
          closeDropdown();
          return;
        }

        cityDropdown.innerHTML = matches.map((city, idx) => {
          const label = formatCityLabel(city);
          cityCaches[index].set(label, city);
          cityCaches[index].set(city.name, city);
          const coords = `${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°`;
          return `
            <div class="city-option" role="option" data-index="${idx}" tabindex="-1">
              <div class="city-name">${escapeHtml(city.name)}</div>
              <div class="city-meta">${escapeHtml([city.admin1, city.country].filter(Boolean).join(', '))}</div>
              <div class="city-coords">${coords}</div>
            </div>
          `;
        }).join('');

        cityDropdown.classList.add('visible');
        cityInput.setAttribute('aria-expanded', 'true');
        selectedIndex = -1;

        const options = cityDropdown.querySelectorAll('.city-option');
        options.forEach(opt => {
          opt.addEventListener('click', () => {
            const idx = parseInt(opt.getAttribute('data-index'), 10);
            selectCity(currentMatches[idx]);
          });
        });
      } catch (err) {
        console.warn('City lookup failed', err);
        closeDropdown();
      }
    }, 250);
  });

  cityInput.addEventListener('keydown', (e) => {
    const options = cityDropdown.querySelectorAll('.city-option');
    if (!options.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, options.length - 1);
      updateSelection(options);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateSelection(options);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectCity(currentMatches[selectedIndex]);
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  function updateSelection(options) {
    options.forEach((opt, idx) => {
      if (idx === selectedIndex) {
        opt.classList.add('selected');
        opt.scrollIntoView({ block: 'nearest' });
      } else {
        opt.classList.remove('selected');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!cityInput.contains(e.target) && !cityDropdown.contains(e.target)) {
      closeDropdown();
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupPersistenceListeners() {
  for (let i = 0; i < 3; i++) {
    const cityInput = document.getElementById(`city-${i}`);
    cityInput.addEventListener('change', () => {
      const value = cityInput.value.trim();
      if (!state.entities[i]) {
        state.entities[i] = {};
      }
      state.entities[i].label = value;
      saveState(state);
    });
  }

  startInput.addEventListener('change', () => handleDateChange('start', startInput));
  endInput.addEventListener('change', () => handleDateChange('end', endInput));
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
  const hasCity = document.getElementById('city-0').value.trim().length > 0;
  const hasValidState = state.entities && state.entities.length > 0;

  if (hasCity && hasValidState) {
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
import { loadState, saveState, defaultState } from './store.js';
import { searchCity, fetchDaily, fetchHourly, dailyMeanFromHourly, fetchNormals, suggestCities } from './api.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll } from './charts.js';
import { exportPng, copyPngToClipboard } from './export.js';

let state = loadState();
const charts = initCharts();
const cityCache = new Map();

const cityInput = document.getElementById('city');
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const cityDropdown = document.getElementById('city-dropdown');
const statsDom = document.getElementById('stats');

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

prefillInputs();
bindControls();
setupCityAutocomplete();
setupPersistenceListeners();
autoApplyOnLoad();

async function apply() {
  const cityValue = cityInput.value.trim();
  const startValue = startInput.value.trim();
  const endValue = endInput.value.trim();
  if (!cityValue || !startValue || !endValue) return alert('Fill all fields');

  const startIso = sanitizeDate(startValue);
  if (!startIso) {
    alert('Start date must use YYYY-MM-DD');
    startInput.focus();
    return;
  }
  const endIso = sanitizeDate(endValue);
  if (!endIso) {
    alert('End date must use YYYY-MM-DD');
    endInput.focus();
    return;
  }

  if (startIso > endIso) {
    alert('Start date must be before end date');
    startInput.focus();
    return;
  }

  const today = isoToday();
  const endIsToday = endIso === today;

  startInput.value = startIso;
  endInput.value = endIsToday ? today : endIso;

  try {
    let geo = cityCache.get(cityValue) || null;
    if (!geo) {
      geo = await searchCity(cityValue);
    }
    const label = formatCityLabel(geo);
    cityCache.set(label, geo);
    cityCache.set(geo.name, geo);
    cityCache.set(cityValue, geo);
    cityInput.value = label;
    state.lastCityLabel = label;

    const daily = await fetchDaily(geo.lat, geo.lon, startIso, endIso);
    const hourly = await fetchHourly(geo.lat, geo.lon, startIso, endIso);
    const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
    const wind = dailyMeanFromHourly(hourly.time, hourly.wind);
    let normals = null;
    if (state.prefs.showNormals) {
      try { normals = await fetchNormals(geo.lat, geo.lon); } catch (e) { normals = null; }
    }
    const series = buildSeries(daily, hum, wind, normals);
    renderAll(charts, series, '#1E88E5', state.prefs);
    const stats = computeStats(series);
    fillStats(statsDom, stats, label, startIso, endIso);

    state.entities = [{
      type: 'city',
      name: geo.name,
      country: geo.country || null,
      admin1: geo.admin1 || null,
      lat: geo.lat,
      lon: geo.lon,
      label
    }];
    state.date = { start: startIso, end: endIso, endIsToday };
    saveState(state);
  } catch (e) {
    console.error(e);
    alert(e.message);
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

export function fillStats(dom, stats, city = '', startDate = '', endDate = '') {
  dom.innerHTML = `
  <div class="stats-header">
    <div class="stats-city">${escapeHtml(city || 'Location')}</div>
    <div class="stats-dates">${startDate} → ${endDate}</div>
  </div>
  <table>
  <tr><th>Min temp</th><td>${formatTemp(stats.minT)}</td></tr>
  <tr><th>Max temp</th><td>${formatTemp(stats.maxT)}</td></tr>
  <tr><th>Avg temp</th><td>${formatTemp(stats.avgT)}</td></tr>
  <tr><th>Climate dev</th><td>${formatDeviation(stats.climateDev)}</td></tr>
  <tr><th>Total precip</th><td>${formatPrecip(stats.precipTotal)}</td></tr>
  <tr><th>Max daily</th><td>${formatPrecip(stats.precipMax)}</td></tr>
  <tr><th>Days >0.1mm</th><td>${stats.precipDays}</td></tr>
  <tr><th>Avg humidity</th><td>${formatPercent(stats.humAvg)}</td></tr>
  <tr><th>Avg wind</th><td>${formatWind(stats.windAvg)}</td></tr>
  <tr><th>Max wind</th><td>${formatWind(stats.windMax)}</td></tr>
  </table>`;
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
  const city = state.entities[0]?.label || state.lastCityLabel || 'grainofrain';
  const safeCity = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grainofrain';
  return `${safeCity}-${today}.png`;
}

function prefillInputs() {
  const today = isoToday();
  const jan1 = isoYearStart(today);
  const savedCity = state.lastCityLabel || (state.entities[0] && state.entities[0].label);
  if (savedCity) {
    cityInput.value = savedCity;
    const entity = state.entities[0];
    if (entity && entity.label === savedCity) {
      const cachedGeo = {
        name: entity.name,
        country: entity.country,
        admin1: entity.admin1,
        lat: entity.lat,
        lon: entity.lon,
        label: savedCity
      };
      cityCache.set(savedCity, cachedGeo);
      cityCache.set(entity.name, cachedGeo);
    }
  } else {
    cityInput.value = '';
  }
  state.lastCityLabel = savedCity ? savedCity : '';

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

function setupCityAutocomplete() {
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
    cityCache.set(label, city);
    cityCache.set(city.name, city);
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
          cityCache.set(label, city);
          cityCache.set(city.name, city);
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
  cityInput.addEventListener('change', () => {
    const value = cityInput.value.trim();
    state.lastCityLabel = value;
    const entity = state.entities[0];
    if (!entity || entity.label !== value) {
      state.entities = [];
    }
    saveState(state);
  });

  startInput.addEventListener('change', () => handleDateChange('start', startInput));
  endInput.addEventListener('change', () => handleDateChange('end', endInput));
}

function handleDateChange(field, inputEl) {
  const raw = inputEl.value.trim();
  const iso = sanitizeDate(raw);
  const today = isoToday();
  if (!iso) {
    alert('Use YYYY-MM-DD format');
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
  const parts = [city.name, city.admin1, city.country].filter(Boolean);
  return parts.join(', ');
}

function autoApplyOnLoad() {
  const hasCity = cityInput.value.trim().length > 0;
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

import { loadState, saveState, defaultState } from './store.js';
import { searchCity, fetchDaily, fetchHourly, dailyMeanFromHourly, fetchNormals, suggestCities } from './api.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll } from './charts.js';
import { exportPng } from './export.js';

let state = loadState();
const charts = initCharts();
const cityCache = new Map();

const cityInput = document.getElementById('city');
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const cityOptions = document.getElementById('city-options');
const statsDom = document.getElementById('stats');

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

prefillInputs();
bindControls();
setupCityAutocomplete();
setupPersistenceListeners();

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
    const series = buildSeries(daily, hum.means, wind.means, normals);
    renderAll(charts, series, '#1E88E5', state.prefs);
    const stats = computeStats(series);
    fillStats(statsDom, stats);

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
  document.getElementById('export').addEventListener('click', () => exportPng('charts'));
  document.getElementById('reset').addEventListener('click', resetAll);
}

export function fillStats(dom, stats) {
  dom.innerHTML = `<table>
  <tr><th>Min temp</th><td>${stats.minT.toFixed(1)} °C</td></tr>
  <tr><th>Max temp</th><td>${stats.maxT.toFixed(1)} °C</td></tr>
  <tr><th>Avg temp</th><td>${stats.avgT.toFixed(1)} °C</td></tr>
  <tr><th>Climate dev</th><td>${stats.climateDev!==null?stats.climateDev.toFixed(1)+' °C':'n/a'}</td></tr>
  <tr><th>Total precip</th><td>${stats.precipTotal.toFixed(1)} mm</td></tr>
  <tr><th>Max daily precip</th><td>${stats.precipMax.toFixed(1)} mm</td></tr>
  <tr><th>Days >0.1 mm</th><td>${stats.precipDays}</td></tr>
  <tr><th>Avg humidity</th><td>${stats.humAvg.toFixed(1)} %</td></tr>
  <tr><th>Avg wind</th><td>${stats.windAvg.toFixed(1)} km/h</td></tr>
  <tr><th>Max wind</th><td>${stats.windMax.toFixed(1)} km/h</td></tr>
  </table>`;
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
  cityInput.addEventListener('input', () => {
    const query = cityInput.value.trim();
    if (timer) clearTimeout(timer);
    if (!query) {
      cityOptions.innerHTML = '';
      return;
    }
    timer = setTimeout(async () => {
      if (query.length < 2) {
        cityOptions.innerHTML = '';
        return;
      }
      try {
        const matches = await suggestCities(query);
        cityOptions.innerHTML = matches.map(city => {
          const label = formatCityLabel(city);
          cityCache.set(label, city);
          cityCache.set(city.name, city);
          return `<option value="${label}"></option>`;
        }).join('');
      } catch (err) {
        console.warn('City lookup failed', err);
      }
    }, 250);
  });
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
  state = defaultState();
  cityCache.clear();
  cityOptions.innerHTML = '';
  statsDom.innerHTML = '';
  Object.values(charts).forEach(chart => chart.clear());
  saveState(state);
  prefillInputs();
}

function formatCityLabel(city) {
  if (!city) return '';
  const parts = [city.name, city.admin1, city.country].filter(Boolean);
  return parts.join(', ');
}

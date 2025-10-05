const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ERA_URL = 'https://archive-api.open-meteo.com/v1/era5';

export async function searchCity(name) {
  const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=1&language=en`;
  const res = await fetch(url);
  const json = await res.json();
  const r = json.results && json.results[0];
  if (!r) throw new Error('City not found');
  return mapGeoResult(r);
}

export async function suggestCities(name, limit = 8) {
  if (!name) return [];
  const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=${limit}&language=en`;
  const res = await fetch(url);
  const json = await res.json();
  const results = Array.isArray(json.results) ? json.results : [];
  return results.map(mapGeoResult);
}

export async function fetchDaily(lat, lon, start, end) {
  const today = new Date().toISOString().slice(0,10);
  const actualEnd = end > today ? today : end;

  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${actualEnd}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,windspeed_10m_max&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    }
    throw new Error(`Failed to load daily data (${res.status})`);
  }
  const json = await res.json();
  const daily = json?.daily || {};
  const dates = enumerateDates(start, end);
  const map = buildDailyMap(daily);
  const tmin = [];
  const tmean = [];
  const tmax = [];
  const precip = [];
  const windMax = [];
  for (const d of dates) {
    const entry = map.get(d);
    tmin.push(entry?.tmin ?? null);
    tmean.push(entry?.tmean ?? null);
    tmax.push(entry?.tmax ?? null);
    precip.push(entry?.precip ?? null);
    windMax.push(entry?.windMax ?? null);
  }
  return { date: dates, tmin, tmean, tmax, precip, windMax };
}

export async function fetchHourly(lat, lon, start, end) {
  const today = new Date().toISOString().slice(0,10);
  const actualEnd = end > today ? today : end;

  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${actualEnd}&hourly=relative_humidity_2m,windspeed_10m&timezone=UTC`;
  const res = await fetch(url);
  const json = await res.json();
  const hourly = json?.hourly || {};
  return {
    time: Array.isArray(hourly.time) ? hourly.time : [],
    humidity: Array.isArray(hourly.relative_humidity_2m) ? hourly.relative_humidity_2m : [],
    wind: Array.isArray(hourly.windspeed_10m) ? hourly.windspeed_10m : []
  };
}

export function dailyMeanFromHourly(time, values) {
  const days = [];
  const means = [];
  let current = null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < time.length; i++) {
    const d = time[i].slice(0,10);
    if (current === null) current = d;
    if (d !== current) {
      days.push(current);
      means.push(count ? sum / count : null);
      current = d;
      sum = 0;
      count = 0;
    }
    const v = values[i];
    if (typeof v === 'number') { sum += v; count++; }
  }
  if (current !== null) {
    days.push(current);
    means.push(count ? sum / count : null);
  }
  return { days, means };
}

export async function fetchNormals(lat, lon) {
  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_mean&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to load climate normals');
  }
  const json = await res.json();
  const times = json?.daily?.time;
  const temps = json?.daily?.temperature_2m_mean;
  if (!Array.isArray(times) || !Array.isArray(temps) || times.length !== temps.length) {
    throw new Error('Climate normals unavailable for this location');
  }

  return buildDailyNormals(times, temps);
}

function buildDailyNormals(times, temps) {
  const sumsCommon = new Array(365).fill(0);
  const countsCommon = new Array(365).fill(0);
  const sumsLeap = new Array(366).fill(0);
  const countsLeap = new Array(366).fill(0);
  for (let i = 0; i < times.length; i++) {
    const dateStr = times[i];
    const value = typeof temps[i] === 'number' ? temps[i] : null;
    if (!dateStr || value === null) continue;
    const month = parseInt(dateStr.slice(5, 7), 10);
    const day = parseInt(dateStr.slice(8, 10), 10);
    if (Number.isNaN(month) || Number.isNaN(day)) continue;
    const idxLeap = dayOfYear(month, day, true) - 1;
    sumsLeap[idxLeap] += value;
    countsLeap[idxLeap] += 1;
    if (month === 2 && day === 29) {
      continue;
    }
    const idxCommon = dayOfYear(month, day, false) - 1;
    sumsCommon[idxCommon] += value;
    countsCommon[idxCommon] += 1;
  }
  const dailyCommon = sumsCommon.map((sum, idx) => (countsCommon[idx] ? sum / countsCommon[idx] : null));
  const dailyLeap = sumsLeap.map((sum, idx) => (countsLeap[idx] ? sum / countsLeap[idx] : null));
  fillMissing(dailyCommon);
  fillMissing(dailyLeap);
  return { dailyCommon, dailyLeap };
}

function buildDailyMap(daily) {
  const time = Array.isArray(daily.time) ? daily.time : [];
  const tmin = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const tmean = Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean : [];
  const tmax = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const precip = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum : [];
  const windMax = Array.isArray(daily.windspeed_10m_max) ? daily.windspeed_10m_max : [];
  const map = new Map();
  for (let i = 0; i < time.length; i++) {
    map.set(time[i], {
      tmin: toNumberOrNull(tmin[i]),
      tmean: toNumberOrNull(tmean[i]),
      tmax: toNumberOrNull(tmax[i]),
      precip: toNumberOrNull(precip[i]),
      windMax: toNumberOrNull(windMax[i])
    });
  }
  return map;
}

function enumerateDates(start, end) {
  const result = [];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return result;
  }
  let current = startDate;
  while (current <= endDate) {
    result.push(current.toISOString().slice(0, 10));
    current = new Date(current.getTime() + 86400000);
  }
  return result;
}

function toNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const CUM_MONTH_DAYS_COMMON = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const CUM_MONTH_DAYS_LEAP = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

function dayOfYear(month, day, leap) {
  const lookup = leap ? CUM_MONTH_DAYS_LEAP : CUM_MONTH_DAYS_COMMON;
  const base = lookup[month - 1] || 0;
  return base + day;
}

function fillMissing(arr) {
  const firstIdx = arr.findIndex(v => typeof v === 'number');
  if (firstIdx === -1) return;
  for (let i = 0; i < firstIdx; i++) {
    arr[i] = arr[firstIdx];
  }

  let prevIdx = firstIdx;
  for (let i = firstIdx + 1; i < arr.length; i++) {
    if (typeof arr[i] === 'number') {
      const span = i - prevIdx;
      if (span > 1) {
        const start = arr[prevIdx];
        const end = arr[i];
        for (let j = 1; j < span; j++) {
          arr[prevIdx + j] = start + ((end - start) * j) / span;
        }
      }
      prevIdx = i;
    }
  }

  for (let i = prevIdx + 1; i < arr.length; i++) {
    arr[i] = arr[prevIdx];
  }
}

function mapGeoResult(r) {
  return {
    id: r.id,
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    lat: r.latitude,
    lon: r.longitude
  };
}

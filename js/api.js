const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ERA_URL = 'https://archive-api.open-meteo.com/v1/era5';

// In-memory cache for climate normals (keyed by "lat,lon")
const _normalsCache = new Map();

// Fetch with unlimited retries on 429, using Retry-After header or a fixed 30s wait.
// Will wait as long as needed — never gives up unless the request is cancelled.
async function fetchWithRetry(url, options = {}) {
  const DEFAULT_WAIT = 60000;
  while (true) {
    if (options.signal?.aborted) throw new Error('Cancelled');
    const res = await fetch(url, options);
    if (res.status !== 429) return res;

    // Respect Retry-After header if present (value in seconds)
    const retryAfterHeader = res.headers.get('Retry-After');
    const seconds = retryAfterHeader ? parseFloat(retryAfterHeader) : NaN;
    const wait = Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_WAIT;

    // Notify any listeners so the UI can show a waiting message
    window.dispatchEvent(new CustomEvent('api-rate-limited', { detail: { waitMs: wait } }));

    await new Promise(resolve => setTimeout(resolve, wait));
  }
}

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

export async function fetchDaily(lat, lon, start, end, signal) {
  const today = new Date().toISOString().slice(0,10);
  const actualEnd = end > today ? today : end;

  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${actualEnd}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,snowfall_water_equivalent_sum,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration,daylight_duration,relative_humidity_2m_mean,wind_speed_10m_mean&timezone=UTC`;
  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
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
  const rain = [];
  const snow = [];
  const windMax = [];
  const windGusts = [];
  const sunshineDur = [];
  const daylightDur = [];
  const humidity = [];
  const wind = [];
  for (const d of dates) {
    const entry = map.get(d);
    tmin.push(entry?.tmin ?? null);
    tmean.push(entry?.tmean ?? null);
    tmax.push(entry?.tmax ?? null);
    precip.push(entry?.precip ?? null);
    rain.push(entry?.rain ?? null);
    snow.push(entry?.snow ?? null);
    windMax.push(entry?.windMax ?? null);
    windGusts.push(entry?.windGusts ?? null);
    sunshineDur.push(entry?.sunshineDur ?? null);
    daylightDur.push(entry?.daylightDur ?? null);
    humidity.push(entry?.humidity ?? null);
    wind.push(entry?.wind ?? null);
  }
  return { date: dates, tmin, tmean, tmax, precip, rain, snow, windMax, windGusts, sunshineDur, daylightDur, humidity, wind };
}

// Humidity and wind are now fetched as daily aggregates in fetchDaily.
// This stub exists only so old call sites don't break during transition.
export async function fetchHourly() {
  return { time: [], humidity: [], wind: [] };
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

export async function fetchNormals(lat, lon, signal) {
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (_normalsCache.has(cacheKey)) return _normalsCache.get(cacheKey);

  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_mean&timezone=UTC`;
  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
    throw new Error('Failed to load climate normals');
  }
  const json = await res.json();
  const times = json?.daily?.time;
  const temps = json?.daily?.temperature_2m_mean;
  if (!Array.isArray(times) || !Array.isArray(temps) || times.length !== temps.length) {
    throw new Error('Climate normals unavailable for this location');
  }

  const result = buildDailyNormals(times, temps);
  _normalsCache.set(cacheKey, result);
  return result;
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
  const rain = Array.isArray(daily.rain_sum) ? daily.rain_sum : [];
  const snow = Array.isArray(daily.snowfall_water_equivalent_sum) ? daily.snowfall_water_equivalent_sum : [];
  const windMax = Array.isArray(daily.wind_speed_10m_max) ? daily.wind_speed_10m_max : [];
  const windGusts = Array.isArray(daily.wind_gusts_10m_max) ? daily.wind_gusts_10m_max : [];
  const sunshineDur = Array.isArray(daily.sunshine_duration) ? daily.sunshine_duration : [];
  const daylightDur = Array.isArray(daily.daylight_duration) ? daily.daylight_duration : [];
  const humidity = Array.isArray(daily.relative_humidity_2m_mean) ? daily.relative_humidity_2m_mean : [];
  const wind = Array.isArray(daily.wind_speed_10m_mean) ? daily.wind_speed_10m_mean : [];
  const map = new Map();
  for (let i = 0; i < time.length; i++) {
    map.set(time[i], {
      tmin: toNumberOrNull(tmin[i]),
      tmean: toNumberOrNull(tmean[i]),
      tmax: toNumberOrNull(tmax[i]),
      precip: toNumberOrNull(precip[i]),
      rain: toNumberOrNull(rain[i]),
      snow: toNumberOrNull(snow[i]),
      windMax: toNumberOrNull(windMax[i]),
      windGusts: toNumberOrNull(windGusts[i]),
      sunshineDur: toNumberOrNull(sunshineDur[i]),
      daylightDur: toNumberOrNull(daylightDur[i]),
      humidity: toNumberOrNull(humidity[i]),
      wind: toNumberOrNull(wind[i])
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

export async function getLocationFromIP() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error('IP geolocation failed');
    const data = await res.json();

    if (!data.latitude || !data.longitude) {
      throw new Error('Location data unavailable');
    }

    // Search for the city using the detected coordinates
    const cityName = data.city || data.region || data.country_name;
    if (cityName) {
      const cities = await suggestCities(cityName, 5);
      // Find the closest match by coordinates
      if (cities.length > 0) {
        const closest = cities.reduce((best, city) => {
          const dist = Math.sqrt(
            Math.pow(city.lat - data.latitude, 2) +
            Math.pow(city.lon - data.longitude, 2)
          );
          const bestDist = Math.sqrt(
            Math.pow(best.lat - data.latitude, 2) +
            Math.pow(best.lon - data.longitude, 2)
          );
          return dist < bestDist ? city : best;
        });
        return closest;
      }
    }

    throw new Error('Could not find city for your location');
  } catch (err) {
    console.error('IP geolocation error:', err);
    throw new Error('Auto-detect failed. Please enter city manually.');
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

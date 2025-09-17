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
  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,windspeed_10m_max&timezone=UTC`;
  const res = await fetch(url);
  const json = await res.json();
  return {
    date: json.daily.time,
    tmin: json.daily.temperature_2m_min,
    tmean: json.daily.temperature_2m_mean,
    tmax: json.daily.temperature_2m_max,
    precip: json.daily.precipitation_sum,
    windMax: json.daily.windspeed_10m_max
  };
}

export async function fetchHourly(lat, lon, start, end) {
  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&hourly=relative_humidity_2m,windspeed_10m&timezone=UTC`;
  const res = await fetch(url);
  const json = await res.json();
  return {
    time: json.hourly.time,
    humidity: json.hourly.relative_humidity_2m,
    wind: json.hourly.windspeed_10m
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
  const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&monthly=temperature_2m_mean`;
  const res = await fetch(url);
  const json = await res.json();
  const temps = json.monthly.temperature_2m_mean;
  const daysPerMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
  const vals = [];
  const doy = [];
  for (let m=0;m<12;m++) {
    const startT = temps[m];
    const endT = temps[(m+1)%12];
    const len = daysPerMonth[m];
    for (let d=0; d<len; d++) {
      const frac = d/len;
      vals.push(startT + (endT-startT)*frac);
      doy.push(vals.length);
    }
  }
  vals.splice(59,0,vals[58]);
  doy.splice(59,0,60);
  return { doy, tmeanNorm: vals };
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

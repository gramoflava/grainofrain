function dailyMeanFromHourly(times, values) {
  const days = [];
  const means = [];
  let currentDay = null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < times.length; i++) {
    const day = times[i].slice(0, 10);
    if (currentDay === null) currentDay = day;
    if (day !== currentDay) {
      days.push(currentDay);
      means.push(count ? sum / count : null);
      currentDay = day;
      sum = 0;
      count = 0;
    }
    const v = values[i];
    if (typeof v === 'number') {
      sum += v;
      count++;
    }
  }
  if (currentDay !== null) {
    days.push(currentDay);
    means.push(count ? sum / count : null);
  }
  return { days, means };
}

async function fetchNormals(lat, lon) {
  const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${lat}&longitude=${lon}&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_mean&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('No climate normals');
  }
  const json = await res.json();
  const times = json?.daily?.time;
  const temps = json?.daily?.temperature_2m_mean;
  if (!Array.isArray(times) || !Array.isArray(temps) || times.length !== temps.length) {
    throw new Error('No climate normals');
  }
  return buildDailyNormals(times, temps);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function getDOY(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  return Math.floor((date - start) / 86400000);
}

async function fetchWeather(city, start, end) {
  if (!city || !start || !end) {
    throw new Error('City, start and end are required');
  }
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`;
  const geoRes = await fetch(geoUrl);
  const geoJson = await geoRes.json();
  if (!geoJson.results || !geoJson.results.length) {
    throw new Error('City not found: ' + city);
  }
  const { latitude, longitude, name, country } = geoJson.results[0];

  const dailyUrl = `https://archive-api.open-meteo.com/v1/era5?latitude=${latitude}&longitude=${longitude}&start_date=${start}&end_date=${end}&daily=temperature_2m_min,temperature_2m_mean,temperature_2m_max,precipitation_sum,windspeed_10m_max&timezone=UTC`;
  const dailyRes = await fetch(dailyUrl);
  const dailyJson = await dailyRes.json();
  if (!dailyJson || !dailyJson.daily) {
    throw new Error('No weather data for ' + city);
  }
  const daily = dailyJson.daily;

  const hourlyUrl = `https://archive-api.open-meteo.com/v1/era5?latitude=${latitude}&longitude=${longitude}&start_date=${start}&end_date=${end}&hourly=relative_humidity_2m,windspeed_10m&timezone=UTC`;
  const hourlyRes = await fetch(hourlyUrl);
  const hourlyJson = await hourlyRes.json();
  const humAgg = dailyMeanFromHourly(hourlyJson.hourly.time, hourlyJson.hourly.relative_humidity_2m);
  const windAgg = dailyMeanFromHourly(hourlyJson.hourly.time, hourlyJson.hourly.windspeed_10m);

  let normals = null;
  try {
    normals = await fetchNormals(latitude, longitude);
  } catch (e) {
    normals = null;
  }

  const minTemp = Math.min(...daily.temperature_2m_min);
  const maxTemp = Math.max(...daily.temperature_2m_max);
  const avgTemp = mean(daily.temperature_2m_mean);
  const totalPrec = sum(daily.precipitation_sum);
  const humAvg = mean(humAgg.means);
  const windAvg = mean(windAgg.means);
  const windMax = Math.max(...daily.windspeed_10m_max);

  let climateDev = null;
  if (normals) {
    const normSlice = daily.time.map(t => mapNormalForDate(t, normals));
    climateDev = avgTemp - mean(normSlice);
  }

  return {
    label: `${name.trim()}, ${country} (${start} – ${end})`,
    dates: daily.time,
    min: daily.temperature_2m_min,
    mean: daily.temperature_2m_mean,
    max: daily.temperature_2m_max,
    prec: daily.precipitation_sum,
    humidity: humAgg.means,
    wind: windAgg.means,
    summary: {
      minTemp,
      maxTemp,
      avgTemp,
      totalPrec,
      humAvg,
      windAvg,
      windMax,
      climateDev,
    },
  };
}

module.exports = { fetchWeather, dailyMeanFromHourly, fetchNormals };

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

function mapNormalForDate(isoDate, normals) {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const leap = isLeapYear(year);
  const idx = dayOfYear(month, day, leap) - 1;
  const pool = leap ? normals.dailyLeap : normals.dailyCommon;
  return pool[idx] ?? null;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

const CUM_MONTH_DAYS_COMMON = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const CUM_MONTH_DAYS_LEAP = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

function dayOfYear(month, day, leap) {
  const lookup = leap ? CUM_MONTH_DAYS_LEAP : CUM_MONTH_DAYS_COMMON;
  const base = lookup[month - 1] || 0;
  return base + day;
}

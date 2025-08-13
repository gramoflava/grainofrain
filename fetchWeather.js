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
  const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&monthly=temperature_2m_mean`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.monthly || !json.monthly.temperature_2m_mean) {
    throw new Error('No climate normals');
  }
  const temps = json.monthly.temperature_2m_mean; // 12 values
  const daysPerMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
  const doy = [];
  const vals = [];
  for (let m = 0; m < 12; m++) {
    const startT = temps[m];
    const endT = temps[(m + 1) % 12];
    const len = daysPerMonth[m];
    for (let d = 0; d < len; d++) {
      const frac = d / len;
      vals.push(startT + (endT - startT) * frac);
      doy.push(vals.length);
    }
  }
  // insert leap day duplicate of Feb 28
  vals.splice(59, 0, vals[58]);
  doy.splice(59, 0, 60);
  return { doy, tmeanNorm: vals };
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
    const normSlice = daily.time.map(t => {
      const d = new Date(t);
      return normals.tmeanNorm[getDOY(d) - 1];
    });
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

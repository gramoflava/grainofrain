const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function sanitizeDate(value) {
  if (!value) return null;
  const trimmed = value.trim();
  return ISO_DATE_REGEX.test(trimmed) ? trimmed : null;
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function isoYearStart(today) {
  return today.slice(0, 4) + '-01-01';
}

export function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatCityLabel(city) {
  if (!city) return '';
  const parts = [city.name].filter(Boolean);
  if (city.admin1 && city.admin1 !== city.name) parts.push(city.admin1);
  if (city.country && city.country !== city.admin1 && city.country !== city.name) parts.push(city.country);
  return parts.join(', ');
}

export function getUniqueCityKey(city) {
  if (!city) return '';
  const lat = Number(city.lat);
  const lon = Number(city.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `city_${lat.toFixed(4)}_${lon.toFixed(4)}`;
  }
  if (city.id != null) return `city_${city.id}`;
  return [city.name || '', city.admin1 || '', city.country || ''].join('_');
}

export function average(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function arrayMax(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? Math.max(...filtered) : null;
}

export function arrayMin(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? Math.min(...filtered) : null;
}

export function arrayMean(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? average(filtered) : null;
}

export function arraySum(arr) {
  const filtered = arr.filter(v => isFiniteNumber(v));
  return filtered.length > 0 ? sum(filtered) : null;
}

export function rollingAverage(arr, window) {
  if (window === 0 || !arr || arr.length === 0) return arr;

  const halfWindow = Math.floor(window / 2);
  const result = [];

  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(arr.length, i + halfWindow + 1);
    const slice = arr.slice(start, end).filter(v => isFiniteNumber(v));

    if (slice.length > 0) {
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    } else {
      result.push(arr[i]);
    }
  }

  return result;
}

export function applySmoothingAndTrim(series, window, startDate, endDate) {
  const startIdx = series.x.findIndex(d => d >= startDate);
  const endIdx = series.x.findIndex(d => d > endDate);
  const trimEnd = endIdx === -1 ? series.x.length : endIdx;

  if (startIdx === -1) return series;

  const sm = window > 0 ? {
    tempMean: rollingAverage(series.tempMean, window),
    tempMax: rollingAverage(series.tempMax, window),
    tempMin: rollingAverage(series.tempMin, window),
    humidity: rollingAverage(series.humidity, window),
    sunshineDuration: rollingAverage(series.sunshineDuration, window),
    daylightDuration: rollingAverage(series.daylightDuration, window),
    precip: rollingAverage(series.precip, window),
    rain: series.rain ? rollingAverage(series.rain, window) : null,
    snow: series.snow ? rollingAverage(series.snow, window) : null,
    wind: rollingAverage(series.wind, window),
    windMax: series.windMax ? rollingAverage(series.windMax, window) : null,
    windGusts: series.windGusts ? rollingAverage(series.windGusts, window) : null,
  } : series;

  return {
    x: series.x.slice(startIdx, trimEnd),
    dates: series.x.slice(startIdx, trimEnd),
    tempMax: sm.tempMax.slice(startIdx, trimEnd),
    tempMin: sm.tempMin.slice(startIdx, trimEnd),
    tempMean: sm.tempMean.slice(startIdx, trimEnd),
    precip: sm.precip.slice(startIdx, trimEnd),
    rain: sm.rain ? sm.rain.slice(startIdx, trimEnd) : null,
    snow: sm.snow ? sm.snow.slice(startIdx, trimEnd) : null,
    humidity: sm.humidity.slice(startIdx, trimEnd),
    wind: sm.wind.slice(startIdx, trimEnd),
    windMax: sm.windMax ? sm.windMax.slice(startIdx, trimEnd) : null,
    windGusts: sm.windGusts ? sm.windGusts.slice(startIdx, trimEnd) : null,
    sunshineDuration: sm.sunshineDuration.slice(startIdx, trimEnd),
    daylightDuration: sm.daylightDuration.slice(startIdx, trimEnd),
    norm: series.norm ? series.norm.slice(startIdx, trimEnd) : null,
    normMax: series.normMax ? series.normMax.slice(startIdx, trimEnd) : null,
    normMin: series.normMin ? series.normMin.slice(startIdx, trimEnd) : null
  };
}

export function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  return {
    isMac: /mac|iphone|ipad|ipod/.test(ua),
    isWindows: /win/.test(ua),
    isSafari: /safari/.test(ua) && !/chrome/.test(ua),
    isChrome: /chrome/.test(ua) && !/edge/.test(ua),
    isFirefox: /firefox/.test(ua)
  };
}

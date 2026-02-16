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
  return city.name;
}

export function getUniqueCityKey(city) {
  if (!city) return '';
  return city.id ? `city_${city.id}` : `${city.name}_${city.country}_${city.lat}_${city.lon}`;
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
  if (window === 0) return series;

  const smoothedTempMean = rollingAverage(series.tempMean, window);
  const smoothedHumidity = rollingAverage(series.humidity, window);

  const startIdx = series.x.findIndex(d => d >= startDate);
  const endIdx = series.x.findIndex(d => d > endDate);
  const trimEnd = endIdx === -1 ? series.x.length : endIdx;

  if (startIdx === -1) return series;

  return {
    x: series.x.slice(startIdx, trimEnd),
    tempMax: series.tempMax.slice(startIdx, trimEnd),
    tempMin: series.tempMin.slice(startIdx, trimEnd),
    tempMean: smoothedTempMean.slice(startIdx, trimEnd),
    precip: series.precip.slice(startIdx, trimEnd),
    humidity: smoothedHumidity.slice(startIdx, trimEnd),
    wind: series.wind.slice(startIdx, trimEnd),
    windMax: series.windMax ? series.windMax.slice(startIdx, trimEnd) : null,
    norm: series.norm ? series.norm.slice(startIdx, trimEnd) : null
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

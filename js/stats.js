import { escapeHtml, isFiniteNumber } from './utils.js';

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

function formatHours(value) {
  return isFiniteNumber(value) ? `${value.toFixed(0)} h` : 'n/a';
}

function formatDeviation(value) {
  if (!isFiniteNumber(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} °C`;
}

function buildMetrics(smoothingActive) {
  const asterisk = smoothingActive ? '*' : '';
  return [
    { key: 'maxT', label: 'T↑', tooltip: 'Maximum temperature', format: formatTemp },
    { key: 'avgT', label: `T~${asterisk}`, tooltip: 'Average temperature', format: formatTemp },
    { key: 'minT', label: 'T↓', tooltip: 'Minimum temperature', format: formatTemp },
    { key: 'climateDev', label: 'ΔT', tooltip: 'Temperature deviation from climate norm', format: formatDeviation },
    { key: 'precipTotal', label: '∑ Precip', tooltip: 'Total precipitation (rain + snow)', format: formatPrecip },
    { key: 'rainTotal', label: '∑ Rain', tooltip: 'Total rainfall', format: formatPrecip },
    { key: 'snowTotal', label: '∑ Snow', tooltip: 'Total snowfall (water equivalent)', format: formatPrecip },
    { key: 'precipMax', label: 'Precip↑', tooltip: 'Maximum daily precipitation', format: formatPrecip },
    { key: 'humAvg', label: `RH%${asterisk}`, tooltip: 'Average relative humidity', format: formatPercent },
    { key: 'windMax', label: 'Wind↑', tooltip: 'Maximum wind speed', format: formatWind },
    { key: 'windGustsMax', label: 'Gusts↑', tooltip: 'Maximum wind gusts', format: formatWind },
    { key: 'windAvg', label: 'Wind~', tooltip: 'Average wind speed', format: formatWind },
    { key: 'sunshineTotal', label: '∑ Sunshine', tooltip: 'Total sunshine hours', format: formatHours },
    { key: 'daylightTotal', label: '∑ Daylight', tooltip: 'Total daylight hours', format: formatHours },
    { key: 'precipDays', label: 'Precip days', tooltip: 'Days with precipitation >0.1mm', format: v => v },
    { key: 'totalDays', label: '∑ Days', tooltip: 'Total days in period', format: v => v }
  ];
}

function renderMetricRows(metrics, statsArray) {
  let html = '';
  metrics.forEach(metric => {
    html += '<div class="stats__row">';
    html += `<div class="stats__label" title="${metric.tooltip}">${metric.label}</div>`;
    statsArray.forEach(stats => {
      html += `<div class="stats__value">${metric.format(stats[metric.key])}</div>`;
    });
    html += '</div>';
  });
  return html;
}

export function fillStats(dom, statsArray, cityLabels, startDate, endDate, smoothing) {
  const numCities = statsArray.length;
  const isComparison = numCities > 1;
  const smoothingActive = (smoothing || 0) > 0;

  dom.style.setProperty('--stats-cols', numCities);

  let titleHtml = '';
  if (isComparison) {
    titleHtml = `<div class="stats__title"><span>${startDate} – ${endDate}</span></div>`;
  } else {
    const cityName = cityLabels[0] || 'City';
    titleHtml = `<div class="stats__title"><strong>${escapeHtml(cityName)}</strong><span>${startDate} – ${endDate}</span></div>`;
  }

  let headerHtml = '';
  if (isComparison) {
    headerHtml = '<div class="stats__head"><span></span>';
    cityLabels.forEach((label, i) => {
      headerHtml += `<span class="is-c${i + 1}">${escapeHtml(label || `City ${i + 1}`)}</span>`;
    });
    headerHtml += '</div>';
  }

  const metrics = buildMetrics(smoothingActive);
  const tableHtml = renderMetricRows(metrics, statsArray);

  const smoothingHint = smoothingActive ? '<div class="stats__note">* Smoothing applied, turn off for exact data</div>' : '';
  dom.innerHTML = `${titleHtml}${headerHtml}<div class="stats__body">${tableHtml}</div>${smoothingHint}`;
}

export function fillStatsPeriodic(dom, statsArray, yearLabels, cityName, periodStart, periodEnd, smoothing) {
  const numYears = statsArray.length;
  const isComparison = numYears > 1;
  const smoothingActive = (smoothing || 0) > 0;
  dom.style.setProperty('--stats-cols', numYears);

  const periodDisplay = `${periodStart} – ${periodEnd}`;
  const titleHtml = `<div class="stats__title"><strong>${escapeHtml(cityName)}</strong><span>${periodDisplay}</span></div>`;

  let headerHtml = '';
  if (isComparison) {
    headerHtml = '<div class="stats__head"><span></span>';
    yearLabels.forEach((label, i) => {
      headerHtml += `<span class="is-c${i + 1}">${escapeHtml(label)}</span>`;
    });
    headerHtml += '</div>';
  }

  const metrics = buildMetrics(smoothingActive);
  const tableHtml = renderMetricRows(metrics, statsArray);

  const smoothingHint = smoothingActive ? '<div class="stats__note">* Smoothing applied, turn off for exact data</div>' : '';
  dom.innerHTML = `${titleHtml}${headerHtml}<div class="stats__body">${tableHtml}</div>${smoothingHint}`;
}

export function fillStatsProgression(dom, stats, cityName, periodLabel, yearFrom, yearTo) {
  dom.style.setProperty('--stats-cols', 1);
  const titleHtml = `<div class="stats__title"><strong>${escapeHtml(cityName)}</strong><span>${escapeHtml(periodLabel)} · ${yearFrom}–${yearTo}</span></div>`;

  const metrics = buildMetrics(false);
  const tableHtml = renderMetricRows(metrics, [stats]);
  dom.innerHTML = `${titleHtml}<div class="stats__body">${tableHtml}</div>`;
}

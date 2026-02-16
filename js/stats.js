import { escapeHtml, isFiniteNumber } from './utils.js';

const COLOR_NAMES = ['blue', 'red', 'green'];

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

function buildMetrics(smoothingActive) {
  const asterisk = smoothingActive ? '*' : '';
  return [
    { key: 'maxT', label: 'T↑', tooltip: 'Maximum temperature', format: formatTemp },
    { key: 'avgT', label: `T~${asterisk}`, tooltip: 'Average temperature', format: formatTemp },
    { key: 'minT', label: 'T↓', tooltip: 'Minimum temperature', format: formatTemp },
    { key: 'climateDev', label: 'ΔT', tooltip: 'Temperature deviation from climate norm', format: formatDeviation },
    { key: 'precipTotal', label: '∑ Rain', tooltip: 'Total precipitation', format: formatPrecip },
    { key: 'precipMax', label: 'Rain↑', tooltip: 'Maximum daily precipitation', format: formatPrecip },
    { key: 'humAvg', label: `RH%${asterisk}`, tooltip: 'Average relative humidity', format: formatPercent },
    { key: 'windMax', label: 'Wind↑', tooltip: 'Maximum wind speed', format: formatWind },
    { key: 'windAvg', label: 'Wind~', tooltip: 'Average wind speed', format: formatWind },
    { key: 'precipDays', label: 'Rain days', tooltip: 'Days with precipitation >0.1mm', format: v => v },
    { key: 'totalDays', label: '∑ Days', tooltip: 'Total days in period', format: v => v }
  ];
}

function renderMetricRows(metrics, statsArray) {
  const numColumns = statsArray.length;
  let html = '';
  metrics.forEach(metric => {
    html += `<div class="stats-row" style="grid-template-columns: auto repeat(${numColumns}, 1fr);">`;
    html += `<div class="stats-label" title="${metric.tooltip}">${metric.label}</div>`;
    statsArray.forEach(stats => {
      html += `<div class="stats-value">${metric.format(stats[metric.key])}</div>`;
    });
    html += '</div>';
  });
  return html;
}

export function fillStats(dom, statsArray, cityLabels, startDate, endDate, smoothing) {
  const numCities = statsArray.length;
  const isComparison = numCities > 1;
  const smoothingActive = (smoothing || 0) > 0;

  let titleHtml = '';
  if (isComparison) {
    titleHtml = `<div class="stats-title"><div class="stats-period">${startDate} – ${endDate}</div></div>`;
  } else {
    const cityName = cityLabels[0] || 'City';
    titleHtml = `<div class="stats-title"><div class="stats-city">${escapeHtml(cityName)}</div><div class="stats-period">${startDate} – ${endDate}</div></div>`;
  }

  let headerHtml = '';
  if (isComparison) {
    headerHtml = `<div class="stats-header-row" style="grid-template-columns: auto repeat(${numCities}, 1fr);">`;
    headerHtml += `<div class="stats-label"></div>`;
    cityLabels.forEach((label, i) => {
      const colorClass = `color-${COLOR_NAMES[i]}`;
      headerHtml += `<div class="stats-value"><span class="${colorClass}">${escapeHtml(label || `City ${i + 1}`)}</span></div>`;
    });
    headerHtml += '</div>';
  }

  const metrics = buildMetrics(smoothingActive);
  const tableHtml = renderMetricRows(metrics, statsArray);

  const smoothingHint = smoothingActive ? '<div class="smoothing-hint">* Smoothing applied, turn off for exact data</div>' : '';
  const headerSection = headerHtml ? `<div class="stats-header">${headerHtml}</div>` : '';
  dom.innerHTML = `${titleHtml}${headerSection}<div class="stats-table">${tableHtml}</div>${smoothingHint}`;
}

export function fillStatsPeriodic(dom, statsArray, yearLabels, cityName, periodStart, periodEnd, smoothing) {
  const numYears = statsArray.length;
  const isComparison = numYears > 1;
  const smoothingActive = (smoothing || 0) > 0;

  const periodDisplay = `${periodStart} – ${periodEnd}`;
  let titleHtml = `<div class="stats-title"><div class="stats-city">${escapeHtml(cityName)}</div><div class="stats-period">${periodDisplay}</div></div>`;

  let headerHtml = '';
  if (isComparison) {
    headerHtml = `<div class="stats-header-row" style="grid-template-columns: auto repeat(${numYears}, 1fr);">`;
    headerHtml += `<div class="stats-label"></div>`;
    yearLabels.forEach((label, i) => {
      const colorClass = `color-${COLOR_NAMES[i]}`;
      headerHtml += `<div class="stats-value"><span class="${colorClass}">${escapeHtml(label)}</span></div>`;
    });
    headerHtml += '</div>';
  }

  const metrics = buildMetrics(smoothingActive);
  const tableHtml = renderMetricRows(metrics, statsArray);

  const smoothingHint = smoothingActive ? '<div class="smoothing-hint">* Smoothing applied, turn off for exact data</div>' : '';
  const headerSection = headerHtml ? `<div class="stats-header">${headerHtml}</div>` : '';
  dom.innerHTML = `${titleHtml}${headerSection}<div class="stats-table">${tableHtml}</div>${smoothingHint}`;
}

export function fillStatsProgression(dom, stats, cityName, periodLabel, yearFrom, yearTo) {
  const titleHtml = `<div class="stats-title"><div class="stats-city">${escapeHtml(cityName)}</div><div class="stats-period">${escapeHtml(periodLabel)} · ${yearFrom}–${yearTo}</div></div>`;

  const metrics = buildMetrics(false);
  let tableHtml = '';
  metrics.forEach(metric => {
    tableHtml += `<div class="stats-row" style="grid-template-columns: auto 1fr;">`;
    tableHtml += `<div class="stats-label" title="${metric.tooltip}">${metric.label}</div>`;
    tableHtml += `<div class="stats-value">${metric.format(stats[metric.key])}</div>`;
    tableHtml += '</div>';
  });

  dom.innerHTML = `${titleHtml}<div class="stats-table">${tableHtml}</div>`;
}

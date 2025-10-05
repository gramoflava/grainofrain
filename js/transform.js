export function buildSeries(daily, humidityAgg, windAgg, normals) {
  const alignedHumidity = alignAggregates(daily.date, humidityAgg);
  const alignedWind = alignAggregates(daily.date, windAgg);
  const normSeries = normals ? mapNormalsToDates(daily.date, normals) : null;
  return {
    x: daily.date,
    dates: daily.date,
    tempMin: daily.tmin,
    tempMean: daily.tmean,
    tempMax: daily.tmax,
    precip: daily.precip,
    humidity: alignedHumidity,
    wind: alignedWind,
    windMax: daily.windMax,
    norm: normSeries
  };
}

export function computeStats(series) {
  const minT = min(series.tempMin);
  const maxT = max(series.tempMax);
  const avgT = avg(series.tempMean);
  const precipValues = filterNumbers(series.precip);
  const precipTotal = sum(precipValues);
  const precipDays = precipValues.filter(v => v > 0.1).length;
  const precipMax = max(series.precip);
  const humAvg = avg(series.humidity);
  const windAvg = avg(series.wind);
  const windCandidates = series.windMax && series.windMax.length ? series.windMax : series.wind;
  const windMax = max(windCandidates);
  const totalDays = series.dates ? series.dates.length : 0;
  let climateDev = null;
  if (series.norm) {
    const diffs = [];
    for (let i = 0; i < series.tempMean.length; i++) {
      const actual = series.tempMean[i];
      const baseline = series.norm[i];
      if (isNumber(actual) && isNumber(baseline)) {
        diffs.push(actual - baseline);
      }
    }
    if (diffs.length) {
      climateDev = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
  }
  return { minT, maxT, avgT, climateDev, precipTotal, precipDays, precipMax, humAvg, windAvg, windMax, totalDays };
}

function alignAggregates(dates, aggregate) {
  if (!aggregate || !Array.isArray(aggregate.days) || !Array.isArray(aggregate.means)) {
    return new Array(dates.length).fill(null);
  }
  const map = new Map();
  for (let i = 0; i < aggregate.days.length; i++) {
    const day = aggregate.days[i];
    const value = aggregate.means[i];
    if (typeof day === 'string' && isNumber(value)) {
      map.set(day, value);
    }
  }
  return dates.map(date => (map.has(date) ? map.get(date) : null));
}

function avg(arr) {
  const values = filterNumbers(arr);
  if (!values.length) return null;
  return values.reduce((a,b)=>a+b,0)/values.length;
}

function sum(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0);
}

function min(arr) {
  const values = filterNumbers(arr);
  if (!values.length) return null;
  return Math.min(...values);
}

function max(arr) {
  const values = filterNumbers(arr);
  if (!values.length) return null;
  return Math.max(...values);
}

function filterNumbers(arr) {
  return Array.isArray(arr) ? arr.filter(isNumber) : [];
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function mapNormalsToDates(dates, normals) {
  if (!normals) return null;
  const { dailyCommon, dailyLeap } = normals;
  if (!Array.isArray(dailyCommon) || !Array.isArray(dailyLeap)) {
    return null;
  }

  return dates.map(dateStr => {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(5, 7), 10);
    const day = parseInt(dateStr.slice(8, 10), 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return null;
    }
    const leap = isLeapYear(year);
    const idx = dayOfYear(month, day, leap) - 1;
    const pool = leap ? dailyLeap : dailyCommon;
    return pool[idx] ?? null;
  });
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

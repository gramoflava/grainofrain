export function buildSeries(daily, _humidityAgg, _windAgg, normals) {
  const normSeries = normals ? mapNormalsToDates(daily.date, normals, 'mean') : null;
  const normSeriesMax = normals ? mapNormalsToDates(daily.date, normals, 'max') : null;
  const normSeriesMin = normals ? mapNormalsToDates(daily.date, normals, 'min') : null;
  const n = daily.date.length;
  // Convert sunshine/daylight from seconds to hours
  const sunshineDuration = (daily.sunshineDur || new Array(n).fill(null)).map(v => v !== null ? v / 3600 : null);
  const daylightDuration = (daily.daylightDur || new Array(n).fill(null)).map(v => v !== null ? v / 3600 : null);
  return {
    x: daily.date,
    dates: daily.date,
    tempMin: daily.tmin,
    tempMean: daily.tmean,
    tempMax: daily.tmax,
    precip: daily.precip,
    rain: daily.rain || new Array(n).fill(null),
    snow: daily.snow || new Array(n).fill(null),
    humidity: daily.humidity || new Array(n).fill(null),
    wind: daily.wind || new Array(n).fill(null),
    windMax: daily.windMax,
    windGusts: daily.windGusts || new Array(n).fill(null),
    sunshineDuration,
    daylightDuration,
    norm: normSeries,
    normMax: normSeriesMax,
    normMin: normSeriesMin
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
  const rainTotal = sum(filterNumbers(series.rain || []));
  const snowTotal = sum(filterNumbers(series.snow || []));
  const humAvg = avg(series.humidity);
  const windAvg = avg(series.wind);
  const windCandidates = series.windMax && series.windMax.length ? series.windMax : series.wind;
  const windMax = max(windCandidates);
  const windGustsMax = max(series.windGusts || []);
  const sunshineTotal = sum(filterNumbers(series.sunshineDuration || []));
  const daylightTotal = sum(filterNumbers(series.daylightDuration || []));
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
  return { minT, maxT, avgT, climateDev, precipTotal, precipDays, precipMax, rainTotal, snowTotal, humAvg, windAvg, windMax, windGustsMax, sunshineTotal, daylightTotal, totalDays };
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

function mapNormalsToDates(dates, normals, field = 'mean') {
  if (!normals) return null;
  let dailyCommon, dailyLeap;
  if (field === 'max') {
    dailyCommon = normals.dailyCommonMax;
    dailyLeap = normals.dailyLeapMax;
  } else if (field === 'min') {
    dailyCommon = normals.dailyCommonMin;
    dailyLeap = normals.dailyLeapMin;
  } else {
    dailyCommon = normals.dailyCommon;
    dailyLeap = normals.dailyLeap;
  }
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

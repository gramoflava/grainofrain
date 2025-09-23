export function buildSeries(daily, humidity, wind, normals) {
  const normSeries = normals ? mapNormalsToDates(daily.date, normals) : null;
  return {
    x: daily.date,
    tempMin: daily.tmin,
    tempMean: daily.tmean,
    tempMax: daily.tmax,
    precip: daily.precip,
    humidity: humidity,
    wind: wind,
    windMax: daily.windMax,
    norm: normSeries
  };
}

export function computeStats(series) {
  const minT = Math.min(...series.tempMin);
  const maxT = Math.max(...series.tempMax);
  const avgT = avg(series.tempMean);
  const precipTotal = sum(series.precip);
  const precipDays = series.precip.filter(v => v > 0.1).length;
  const precipMax = Math.max(...series.precip);
  const humAvg = avg(series.humidity);
  const windAvg = avg(series.wind);
  const windCandidates = series.windMax && series.windMax.length ? series.windMax : series.wind;
  const windMax = Math.max(...windCandidates);
  let climateDev = null;
  if (series.norm) {
    climateDev = avgT - avg(series.norm);
  }
  return { minT, maxT, avgT, climateDev, precipTotal, precipDays, precipMax, humAvg, windAvg, windMax };
}

function avg(arr) {
  return arr.reduce((a,b)=>a+b,0)/(arr.length||1);
}

function sum(arr) {
  return arr.reduce((a,b)=>a+b,0);
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

export function buildSeries(daily, humidity, wind, normals) {
  return {
    x: daily.date,
    tempMin: daily.tmin,
    tempMean: daily.tmean,
    tempMax: daily.tmax,
    precip: daily.precip,
    humidity: humidity,
    wind: wind,
    windMax: daily.windMax,
    norm: normals ? normals.tmeanNorm.slice(0, daily.date.length) : null
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

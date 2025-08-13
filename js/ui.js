import { loadState, saveState } from './store.js';
import { searchCity, fetchDaily, fetchHourly, dailyMeanFromHourly, fetchNormals } from './api.js';
import { buildSeries, computeStats } from './transform.js';
import { initCharts, renderAll } from './charts.js';
import { exportPng } from './export.js';

const state = loadState();
const charts = initCharts();

async function apply() {
  const city = document.getElementById('city').value;
  const start = document.getElementById('start').value;
  const end = document.getElementById('end').value;
  if (!city || !start || !end) return alert('Fill all fields');
  try {
    const geo = await searchCity(city);
    const daily = await fetchDaily(geo.lat, geo.lon, start, end);
    const hourly = await fetchHourly(geo.lat, geo.lon, start, end);
    const hum = dailyMeanFromHourly(hourly.time, hourly.humidity);
    const wind = dailyMeanFromHourly(hourly.time, hourly.wind);
    let normals = null;
    if (state.prefs.showNormals) {
      try { normals = await fetchNormals(geo.lat, geo.lon); } catch (e) { normals = null; }
    }
    const series = buildSeries(daily, hum.means, wind.means, normals);
    renderAll(charts, series, '#1E88E5', state.prefs);
    const stats = computeStats(series);
    fillStats(document.getElementById('stats'), stats);
    state.entities = [{type:'city', name: geo.name, lat: geo.lat, lon: geo.lon, color:'#1E88E5'}];
    state.date = {start, end};
    saveState(state);
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}

export function bindControls() {
  document.getElementById('apply').addEventListener('click', apply);
  document.getElementById('export').addEventListener('click', () => exportPng('charts'));
}

export function fillStats(dom, stats) {
  dom.innerHTML = `<table>
  <tr><th>Min temp</th><td>${stats.minT.toFixed(1)} °C</td></tr>
  <tr><th>Max temp</th><td>${stats.maxT.toFixed(1)} °C</td></tr>
  <tr><th>Avg temp</th><td>${stats.avgT.toFixed(1)} °C</td></tr>
  <tr><th>Climate dev</th><td>${stats.climateDev!==null?stats.climateDev.toFixed(1)+' °C':'n/a'}</td></tr>
  <tr><th>Total precip</th><td>${stats.precipTotal.toFixed(1)} mm</td></tr>
  <tr><th>Max daily precip</th><td>${stats.precipMax.toFixed(1)} mm</td></tr>
  <tr><th>Days >0.1 mm</th><td>${stats.precipDays}</td></tr>
  <tr><th>Avg humidity</th><td>${stats.humAvg.toFixed(1)} %</td></tr>
  <tr><th>Avg wind</th><td>${stats.windAvg.toFixed(1)} km/h</td></tr>
  <tr><th>Max wind</th><td>${stats.windMax.toFixed(1)} km/h</td></tr>
  </table>`;
}

bindControls();

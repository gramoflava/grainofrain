import { getAllEntries, deleteEntry, getCache, setCache } from './cache.js';
import { suggestCities } from './api.js';
import { saveLocation, locationLabel } from './locations.js';

const ERA_URL = 'https://archive-api.open-meteo.com/v1/era5';

// ─── ERA5 parameter catalogue ───────────────────────────────────────────────

const ERA5_PARAMS = [
  { group: 'Temperature', params: [
    { id: 'temperature_2m_max',           label: 'Max temperature',         unit: '°C'    },
    { id: 'temperature_2m_min',           label: 'Min temperature',         unit: '°C'    },
    { id: 'temperature_2m_mean',          label: 'Mean temperature',        unit: '°C'    },
    { id: 'apparent_temperature_max',     label: 'Apparent temp max',       unit: '°C'    },
    { id: 'apparent_temperature_min',     label: 'Apparent temp min',       unit: '°C'    },
    { id: 'apparent_temperature_mean',    label: 'Apparent temp mean',      unit: '°C'    },
  ]},
  { group: 'Precipitation', params: [
    { id: 'precipitation_sum',            label: 'Total precipitation',     unit: 'mm'    },
    { id: 'rain_sum',                     label: 'Rain',                    unit: 'mm'    },
    { id: 'snowfall_sum',                 label: 'Snowfall',                unit: 'cm'    },
    { id: 'snowfall_water_equivalent_sum',label: 'Snowfall (water equiv.)', unit: 'mm'    },
    { id: 'showers_sum',                  label: 'Showers',                 unit: 'mm'    },
    { id: 'precipitation_hours',          label: 'Precipitation hours',     unit: 'h'     },
  ]},
  { group: 'Wind', params: [
    { id: 'wind_speed_10m_max',           label: 'Max wind speed',          unit: 'km/h'  },
    { id: 'wind_gusts_10m_max',           label: 'Max wind gusts',          unit: 'km/h'  },
    { id: 'wind_speed_10m_mean',          label: 'Mean wind speed',         unit: 'km/h'  },
    { id: 'wind_direction_10m_dominant',  label: 'Wind direction',          unit: '°'     },
  ]},
  { group: 'Solar / Daylight', params: [
    { id: 'sunshine_duration',            label: 'Sunshine duration',       unit: 'h',    transform: v => +(v / 3600).toFixed(2) },
    { id: 'daylight_duration',            label: 'Daylight duration',       unit: 'h',    transform: v => +(v / 3600).toFixed(2) },
    { id: 'shortwave_radiation_sum',      label: 'Solar radiation',         unit: 'MJ/m²' },
  ]},
  { group: 'Humidity', params: [
    { id: 'relative_humidity_2m_max',     label: 'Max humidity',            unit: '%'     },
    { id: 'relative_humidity_2m_min',     label: 'Min humidity',            unit: '%'     },
    { id: 'relative_humidity_2m_mean',    label: 'Mean humidity',           unit: '%'     },
  ]},
  { group: 'Other', params: [
    { id: 'et0_fao_evapotranspiration',   label: 'Evapotranspiration',      unit: 'mm'    },
    { id: 'cloud_cover_mean',             label: 'Cloud cover',             unit: '%'     },
    { id: 'weather_code',                 label: 'Weather code',            unit: ''      },
  ]},
];

// Mapping from aggregate cache field names to param meta
const AGGREGATE_FIELDS = {
  temperature_2m_min:            { field: 'tmin',       label: 'Min temperature',         unit: '°C'    },
  temperature_2m_mean:           { field: 'tmean',      label: 'Mean temperature',        unit: '°C'    },
  temperature_2m_max:            { field: 'tmax',       label: 'Max temperature',         unit: '°C'    },
  precipitation_sum:             { field: 'precip',     label: 'Total precipitation',     unit: 'mm'    },
  rain_sum:                      { field: 'rain',       label: 'Rain',                    unit: 'mm'    },
  snowfall_water_equivalent_sum: { field: 'snow',       label: 'Snowfall (water equiv.)', unit: 'mm'    },
  wind_speed_10m_max:            { field: 'windMax',    label: 'Max wind speed',          unit: 'km/h'  },
  wind_gusts_10m_max:            { field: 'windGusts',  label: 'Max wind gusts',          unit: 'km/h'  },
  wind_speed_10m_mean:           { field: 'wind',       label: 'Mean wind speed',         unit: 'km/h'  },
  sunshine_duration:             { field: 'sunshineDur',label: 'Sunshine duration',       unit: 'h',    transform: v => +(v / 3600).toFixed(2) },
  daylight_duration:             { field: 'daylightDur',label: 'Daylight duration',       unit: 'h',    transform: v => +(v / 3600).toFixed(2) },
  relative_humidity_2m_mean:     { field: 'humidity',   label: 'Mean humidity',           unit: '%'     },
};

// ─── Module state ────────────────────────────────────────────────────────────

let _chart = null;
let _selectedKey = null;
let _loadCity = null;
let _loadAbort = null;
let _suggestTimer = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initRawDataMode(container) {
  container.innerHTML = `
    <div class="rdm-wrap">
      <aside class="rdm-left">
        <div class="rdm-section">
          <div class="rdm-section-title">Load new data</div>
          <div class="rdm-load-form">
            <div class="rdm-city-wrap">
              <input id="rdm-city-input" class="rdm-input" type="search"
                placeholder="City…" autocomplete="off" autocorrect="off"
                autocapitalize="off" spellcheck="false" />
              <div id="rdm-city-dropdown" class="city-dropdown" role="listbox"></div>
            </div>
            <select id="rdm-param-select" class="rdm-select">
              ${ERA5_PARAMS.map(g =>
                `<optgroup label="${g.group}">${
                  g.params.map(p => `<option value="${p.id}">${p.label}</option>`).join('')
                }</optgroup>`
              ).join('')}
            </select>
            <div class="rdm-date-row">
              <input id="rdm-start" class="rdm-input" type="date" />
              <input id="rdm-end"   class="rdm-input" type="date" />
            </div>
            <button id="rdm-load-btn" class="rdm-load-btn" disabled>Load &amp; Store</button>
            <div id="rdm-load-status" class="rdm-load-status hidden"></div>
          </div>
        </div>

        <div class="rdm-section rdm-tree-section">
          <div class="rdm-section-title">
            Stored data
            <span id="rdm-total-size" class="rdm-total-size"></span>
          </div>
          <div id="rdm-tree" class="rdm-tree"></div>
        </div>
      </aside>

      <div class="rdm-right">
        <div id="rdm-placeholder" class="rdm-placeholder">
          <div class="rdm-placeholder-text">Select an entry to preview</div>
        </div>
        <div id="rdm-chart-area" class="rdm-chart-area hidden">
          <div class="rdm-chart-header">
            <span id="rdm-chart-title" class="rdm-chart-title"></span>
            <select id="rdm-field-picker" class="rdm-field-picker hidden">
              ${Object.entries(AGGREGATE_FIELDS).map(([id, m]) =>
                `<option value="${id}">${m.label}</option>`
              ).join('')}
            </select>
          </div>
          <div id="rdm-chart-el" class="rdm-chart-el"></div>
        </div>
      </div>
    </div>
  `;

  _setDefaultDates();
  _bindLoadForm();
  await _refreshTree();
}

export function destroyRawDataMode() {
  if (_chart) { _chart.dispose(); _chart = null; }
  if (_loadAbort) { _loadAbort.abort(); _loadAbort = null; }
  _selectedKey = null;
  _loadCity = null;
}

// ─── Load form ────────────────────────────────────────────────────────────────

function _setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  const fiveYearsAgo = (new Date().getFullYear() - 5) + today.slice(4);
  const startEl = document.getElementById('rdm-start');
  const endEl = document.getElementById('rdm-end');
  if (startEl) startEl.value = fiveYearsAgo;
  if (endEl) endEl.value = today;
}

function _bindLoadForm() {
  const cityInput = document.getElementById('rdm-city-input');
  const dropdown  = document.getElementById('rdm-city-dropdown');
  const loadBtn   = document.getElementById('rdm-load-btn');

  if (cityInput) {
    cityInput.addEventListener('input', () => {
      clearTimeout(_suggestTimer);
      _suggestTimer = setTimeout(() => _suggestLoad(cityInput.value, dropdown), 250);
      _loadCity = null;
      if (loadBtn) loadBtn.disabled = true;
    });
    cityInput.addEventListener('keydown', e => { if (e.key === 'Escape') _closeDropdown(dropdown); });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('.rdm-city-wrap')) _closeDropdown(dropdown);
  });

  if (loadBtn) loadBtn.addEventListener('click', _handleLoad);
}

async function _suggestLoad(query, dropdown) {
  if (!query || query.length < 2) { _closeDropdown(dropdown); return; }
  const cities = await suggestCities(query, 6);
  _closeDropdown(dropdown);
  if (!cities.length) return;

  dropdown.setAttribute('aria-expanded', 'true');
  cities.forEach(city => {
    const opt = document.createElement('div');
    opt.className = 'city-option';
    opt.setAttribute('role', 'option');
    const parts = [city.name];
    if (city.admin1) parts.push(city.admin1);
    if (city.country) parts.push(city.country);
    opt.textContent = parts.join(', ');
    opt.addEventListener('mousedown', () => {
      _loadCity = city;
      saveLocation(city.lat, city.lon, city);
      const input = document.getElementById('rdm-city-input');
      if (input) input.value = opt.textContent;
      _closeDropdown(dropdown);
      const loadBtn = document.getElementById('rdm-load-btn');
      if (loadBtn) loadBtn.disabled = false;
    });
    dropdown.appendChild(opt);
  });
}

function _closeDropdown(dropdown) {
  if (dropdown) { dropdown.innerHTML = ''; dropdown.removeAttribute('aria-expanded'); }
}

async function _handleLoad() {
  if (!_loadCity) return;
  const paramId = document.getElementById('rdm-param-select')?.value;
  const start   = document.getElementById('rdm-start')?.value;
  const end     = document.getElementById('rdm-end')?.value;
  if (!paramId || !start || !end) return;

  const statusEl = document.getElementById('rdm-load-status');
  const loadBtn  = document.getElementById('rdm-load-btn');

  _setLoadStatus('Loading…', 'loading');
  if (loadBtn) loadBtn.disabled = true;

  try {
    const { cacheKey, fromCache } = await _fetchRawParam(_loadCity.lat, _loadCity.lon, start, end, paramId);
    _setLoadStatus(fromCache ? 'Already stored — selecting.' : '✓ Stored', 'success');
    if (loadBtn) loadBtn.disabled = false;
    await _refreshTree();
    await _selectByKey(cacheKey);
  } catch (err) {
    if (err.name === 'AbortError') return;
    _setLoadStatus('Error: ' + (err.message || 'fetch failed'), 'error');
    if (loadBtn) loadBtn.disabled = false;
  }
}

function _setLoadStatus(msg, type) {
  const el = document.getElementById('rdm-load-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `rdm-load-status rdm-status-${type}`;
}

async function _fetchRawParam(lat, lon, start, end, paramId) {
  const today = new Date().toISOString().slice(0, 10);
  const actualEnd = end > today ? today : end;
  const cacheKey = `raw:${lat.toFixed(4)},${lon.toFixed(4)}|${start}|${actualEnd}|${paramId}`;

  const cached = await getCache(cacheKey);
  if (cached) return { cacheKey, fromCache: true };

  if (_loadAbort) _loadAbort.abort();
  _loadAbort = new AbortController();

  const url = `${ERA_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${actualEnd}&daily=${encodeURIComponent(paramId)}&timezone=UTC`;
  const res = await fetch(url, { signal: _loadAbort.signal });
  if (!res.ok) throw new Error(`API error ${res.status}`);

  const json = await res.json();
  const dates  = json?.daily?.time || [];
  const values = (json?.daily?.[paramId] || []).map(v =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  );

  const data = { dates, values, paramId, lat, lon, start, end: actualEnd };
  setCache(cacheKey, data);
  return { cacheKey, fromCache: false };
}

// ─── Tree ─────────────────────────────────────────────────────────────────────

async function _refreshTree() {
  const entries = await getAllEntries();
  const treeEl  = document.getElementById('rdm-tree');
  if (!treeEl) return;

  if (!entries.length) {
    treeEl.innerHTML = '<div class="rdm-empty">No data stored yet.</div>';
    document.getElementById('rdm-total-size').textContent = '';
    return;
  }

  const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);
  const totalSizeEl = document.getElementById('rdm-total-size');
  if (totalSizeEl) totalSizeEl.textContent = `· ${_formatSize(totalBytes)} total`;

  // Group by lat,lon string
  const groups = new Map();
  for (const entry of entries) {
    const ll = _latlonFromKey(entry.key);
    if (!ll) continue;
    if (!groups.has(ll)) groups.set(ll, []);
    groups.get(ll).push(entry);
  }

  treeEl.innerHTML = '';
  const autoExpand = groups.size === 1;

  for (const [ll, cityEntries] of groups) {
    const cityLabel = locationLabel(ll);
    const cityBytes = cityEntries.reduce((s, e) => s + e.sizeBytes, 0);

    const groupEl = document.createElement('div');
    groupEl.className = 'rdm-group';

    const headerEl = document.createElement('div');
    headerEl.className = 'rdm-group-header';
    headerEl.innerHTML = `
      <span class="rdm-toggle">${autoExpand ? '▼' : '▶'}</span>
      <span class="rdm-group-name">${_esc(cityLabel)}</span>
      <span class="rdm-group-size">${_formatSize(cityBytes)}</span>
    `;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'rdm-group-body' + (autoExpand ? '' : ' collapsed');

    headerEl.addEventListener('click', () => {
      const open = !bodyEl.classList.contains('collapsed');
      bodyEl.classList.toggle('collapsed', open);
      headerEl.querySelector('.rdm-toggle').textContent = open ? '▶' : '▼';
    });

    for (const entry of cityEntries) {
      bodyEl.appendChild(_buildEntryRow(entry, ll));
    }

    groupEl.appendChild(headerEl);
    groupEl.appendChild(bodyEl);
    treeEl.appendChild(groupEl);
  }
}

function _buildEntryRow(entry, ll) {
  const row = document.createElement('div');
  row.className = 'rdm-entry' + (entry.key === _selectedKey ? ' selected' : '');
  row.dataset.key = entry.key;

  const { label, yearRange } = _describeEntry(entry.key);

  row.innerHTML = `
    <div class="rdm-entry-info">
      <span class="rdm-entry-label">${_esc(label)}</span>
      <span class="rdm-entry-meta">${yearRange} · ${_formatSize(entry.sizeBytes)}</span>
    </div>
    <button class="rdm-delete-btn" title="Delete">×</button>
  `;

  row.querySelector('.rdm-entry-info').addEventListener('click', () => _selectByKey(entry.key));
  row.querySelector('.rdm-delete-btn').addEventListener('click', async e => {
    e.stopPropagation();
    if (_selectedKey === entry.key) { _selectedKey = null; _showPlaceholder(); }
    await deleteEntry(entry.key);
    await _refreshTree();
  });

  return row;
}

function _describeEntry(key) {
  if (key.startsWith('raw:')) {
    const parts = key.slice(4).split('|');
    const paramId = parts[3] || '';
    const paramMeta = _findParam(paramId);
    return {
      label: paramMeta?.label ?? paramId,
      yearRange: _yearRange(parts[1], parts[2])
    };
  }
  const parts = key.split('|');
  return { label: 'Daily aggregate (all fields)', yearRange: _yearRange(parts[1], parts[2]) };
}

// ─── Chart ────────────────────────────────────────────────────────────────────

async function _selectByKey(key) {
  _selectedKey = key;

  // Update row selection highlight
  document.querySelectorAll('.rdm-entry').forEach(el => {
    el.classList.toggle('selected', el.dataset.key === key);
  });

  const data = await getCache(key);
  if (!data) { _showPlaceholder(); return; }

  const ll = _latlonFromKey(key);
  const cityName = ll ? locationLabel(ll) : '—';

  const chartArea = document.getElementById('rdm-chart-area');
  const placeholder = document.getElementById('rdm-placeholder');
  if (chartArea) chartArea.classList.remove('hidden');
  if (placeholder) placeholder.classList.add('hidden');

  if (key.startsWith('raw:')) {
    // Single parameter
    const parts = key.slice(4).split('|');
    const paramMeta = _findParam(parts[3]) ?? { label: parts[3], unit: '' };
    _hideFieldPicker();
    _renderChart(data.dates, data.values, cityName, paramMeta, _yearRange(parts[1], parts[2]));
  } else {
    // Daily aggregate — show field picker, default to mean temperature
    const fieldPicker = document.getElementById('rdm-field-picker');
    if (fieldPicker) {
      fieldPicker.classList.remove('hidden');
      fieldPicker.onchange = () => _renderAggChart(data, cityName, key, fieldPicker.value);
      _renderAggChart(data, cityName, key, fieldPicker.value || 'temperature_2m_mean');
    }
  }
}

function _renderAggChart(data, cityName, key, paramId) {
  const meta = AGGREGATE_FIELDS[paramId];
  if (!meta) return;
  const parts = key.split('|');
  const values = (data[meta.field] || []).map(v =>
    typeof v === 'number' ? (meta.transform ? meta.transform(v) : v) : null
  );
  _renderChart(data.date, values, cityName, meta, _yearRange(parts[1], parts[2]));
}

function _renderChart(dates, values, cityName, paramMeta, yearRange) {
  const el = document.getElementById('rdm-chart-el');
  if (!el) return;

  const titleEl = document.getElementById('rdm-chart-title');
  if (titleEl) titleEl.textContent = `${cityName} · ${paramMeta.label}`;

  if (!_chart) {
    _chart = echarts.init(el);
    window.addEventListener('resize', _onResize);
  }

  const pairs = (dates || []).map((d, i) => [d, values[i] ?? null]);

  _chart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 20, right: 16, bottom: 56, left: 56 },
    xAxis: {
      type: 'time',
      axisLabel: { formatter: v => new Date(v).getFullYear().toString(), color: '#64748b', fontSize: 11 },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: paramMeta.unit || '',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(203,213,225,0.4)' } }
    },
    series: [{
      type: 'line',
      data: pairs,
      symbol: 'none',
      lineStyle: { color: '#1e88e5', width: 1.5 },
      emphasis: { disabled: true }
    }],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0], filterMode: 'filter' },
      {
        type: 'slider', xAxisIndex: [0], filterMode: 'filter',
        height: 16, bottom: 4,
        handleIcon: 'path://M10,30 A20,20,0,0,1,50,30 A20,20,0,0,1,90,30 Q90,60,50,90 Q10,60,10,30 Z',
        handleSize: '80%',
        showDetail: false,
        filledColor: 'rgba(30,136,229,0.15)',
        borderColor: 'rgba(203,213,225,0.5)'
      }
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#0f172a', fontSize: 12 },
      formatter: params => {
        const p = params[0];
        if (!p) return '';
        const date = new Date(p.value[0]).toISOString().slice(0, 10);
        const val = p.value[1] != null ? p.value[1].toFixed(2) : '—';
        return `${date}: ${val} ${paramMeta.unit || ''}`;
      }
    }
  }, true);

  setTimeout(() => _chart?.resize(), 50);
}

function _hideFieldPicker() {
  const fp = document.getElementById('rdm-field-picker');
  if (fp) { fp.classList.add('hidden'); fp.onchange = null; }
}

function _showPlaceholder() {
  const chartArea = document.getElementById('rdm-chart-area');
  const placeholder = document.getElementById('rdm-placeholder');
  if (chartArea) chartArea.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
  _hideFieldPicker();
}

function _onResize() { _chart?.resize(); }

// ─── Utilities ────────────────────────────────────────────────────────────────

function _latlonFromKey(key) {
  const raw = key.startsWith('raw:') ? key.slice(4) : key;
  const latlon = raw.split('|')[0];
  return latlon && latlon.includes(',') ? latlon : null;
}

function _findParam(id) {
  for (const group of ERA5_PARAMS) {
    const p = group.params.find(x => x.id === id);
    if (p) return p;
  }
  return null;
}

function _yearRange(start, end) {
  const y1 = (start || '').slice(0, 4);
  const y2 = (end   || '').slice(0, 4);
  return y1 === y2 ? y1 : `${y1}–${y2}`;
}

function _formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

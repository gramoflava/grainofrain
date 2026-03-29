import { isFiniteNumber } from './utils.js';

export function initCharts() {
  const temp = echarts.init(document.getElementById('chart-temp'));
  const hydro = echarts.init(document.getElementById('chart-hydro'));
  echarts.connect([temp, hydro]);
  return { temp, hydro };
}

// --- Tab state ---
let _activeTab = 'hydro'; // 'hydro' | 'sun' | 'wind'
let _activeTempFocus = 'mean'; // 'mean' | 'max' | 'min'
let _lastSingle = null;   // { ch, series, color, prefs, label }
let _lastCompare = null;  // { ch, allSeries, colors, prefs, labels }

export function setHydroTab(tab) {
  _activeTab = tab;
  if (_lastSingle) {
    const { ch, series, color, prefs, label } = _lastSingle;
    _renderHydroChart(ch, [series], [color], prefs, [label], false);
  } else if (_lastCompare) {
    const { ch, allSeries, colors, prefs, labels } = _lastCompare;
    _renderHydroChart(ch, allSeries, colors, prefs, labels, true);
  }
}

export function setTempFocus(focus) {
  _activeTempFocus = focus;
  if (_lastSingle) {
    const { ch, series, color, prefs, label } = _lastSingle;
    const asterisk = (prefs.smoothing || 0) > 0 ? '*' : '';
    _renderTempChart(ch, series, color, prefs, label, asterisk);
  } else if (_lastCompare) {
    const { ch, allSeries, colors, prefs, labels } = _lastCompare;
    const asterisk = (prefs.smoothing || 0) > 0 ? '*' : '';
    _renderTempChartCompare(ch, allSeries, colors, prefs, labels, asterisk);
  }
}

// --- Shared helpers ---

function _themeVars() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    isDark,
    gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    axisLabelColor: isDark ? '#9E9E9E' : '#757575',
    tooltipBg: isDark ? '#2a2a2a' : '#ffffff',
    tooltipBorder: isDark ? '#404040' : '#e0e0e0',
    tooltipText: isDark ? '#e0e0e0' : '#263238',
    snowColor: isDark ? 'rgba(210,225,255,0.85)' : 'rgba(80,90,120,0.75)'
  };
}

function _gridSizes() {
  const narrow = window.innerWidth <= 480;
  return {
    left: narrow ? 36 : 56,
    right: narrow ? 12 : 32
  };
}

function _baseXAxis(x) {
  return {
    type: 'category',
    data: x,
    boundaryGap: true,
    axisLabel: { hideOverlap: true, color: '#546E7A', margin: 12 },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#CFD8DC' } }
  };
}

function _dataZoom() {
  return [
    { type: 'inside', xAxisIndex: [0], filterMode: 'filter' }
  ];
}

function _precipAxisMax(series) {
  const max = Math.max(...series.precip.filter(v => isFiniteNumber(v)));
  return Math.max(10, Math.ceil((isFiniteNumber(max) ? max : 0) * 1.1));
}

function _precipAxisMaxAll(allSeries) {
  let max = 0;
  allSeries.forEach(s => {
    if (s && s.precip) {
      const m = Math.max(...s.precip.filter(v => isFiniteNumber(v)));
      if (isFiniteNumber(m) && m > max) max = m;
    }
  });
  return Math.max(10, Math.ceil(max * 1.1));
}

function _precipAxisFormatter(precipAxisMax) {
  return (value) => {
    if (value === 0) return '0';
    if (value === precipAxisMax) return value.toFixed(0);
    const middle = precipAxisMax / 2;
    if (Math.abs(value - middle) < 0.5) return value.toFixed(0);
    return '';
  };
}

function _monthMarkLines(x, gridColor) {
  const data = [];
  for (let i = 1; i < x.length; i++) {
    if (x[i].slice(5, 7) !== x[i - 1].slice(5, 7)) {
      data.push({ xAxis: x[i] });
    }
  }
  return {
    silent: true,
    symbol: 'none',
    lineStyle: { color: gridColor, type: 'solid', width: 1, opacity: 0.5 },
    label: { show: false },
    data
  };
}

// --- Temp chart renderer (single) ---

function _renderTempChart(ch, series, color, prefs, label, asterisk) {
  const { isDark, gridColor, axisLabelColor, tooltipBg, tooltipBorder, tooltipText } = _themeVars();
  const { left, right } = _gridSizes();
  const x = series.x;
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const focus = _activeTempFocus;

  const focusCfg = {
    max:  { lineW: [2, 0, 0], lineColor: '#EF5350', norm: series.normMax },
    mean: { lineW: [0, 2, 0], lineColor: '#0D47A1', norm: series.norm },
    min:  { lineW: [0, 0, 2], lineColor: '#1E88E5', norm: series.normMin },
  }[focus] || { lineW: [0, 2, 0], lineColor: '#0D47A1', norm: series.norm };

  const tempRange = series.tempMax.map((mx, i) =>
    (isFiniteNumber(mx) && isFiniteNumber(series.tempMin[i]) ? mx - series.tempMin[i] : null));

  const tooltip = {
    trigger: 'axis', confine: true, transitionDuration: 0.2,
    backgroundColor: tooltipBg, borderColor: tooltipBorder,
    textStyle: { color: tooltipText },
    formatter: (params) => {
      if (!params || params.length === 0) return '';
      const date = params[0].axisValue;
      let html = `<div style="margin-bottom:4px;font-weight:500;">${date}</div>`;
      params.forEach(p => {
        if (!p.seriesName || p.seriesName === 'Temp Range') return;
        const name = p.seriesName;
        let markerColor = '';
        if (name.startsWith('T↑') && focus === 'max') markerColor = '#EF5350';
        else if (name.startsWith('T~')) markerColor = '#0D47A1';
        else if (name.startsWith('T↓') && focus === 'min') markerColor = '#1E88E5';
        const fv = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
        let marker = '<span style="display:inline-block;width:10px;margin-right:5px;"></span>';
        if (markerColor) marker = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${markerColor};margin-right:5px;"></span>`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;"><span>${marker}${name}</span><span style="margin-left:20px;font-weight:600;">${fv} °C</span></div>`;
      });
      return html;
    }
  };

  const monthML = _monthMarkLines(x, gridColor);
  const tempSeries = [
    { name: 'T↑', type: 'line', data: series.tempMax, symbol: 'none', lineStyle: { color: '#EF5350', width: focusCfg.lineW[0] }, tooltip: { valueFormatter: valueFmt }, markLine: focus === 'max' ? monthML : undefined },
    { name: `T~${asterisk}`, type: 'line', data: series.tempMean, symbol: 'none', lineStyle: { color: '#0D47A1', width: focusCfg.lineW[1] }, tooltip: { valueFormatter: valueFmt }, markLine: focus === 'mean' ? monthML : undefined },
    { name: 'T↓', type: 'line', data: series.tempMin, symbol: 'none', stack: 'temp-range', stackStrategy: 'all', lineStyle: { color: '#1E88E5', width: focusCfg.lineW[2] }, tooltip: { valueFormatter: valueFmt }, markLine: focus === 'min' ? monthML : undefined },
    { name: 'Temp Range', type: 'line', data: tempRange, stack: 'temp-range', stackStrategy: 'all', showSymbol: false, lineStyle: { width: 0 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: focusCfg.lineColor + '33' }, { offset: 1, color: focusCfg.lineColor + '05' }]) }, tooltip: { show: false } }
  ];

  if (focusCfg.norm) {
    tempSeries.push({ name: 'Climate Norm', type: 'line', data: focusCfg.norm, symbol: 'none', lineStyle: { color: '#616161', type: 'dashed' }, tooltip: { valueFormatter: valueFmt } });
  }

  ch.temp.setOption({
    animation: false, legend: { show: false },
    grid: { left, right, top: 16, bottom: 4, containLabel: true },
    tooltip, dataZoom: _dataZoom(),
    xAxis: _baseXAxis(x),
    yAxis: [
      { type: 'value', interval: 5, splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } }, axisLabel: { show: true, color: axisLabelColor, fontSize: 11, formatter: '{value}' }, axisTick: { show: false }, axisLine: { show: false } }
    ],
    series: tempSeries
  }, { notMerge: true });
}

// --- Temp chart renderer (compare) ---

function _renderTempChartCompare(ch, allSeries, colors, prefs, labels, asterisk) {
  const { isDark, gridColor, axisLabelColor, tooltipBg, tooltipBorder, tooltipText } = _themeVars();
  const { left, right } = _gridSizes();
  const x = allSeries[0].x;
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const focus = _activeTempFocus;

  // Which data field and norm field to use
  const focusDataKey = focus === 'max' ? 'tempMax' : focus === 'min' ? 'tempMin' : 'tempMean';
  const focusNormKey = focus === 'max' ? 'normMax' : focus === 'min' ? 'normMin' : 'norm';
  const focusSeriesPrefix = focus === 'max' ? 'T↑' : focus === 'min' ? 'T↓' : 'T~';

  const tooltip = {
    trigger: 'axis', confine: true, transitionDuration: 0.2,
    backgroundColor: tooltipBg, borderColor: tooltipBorder,
    textStyle: { color: tooltipText },
    formatter: (params) => {
      if (!params || params.length === 0) return '';
      const date = params[0].axisValue;
      let html = `<div style="margin-bottom:4px;font-weight:500;">${date}</div>`;
      const mainSeries = params.filter(p => {
        const n = p.seriesName;
        return n.startsWith(focusSeriesPrefix) || n.startsWith('Climate Norm');
      });
      mainSeries.forEach(p => {
        const name = p.seriesName;
        let displayName = name;
        const cityNumMatch = name.match(/ (\d+)$/);
        const cityIdx = cityNumMatch ? parseInt(cityNumMatch[1]) - 1 : 0;
        const cityColor = colors[cityIdx] || colors[0];
        if (cityNumMatch) {
          const label = labels[parseInt(cityNumMatch[1]) - 1];
          if (label) displayName = displayName.replace(/ \d+$/, ` ${label}`);
        }
        const fv = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
        const showMarker = name.startsWith(focusSeriesPrefix);
        let marker = '<span style="display:inline-block;width:10px;margin-right:5px;"></span>';
        if (showMarker) marker = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${cityColor};margin-right:5px;"></span>`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;"><span>${marker}${displayName}</span><span style="margin-left:20px;font-weight:600;">${fv} °C</span></div>`;
      });
      return html;
    }
  };

  const series = [];
  const monthML = _monthMarkLines(x, gridColor);

  // Focused temperature lines per city
  allSeries.forEach((s, idx) => {
    if (!s || idx >= colors.length) return;
    series.push({
      name: `${focusSeriesPrefix}${asterisk} ${idx + 1}`,
      type: 'line', data: s[focusDataKey], symbol: 'none',
      lineStyle: { color: colors[idx], width: 2 },
      tooltip: { valueFormatter: valueFmt },
      markLine: idx === 0 ? monthML : undefined
    });
  });

  // Climate norms — pick norm corresponding to focus
  const normKey = focusNormKey;
  let showSingleNorm = false;
  if (allSeries.length > 1 && allSeries[0]?.[normKey] && allSeries[1]?.[normKey]) {
    showSingleNorm = allSeries.every(s => s?.[normKey] && JSON.stringify(s[normKey]) === JSON.stringify(allSeries[0][normKey]));
  }
  if (showSingleNorm) {
    series.push({ name: 'Climate Norm', type: 'line', data: allSeries[0][normKey], symbol: 'none', lineStyle: { color: '#616161', type: 'dashed', width: 1 }, tooltip: { valueFormatter: valueFmt } });
  } else {
    allSeries.forEach((s, idx) => {
      if (!s || idx >= colors.length || !s[normKey] || !prefs.showNormals) return;
      series.push({ name: `Climate Norm ${idx + 1}`, type: 'line', data: s[normKey], symbol: 'none', lineStyle: { color: '#616161', type: 'dashed', width: 1 }, tooltip: { valueFormatter: valueFmt } });
    });
  }

  ch.temp.setOption({
    animation: false, legend: { show: false },
    grid: { left, right, top: 16, bottom: 4, containLabel: true },
    tooltip, dataZoom: _dataZoom(),
    xAxis: _baseXAxis(x),
    yAxis: [
      { type: 'value', interval: 5, splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } }, axisLabel: { show: true, color: axisLabelColor, fontSize: 11, formatter: '{value}' }, axisTick: { show: false }, axisLine: { show: false } }
    ],
    series
  }, { notMerge: true });
}

// --- Hydro chart renderer (tabs) ---

function _renderHydroChart(ch, allSeries, colors, prefs, labels, isCompare) {
  const tab = _activeTab;
  const { isDark, gridColor, axisLabelColor, tooltipBg, tooltipBorder, tooltipText, snowColor } = _themeVars();
  const { left, right } = _gridSizes();
  const x = allSeries[0].x;
  const grid = { left, right, top: 16, bottom: 4, containLabel: true };

  const baseTooltip = {
    trigger: 'axis', confine: true, transitionDuration: 0.2,
    backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: tooltipText }
  };

  if (tab === 'sun') {
    _renderSunTab(ch, allSeries, colors, labels, isCompare, x, grid, gridColor, axisLabelColor, baseTooltip, prefs);
  } else if (tab === 'wind') {
    _renderWindTab(ch, allSeries, colors, labels, isCompare, x, grid, gridColor, axisLabelColor, baseTooltip, prefs);
  } else {
    _renderHydroTab(ch, allSeries, colors, labels, isCompare, x, grid, gridColor, axisLabelColor, baseTooltip, prefs, snowColor);
  }
}

function _renderHydroTab(ch, allSeries, colors, labels, isCompare, x, grid, gridColor, axisLabelColor, baseTooltip, prefs, snowColor) {
  const asterisk = (prefs.smoothing || 0) > 0 ? '*' : '';
  const precipAxisMax = _precipAxisMaxAll(allSeries);

  const tooltip = {
    ...baseTooltip,
    formatter: (params) => {
      if (!params || params.length === 0) return '';
      const date = params[0].axisValue;
      let html = `<div style="margin-bottom:4px;font-weight:500;">${date}</div>`;
      params.forEach(p => {
        const name = p.seriesName;
        const fv = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
        const cityNumMatch = name.match(/ (\d+)$/);
        const cityIdx = cityNumMatch ? parseInt(cityNumMatch[1]) - 1 : 0;
        const cityColor = colors[cityIdx] || colors[0];
        let displayName = name;
        if (cityNumMatch) {
          const label = labels[parseInt(cityNumMatch[1]) - 1];
          if (label) displayName = displayName.replace(/ \d+$/, ` ${label}`);
        }
        let unit = '';
        let markerColor = '';
        if (name.startsWith('Rain')) { unit = ' mm'; markerColor = 'rgba(66,133,244,0.80)'; }
        else if (name.startsWith('∑ Precip')) { unit = ' mm'; markerColor = cityColor; }
        else if (name.startsWith('Snow')) { unit = ' mm'; markerColor = '#aab8cc'; }
        else if (name.startsWith('RH%')) { unit = ' %'; }
        const marker = markerColor
          ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${markerColor};margin-right:5px;"></span>`
          : `<span style="display:inline-block;width:10px;margin-right:5px;"></span>`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;"><span>${marker}${displayName}</span><span style="margin-left:20px;font-weight:600;">${fv}${unit}</span></div>`;
      });
      return html;
    }
  };

  let series = [];

  if (isCompare) {
    // Comparison: total precip bars per city + humidity areas per city
    allSeries.forEach((s, idx) => {
      if (!s || idx >= colors.length) return;
      series.push({
        name: `∑ Precip ${idx + 1}`, type: 'bar', data: s.precip,
        yAxisIndex: 0, barWidth: '55%',
        itemStyle: { color: `${colors[idx]}CC` },
        tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} mm` : v) }
      });
      series.push({
        name: `RH%${asterisk} ${idx + 1}`, type: 'line', data: s.humidity,
        yAxisIndex: 1, showSymbol: false,
        lineStyle: { color: colors[idx], width: 1 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: colors[idx] + '33' }, { offset: 1, color: colors[idx] + '05' }]) },
        tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} %` : v) }
      });
    });
  } else {
    const s = allSeries[0];
    const color = colors[0];
    // Stacked rain + snow bars
    series.push({
      name: 'Rain', type: 'bar', stack: 'precip', data: s.rain,
      yAxisIndex: 0, barWidth: '55%',
      itemStyle: { color: 'rgba(66,133,244,0.80)' },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} mm` : v) }
    });
    series.push({
      name: 'Snow', type: 'bar', stack: 'precip', data: s.snow,
      yAxisIndex: 0, barWidth: '55%',
      itemStyle: { color: snowColor },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} mm` : v) }
    });
    // Humidity area
    series.push({
      name: `RH%${asterisk}`, type: 'line', data: s.humidity,
      yAxisIndex: 1, showSymbol: false, lineStyle: { width: 0 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(67,160,71,0.3)' }, { offset: 1, color: 'rgba(67,160,71,0.05)' }]) },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} %` : v) }
    });
  }

  // Only show precipitation series in the zoom minimap (exclude humidity)
  const precipZoomIdx = isCompare
    ? allSeries.map((_, i) => i * 2).filter(i => i < series.length) // even indices = precip bars
    : [0, 1]; // rain=0, snow=1

  ch.hydro.setOption({
    animation: false, legend: { show: false },
    grid, tooltip, dataZoom: _dataZoom(),
    xAxis: _baseXAxis(x),
    yAxis: [
      {
        type: 'value', min: 0, max: precipAxisMax, splitNumber: 3,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: { show: true, color: axisLabelColor, fontSize: 10, formatter: _precipAxisFormatter(precipAxisMax) },
        axisTick: { show: false }, axisLine: { show: false }
      },
      { type: 'value', min: 0, max: 100, splitLine: { show: false }, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } }
    ],
    series
  }, { notMerge: true });
}

function _renderSunTab(ch, allSeries, colors, labels, isCompare, x, grid, gridColor, axisLabelColor, baseTooltip, prefs) {
  const tooltip = {
    ...baseTooltip,
    formatter: (params) => {
      if (!params || params.length === 0) return '';
      const date = params[0].axisValue;
      let html = `<div style="margin-bottom:4px;font-weight:500;">${date}</div>`;
      params.forEach(p => {
        const name = p.seriesName;
        const fv = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
        const cityNumMatch = name.match(/ (\d+)$/);
        const cityIdx = cityNumMatch ? parseInt(cityNumMatch[1]) - 1 : 0;
        const cityColor = colors[cityIdx] || colors[0];
        let displayName = name;
        if (cityNumMatch) {
          const label = labels[parseInt(cityNumMatch[1]) - 1];
          if (label) displayName = displayName.replace(/ \d+$/, ` ${label}`);
        }
        let markerColor = name.startsWith('Daylight') ? '#78909C' : '#FFA726';
        if (isCompare) markerColor = cityColor;
        const marker = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${markerColor};margin-right:5px;"></span>`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;"><span>${marker}${displayName}</span><span style="margin-left:20px;font-weight:600;">${fv} h</span></div>`;
      });
      return html;
    }
  };

  const series = [];

  if (isCompare) {
    // Per city: show sunshine as line/area
    allSeries.forEach((s, idx) => {
      if (!s || idx >= colors.length) return;
      series.push({
        name: `Sunshine ${idx + 1}`, type: 'line', data: s.sunshineDuration,
        showSymbol: false, lineStyle: { color: colors[idx], width: 1.5 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: colors[idx] + '40' }, { offset: 1, color: colors[idx] + '05' }]) },
        tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} h` : v) }
      });
    });
  } else {
    const s = allSeries[0];
    // Daylight as background area (light blue)
    series.push({
      name: 'Daylight', type: 'line', data: s.daylightDuration,
      showSymbol: false, lineStyle: { width: 0 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(100,181,246,0.25)' }, { offset: 1, color: 'rgba(100,181,246,0.05)' }]) },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} h` : v) }
    });
    // Sunshine as foreground area (golden)
    series.push({
      name: 'Sunshine', type: 'line', data: s.sunshineDuration,
      showSymbol: false, lineStyle: { color: '#FFA726', width: 1 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(255,167,38,0.55)' }, { offset: 1, color: 'rgba(255,167,38,0.08)' }]) },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} h` : v) }
    });
  }

  ch.hydro.setOption({
    animation: false, legend: { show: false },
    grid, tooltip, dataZoom: _dataZoom(),
    xAxis: _baseXAxis(x),
    yAxis: [
      {
        type: 'value', min: 0, max: 24,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: { show: true, color: axisLabelColor, fontSize: 10, formatter: v => v === 0 ? '0' : `${v}h` },
        axisTick: { show: false }, axisLine: { show: false }
      }
    ],
    series
  }, { notMerge: true });
}

function _renderWindTab(ch, allSeries, colors, labels, isCompare, x, grid, gridColor, axisLabelColor, baseTooltip, prefs) {
  const tooltip = {
    ...baseTooltip,
    formatter: (params) => {
      if (!params || params.length === 0) return '';
      const date = params[0].axisValue;
      let html = `<div style="margin-bottom:4px;font-weight:500;">${date}</div>`;
      params.forEach(p => {
        const name = p.seriesName;
        const fv = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
        const cityNumMatch = name.match(/ (\d+)$/);
        const cityIdx = cityNumMatch ? parseInt(cityNumMatch[1]) - 1 : 0;
        const cityColor = colors[cityIdx] || colors[0];
        let displayName = name;
        if (cityNumMatch) {
          const label = labels[parseInt(cityNumMatch[1]) - 1];
          if (label) displayName = displayName.replace(/ \d+$/, ` ${label}`);
        }
        let markerColor = name.startsWith('Gusts') ? '#8E24AA' : cityColor;
        const marker = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${markerColor};margin-right:5px;"></span>`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;"><span>${marker}${displayName}</span><span style="margin-left:20px;font-weight:600;">${fv} km/h</span></div>`;
      });
      return html;
    }
  };

  // Dynamic y-axis max from wind + gusts
  let windMax = 0;
  allSeries.forEach(s => {
    if (!s) return;
    const candidates = [...(s.wind || []), ...(s.windGusts || [])];
    const m = Math.max(...candidates.filter(v => isFiniteNumber(v)));
    if (isFiniteNumber(m) && m > windMax) windMax = m;
  });
  const windAxisMax = Math.max(50, Math.ceil(windMax * 1.15 / 10) * 10);

  const series = [];

  if (isCompare) {
    allSeries.forEach((s, idx) => {
      if (!s || idx >= colors.length) return;
      series.push({
        name: `Wind ${idx + 1}`, type: 'line', data: s.wind,
        showSymbol: false, lineStyle: { color: colors[idx], width: 1.5 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: colors[idx] + '33' }, { offset: 1, color: colors[idx] + '05' }]) },
        tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} km/h` : v) }
      });
      series.push({
        name: `Gusts ${idx + 1}`, type: 'bar', data: s.windGusts,
        barWidth: '40%', itemStyle: { color: `${colors[idx]}88` },
        tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} km/h` : v) }
      });
    });
  } else {
    const s = allSeries[0];
    const color = colors[0];
    series.push({
      name: 'Wind', type: 'line', data: s.wind,
      showSymbol: false, lineStyle: { color, width: 1.5 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '08' }]) },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} km/h` : v) }
    });
    series.push({
      name: 'Gusts', type: 'bar', data: s.windGusts,
      barWidth: '55%', itemStyle: { color: '#8E24AA88' },
      tooltip: { valueFormatter: v => (typeof v === 'number' ? `${v.toFixed(1)} km/h` : v) }
    });
  }

  ch.hydro.setOption({
    animation: false, legend: { show: false },
    grid, tooltip, dataZoom: _dataZoom(),
    xAxis: _baseXAxis(x),
    yAxis: [
      {
        type: 'value', min: 0, max: windAxisMax,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: { show: true, color: axisLabelColor, fontSize: 10, formatter: v => v === 0 ? '0' : `${v}` },
        axisTick: { show: false }, axisLine: { show: false }
      }
    ],
    series
  }, { notMerge: true });
}

// --- Public API ---

export function renderAll(ch, series, color = '#1E88E5', prefs = { showGrid: true, smoothing: 0 }, label = '') {
  const asterisk = (prefs.smoothing || 0) > 0 ? '*' : '';
  if (prefs.tempFocus) _activeTempFocus = prefs.tempFocus;
  _lastSingle = { ch, series, color, prefs, label };
  _lastCompare = null;
  _renderTempChart(ch, series, color, prefs, label, asterisk);
  _renderHydroChart(ch, [series], [color], prefs, [label], false);
}

export function renderCompare(ch, allSeries, colors, prefs = { showGrid: true, smoothing: 0 }, labels = []) {
  const asterisk = (prefs.smoothing || 0) > 0 ? '*' : '';
  if (prefs.tempFocus) _activeTempFocus = prefs.tempFocus;
  _lastCompare = { ch, allSeries, colors, prefs, labels };
  _lastSingle = null;
  _renderTempChartCompare(ch, allSeries, colors, prefs, labels, asterisk);
  _renderHydroChart(ch, allSeries, colors, prefs, labels, true);
}

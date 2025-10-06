export function initCharts() {
  const temp = echarts.init(document.getElementById('chart-temp'));
  const hydro = echarts.init(document.getElementById('chart-hydro'));
  echarts.connect([temp, hydro]);
  return { temp, hydro };
}

export function renderAll(ch, series, color = '#1E88E5', prefs = { showGrid: true, smoothing: 0 }) {
  const x = series.x;
  const tempRange = series.tempMax.map((max, i) => (isFiniteNumber(max) && isFiniteNumber(series.tempMin[i]) ? max - series.tempMin[i] : null));
  const windSeries = (series.windMax && series.windMax.length) ? series.windMax : series.wind;
  const windAxisMax = 200;
  const gridTop = { left: 56, right: 32, top: 16, bottom: 24, containLabel: true };
  const gridBottom = { left: 56, right: 32, top: 16, bottom: 24, containLabel: true };

  const smoothingActive = (prefs.smoothing || 0) > 0;
  const asterisk = smoothingActive ? '*' : '';

  // Get theme-aware grid color
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const axisLabelColor = isDark ? '#9E9E9E' : '#757575';

  const baseXAxis = {
    type: 'category',
    data: x,
    boundaryGap: true,
    axisLabel: { hideOverlap: true, color: '#546E7A', margin: 12 },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#CFD8DC' } }
  };
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const tooltip = {
    trigger: 'axis',
    valueFormatter: valueFmt,
    backgroundColor: 'var(--bg-card)',
    borderColor: 'var(--border-color)',
    textStyle: { color: 'var(--text-primary)' }
  };

  const tempSeries = [
    {
      name: 'T↑',
      type: 'line',
      data: series.tempMax,
      symbol: 'none',
      lineStyle: { color: '#64B5F6', width: 0 },
      tooltip: { valueFormatter: valueFmt }
    },
    {
      name: `T~${asterisk}`,
      type: 'line',
      data: series.tempMean,
      symbol: 'none',
      lineStyle: { color: '#0D47A1', width: 2 },
      tooltip: { valueFormatter: valueFmt }
    },
    {
      name: 'T↓',
      type: 'line',
      data: series.tempMin,
      symbol: 'none',
      stack: 'temp-range',
      stackStrategy: 'all',
      lineStyle: { color: '#1565C0', width: 0 },
      tooltip: { valueFormatter: valueFmt }
    },
    {
      name: 'Temp Range',
      type: 'line',
      data: tempRange,
      stack: 'temp-range',
      stackStrategy: 'all',
      showSymbol: false,
      lineStyle: { width: 0 },
      areaStyle: { color: color, opacity: 0.18 },
      tooltip: { show: false }
    }
  ];

  if (series.norm) {
    tempSeries.push({
      name: 'Climate Norm',
      type: 'line',
      data: series.norm,
      symbol: 'none',
      lineStyle: { color: '#616161', type: 'dashed' },
      tooltip: { valueFormatter: valueFmt }
    });
  }

  tempSeries.push({
    name: 'Wind↑',
    type: 'bar',
    data: windSeries,
    yAxisIndex: 1,
    barWidth: '55%',
    itemStyle: { color: '#8E24AA99' },
    tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} km/h` : value) }
  });

  ch.temp.setOption({
    animation: false,
    legend: { show: false },
    grid: gridTop,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        interval: 5,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: {
          show: true,
          color: axisLabelColor,
          fontSize: 11,
          formatter: '{value}'
        },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      {
        type: 'value',
        min: 0,
        max: windAxisMax,
        interval: 50,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    series: tempSeries
  }, { notMerge: true });

  ch.hydro.setOption({
    animation: false,
    legend: { show: false },
    grid: gridBottom,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        interval: 5,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: {
          show: true,
          color: axisLabelColor,
          fontSize: 11,
          formatter: '{value}'
        },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    series: [
      {
        name: '∑ Rain',
        type: 'bar',
        data: series.precip,
        itemStyle: { color: `${color}CC` },
        barWidth: '55%',
        tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} mm` : value) }
      },
      {
        name: `RH%${asterisk}`,
        type: 'line',
        data: series.humidity,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { width: 0 },
        areaStyle: { color: 'rgba(67,160,71,0.2)' },
        tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} %` : value) }
      }
    ]
  }, { notMerge: true });
}

export function renderCompare(ch, allSeries, colors, prefs = { showGrid: true, smoothing: 0 }) {
  const x = allSeries[0].x;
  const windAxisMax = 200;
  const gridTop = { left: 56, right: 32, top: 16, bottom: 24, containLabel: true };
  const gridBottom = { left: 56, right: 32, top: 16, bottom: 24, containLabel: true };

  const smoothingActive = (prefs.smoothing || 0) > 0;
  const asterisk = smoothingActive ? '*' : '';

  // Get theme-aware grid color
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const axisLabelColor = isDark ? '#9E9E9E' : '#757575';

  const baseXAxis = {
    type: 'category',
    data: x,
    boundaryGap: true,
    axisLabel: { hideOverlap: true, color: '#546E7A', margin: 12 },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#CFD8DC' } }
  };
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const tooltip = {
    trigger: 'axis',
    valueFormatter: valueFmt,
    backgroundColor: 'var(--bg-card)',
    borderColor: 'var(--border-color)',
    textStyle: { color: 'var(--text-primary)' }
  };

  const tempSeries = [];
  const hydroSeries = [];

  // First pass: add temperature and climate norm series
  allSeries.forEach((series, idx) => {
    if (!series || idx >= colors.length) return;

    const color = colors[idx];
    const cityNum = idx + 1;

    // Temperature mean line
    tempSeries.push({
      name: `T~${asterisk} ${cityNum}`,
      type: 'line',
      data: series.tempMean,
      symbol: 'none',
      lineStyle: { color: color, width: 2 },
      tooltip: { valueFormatter: valueFmt }
    });
  });

  // Second pass: add climate norms
  allSeries.forEach((series, idx) => {
    if (!series || idx >= colors.length) return;

    const color = colors[idx];
    const cityNum = idx + 1;

    if (series.norm && prefs.showNormals) {
      tempSeries.push({
        name: `Climate Norm ${cityNum}`,
        type: 'line',
        data: series.norm,
        symbol: 'none',
        lineStyle: { color: color, type: 'dashed', width: 1 },
        tooltip: { valueFormatter: valueFmt }
      });
    }
  });

  // Third pass: add wind series
  allSeries.forEach((series, idx) => {
    if (!series || idx >= colors.length) return;

    const color = colors[idx];
    const cityNum = idx + 1;

    const windSeries = (series.windMax && series.windMax.length) ? series.windMax : series.wind;
    tempSeries.push({
      name: `Wind↑ ${cityNum}`,
      type: 'bar',
      data: windSeries,
      yAxisIndex: 1,
      barWidth: '55%',
      itemStyle: { color: `${color}99` },
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} km/h` : value) }
    });
  });

  // Hydro series: precipitation and humidity
  allSeries.forEach((series, idx) => {
    if (!series || idx >= colors.length) return;

    const color = colors[idx];
    const cityNum = idx + 1;

    // Precipitation bars (overlapping)
    hydroSeries.push({
      name: `∑ Rain ${cityNum}`,
      type: 'bar',
      data: series.precip,
      itemStyle: { color: `${color}CC` },
      barWidth: '55%',
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} mm` : value) }
    });

    // Humidity area (overlapping)
    hydroSeries.push({
      name: `RH%${asterisk} ${cityNum}`,
      type: 'line',
      data: series.humidity,
      yAxisIndex: 1,
      showSymbol: false,
      lineStyle: { color: color, width: 1 },
      areaStyle: { color: color, opacity: 0.15 },
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} %` : value) }
    });
  });

  ch.temp.setOption({
    animation: false,
    legend: { show: false },
    grid: gridTop,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        interval: 5,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: {
          show: true,
          color: axisLabelColor,
          fontSize: 11,
          formatter: '{value}'
        },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      {
        type: 'value',
        min: 0,
        max: windAxisMax,
        interval: 50,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    series: tempSeries
  }, { notMerge: true });

  ch.hydro.setOption({
    animation: false,
    legend: { show: false },
    grid: gridBottom,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        interval: 5,
        splitLine: { show: prefs.showGrid, lineStyle: { color: gridColor } },
        axisLabel: {
          show: true,
          color: axisLabelColor,
          fontSize: 11,
          formatter: '{value}'
        },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    series: hydroSeries
  }, { notMerge: true });
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function initCharts() {
  const temp = echarts.init(document.getElementById('chart-temp'));
  const hydro = echarts.init(document.getElementById('chart-hydro'));
  echarts.connect([temp, hydro]);
  return { temp, hydro };
}

export function renderAll(ch, series, color = '#1E88E5', prefs = { showGrid: true }) {
  const x = series.x;
  const tempRange = series.tempMax.map((max, i) => (isFiniteNumber(max) && isFiniteNumber(series.tempMin[i]) ? max - series.tempMin[i] : null));
  const windSeries = (series.windMax && series.windMax.length) ? series.windMax : series.wind;
  const windAxisMax = 200;
  const gridTop = { left: 36, right: 32, top: 16, bottom: 24, containLabel: true };
  const gridBottom = { left: 36, right: 32, top: 16, bottom: 24, containLabel: true };

  const baseXAxis = {
    type: 'category',
    data: x,
    boundaryGap: true,
    axisLabel: { hideOverlap: true, color: '#546E7A', margin: 12 },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#CFD8DC' } }
  };
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const tooltip = { trigger: 'axis', valueFormatter: valueFmt };

  const tempSeries = [
    {
      name: 'Temp Min',
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
      tooltip: { valueFormatter: valueFmt }
    },
    {
      name: 'Temp Max',
      type: 'line',
      data: series.tempMax,
      symbol: 'none',
      lineStyle: { color: '#64B5F6', width: 0 },
      tooltip: { valueFormatter: valueFmt }
    },
    {
      name: 'Temp Mean',
      type: 'line',
      data: series.tempMean,
      symbol: 'none',
      lineStyle: { color: '#0D47A1', width: 2 },
      tooltip: { valueFormatter: valueFmt }
    },
    {
      name: 'Wind',
      type: 'bar',
      data: windSeries,
      yAxisIndex: 1,
      barWidth: '55%',
      itemStyle: { color: '#8E24AA99' },
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} km/h` : value) }
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

  ch.temp.setOption({
    animation: false,
    legend: { show: false },
    grid: gridTop,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        splitLine: { show: prefs.showGrid, lineStyle: { color: '#ECEFF1' } },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      {
        type: 'value',
        min: 0,
        max: windAxisMax,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    series: tempSeries
  });

  ch.hydro.setOption({
    animation: false,
    legend: { show: false },
    grid: gridBottom,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        splitLine: { show: prefs.showGrid, lineStyle: { color: '#ECEFF1' } },
        axisLabel: { show: false },
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
        name: 'Precipitation',
        type: 'bar',
        data: series.precip,
        itemStyle: { color: `${color}CC` },
        barWidth: '55%',
        tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} mm` : value) }
      },
      {
        name: 'Humidity',
        type: 'line',
        data: series.humidity,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { width: 0 },
        areaStyle: { color: 'rgba(67,160,71,0.2)' },
        tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} %` : value) }
      }
    ]
  });
}

export function renderCompare(ch, allSeries, colors, prefs = { showGrid: true }) {
  const x = allSeries[0].x;
  const windAxisMax = 200;
  const gridTop = { left: 36, right: 32, top: 16, bottom: 24, containLabel: true };
  const gridBottom = { left: 36, right: 32, top: 16, bottom: 24, containLabel: true };

  const baseXAxis = {
    type: 'category',
    data: x,
    boundaryGap: true,
    axisLabel: { hideOverlap: true, color: '#546E7A', margin: 12 },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#CFD8DC' } }
  };
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const tooltip = { trigger: 'axis', valueFormatter: valueFmt };

  const tempSeries = [];
  const hydroSeries = [];

  allSeries.forEach((series, idx) => {
    if (!series || idx >= colors.length) return;

    const color = colors[idx];
    const cityNum = idx + 1;

    // Temperature mean line
    tempSeries.push({
      name: `Temp Mean ${cityNum}`,
      type: 'line',
      data: series.tempMean,
      symbol: 'none',
      lineStyle: { color: color, width: 2 },
      tooltip: { valueFormatter: valueFmt }
    });

    // Wind bars (overlapping)
    const windSeries = (series.windMax && series.windMax.length) ? series.windMax : series.wind;
    tempSeries.push({
      name: `Wind ${cityNum}`,
      type: 'bar',
      data: windSeries,
      yAxisIndex: 1,
      barWidth: '55%',
      itemStyle: { color: `${color}99` },
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} km/h` : value) }
    });

    // Precipitation bars (overlapping)
    hydroSeries.push({
      name: `Precipitation ${cityNum}`,
      type: 'bar',
      data: series.precip,
      itemStyle: { color: `${color}CC` },
      barWidth: '55%',
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} mm` : value) }
    });

    // Humidity area (overlapping)
    hydroSeries.push({
      name: `Humidity ${cityNum}`,
      type: 'line',
      data: series.humidity,
      yAxisIndex: 1,
      showSymbol: false,
      lineStyle: { color: color, width: 1 },
      areaStyle: { color: color, opacity: 0.15 },
      tooltip: { valueFormatter: value => (typeof value === 'number' ? `${value.toFixed(1)} %` : value) }
    });

    // Climate norm if available
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

  ch.temp.setOption({
    animation: false,
    legend: { show: false },
    grid: gridTop,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        splitLine: { show: prefs.showGrid, lineStyle: { color: '#ECEFF1' } },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      {
        type: 'value',
        min: 0,
        max: windAxisMax,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false }
      }
    ],
    series: tempSeries
  });

  ch.hydro.setOption({
    animation: false,
    legend: { show: false },
    grid: gridBottom,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        splitLine: { show: prefs.showGrid, lineStyle: { color: '#ECEFF1' } },
        axisLabel: { show: false },
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
  });
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

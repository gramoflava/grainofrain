export function initCharts() {
  const temp = echarts.init(document.getElementById('chart-temp'));
  const hydro = echarts.init(document.getElementById('chart-hydro'));
  echarts.connect([temp, hydro]);
  return { temp, hydro };
}

export function renderAll(ch, series, color = '#1E88E5', prefs = { showGrid: true, smoothing: 0 }, label = '') {
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
    backgroundColor: 'var(--bg-card)',
    borderColor: 'var(--border-color)',
    textStyle: { color: 'var(--text-primary)' },
    formatter: (params) => {
      if (!params || params.length === 0) return '';

      const date = params[0].axisValue;
      let html = `<div style="margin-bottom: 4px; font-weight: 500;">${date}</div>`;

      params.forEach(p => {
        if (!p.seriesName || p.seriesName === 'Temp Range') return; // Skip Temp Range entirely

        const name = p.seriesName;
        let value = p.value;
        let unit = '';
        let markerColor = '';

        // Add units and determine marker color
        if (name.startsWith('Wind↑')) {
          unit = ' km/h';
          markerColor = '#8E24AA';
        } else if (name.startsWith('RH%')) {
          unit = ' %';
          // RH% should not show marker
        } else if (name.startsWith('∑ Rain')) {
          unit = ' mm';
          markerColor = color;
        } else if (name.startsWith('T~')) {
          markerColor = '#0D47A1';
        } else if (name === 'Climate Norm') {
          // Climate Norm should not show marker
        }

        // Format value
        const formattedValue = typeof value === 'number' ? value.toFixed(1) : value;

        // Create marker
        let marker = '<span style="display: inline-block; width: 10px; margin-right: 5px;"></span>';
        if (markerColor) {
          marker = `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${markerColor}; margin-right: 5px;"></span>`;
        }

        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin: 2px 0;">
          <span>${marker}${name}</span>
          <span style="margin-left: 20px; font-weight: 600;">${formattedValue}${unit}</span>
        </div>`;
      });

      return html;
    }
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

export function renderCompare(ch, allSeries, colors, prefs = { showGrid: true, smoothing: 0 }, labels = []) {
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

  // Custom tooltip formatter to show only main series with colored markers
  const tooltip = {
    trigger: 'axis',
    backgroundColor: 'var(--bg-card)',
    borderColor: 'var(--border-color)',
    textStyle: { color: 'var(--text-primary)' },
    formatter: (params) => {
      if (!params || params.length === 0) return '';

      const date = params[0].axisValue;
      let html = `<div style="margin-bottom: 4px; font-weight: 500;">${date}</div>`;

      // Filter to show only main series
      const mainSeries = params.filter(p => {
        const name = p.seriesName;
        return name.startsWith('T~') || name.startsWith('Wind↑') || name.startsWith('RH%') || name.startsWith('∑ Rain') || name.startsWith('Climate Norm');
      });

      mainSeries.forEach(p => {
        const name = p.seriesName;
        let displayName = name;
        let value = p.value;
        let unit = '';

        // Extract city number to get color
        const cityNumMatch = name.match(/ (\d+)$/);
        const cityIdx = cityNumMatch ? parseInt(cityNumMatch[1]) - 1 : 0;
        const cityColor = colors[cityIdx] || colors[0];

        // Replace city number with city label (use word boundary to match only at the end)
        if (cityNumMatch) {
          const cityNum = parseInt(cityNumMatch[1]);
          const label = labels[cityNum - 1];
          if (label) {
            displayName = displayName.replace(/ \d+$/, ` ${label}`);
          }
        }

        // Add units
        if (name.startsWith('Wind↑')) {
          unit = ' km/h';
        } else if (name.startsWith('RH%')) {
          unit = ' %';
        } else if (name.startsWith('∑ Rain')) {
          unit = ' mm';
        }

        // Format value
        const formattedValue = typeof value === 'number' ? value.toFixed(1) : value;

        // Show marker only for T~ and ∑ Rain
        const showMarker = name.startsWith('T~') || name.startsWith('∑ Rain');
        let marker = '<span style="display: inline-block; width: 10px; margin-right: 5px;"></span>';
        if (showMarker) {
          marker = `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${cityColor}; margin-right: 5px;"></span>`;
        }

        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin: 2px 0;">
          <span>${marker}${displayName}</span>
          <span style="margin-left: 20px; font-weight: 600;">${formattedValue}${unit}</span>
        </div>`;
      });

      return html;
    }
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

  // Second pass: add climate norms (gray color)
  // Check if all norms are identical (periodic mode with same city)
  let showSingleNorm = false;
  if (allSeries.length > 1 && allSeries[0]?.norm && allSeries[1]?.norm) {
    const firstNorm = JSON.stringify(allSeries[0].norm);
    showSingleNorm = allSeries.every(s => s?.norm && JSON.stringify(s.norm) === firstNorm);
  }

  if (showSingleNorm) {
    // Periodic mode: same city, same norm - show only once
    tempSeries.push({
      name: 'Climate Norm',
      type: 'line',
      data: allSeries[0].norm,
      symbol: 'none',
      lineStyle: { color: '#616161', type: 'dashed', width: 1 },
      tooltip: { valueFormatter: valueFmt }
    });
  } else {
    // Comparison mode: different cities - show norm for each
    allSeries.forEach((series, idx) => {
      if (!series || idx >= colors.length) return;
      const cityNum = idx + 1;

      if (series.norm && prefs.showNormals) {
        tempSeries.push({
          name: `Climate Norm ${cityNum}`,
          type: 'line',
          data: series.norm,
          symbol: 'none',
          lineStyle: { color: '#616161', type: 'dashed', width: 1 },
          tooltip: { valueFormatter: valueFmt }
        });
      }
    });
  }

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

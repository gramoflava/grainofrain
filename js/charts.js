export function initCharts() {
  const temp = echarts.init(document.getElementById('chart-temp'));
  const hydro = echarts.init(document.getElementById('chart-hydro'));
  echarts.connect([temp, hydro]);
  return { temp, hydro };
}

export function renderAll(ch, series, color = '#1E88E5', prefs = { showGrid: true }) {
  const x = series.x;
  const tempRange = series.tempMax.map((max, i) => max - series.tempMin[i]);
  const windSeries = (series.windMax && series.windMax.length) ? series.windMax : series.wind;
  const windAxisMax = 200;
  const gridTop = { left: 60, right: 60, top: 60, bottom: 40 };
  const gridBottom = { left: 60, right: 60, top: 60, bottom: 50 };

  const baseXAxis = { type: 'category', data: x, boundaryGap: true, axisLabel: { hideOverlap: true } };
  const valueFmt = v => (typeof v === 'number' ? v.toFixed(1) : v);
  const tooltip = { trigger: 'axis', valueFormatter: valueFmt };

  const tempLegend = ['Temp Min', 'Temp Range', 'Temp Max', 'Temp Mean', 'Wind'];
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
    tempLegend.push('Climate Norm');
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
    title: { text: 'Temperature & Wind', left: 'left', top: 10, textStyle: { fontSize: 14 } },
    legend: { top: 30, left: 'left', data: tempLegend },
    grid: gridTop,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        name: '°C',
        nameGap: 55,
        nameLocation: 'middle',
        nameRotate: 90,
        splitLine: { show: prefs.showGrid }
      },
      {
        type: 'value',
        name: 'km/h',
        position: 'right',
        nameGap: 55,
        nameLocation: 'middle',
        nameRotate: -90,
        min: 0,
        max: windAxisMax,
        splitLine: { show: false },
        axisLabel: { formatter: '{value}' }
      }
    ],
    series: tempSeries
  });

  ch.hydro.setOption({
    animation: false,
    title: { text: 'Precipitation & Humidity', left: 'left', top: 10, textStyle: { fontSize: 14 } },
    legend: { top: 30, left: 'left', data: ['Precipitation', 'Humidity'] },
    grid: gridBottom,
    tooltip,
    xAxis: baseXAxis,
    yAxis: [
      {
        type: 'value',
        name: 'mm',
        nameGap: 55,
        nameLocation: 'middle',
        nameRotate: 90,
        splitLine: { show: prefs.showGrid }
      },
      {
        type: 'value',
        name: '%',
        position: 'right',
        min: 0,
        max: 100,
        nameGap: 55,
        nameLocation: 'middle',
        nameRotate: -90,
        splitLine: { show: false }
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

export function initCharts() {
  const temp = echarts.init(document.getElementById('chart-temp'));
  const precip = echarts.init(document.getElementById('chart-precip'));
  const humidity = echarts.init(document.getElementById('chart-humidity'));
  const wind = echarts.init(document.getElementById('chart-wind'));
  echarts.connect([temp, precip, humidity, wind]);
  return { temp, precip, humidity, wind };
}

export function renderAll(ch, series, color = '#1E88E5', prefs = {showGrid:true}) {
  const x = series.x;
  const tempRange = series.tempMax.map((max, i) => max - series.tempMin[i]);
  const grid = { left: 40, right: 10, top: 10, bottom: 20 };
  const common = { animation:false, xAxis:{type:'category', data:x, boundaryGap:false}, yAxis:{type:'value'}, grid, tooltip:{trigger:'axis'} };
  ch.temp.setOption({
    ...common,
    yAxis:{type:'value', name:'°C'},
    series:[
      {name:'Min', type:'line', data:series.tempMin, stack:'temp', lineStyle:{opacity:0}},
      {name:'Range', type:'line', data:tempRange, stack:'temp', lineStyle:{opacity:0}, areaStyle:{color, opacity:0.2}},
      {name:'Mean', type:'line', data:series.tempMean, lineStyle:{color, width:2}}
    ]
  });
  if (series.norm) {
    const opt = ch.temp.getOption();
    opt.series.push({name:'Norm', type:'line', data:series.norm, lineStyle:{color:'#616161', type:'dotted'}});
    ch.temp.setOption(opt);
  }
  ch.precip.setOption({
    ...common,
    yAxis:{type:'value', name:'mm'},
    series:[{name:'Precip', type:'bar', data:series.precip, itemStyle:{color:`${color}99`}}]
  });
  ch.humidity.setOption({
    ...common,
    yAxis:{type:'value', name:'%'},
    series:[{name:'Humidity', type:'line', data:series.humidity, areaStyle:{color:`${color}33`}, lineStyle:{color}}]
  });
  ch.wind.setOption({
    ...common,
    yAxis:{type:'value', name:'km/h'},
    series:[{name:'Wind', type:'line', data:series.wind, lineStyle:{color}}]
  });
}

async function fetchWeather(city, start, end) {
  if (!city || !start || !end) {
    throw new Error("Не заполнены все поля для " + city);
  }

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
  const geoRes = await fetch(geoUrl);
  const geoJson = await geoRes.json();
  if (!geoJson.results || !geoJson.results.length) {
    throw new Error("Город не найден: " + city);
  }
  const { latitude, longitude, name, country } = geoJson.results[0];

  const weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${start}&end_date=${end}&daily=temperature_2m_min,temperature_2m_mean,temperature_2m_max,precipitation_sum&timezone=UTC`;
  const wxRes = await fetch(weatherUrl);
  const wxJson = await wxRes.json();
  if (!wxJson || !wxJson.daily) {
    throw new Error("Нет данных погоды для " + city);
  }

  const dates = wxJson.daily.time;
  const min = wxJson.daily.temperature_2m_min;
  const mean = wxJson.daily.temperature_2m_mean;
  const max = wxJson.daily.temperature_2m_max;
  const prec = wxJson.daily.precipitation_sum;

  const minTemp = Math.min(...min);
  const maxTemp = Math.max(...max);
  const avgTemp = mean.reduce((acc, v) => acc + v, 0) / (mean.length || 1);
  const totalPrec = prec.reduce((acc, v) => acc + v, 0);

  return {
    label: `${name.trim()}, ${country} (${start} – ${end})`,
    dates,
    min,
    mean,
    max,
    prec,
    summary: { minTemp, maxTemp, avgTemp, totalPrec },
  };
}

module.exports = { fetchWeather };

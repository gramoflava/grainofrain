const { fetchWeather } = require('../fetchWeather');

global.fetch = jest.fn();

test('fetchWeather aggregates data and returns summary', async () => {
  const city = 'Testville';
  const start = '2023-01-01';
  const end = '2023-01-03';

  // geo
  fetch.mockResolvedValueOnce({
    json: async () => ({ results: [{ latitude:1, longitude:2, name:'Testville', country:'TV' }] })
  });
  // daily
  fetch.mockResolvedValueOnce({
    json: async () => ({
      daily: {
        time: [start, '2023-01-02', end],
        temperature_2m_min: [1,2,3],
        temperature_2m_mean: [2,3,4],
        temperature_2m_max: [3,4,5],
        precipitation_sum: [0,1,2],
        windspeed_10m_max: [10,12,15]
      }
    })
  });
  // hourly
  fetch.mockResolvedValueOnce({
    json: async () => ({
      hourly: {
        time: [
          start+'T00', start+'T12',
          '2023-01-02T00', '2023-01-02T12',
          end+'T00', end+'T12'
        ],
        relative_humidity_2m: [70,80,60,65,50,55],
        windspeed_10m: [5,10,6,12,7,14]
      }
    })
  });
  // normals
  fetch.mockResolvedValueOnce({
    json: async () => ({
      monthly: { temperature_2m_mean: [1,2,3,4,5,6,7,8,9,10,11,12] }
    })
  });

  const data = await fetchWeather(city, start, end);

  expect(fetch).toHaveBeenCalledTimes(4);
  expect(data.label).toBe('Testville, TV (' + start + ' – ' + end + ')');
  expect(data.summary.minTemp).toBe(1);
  expect(data.summary.maxTemp).toBe(5);
  expect(data.summary.avgTemp).toBe((2+3+4)/3);
  expect(data.summary.totalPrec).toBe(3);
  expect(data.summary.humAvg).toBeCloseTo((75+62.5+52.5)/3);
  expect(data.summary.windAvg).toBeCloseTo((7.5+9+10.5)/3);
  expect(data.summary.windMax).toBe(15);
});

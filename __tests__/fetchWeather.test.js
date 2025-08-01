const { fetchWeather } = require('../fetchWeather');

// Mock fetch
global.fetch = jest.fn();

test('fetchWeather returns expected summary and label', async () => {
  const city = 'Testville';
  const start = '2023-01-01';
  const end = '2023-01-03';

  // Mock geo API response
  fetch.mockResolvedValueOnce({
    json: async () => ({
      results: [
        { latitude: 1, longitude: 2, name: 'Testville', country: 'TV' }
      ]
    })
  });

  // Mock weather API response
  fetch.mockResolvedValueOnce({
    json: async () => ({
      daily: {
        time: [start, '2023-01-02', end],
        temperature_2m_min: [1, 2, 3],
        temperature_2m_mean: [2, 3, 4],
        temperature_2m_max: [3, 4, 5],
        precipitation_sum: [0, 1, 2]
      }
    })
  });

  const data = await fetchWeather(city, start, end);

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(data.label).toBe('Testville, TV (' + start + ' – ' + end + ')');
  expect(data.summary).toEqual({
    minTemp: 1,
    maxTemp: 5,
    avgTemp: (2 + 3 + 4) / 3,
    totalPrec: 3
  });
});

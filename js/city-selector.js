import { suggestCities } from './api.js';
import { escapeHtml, getUniqueCityKey } from './utils.js';

const cityCache = new Map();

export function createCitySelector({ input, dropdown, controlsId, onSelect }) {
  input.addEventListener('input', () => handleSearch(input, dropdown, onSelect));
  input.addEventListener('focus', () => {
    if (input.value.trim()) {
      handleSearch(input, dropdown, onSelect);
    }
  });

  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.city-input-wrapper');
    const isOurs = wrapper && wrapper.closest(`#${controlsId}`);
    if (!isOurs) {
      dropdown.classList.remove('visible');
    }
  });
}

async function handleSearch(input, dropdown, onSelect) {
  const query = input.value.trim();

  if (query.length < 2) {
    dropdown.classList.remove('visible');
    return;
  }

  try {
    const cities = await suggestCities(query);
    displaySuggestions(cities, dropdown, onSelect);
  } catch (err) {
    console.error('City search error:', err);
    dropdown.classList.remove('visible');
  }
}

function displaySuggestions(cities, dropdown, onSelect) {
  if (!cities || cities.length === 0) {
    dropdown.classList.remove('visible');
    return;
  }

  dropdown.innerHTML = cities.map(city => {
    const uniqueKey = getUniqueCityKey(city);
    cityCache.set(uniqueKey, city);

    return `
      <div class="city-option" data-city-key="${escapeHtml(uniqueKey)}">
        <div class="city-name">${escapeHtml(city.name)}</div>
        <div class="city-meta">${escapeHtml([city.admin1, city.country].filter(Boolean).join(', '))}</div>
        <div class="city-coords">${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°</div>
      </div>
    `;
  }).join('');

  dropdown.querySelectorAll('.city-option').forEach(option => {
    option.addEventListener('click', () => {
      const cityKey = option.getAttribute('data-city-key');
      const city = cityCache.get(cityKey);
      if (city) onSelect(city);
    });
  });

  dropdown.classList.add('visible');
}

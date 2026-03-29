const LS_KEY = 'gor-locations';

export function saveLocation(lat, lon, city) {
  try {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const map = getLocations();
    map[key] = {
      name: city.name || '',
      country: city.country || '',
      admin1: city.admin1 || ''
    };
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch { /* fail silently */ }
}

export function getLocations() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function locationLabel(latlonKey) {
  const loc = getLocations()[latlonKey];
  if (!loc || !loc.name) return latlonKey;
  return loc.country ? `${loc.name}, ${loc.country}` : loc.name;
}

const normalizeLocationKey = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s,.-]/g, ' ')
    .replace(/[\s,.-]+/g, ' ')
    .trim();
};

const KNOWN_LOCATIONS = new Map([
  ['beijing', { name: 'Beijing', latitude: 39.9042, longitude: 116.4074 }],
  ['shanghai', { name: 'Shanghai', latitude: 31.2304, longitude: 121.4737 }],
  ['shenzhen', { name: 'Shenzhen', latitude: 22.5431, longitude: 114.0579 }],
  ['guangzhou', { name: 'Guangzhou', latitude: 23.1291, longitude: 113.2644 }],
  ['hong kong', { name: 'Hong Kong', latitude: 22.3193, longitude: 114.1694 }],
  ['taipei', { name: 'Taipei', latitude: 25.033, longitude: 121.5654 }],
  ['tokyo', { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 }],
  ['seoul', { name: 'Seoul', latitude: 37.5665, longitude: 126.978 }],
  ['singapore', { name: 'Singapore', latitude: 1.3521, longitude: 103.8198 }],
  ['london', { name: 'London', latitude: 51.5074, longitude: -0.1278 }],
  ['paris', { name: 'Paris', latitude: 48.8566, longitude: 2.3522 }],
  ['berlin', { name: 'Berlin', latitude: 52.52, longitude: 13.405 }],
  ['rome', { name: 'Rome', latitude: 41.9028, longitude: 12.4964 }],
  ['madrid', { name: 'Madrid', latitude: 40.4168, longitude: -3.7038 }],
  ['new york', { name: 'New York', latitude: 40.7128, longitude: -74.006 }],
  ['new york city', { name: 'New York', latitude: 40.7128, longitude: -74.006 }],
  ['nyc', { name: 'New York', latitude: 40.7128, longitude: -74.006 }],
  ['los angeles', { name: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 }],
  ['san francisco', { name: 'San Francisco', latitude: 37.7749, longitude: -122.4194 }],
  ['chicago', { name: 'Chicago', latitude: 41.8781, longitude: -87.6298 }],
  ['toronto', { name: 'Toronto', latitude: 43.6532, longitude: -79.3832 }],
  ['vancouver', { name: 'Vancouver', latitude: 49.2827, longitude: -123.1207 }],
  ['sydney', { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 }],
  ['melbourne', { name: 'Melbourne', latitude: -37.8136, longitude: 144.9631 }],
  ['sao paulo', { name: 'Sao Paulo', latitude: -23.5558, longitude: -46.6396 }],
  ['mexico city', { name: 'Mexico City', latitude: 19.4326, longitude: -99.1332 }],
  ['cape town', { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 }],
  ['nairobi', { name: 'Nairobi', latitude: -1.2921, longitude: 36.8219 }],
  ['lagos', { name: 'Lagos', latitude: 6.5244, longitude: 3.3792 }],
  ['mumbai', { name: 'Mumbai', latitude: 19.076, longitude: 72.8777 }],
  ['delhi', { name: 'Delhi', latitude: 28.7041, longitude: 77.1025 }],
  ['bangalore', { name: 'Bangalore', latitude: 12.9716, longitude: 77.5946 }],
  ['dubai', { name: 'Dubai', latitude: 25.2048, longitude: 55.2708 }],
]);

const parseCoordinatePair = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const absFirst = Math.abs(first);
  const absSecond = Math.abs(second);
  if (absFirst <= 90 && absSecond <= 180) {
    return { latitude: first, longitude: second, source: 'coordinates' };
  }
  if (absFirst <= 180 && absSecond <= 90) {
    return { latitude: second, longitude: first, source: 'coordinates' };
  }
  return null;
};

const resolveLocationCoordinates = (birthLocation) => {
  if (typeof birthLocation !== 'string') return null;
  const trimmed = birthLocation.trim();
  if (!trimmed) return null;
  const parsedCoords = parseCoordinatePair(trimmed);
  if (parsedCoords) return parsedCoords;
  const key = normalizeLocationKey(trimmed);
  if (!key) return null;
  const entry = KNOWN_LOCATIONS.get(key);
  if (entry) return { ...entry, source: 'known' };
  for (const [knownKey, knownValue] of KNOWN_LOCATIONS.entries()) {
    if (key.includes(knownKey)) {
      return { ...knownValue, source: 'known' };
    }
  }
  return null;
};

const computeTrueSolarTime = ({
  birthYear,
  birthMonth,
  birthDay,
  birthHour,
  birthMinute = 0,
  timezoneOffsetMinutes,
  longitude,
}) => {
  if (!Number.isFinite(timezoneOffsetMinutes) || !Number.isFinite(longitude)) return null;
  const year = Number(birthYear);
  const month = Number(birthMonth);
  const day = Number(birthDay);
  const hour = Number(birthHour);
  const minute = Number.isFinite(Number(birthMinute)) ? Number(birthMinute) : 0;
  if (![year, month, day, hour].every(Number.isFinite)) return null;

  const offsetHours = timezoneOffsetMinutes / 60;
  const standardMeridian = offsetHours * 15;
  const correctionMinutes = (longitude - standardMeridian) * 4;
  const baseUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const correctedDate = new Date(baseUtc + correctionMinutes * 60000);

  return {
    applied: true,
    correctionMinutes: Math.round(correctionMinutes * 100) / 100,
    correctedDate,
    corrected: {
      year: correctedDate.getUTCFullYear(),
      month: correctedDate.getUTCMonth() + 1,
      day: correctedDate.getUTCDate(),
      hour: correctedDate.getUTCHours(),
      minute: correctedDate.getUTCMinutes(),
    },
  };
};

const listKnownLocations = () => {
  const seen = new Set();
  const locations = [];
  for (const location of KNOWN_LOCATIONS.values()) {
    if (!location) continue;
    const key = `${location.name ?? ''}|${location.latitude ?? ''}|${location.longitude ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({
      name: location.name ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }
  return locations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

export { normalizeLocationKey, resolveLocationCoordinates, computeTrueSolarTime, listKnownLocations };

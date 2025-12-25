export const ZODIAC_ORDER = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
];

export const normalizeAngle = (deg) => ((deg % 360) + 360) % 360;
export const degToRad = (deg) => (deg * Math.PI) / 180;
export const radToDeg = (rad) => (rad * 180) / Math.PI;

export const calculateRisingSign = ({
  birthYear,
  birthMonth,
  birthDay,
  birthHour,
  birthMinute,
  latitude,
  longitude,
  timezoneOffsetMinutes
}) => {
  const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
  const utcMillis = Date.UTC(
    birthYear,
    birthMonth - 1,
    birthDay,
    birthHour,
    birthMinute || 0,
    0
  ) - offsetMinutes * 60 * 1000;

  const jd = utcMillis / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const gmst = normalizeAngle(
    280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * t * t -
      (t * t * t) / 38710000
  );
  const lst = normalizeAngle(gmst + longitude);

  const theta = degToRad(lst);
  const epsilon = degToRad(23.439291 - 0.0130042 * t);
  const phi = degToRad(latitude);

  const ascRad = Math.atan2(
    -Math.cos(theta),
    Math.sin(theta) * Math.cos(epsilon) + Math.tan(phi) * Math.sin(epsilon)
  );
  const ascDeg = normalizeAngle(radToDeg(ascRad) + 180);
  const signIndex = Math.floor(ascDeg / 30);
  const signKey = ZODIAC_ORDER[signIndex] || 'aries';

  return {
    signKey,
    ascendant: {
      longitude: Number(ascDeg.toFixed(2)),
      localSiderealTime: Number((lst / 15).toFixed(2))
    }
  };
};

import express from 'express';
import { listKnownLocations } from '../services/solarTime.service.js';

const router = express.Router();

// Sorted once at module load: the table is static and the list is answered on every
// keystroke of a location autocomplete.
const KNOWN_LOCATIONS = listKnownLocations();

/**
 * GET /api/locations?search=<prefix>
 *
 * 返回**真太阳时校正真正认得的**地点。这里以前是一份写死的 5 个城市的假数据，和
 * `solarTime.service.js` 的 KNOWN_LOCATIONS 完全脱节——补全会提示引擎算不出经度的城市，
 * 又藏起引擎其实认得的城市。用户看到的是"填了出生地，但真太阳时没生效"，且无从排查。
 *
 * 现在两边同一份数据：这里列得出来的，`birthLocation` 就一定解析得出经纬度。
 * 引擎同时也接受 `"39.9,116.4"` 这种坐标串，那条路径不需要出现在补全里。
 */
router.get('/', (req, res) => {
  // A repeated query parameter (?search=a&search=b) arrives as an array, which has a
  // length but no toLowerCase. Only accept the string form.
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  // No search term lists everything: the table is small and a caller enumerating the
  // supported locations up front is a legitimate use, not an accident.
  if (!search) {
    return res.json(KNOWN_LOCATIONS);
  }

  const lowerSearch = search.toLowerCase();
  res.json(KNOWN_LOCATIONS.filter((item) => (item.name || '').toLowerCase().includes(lowerSearch)));
});

export default router;

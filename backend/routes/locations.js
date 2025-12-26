import express from 'express';
// import { requireAuth } from '../middleware/auth.js'; 
// Locations might be public? Usually yes for autocomplete.
// But if user specific, requireAuth. Assuming public for now or check frontend usage.
// Finding says "location lookup /api/locations".

const router = express.Router();

/**
 * GET /api/locations
 * Query params: search (string)
 */
router.get('/', async (req, res) => {
    const { search } = req.query;
    if (!search || search.length < 2) {
        return res.json([]);
    }

    // Stub: Return some dummy locations if search matches or empty
    // In real app: call external Geo API or query internal DB
    const dummyLocations = [
        { name: 'New York, NY', lat: 40.7128, lng: -74.0060, timezone: 'America/New_York' },
        { name: 'London, UK', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' },
        { name: 'Beijing, CN', lat: 39.9042, lng: 116.4074, timezone: 'Asia/Shanghai' },
        { name: 'Singapore', lat: 1.3521, lng: 103.8198, timezone: 'Asia/Singapore' },
        { name: 'Sydney, AU', lat: -33.8688, lng: 151.2093, timezone: 'Australia/Sydney' },
    ];

    const lowerSearch = search.toLowerCase();
    const results = dummyLocations.filter(L => L.name.toLowerCase().includes(lowerSearch));

    res.json(results);
});

export default router;

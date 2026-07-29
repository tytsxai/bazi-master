import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { listKnownLocations, resolveLocationCoordinates } from '../services/solarTime.service.js';

describe('GET /api/locations', () => {
  it('lists every known location when no search term is given', async () => {
    const res = await request(app).get('/api/locations').expect(200);

    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, listKnownLocations().length);
  });

  it('filters by substring, case-insensitively', async () => {
    const res = await request(app).get('/api/locations?search=new').expect(200);

    assert.ok(res.body.length > 0);
    assert.ok(res.body.every((item) => item.name.toLowerCase().includes('new')));
  });

  // The whole point of listing these rather than a separate hardcoded table: anything the
  // autocomplete offers must be something the true-solar-time correction can actually
  // resolve. A location that lists but does not resolve silently disables the correction.
  it('only offers locations the solar-time correction can resolve', async () => {
    const res = await request(app).get('/api/locations').expect(200);

    for (const item of res.body) {
      const resolved = resolveLocationCoordinates(item.name);
      assert.ok(resolved, `"${item.name}" is listed but does not resolve`);
      assert.equal(resolved.longitude, item.longitude);
      assert.equal(resolved.latitude, item.latitude);
    }
  });

  it('returns an empty array when nothing matches', async () => {
    const res = await request(app).get('/api/locations?search=zzzznowhere').expect(200);

    assert.deepEqual(res.body, []);
  });

  it('ignores a repeated search parameter rather than crashing', async () => {
    const res = await request(app).get('/api/locations?search=a&search=b').expect(200);

    // Array-valued query params fall back to "no search term", i.e. the full list.
    assert.equal(res.body.length, listKnownLocations().length);
  });

  it('returns 404 for unknown route', async () => {
    await request(app).get('/api/locations/unknown').expect(404);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getZodiacCompatibility,
  getZodiacHoroscope,
  getZodiacSign,
  postZodiacRising,
} from '../controllers/zodiac.controller.js';

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('Zodiac controller coverage', () => {
  it('getZodiacSign returns 400 for unknown sign', () => {
    const req = { params: { sign: 'not-a-sign' } };
    const res = createRes();

    getZodiacSign(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Unknown zodiac sign.');
  });

  it('getZodiacSign returns sign payload for valid sign', () => {
    const req = { params: { sign: 'aries' } };
    const res = createRes();

    getZodiacSign(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sign.key, 'aries');
    assert.equal(res.body.sign.value, 'aries');
    assert.ok(res.body.sign.name);
  });

  it('getZodiacCompatibility validates query params', () => {
    const req = { query: { primary: 'aries' } };
    const res = createRes();

    getZodiacCompatibility(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid zodiac signs provided.');
  });

  it('getZodiacCompatibility returns compatibility payload for valid signs', () => {
    const req = { query: { primary: 'aries', secondary: 'taurus' } };
    const res = createRes();

    getZodiacCompatibility(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.primary.key, 'aries');
    assert.equal(res.body.secondary.key, 'taurus');
    assert.equal(typeof res.body.score, 'number');
    assert.ok(res.body.level);
    assert.ok(res.body.summary);
  });

  it('getZodiacHoroscope validates sign and period', () => {
    const resBadSign = createRes();
    getZodiacHoroscope({ params: { sign: 'nope' }, query: {} }, resBadSign);
    assert.equal(resBadSign.statusCode, 400);
    assert.equal(resBadSign.body.error, 'Unknown zodiac sign.');

    const resBadPeriod = createRes();
    getZodiacHoroscope({ params: { sign: 'aries' }, query: { period: 'yearly' } }, resBadPeriod);
    assert.equal(resBadPeriod.statusCode, 400);
    assert.equal(resBadPeriod.body.error, 'Unknown horoscope period.');
  });

  it('getZodiacHoroscope returns horoscope payload', () => {
    const req = { params: { sign: 'aries' }, query: { period: 'daily' } };
    const res = createRes();

    getZodiacHoroscope(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sign.key, 'aries');
    assert.equal(res.body.period, 'daily');
    assert.ok(res.body.range);
    assert.ok(res.body.generatedAt);
    assert.ok(res.body.horoscope);
    assert.ok(res.body.horoscope.overview);
  });

  it('postZodiacRising validates input', () => {
    const resMissing = createRes();
    postZodiacRising({ body: {} }, resMissing);
    assert.equal(resMissing.statusCode, 400);
    assert.equal(resMissing.body.error, 'Birth date and time are required.');

    const resInvalid = createRes();
    postZodiacRising(
      {
        body: {
          birthDate: '2024-02-31',
          birthTime: '25:00',
          timezoneOffsetMinutes: 0,
          latitude: 0,
          longitude: 0,
        },
      },
      resInvalid
    );
    assert.equal(resInvalid.statusCode, 400);
    assert.equal(resInvalid.body.error, 'Invalid rising sign input.');
  });

  it('postZodiacRising returns rising sign payload for valid input', () => {
    const res = createRes();
    postZodiacRising(
      {
        body: {
          birthDate: '2000-01-01',
          birthTime: '12:30',
          timezoneOffsetMinutes: 0,
          latitude: 0,
          longitude: 0,
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.rising);
    assert.ok(res.body.rising.key);
    assert.ok(res.body.rising.name);
    assert.ok(res.body.ascendant);
    assert.equal(typeof res.body.ascendant.longitude, 'number');
  });
});

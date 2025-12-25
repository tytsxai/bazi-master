import test from 'node:test';
import assert from 'node:assert/strict';
import tarotDeck from '../data/tarotData.js';
import { drawTarot, getTarotSpreadConfig, TAROT_SPREADS } from '../tarot.js';

const makeRng = (values, fallback = 0.99) => {
  let index = 0;
  return () => (index < values.length ? values[index++] : fallback);
};

test('getTarotSpreadConfig falls back to SingleCard', () => {
  assert.strictEqual(getTarotSpreadConfig(), TAROT_SPREADS.SingleCard);
  assert.strictEqual(getTarotSpreadConfig('NotARealSpread'), TAROT_SPREADS.SingleCard);
  assert.strictEqual(getTarotSpreadConfig('ThreeCard'), TAROT_SPREADS.ThreeCard);
});

test('drawTarot returns three cards with correct position metadata', () => {
  const result = drawTarot({ spreadType: 'ThreeCard', rng: () => 0.99 });

  assert.equal(result.spreadType, 'ThreeCard');
  assert.equal(result.cards.length, 3);

  result.cards.forEach((card, index) => {
    const config = TAROT_SPREADS.ThreeCard.positions[index];
    assert.equal(card.position, index + 1);
    assert.equal(card.positionLabel, config.label);
    assert.equal(card.positionMeaning, config.meaning);
    assert.equal(card.isReversed, false);
  });

  assert.deepEqual(
    result.spreadMeta.positions,
    TAROT_SPREADS.ThreeCard.positions.map((position, index) => ({
      position: index + 1,
      label: position.label,
      meaning: position.meaning
    }))
  );
});

test('drawTarot does not repeat cards in Celtic Cross', () => {
  const result = drawTarot({ spreadType: 'CelticCross', rng: () => 0.99 });

  assert.equal(result.cards.length, 10);

  const ids = new Set(result.cards.map((card) => card.id));
  assert.equal(ids.size, result.cards.length);
});

test('drawTarot uses reversal threshold', () => {
  const shuffleCalls = Math.max(0, tarotDeck.length - 1);
  const values = new Array(shuffleCalls).fill(0.99).concat([0.0]);
  const rng = makeRng(values, 0.99);

  const result = drawTarot({ spreadType: 'SingleCard', rng });

  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].isReversed, true);
});

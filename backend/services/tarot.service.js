import tarotDeck from '../data/tarotData.js';

export const TAROT_SPREADS = {
  SingleCard: {
    count: 1,
    positions: [{ label: 'Insight', meaning: 'The core message to focus on right now.' }],
  },
  ThreeCard: {
    count: 3,
    positions: [
      { label: 'Past', meaning: 'What led to this moment.' },
      { label: 'Present', meaning: 'The current energy or situation.' },
      { label: 'Future', meaning: 'Likely direction if the path continues.' },
    ],
  },
  CelticCross: {
    count: 10,
    positions: [
      { label: 'Present', meaning: 'Your current situation or heart of the matter.' },
      { label: 'Challenge', meaning: 'The obstacle, tension, or crossing influence.' },
      { label: 'Past', meaning: 'Recent past events or influences fading.' },
      { label: 'Future', meaning: 'Near-future direction or next steps.' },
      { label: 'Above', meaning: 'Conscious goals, aspirations, or ideals.' },
      { label: 'Below', meaning: 'Subconscious roots, foundations, or hidden motives.' },
      { label: 'Advice', meaning: 'Guidance on how to respond or proceed.' },
      { label: 'External', meaning: 'Outside influences, people, or environment.' },
      { label: 'Hopes/Fears', meaning: 'Inner desires, anxieties, or expectations.' },
      { label: 'Outcome', meaning: 'Likely outcome if current course continues.' },
    ],
  },
};

export const getTarotSpreadConfig = (spreadType) => {
  if (!spreadType) return TAROT_SPREADS.SingleCard;
  return TAROT_SPREADS[spreadType] || TAROT_SPREADS.SingleCard;
};

const shuffleDeck = (deck, rng) => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
};

export const drawTarot = ({ spreadType = 'SingleCard', rng = Math.random } = {}) => {
  const normalizedSpread = spreadType || 'SingleCard';
  const spreadConfig = getTarotSpreadConfig(normalizedSpread);
  const positions = spreadConfig.positions || [];

  const shuffled = shuffleDeck(tarotDeck, rng);

  const drawCount = spreadConfig.count || 1;
  const drawnCards = shuffled.slice(0, drawCount).map((card, index) => ({
    ...card,
    position: index + 1,
    positionLabel: positions[index]?.label || spreadConfig.labels?.[index] || null,
    positionMeaning: positions[index]?.meaning || null,
    isReversed: rng() < 0.3,
  }));

  return {
    spreadType: normalizedSpread,
    cards: drawnCards,
    spreadMeta: {
      positions: positions.map((position, index) => ({
        position: index + 1,
        label: position.label,
        meaning: position.meaning,
      })),
    },
  };
};

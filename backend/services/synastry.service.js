import { getElementRelation, ELEMENTS } from './calculations.service.js';

export const calculateCompatibility = (chartA, chartB) => {
  if (!chartA || !chartB || !chartA.pillars || !chartB.pillars) {
    throw new Error('Invalid chart data for comparison');
  }

  const result = {
    score: 0, // 0-100
    insights: [],
    details: {
      dayMasterRelation: '',
      elementBalance: '',
      dayBranchRelation: '',
    },
  };

  let score = 0;

  // 1. Day Master Comparison (Most important)
  const dmA = chartA.pillars.day.elementStem;
  const dmB = chartB.pillars.day.elementStem;
  const dmRelation = getElementRelation(dmA, dmB);

  result.details.dayMasterRelation = `${dmA} and ${dmB} relation: ${dmRelation}`;

  if (dmRelation === 'Generates' || dmRelation === 'GeneratedBy') {
    score += 40;
    result.insights.push(
      `Strong emotional connection: The Day Masters support each other (${dmRelation}).`
    );
  } else if (dmRelation === 'Same') {
    score += 30;
    result.insights.push(
      'Great friendship potential: Detailed understanding due to similar nature.'
    );
  } else if (dmRelation === 'Controls' || dmRelation === 'ControlledBy') {
    score += 20;
    result.insights.push('Dynamic tension: Can be attractive but requires patience.');
  } else {
    score += 10;
  }

  // 2. Day Branch Comparison (Spouse Palace)
  // Simplified check for clash/combine (would need Branches Map/logic from calculation service strictly,
  // but for now we'll do a basic element check)
  const dbA = chartA.pillars.day.elementBranch;
  const dbB = chartB.pillars.day.elementBranch;
  const dbRelation = getElementRelation(dbA, dbB);

  result.details.dayBranchRelation = `${dbA} and ${dbB} relation: ${dbRelation}`;

  if (dbRelation === 'Generates' || dbRelation === 'GeneratedBy') {
    score += 30;
    result.insights.push('Harmonious domestic life: Spouse palaces are compatible.');
  } else if (dbRelation === 'Same') {
    score += 20;
    result.insights.push('Similar values in relationships.');
  } else {
    score += 10;
  }

  // 3. Five Element Balance (Complementary)
  // If A lacks Fire and B has lots of Fire -> Good
  const elementsA = chartA.fiveElementsPercent || {};
  const elementsB = chartB.fiveElementsPercent || {};

  let balanceScore = 0;
  let missingA = ELEMENTS.filter((e) => (elementsA[e] || 0) < 10);
  let missingB = ELEMENTS.filter((e) => (elementsB[e] || 0) < 10);

  // Check if B supplies what A misses
  missingA.forEach((e) => {
    if ((elementsB[e] || 0) > 30) {
      balanceScore += 10;
      result.insights.push(`Person B brings the ${e} element that Person A needs.`);
    }
  });

  // Check if A supplies what B misses
  missingB.forEach((e) => {
    if ((elementsA[e] || 0) > 30) {
      balanceScore += 10;
      result.insights.push(`Person A brings the ${e} element that Person B needs.`);
    }
  });

  score += Math.min(balanceScore, 30); // Cap balance score
  result.details.elementBalance = `Balance Score boost: ${Math.min(balanceScore, 30)}`;

  // Final Score Normalization
  result.score = Math.min(Math.round(score), 100);

  return result;
};

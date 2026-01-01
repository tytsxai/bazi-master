const buildBaziPrompt = ({ pillars, fiveElements, tenGods, luckCycles, strength }) => {
  const elementLines = fiveElements
    ? Object.entries(fiveElements)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')
    : '- Not provided';
  const tenGodLines = Array.isArray(tenGods)
    ? tenGods
        .filter((tg) => tg?.strength > 0)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5)
        .map((tg) => `- ${tg.name}: ${tg.strength}`)
        .join('\n')
    : '- Not provided';
  const luckLines = Array.isArray(luckCycles)
    ? luckCycles.map((cycle) => `- ${cycle.range}: ${cycle.stem}${cycle.branch}`).join('\n')
    : '- Not provided';

  const system =
    'You are a seasoned BaZi practitioner. Provide a concise, grounded interpretation in Markdown with sections: Summary, Key Patterns, Advice. Keep under 220 words.';
  const user = `
Day Master: ${pillars?.day?.stem || 'Unknown'} (${pillars?.day?.elementStem || 'Unknown'})
Month Pillar: ${pillars?.month?.stem || 'Unknown'} ${pillars?.month?.branch || 'Unknown'} (${pillars?.month?.elementBranch || 'Unknown'})
Five Elements:
${elementLines}
Ten Gods (top):
${tenGodLines}
Luck Cycles:
${luckLines}
Strength Notes: ${strength || 'Not provided'}
  `.trim();

  const fallback = () => {
    const summary = `A ${pillars?.day?.elementStem || 'balanced'} Day Master chart with notable elemental distribution.`;
    const patterns = tenGodLines;
    const advice =
      'Focus on balancing elements that are lower in count and lean into favorable cycles.';
    return `
## 🔮 BaZi Insight
**Summary:** ${summary}

**Key Patterns:**
${patterns}

**Advice:**
${advice}
    `.trim();
  };

  return { system, user, fallback };
};

const buildZiweiPrompt = ({ chart, birth }) => {
  const lunar = chart?.lunar || {};
  const mingPalace = chart?.mingPalace || {};
  const shenPalace = chart?.shenPalace || {};
  const transformations = Array.isArray(chart?.fourTransformations)
    ? chart.fourTransformations
        .map(
          (item) =>
            `${item.type?.toUpperCase?.() || item.type} ${item.starCn || item.starName || item.starKey}`
        )
        .filter(Boolean)
        .slice(0, 6)
        .join(', ')
    : 'None';
  const mingStars = Array.isArray(mingPalace?.stars?.major)
    ? mingPalace.stars.major
        .map((star) => star.cn || star.name || star.key)
        .filter(Boolean)
        .join(', ')
    : '';
  const shenStars = Array.isArray(shenPalace?.stars?.major)
    ? shenPalace.stars.major
        .map((star) => star.cn || star.name || star.key)
        .filter(Boolean)
        .join(', ')
    : '';

  const system =
    'You are a Zi Wei Dou Shu interpreter. Provide a concise interpretation in Markdown with sections: Overview, Key Palaces, Transformations, Guidance. Keep under 220 words.';
  const user = `
Birth: ${birth?.birthYear || '?'}-${birth?.birthMonth || '?'}-${birth?.birthDay || '?'} ${birth?.birthHour ?? '?'}h
Gender: ${birth?.gender || 'Unknown'}
Lunar: ${lunar.year || '?'}年 ${lunar.month || '?'}月 ${lunar.day || '?'}日 ${lunar.isLeap ? '(Leap)' : ''}
Ming Palace: ${mingPalace?.palace?.cn || mingPalace?.palace?.name || 'Unknown'} · ${mingPalace?.branch?.name || 'Unknown'}
Ming Major Stars: ${mingStars || 'None'}
Shen Palace: ${shenPalace?.palace?.cn || shenPalace?.palace?.name || 'Unknown'} · ${shenPalace?.branch?.name || 'Unknown'}
Shen Major Stars: ${shenStars || 'None'}
Four Transformations: ${transformations}
  `.trim();
  const fallback = () => {
    const overview =
      'Your chart highlights distinct strengths rooted in the Ming and Shen palaces, with transformations signaling key growth themes.';
    const keyPalaces =
      'Focus on the Ming palace qualities and how the Shen palace supports your life direction.';
    const transformationsText = 'Notice where your chart emphasizes momentum or restraint.';
    const guidance =
      'Align daily decisions with the strongest palace energies and lean into balanced actions.';
    return `
## 🌌 Zi Wei Interpretation
**Overview:** ${overview}

**Key Palaces:** ${keyPalaces}

**Transformations:** ${transformationsText}

**Guidance:** ${guidance}
    `.trim();
  };

  return { system, user, fallback };
};

const getChatSystemPrompt = (mode, context) => {
  const baseDefaults =
    'You are a helpful and wise BaZi Fortune Assistant. You help users understand their destiny, fortune, and BaZi charts. Be polite, mystical yet grounded, and helpful.';

  let prompt = '';
  switch (mode) {
    case 'love':
      prompt =
        'You are an expert in Chinese Metaphysics focusing on relationships and love. Use BaZi concepts (Elements, Ten Gods like Husband/Wife star) to give relationship advice. Be empathetic but honest about compatibility and timing.';
      break;
    case 'career':
      prompt =
        'You are a career strategist using BaZi insights. Focus on the Officer and Wealth stars, element strengths, and favorable industries. Provide actionable career guidance.';
      break;
    case 'wealth':
      prompt =
        'You are a financial luck consultant using BaZi. Focus on Wealth stars (Direct/Indirect Wealth) and element flows. Analyze wealth potential and timing for financial decisions.';
      break;
    case 'general':
    default:
      prompt = baseDefaults;
      break;
  }

  if (context && context.pillars) {
    const { pillars, fiveElements } = context;
    const dm = pillars.day ? `${pillars.day.stem} (${pillars.day.elementStem})` : 'Unknown';
    const elementSummary = fiveElements
      ? Object.entries(fiveElements)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')
      : '';

    prompt += `\n\n[User's BaZi Context]\nDay Master: ${dm}\nElements: ${elementSummary}\nUse this context to personalize your advice.`;
  }

  return prompt;
};

export { buildBaziPrompt, buildZiweiPrompt, getChatSystemPrompt };

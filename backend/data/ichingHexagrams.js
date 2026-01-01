const TRIGRAMS = [
  { id: 1, name: 'Qian', element: 'Heaven', lines: [1, 1, 1] },
  { id: 2, name: 'Dui', element: 'Lake', lines: [1, 1, 0] },
  { id: 3, name: 'Li', element: 'Fire', lines: [1, 0, 1] },
  { id: 4, name: 'Zhen', element: 'Thunder', lines: [1, 0, 0] },
  { id: 5, name: 'Xun', element: 'Wind', lines: [0, 1, 1] },
  { id: 6, name: 'Kan', element: 'Water', lines: [0, 1, 0] },
  { id: 7, name: 'Gen', element: 'Mountain', lines: [0, 0, 1] },
  { id: 8, name: 'Kun', element: 'Earth', lines: [0, 0, 0] },
];

const hexagrams = [];
const hexagramByTrigrams = new Map();
const hexagramByLines = new Map();

TRIGRAMS.forEach((upper) => {
  TRIGRAMS.forEach((lower) => {
    const lines = [...lower.lines, ...upper.lines];
    const id = hexagrams.length + 1;
    const name = `${upper.element} over ${lower.element}`;
    const title = `${upper.name} / ${lower.name}`;
    const summary = `Balance ${upper.element} above ${lower.element} to reveal the lesson.`;
    const hexagram = {
      id,
      name,
      title,
      summary,
      upperTrigram: upper,
      lowerTrigram: lower,
      lines,
    };
    hexagrams.push(hexagram);
    hexagramByTrigrams.set(`${upper.id}-${lower.id}`, hexagram);
    hexagramByLines.set(lines.join(''), hexagram);
  });
});

export { TRIGRAMS, hexagrams, hexagramByTrigrams, hexagramByLines };
export default hexagrams;

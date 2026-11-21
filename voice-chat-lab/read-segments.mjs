const counted = /[\p{L}\p{N}]/u;
const sentenceEnd = /[。！？!?；;\n]/u;
const clauseEnd = /[，、：,:]/u;
const space = /\s/u;
const digit = /\p{N}/u;

export function splitText(input, { min = 30, max = 50, target = 42 } = {}) {
  const characters = Array.from(input.trim());
  const ends = [0];
  const strengths = [0];
  let count = 0;
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    if (counted.test(character)) {
      count++;
      strengths[count] = 0;
    } else if (count > 0) {
      const decimal = character === '.' && digit.test(characters[index - 1] ?? '') && digit.test(characters[index + 1] ?? '');
      if (!decimal) {
        const strength = sentenceEnd.test(character) || character === '.' ? 18 : clauseEnd.test(character) ? 10 : space.test(character) ? 3 : 0;
        strengths[count] = Math.max(strengths[count], strength);
      }
    }
    ends[count] = index + 1;
  }

  const segments = [];
  let start = 0;
  while (start < count) {
    const remaining = count - start;
    let size = remaining;
    if (remaining > max) {
      const slots = Math.ceil(remaining / max);
      const low = Math.max(min, remaining - (slots - 1) * max);
      const high = Math.min(max, remaining - (slots - 1) * min);
      const aim = Math.max(low, Math.min(target, Math.round(remaining / slots)));
      function bestBoundary(from, through) {
        let best, score = Infinity;
        for (let length = from; length <= through; length++) {
          const strength = strengths[start + length];
          if (strength && Math.abs(length - aim) - strength < score) {
            best = length;
            score = Math.abs(length - aim) - strength;
          }
        }
        return best;
      }
      size = bestBoundary(low, high) ?? bestBoundary(min, max) ?? aim;
    }
    const end = start + size;
    const from = start === 0 ? 0 : ends[start];
    segments.push({ text: characters.slice(from, ends[end]).join('').trim(), count: size });
    start = end;
  }
  return segments;
}

const UNITS = [
  // Korean
  '큰술', '작은술', '숟가락', '스푼', '티스푼', '컵', '공기', '그릇', '개', '알', '쪽', '톨', '줌', '꼬집', '장', '대', '모',
  '봉지', '봉', '팩', '캔', '근', '줄기', '뿌리', '마리', '조각', '바퀴',
  // English
  'tablespoons', 'tablespoon', 'tbsps', 'tbsp', 'tbs', 'teaspoons', 'teaspoon', 'tsps', 'tsp', 'cups', 'cup',
  'grams', 'gram', 'g', 'kilograms', 'kilogram', 'kg', 'milliliters', 'milliliter', 'millilitres', 'millilitre', 'ml',
  'liters', 'liter', 'litres', 'litre', 'l', 'fl oz', 'fluid ounces', 'fluid ounce', 'oz', 'ounces', 'ounce',
  'lb', 'lbs', 'pounds', 'pound', 'pints', 'pint', 'quarts', 'quart', 'sticks', 'stick', 'cloves', 'clove',
  'pinches', 'pinch', 'dashes', 'dash', 'splashes', 'splash', 'handfuls', 'handful', 'slices', 'slice',
  'pieces', 'piece', 'cans', 'can', 'sprigs', 'sprig', 'bunches', 'bunch', 'heads', 'head',
  // Metric written in Korean
  '그램', '킬로그램', '밀리리터', '리터',
].sort((a, b) => b.length - a.length);

const QUALITATIVE = ['약간', '조금', '적당량', '적당히', '취향껏', '넉넉히', '듬뿍', '한가득'];
const QUALITATIVE_EN = /\b(?:to taste|as needed|as much as you (?:like|want)|a little|a bit|some|optional|for (?:garnish|serving|frying))\b/i;

const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75 };
const KOREAN_NUMBERS = { 반: 0.5, 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 석: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const ENGLISH_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, half: 0.5, quarter: 0.25, 'a half': 0.5, 'a quarter': 0.25, 'one half': 0.5, 'a couple of': 2, 'a couple': 2,
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byLength = (o) => Object.keys(o).sort((a, b) => b.length - a.length);
const KOREAN_RE = byLength(KOREAN_NUMBERS).join('|');
// English number words must end a word: "a" is not the start of "about".
const ENGLISH_RE = byLength(ENGLISH_NUMBERS).map((w) => `${escape(w).replace(/ /g, '\\s+')}(?![a-z])`).join('|');
const FRACTION_CHARS = Object.keys(FRACTIONS).join('');
// "1 1/2", "1½", "1/2", "1.5", "½", "두", "two"
const NUM = String.raw`(\d+\s+\d+\s*\/\s*\d+|\d+[${FRACTION_CHARS}]|\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[${FRACTION_CHARS}]|${ENGLISH_RE}|${KOREAN_RE})`;
const UNIT_RE = UNITS.map((u) => escape(u).replace(/ /g, '\\s*')).join('|');
// An English unit must end a word: "2 garlic" has no unit "g".
const AMOUNT_RE = new RegExp(
  String.raw`^${NUM}(?:\s*(?:[~\-–]|to|or)\s*${NUM})?(\s+and\s+a\s+half)?\s*(?:(${UNIT_RE})(?![a-z]))?(?:\s*반)?\s*(.*)$`,
  'i',
);
// "약 2큰술", "about 2 cups": the hedge word does not change the amount.
const HEDGE = /^(?:약\s+|about\s+|around\s+|approx(?:imately|\.)?\s+|roughly\s+|~\s*)/i;

function toNumber(raw) {
  if (raw == null) return null;
  const word = raw.toLowerCase().replace(/\s+/g, ' ');
  if (raw in FRACTIONS) return FRACTIONS[raw];
  if (raw in KOREAN_NUMBERS) return KOREAN_NUMBERS[raw];
  if (word in ENGLISH_NUMBERS) return ENGLISH_NUMBERS[word];
  const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[3]) ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : null;
  const glued = raw.match(new RegExp(`^(\\d+)([${FRACTION_CHARS}])$`));
  if (glued) return Number(glued[1]) + FRACTIONS[glued[2]];
  const clean = raw.replace(',', '.').replace(/\s/g, '');
  if (clean.includes('/')) {
    const [a, b] = clean.split('/').map(Number);
    return b ? a / b : null;
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

// Parses the verbatim amount ("2스푼", "1~2큰술", "한 줌", "반 개", "약간", "1 1/2 cups", "two cloves", "a pinch")
// into quantity/unit for validation and evaluation only; the UI always shows the original text.
export function parseAmount(amount) {
  const empty = { quantity: null, quantity2: null, unit: null, qualitative: false };
  if (amount == null) return empty;
  const text = amount.trim().replace(HEDGE, '');
  if (!text) return empty;
  if (QUALITATIVE.some((q) => text.includes(q))) return { ...empty, qualitative: true };

  const m = text.match(AMOUNT_RE);
  if (!m) return QUALITATIVE_EN.test(text) ? { ...empty, qualitative: true } : empty;
  let quantity = toNumber(m[1]);
  let quantity2 = toNumber(m[2]);
  // "one and a half cups" means 1.5.
  if (m[3] && quantity != null) {
    if (quantity2 != null) quantity2 += 0.5;
    else quantity += 0.5;
  }
  // "한 개 반" means 1.5.
  if (quantity != null && /반\s*$/.test(text.slice(0, text.length - m[5].length)) && m[1] !== '반') quantity += 0.5;
  return { quantity, quantity2, unit: m[4] ? m[4].replace(/\s+/g, ' ') : null, qualitative: false };
}

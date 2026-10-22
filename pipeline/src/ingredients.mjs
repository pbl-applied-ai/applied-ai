const UNITS = [
  // Korean
  '큰술', '작은술', '숟가락', '스푼', '티스푼', '컵', '공기', '그릇', '개', '알', '쪽', '톨', '줌', '꼬집', '장', '대', '모',
  '봉지', '봉', '팩', '캔', '근', '줄기', '뿌리', '마리', '조각', '바퀴',
  // English
  'tablespoons', 'tablespoon', 'tbsp', 'teaspoons', 'teaspoon', 'tsp', 'cups', 'cup', 'grams', 'gram', 'g', 'kg',
  'ml', 'l', 'oz', 'ounces', 'ounce', 'lb', 'lbs', 'pounds', 'pound', 'cloves', 'clove', 'pinch', 'slices', 'slice',
  // Metric written in Korean
  '그램', '킬로그램', '밀리리터', '리터',
].sort((a, b) => b.length - a.length);

const QUALITATIVE = ['약간', '조금', '적당량', '적당히', '취향껏', '넉넉히', '듬뿍', '한가득'];

const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75 };
const KOREAN_NUMBERS = { 반: 0.5, 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 석: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KOREAN_RE = Object.keys(KOREAN_NUMBERS).sort((a, b) => b.length - a.length).join('|');
const NUM = String.raw`(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾]|${KOREAN_RE})`;
const UNIT_RE = UNITS.map(escape).join('|');
const AMOUNT_RE = new RegExp(String.raw`^${NUM}(?:\s*[~\-–]\s*${NUM})?\s*(${UNIT_RE})?(?:\s*반)?\s*(.*)$`, 'i');

function toNumber(raw) {
  if (raw == null) return null;
  if (raw in FRACTIONS) return FRACTIONS[raw];
  if (raw in KOREAN_NUMBERS) return KOREAN_NUMBERS[raw];
  const clean = raw.replace(',', '.').replace(/\s/g, '');
  if (clean.includes('/')) {
    const [a, b] = clean.split('/').map(Number);
    return b ? a / b : null;
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

// Parses the verbatim amount ("2스푼", "1~2큰술", "한 줌", "반 개", "약간") into
// quantity/unit for validation and evaluation only; the UI always shows the original text.
export function parseAmount(amount) {
  const empty = { quantity: null, quantity2: null, unit: null, qualitative: false };
  if (amount == null) return empty;
  const text = amount.trim();
  if (!text) return empty;
  if (QUALITATIVE.some((q) => text.includes(q))) return { ...empty, qualitative: true };

  const m = text.match(AMOUNT_RE);
  if (!m) return empty;
  let quantity = toNumber(m[1]);
  // "한 개 반" means 1.5.
  if (quantity != null && /반\s*$/.test(text.slice(0, text.length - m[4].length)) && m[1] !== '반') quantity += 0.5;
  return { quantity, quantity2: toNumber(m[2]), unit: m[3] ?? null, qualitative: false };
}

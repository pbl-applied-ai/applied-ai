// 미국식 단위(컵·온스·파운드 등)로 적힌 분량을 ml·g로 바꾼 참고값. 원문 분량은 그대로 보여 주고 옆에 덧붙인다.
// 큰술·작은술(tbsp·tsp)은 나라마다 거의 같아 바꾸지 않는다. 한국어 "컵"(200ml 기준)도 바꾸지 않는다.

type Conversion = { to: "ml" | "g"; factor: number };

const CONVERSIONS: [RegExp, Conversion][] = [
  [/^(?:fl\.?\s*oz|fluid\s+ounces?)$/, { to: "ml", factor: 29.57 }],
  [/^(?:cups?|c)$/, { to: "ml", factor: 240 }],
  [/^(?:pints?|pt)$/, { to: "ml", factor: 473 }],
  [/^(?:quarts?|qt)$/, { to: "ml", factor: 946 }],
  [/^(?:gallons?|gal)$/, { to: "ml", factor: 3785 }],
  [/^(?:oz|ounces?)$/, { to: "g", factor: 28.35 }],
  [/^(?:lbs?|pounds?)$/, { to: "g", factor: 453.6 }],
  [/^sticks?$/, { to: "g", factor: 113 }], // 버터 1스틱
];

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5, quarter: 0.25,
};
const FRACTIONS: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75 };

const NUM = String.raw`(\d+\s+\d+\/\d+|\d+[½⅓⅔¼¾]|\d+(?:\.\d+)?(?:\/\d+)?|[½⅓⅔¼¾]|${Object.keys(WORDS).join("|")})`;
const AMOUNT = new RegExp(
  String.raw`^(?:about\s+|around\s+|approx\.?\s+|~\s*)?${NUM}(?:\s*(?:-|–|~|to|or)\s*${NUM})?(\s+and\s+a\s+half)?\s*(fl\.?\s*oz|fluid\s+ounces?|[a-z]+)\.?(?![a-z])`,
  "i",
);

function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const word = raw.toLowerCase();
  if (word in WORDS) return WORDS[word];
  if (raw in FRACTIONS) return FRACTIONS[raw];
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[3]) ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : null;
  const glued = raw.match(/^(\d+)([½⅓⅔¼¾])$/);
  if (glued) return Number(glued[1]) + FRACTIONS[glued[2]];
  if (raw.includes("/")) {
    const [a, b] = raw.split("/").map(Number);
    return b ? a / b : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function round(value: number): number {
  if (value < 10) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}

function format(value: number, to: "ml" | "g"): string {
  if (value >= 1000) return `${(Math.round(value / 100) / 10).toString()}${to === "ml" ? "L" : "kg"}`;
  return `${round(value)}${to}`;
}

/** "1 cup" → "약 240ml", "8 oz" → "약 230g", "2-3 cups" → "약 480~720ml". 바꿀 단위가 아니면 null. */
export function metricHint(amount: string | null | undefined): string | null {
  if (!amount) return null;
  const text = amount.trim();
  // 이미 미터법 값이 같이 적혀 있으면("1 cup (240ml)") 덧붙이지 않는다.
  if (/\d\s*(?:ml|g|kg|l|liters?|litres?|grams?)\b/i.test(text)) return null;
  const m = text.match(AMOUNT);
  if (!m) return null;
  const conv = CONVERSIONS.find(([re]) => re.test(m[4].toLowerCase().replace(/\s+/g, " ")))?.[1];
  if (!conv) return null;
  let a = toNumber(m[1]);
  let b = toNumber(m[2]);
  if (a == null) return null;
  if (m[3]) {
    if (b != null) b += 0.5;
    else a += 0.5;
  }
  const low = format(a * conv.factor, conv.to);
  if (b == null) return `약 ${low}`;
  return `약 ${low.replace(/(ml|g|L|kg)$/, "")}~${format(b * conv.factor, conv.to)}`;
}

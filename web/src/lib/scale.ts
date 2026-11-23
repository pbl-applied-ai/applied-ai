// 몇 인분 조절(+/−). 레시피 화면에서만 분량 글자를 비율대로 바꿔 보여 준다. 저장된 값은 바꾸지 않는다.
// 숫자로 시작하는 분량만 바꾼다("2 tbsp", "1 1/2 cups", "2-3 cloves"). "a little bit", "to taste", "a pinch"는 그대로 둔다.
// 괄호 안 숫자는 앞 단위가 계량 단위일 때만 같이 바꾼다: "1360g (48oz)" → 둘 다, "1 can (15 oz)" → 통 크기라 그대로.

const FRACTIONS: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8 };
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5,
};

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛]|\d+(?:\.\d+)?(?:\/\d+)?|[½⅓⅔¼¾⅛]|(?:${Object.keys(WORDS).join("|")})\b)`;
const LEADING = new RegExp(String.raw`^(\s*(?:about\s+|around\s+|approx\.?\s+|~\s*)?)(${NUM})(?:(\s*(?:-|–|to)\s*)(${NUM}))?(?![\d/])`, "i");
const IN_PARENS = new RegExp(String.raw`\(([^()]*)\)`, "g");
const NUM_GLOBAL = new RegExp(String.raw`${NUM}(?![\d/])`, "gi");

// 계량 단위(무게·부피). 이 단위 뒤의 괄호는 같은 양을 다른 단위로 적은 것이라 같이 바꾼다.
const MEASURE = /^(?:g|grams?|kg|kilograms?|mg|ml|milliliters?|millilitres?|l|liters?|litres?|oz|ounces?|fl\.?\s*oz|lbs?|pounds?|cups?|c|tbsps?|tablespoons?|tsps?|teaspoons?|pints?|quarts?|qt|gallons?)\b/i;
const METRIC = /^(?:g|grams?|kg|mg|ml|l|liters?|litres?)\b/i;

// 2 이상이 되면 복수형으로 바꾸는 단위. 사전에 없는 말은 그대로 둔다("2 egg"보다 원문을 덜 건드리는 쪽).
const PLURAL: Record<string, string> = {
  cup: "cups", can: "cans", clove: "cloves", stick: "sticks", pound: "pounds", ounce: "ounces", tablespoon: "tablespoons",
  teaspoon: "teaspoons", slice: "slices", piece: "pieces", sprig: "sprigs", bunch: "bunches", head: "heads", jar: "jars",
  package: "packages", packet: "packets", bag: "bags", box: "boxes", bottle: "bottles", handful: "handfuls", pinch: "pinches",
  dash: "dashes", egg: "eggs", onion: "onions", lemon: "lemons", lime: "limes", potato: "potatoes", tomato: "tomatoes",
};
const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([one, many]) => [many, one]));

function toNumber(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (text in WORDS) return WORDS[text];
  if (text in FRACTIONS) return FRACTIONS[text];
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[3]) ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : null;
  const glued = text.match(/^(\d+)\s*([½⅓⅔¼¾⅛])$/);
  if (glued) return Number(glued[1]) + FRACTIONS[glued[2]];
  if (text.includes("/")) {
    const [a, b] = text.split("/").map(Number);
    return b ? a / b : null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const NICE: [number, string][] = [
  [1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"],
];

/** 숫자를 레시피에 쓰는 모양으로. 미국 단위는 1/2·1/3 같은 분수, 미터법(g·ml)은 정수로 반올림한다. */
export function formatQuantity(value: number, metric = false): string {
  if (metric || value >= 10) {
    if (metric && value >= 100) return String(Math.round(value / 5) * 5);
    return String(Math.round(value));
  }
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < 0.06) return String(whole || NICE[0][1]);
  if (rest > 0.94) return String(whole + 1);
  const [, frac] = NICE.reduce((best, cur) => (Math.abs(cur[0] - rest) < Math.abs(best[0] - rest) ? cur : best));
  // 가까운 분수가 없으면(0.4 같은 값) 소수 한 자리
  const near = NICE.some(([v]) => Math.abs(v - rest) < 0.05);
  if (!near) return (Math.round(value * 10) / 10).toString();
  return whole ? `${whole} ${frac}` : frac;
}

function fixPlural(rest: string, value: number): string {
  const m = rest.match(/^(\s*)([a-z]+)/i);
  if (!m) return rest;
  const word = m[2].toLowerCase();
  const swap = value > 1 ? PLURAL[word] : SINGULAR[word];
  if (!swap) return rest;
  return m[1] + swap + rest.slice(m[0].length);
}

/** 분량 글자를 factor배로. 바꿀 숫자가 없으면 원문 그대로. */
export function scaleAmount(text: string, factor: number): string {
  if (factor === 1) return text;
  const m = text.match(LEADING);
  if (!m) return text;
  const a = toNumber(m[2]);
  const b = m[4] != null ? toNumber(m[4]) : null;
  if (a == null || (m[4] != null && b == null)) return text;
  let rest = text.slice(m[0].length);
  const metric = METRIC.test(rest.trim());
  const scaled = (v: number) => formatQuantity(v * factor, metric);
  const quantity = b != null ? `${scaled(a)}${m[3]}${scaled(b)}` : scaled(a);
  rest = fixPlural(rest, (b ?? a) * factor);
  if (MEASURE.test(rest.trim())) {
    rest = rest.replace(IN_PARENS, (whole, inner: string) => {
      const innerMetric = /\d\s*(?:g|kg|ml|l)\b/i.test(inner);
      return `(${inner.replace(NUM_GLOBAL, (n) => {
        const v = toNumber(n);
        return v == null ? n : formatQuantity(v * factor, innerMetric);
      })})`;
    });
  }
  return `${m[1]}${quantity}${rest}`;
}

export type Servings = { count: number; unit: string };

/** "Serves 4" → 4 servings, "Makes: 8 cookies" → 8 cookies, "Serves 1-2" → 2 servings(큰 쪽). 숫자가 없으면 null. */
export function parseServings(raw: string | null | undefined): Servings | null {
  if (!raw) return null;
  const m = raw.match(/(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*([a-z]+)?/i);
  if (!m) return null;
  const count = Number(m[2] ?? m[1]);
  if (!count || count > 100) return null;
  const word = m[3]?.toLowerCase();
  const unit = word && !/^(?:serv|people|person|portion)/.test(word) ? word : "servings";
  return { count, unit };
}

/** 인분이 없을 때 고르는 배수. */
export const BATCH_STEPS = [0.5, 1, 1.5, 2, 3, 4] as const;

export function servingsLabel(count: number, unit: string): string {
  if (unit === "servings") return `${count} serving${count === 1 ? "" : "s"}`;
  return `${count} ${count === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit}`;
}

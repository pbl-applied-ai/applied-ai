import { parseAmount } from './ingredients.mjs';

const squash = (s) => s.replace(/\s+/g, '');
const optional = (s) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t && !/^(null|none|n\/a)$/i.test(t) ? t : null;
};

function citations(ids, byId, label, warnings) {
  const valid = [];
  for (const id of ids || []) {
    if (byId.has(id)) {
      if (!valid.includes(id)) valid.push(id);
    } else {
      warnings.push(`${label}: dropped unknown evidence ${id}`);
    }
  }
  return valid;
}

function earliestStart(ids, byId) {
  const starts = ids.map((id) => byId.get(id).startMs).filter((ms) => ms != null);
  return starts.length ? Math.min(...starts) : null;
}

const evidenceRefs = (ids, byId) =>
  ids.map((id) => {
    const s = byId.get(id);
    return { segment_id: id, kind: s.kind, start_ms: s.startMs, text: s.text };
  });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALTERNATIVE = '(?:이나|나|또는|혹은|아니면|or)';

// Adjacent ingredients the evidence offers as alternatives ("쪽파나 대파") become one item.
function mergeAlternatives(list, byId, warnings) {
  const out = [];
  for (const ing of list) {
    const prev = out[out.length - 1];
    if (prev && !prev.is_group_header && !ing.is_group_header && (prev.preparation ?? null) === (ing.preparation ?? null)) {
      const re = new RegExp(`${escapeRe(squash(prev.name))}${ALTERNATIVE}.{0,4}${escapeRe(squash(ing.name))}`, 'i');
      const shared = [...new Set([...(prev.evidence || []), ...(ing.evidence || [])])].filter((id) => byId.has(id));
      if (shared.some((id) => re.test(squash(byId.get(id).text)))) {
        warnings.push(`ingredients "${prev.name}" and "${ing.name}" are alternatives, merged`);
        out[out.length - 1] = {
          ...prev,
          name: `${prev.name} 또는 ${ing.name}`,
          amounts: [...(prev.amounts || []), ...(ing.amounts || [])],
          evidence: shared,
        };
        continue;
      }
    }
    out.push(ing);
  }
  return out;
}

const UNIT_FAMILY = {
  큰술: 'spoon', 숟가락: 'spoon', 스푼: 'spoon', tablespoon: 'spoon', tablespoons: 'spoon', tbsp: 'spoon',
  작은술: 'teaspoon', 티스푼: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon', tsp: 'teaspoon',
  컵: 'cup', cup: 'cup', cups: 'cup', g: 'g', 그램: 'g', gram: 'g', grams: 'g', ml: 'ml', 밀리리터: 'ml',
};
const unitFamily = (u) => (u ? UNIT_FAMILY[u.toLowerCase()] ?? u.toLowerCase() : null);
const NUMBER_ONLY = /^[\d.,/\s~\-–½⅓⅔¼¾]+$/;

const fold = (s) => squash(s).toLowerCase();
const DIGIT_BEFORE = /(?:\d|\d[.,/~\-–])$/;
const DIGIT_AFTER = /^(?:\d|[.,/]\d)/;

const KOREAN_UNITS = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const KOREAN_TENS = ['열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const KOREAN_LEADING = new RegExp(`^(${[...KOREAN_UNITS, ...KOREAN_TENS].join('|')})`);
// Positions in the space-free text where a word of the original text begins.
function wordStarts(text, offset = 0) {
  const starts = new Set();
  let at = offset;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    starts.add(at);
    at += word.length;
  }
  return starts;
}

// Whether a Korean amount continues a number word just before it: "두 스푼" inside "열두 스푼", "한두 스푼" or "한~두 스푼".
// The number word before must start a word in the original text, so a name ending in the same syllable
// ("만두 두 개", "녹두 세 컵") or a word like "적당한 두 스푼" does not count. Without word starts every position counts.
function continuesKoreanNumber(before, amt, starts) {
  const first = amt.match(KOREAN_LEADING)?.[1];
  if (!first) return false;
  const dash = /[~\-–]$/.test(before);
  const prev = before.replace(/[~\-–]$/, '');
  const wordBefore = (words) => words.some((w) => prev.endsWith(w) && (!starts || starts.has(prev.length - w.length)));
  if (dash) return wordBefore([...KOREAN_UNITS, ...KOREAN_TENS]);
  if (prev.endsWith('백') || prev.endsWith('천')) return true;
  const i = KOREAN_UNITS.indexOf(first);
  return i !== -1 && (wordBefore(KOREAN_TENS) || (i > 0 && wordBefore([KOREAN_UNITS[i - 1]])));
}

// Where the amount occurs as a whole number: "2스푼" is not in "12스푼", "1.2스푼" or "1~2스푼".
// starts holds the word starts of hay (see wordStarts) so Korean number words are read per word.
function amountMatches(hay, amt, from = 0, starts) {
  const found = [];
  for (let p = hay.indexOf(amt, from); p !== -1; p = hay.indexOf(amt, p + 1)) {
    const before = hay.slice(0, p);
    const after = hay.slice(p + amt.length);
    if (/^\d/.test(amt) && DIGIT_BEFORE.test(before)) continue;
    if (/^[가-힣]/.test(amt) && continuesKoreanNumber(before, amt, starts)) continue;
    if (/\d$/.test(amt) && DIGIT_AFTER.test(after)) continue;
    if (/[a-z]$/.test(amt) && /^[a-z]/.test(after)) continue;
    found.push({ start: p, end: p + amt.length });
  }
  return found;
}

// Spellings an ingredient may appear under: the full name, each alternative and the head word ("다진 마늘" → "마늘").
// The value says whether the spelling is only a head word.
function nameForms(name) {
  const forms = new Map();
  for (const part of (name || '').split(/\s+또는\s+/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    forms.set(fold(part), false);
    const last = fold(words[words.length - 1]);
    if (words.length > 1 && last.length > 1 && !forms.has(last)) forms.set(last, true);
  }
  forms.delete('');
  return forms;
}

// Ingredient mentions in the text; a shorter name inside a longer one ("참치" in "참치액") is not a mention,
// and neither is a head word where another ingredient has that full name ("마늘" of "다진 마늘" when "마늘" is listed).
function mentions(hay, names) {
  const all = [];
  names.forEach((forms, owner) => {
    for (const [f, headWord] of forms) {
      for (let p = hay.indexOf(f); p !== -1; p = hay.indexOf(f, p + 1)) all.push({ start: p, end: p + f.length, owner, headWord });
    }
  });
  const other = (m, o) => o.owner !== m.owner;
  const inside = (m, o) => o.end - o.start > m.end - m.start && o.start <= m.start && m.end <= o.end;
  const sameSpan = (m, o) => o.start === m.start && o.end === m.end;
  return all.filter((m) => !all.some((o) => other(m, o) && (inside(m, o) || (m.headWord && !o.headWord && sameSpan(m, o)))));
}

// The first candidate; its owner is null when another ingredient is named at exactly the same place.
function closest(cands) {
  const best = cands[0];
  if (!best) return null;
  const owners = new Set(cands.filter((n) => n.start === best.start && n.end === best.end).map((n) => n.owner));
  return { ...best, owner: owners.size === 1 ? best.owner : null };
}

const LINK_GAP_BEFORE = 6; // "계란 프라이를 딱 하나만": name, a few words, then the amount
const LINK_GAP_AFTER = 1; // "2스푼의 간장"
const CAPTION_BREAK = '\n'; // keeps "…1" + "2스푼" from reading as "12스푼"; not counted in gaps

// Mentions found across the break as if it were not there ("다진" + "마늘" is still "다진 마늘"),
// with positions moved to the text that has the break.
function mentionsAcross(prevText, segText, names) {
  const cut = prevText.length;
  const moveStart = (p) => (p >= cut ? p + CAPTION_BREAK.length : p);
  const moveEnd = (p) => (p > cut ? p + CAPTION_BREAK.length : p);
  return mentions(prevText + segText, names).map((n) => ({ ...n, start: moveStart(n.start), end: moveEnd(n.end) }));
}

// The amount belongs to this ingredient when the closest ingredient named before it (or right after it) is this one.
// Speech often names the ingredient at the end of the previous caption, so that caption is read along with it.
function linkedTo(seg, prev, amt, owner, names) {
  const prevText = prev ? fold(prev.text) : '';
  const head = prev ? prevText + CAPTION_BREAK : '';
  const hay = head + fold(seg.text);
  const found = prev ? mentionsAcross(prevText, fold(seg.text), names) : mentions(hay, names);
  const gap = (from, to) => hay.slice(from, to).replace(CAPTION_BREAK, '');
  const starts = new Set([...(prev ? wordStarts(prev.text) : []), ...wordStarts(seg.text, head.length)]);
  return amountMatches(hay, amt, head.length, starts).some((m) => {
    const before = closest(found.filter((n) => n.end <= m.start).sort((a, b) => b.end - a.end || a.start - b.start));
    if (before && gap(before.end, m.start).length <= LINK_GAP_BEFORE && !/\d/.test(gap(before.end, m.start))) return before.owner === owner;
    const after = closest(found.filter((n) => n.start >= m.end).sort((a, b) => a.start - b.start));
    return !!after && gap(m.end, after.start).length <= LINK_GAP_AFTER && after.owner === owner;
  });
}

// One stated amount. It needs review when its text is not in the cited evidence as a whole number,
// it is not tied to this ingredient there, or it is a bare number.
function amountEntry(a, ctx, label, warnings) {
  const { byId, prevSpeech, owner, names } = ctx;
  const text = optional(a?.text);
  if (!text) return null;
  const ids = citations(a.evidence, byId, `${label} amount "${text}"`, warnings);
  if (!ids.length) {
    warnings.push(`${label}: amount "${text}" has no valid evidence, dropped`);
    return null;
  }
  const amt = fold(text);
  const verbatim = ids.some((id) => {
    const t = byId.get(id).text;
    return amountMatches(fold(t), amt, 0, wordStarts(t)).length > 0;
  });
  if (!verbatim) warnings.push(`${label}: amount "${text}" does not appear verbatim in ${ids.join(',')}`);
  const linked = verbatim && ids.some((id) => linkedTo(byId.get(id), prevSpeech.get(id), amt, owner, names));
  if (verbatim && !linked) warnings.push(`${label}: amount "${text}" is not tied to this ingredient in ${ids.join(',')}`);
  const unitless = NUMBER_ONLY.test(text);
  return {
    text,
    sources: [...new Set(ids.map((id) => byId.get(id).kind))],
    verbatim,
    linked,
    unitless,
    needs_review: !linked || unitless,
    parsed: parseAmount(text),
    evidence: evidenceRefs(ids, byId),
  };
}

// Amounts agree when their numbers match; a missing unit is compatible with any unit.
function sameAmount(a, b) {
  const p = a.parsed;
  const q = b.parsed;
  if (p.qualitative || q.qualitative || p.quantity == null || q.quantity == null) return squash(a.text) === squash(b.text);
  if (p.quantity !== q.quantity || p.quantity2 !== q.quantity2) return false;
  return !p.unit || !q.unit || unitFamily(p.unit) === unitFamily(q.unit);
}

function amountStatus(amounts) {
  if (!amounts.length) return 'not_in_video';
  if (amounts.some((a, i) => amounts.slice(i + 1).some((b) => !sameAmount(a, b)))) return 'conflict';
  return amounts.some((a) => !a.needs_review) ? 'confirmed' : 'needs_review';
}

const bigrams = (s) => {
  const t = squash(s).replace(/[.,!?~]/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
};
const similarity = (a, b) => {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  for (const g of x) if (y.has(g)) hit++;
  return (2 * hit) / (x.size + y.size);
};

const EQUIPMENT = new Set([
  '뚝배기', '팬', '프라이팬', '웍', '냄비', '솥', '압력솥', '휘핑기', '거품기', '그릇', '볼', '접시', '도마', '칼', '가위', '뚜껑',
  '체', '채반', '국자', '주걱', '집게', '계량컵', '계량스푼', '오븐', '에어프라이어', '전자레인지', '믹서', '믹서기', '랩', '호일',
  '종이호일', '키친타월', 'pan', 'pot', 'bowl', 'whisk', 'knife', 'lid', 'oven',
]);

// Drops items whose name is only equipment words ("뚝배기 뚜껑"); "팬케이크" or "냄비밥" stay.
function dropEquipment(list, warnings) {
  return list.filter((ing) => {
    const words = (ing.name || '').toLowerCase().split(/\s+/).filter(Boolean);
    const equipment = !ing.is_group_header && words.length > 0 && words.every((w) => EQUIPMENT.has(w));
    if (equipment) warnings.push(`"${ing.name}" is equipment, not an ingredient, dropped`);
    return !equipment;
  });
}

// "참치" and "참치액" citing the same segment are usually one ingredient before and after a recognition fix.
// Only warned, because "마늘" and "다진마늘" can be separate ingredients.
function warnLikelyDuplicates(ingredients, warnings) {
  const real = ingredients.filter((i) => !i.is_group_header);
  for (let a = 0; a < real.length; a++) {
    for (let b = a + 1; b < real.length; b++) {
      const [x, y] = [squash(real[a].name), squash(real[b].name)];
      if (x !== y && !x.includes(y) && !y.includes(x)) continue;
      const shared = real[a].evidence.some((e) => real[b].evidence.some((f) => f.segment_id === e.segment_id));
      if (shared) warnings.push(`ingredients "${real[a].name}" and "${real[b].name}" cite the same evidence, possible duplicate`);
    }
  }
}

const validIds = (ids, byId) => [...new Set((ids || []).filter((id) => byId.has(id)))].sort();

// A step is dropped only when it restates a tip almost word for word from exactly the same evidence.
// A step that merely resembles a tip ("전분을 빼고 바삭하게 볶는다" vs "전분을 빼야 바삭하다") can be a real action, so it is kept with a warning.
function dropStepsDuplicatingTips(steps, tips, byId, warnings) {
  return steps.filter((step, i) => {
    const stepIds = validIds(step.evidence, byId);
    const matches = tips
      .filter((tip) => validIds(tip.evidence, byId).some((id) => stepIds.includes(id)))
      .map((tip) => ({ tip, score: similarity(step.text, tip.text), same: validIds(tip.evidence, byId).join() === stepIds.join() }))
      .filter((m) => m.score >= 0.5);
    const dup = matches.find((m) => m.same && m.score >= 0.8);
    if (dup) {
      warnings.push(`step ${i + 1} ("${step.text}") duplicates tip "${dup.tip.text}" (similarity ${dup.score.toFixed(2)}, same evidence ${stepIds.join(',')}), dropped`);
      return false;
    }
    for (const m of matches) warnings.push(`step ${i + 1} ("${step.text}") resembles tip "${m.tip.text}" (similarity ${m.score.toFixed(2)}), kept`);
    return true;
  });
}

// Turns the model's cited evidence IDs into times, amount status and a confidence summary.
// The model never supplies times, and an amount without valid evidence is never shown as confirmed.
export function resolveRecipe(llm, segments) {
  const byId = new Map(segments.map((s) => [s.id, s]));
  const warnings = [];

  const speech = segments.filter((s) => s.kind === 'speech');
  const prevSpeech = new Map(speech.map((s, i) => [s.id, speech[i - 1]]));
  const merged = mergeAlternatives(dropEquipment(llm.ingredients || [], warnings), byId, warnings);
  const names = new Map(merged.map((ing, i) => [i, ing.is_group_header ? new Map() : nameForms(ing.name)]));

  const ingredients = merged.map((ing, i) => {
    const label = `ingredient ${i + 1} (${ing.name})`;
    const ids = citations(ing.evidence, byId, label, warnings);
    const ctx = { byId, prevSpeech, owner: i, names };
    const amounts = ing.is_group_header
      ? []
      : (ing.amounts || []).map((a) => amountEntry(a, ctx, label, warnings)).filter(Boolean);
    const status = ing.is_group_header ? null : amountStatus(amounts);
    if (status === 'conflict') warnings.push(`${label}: sources state different amounts (${amounts.map((a) => a.text).join(' / ')})`);
    return {
      id: `ing_${String(i + 1).padStart(2, '0')}`,
      sort_order: i,
      name: ing.name,
      preparation: optional(ing.preparation),
      is_group_header: !!ing.is_group_header,
      amount_text: (amounts.find((a) => !a.needs_review) ?? amounts[0])?.text ?? null,
      amount_status: status,
      amounts,
      start_ms: earliestStart(ids, byId),
      evidence: evidenceRefs(ids, byId),
    };
  });

  warnLikelyDuplicates(ingredients, warnings);

  const steps = dropStepsDuplicatingTips(llm.steps || [], llm.tips || [], byId, warnings).map((step, i) => {
    const ids = citations(step.evidence, byId, `step ${i + 1}`, warnings);
    return {
      id: `step_${String(i + 1).padStart(2, '0')}`,
      sort_order: i,
      text: step.text,
      is_group_header: !!step.is_group_header,
      start_ms: step.is_group_header ? null : earliestStart(ids, byId),
      end_ms: null,
      timing: 'ok',
      evidence: evidenceRefs(ids, byId),
    };
  });

  const timed = steps.filter((s) => s.start_ms != null);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].start_ms < timed[i - 1].start_ms) {
      timed[i].timing = 'out_of_order';
      warnings.push(`step ${timed[i].sort_order + 1}: starts before the previous step`);
    }
  }
  for (const s of steps) if (!s.is_group_header && s.start_ms == null) s.timing = 'missing';

  // A step ends where the next timed step begins; the last one ends at the last speech segment.
  const speechEnds = segments.filter((s) => s.endMs != null).map((s) => s.endMs);
  const lastEnd = speechEnds.length ? Math.max(...speechEnds) : null;
  timed.forEach((s, i) => {
    const next = timed.slice(i + 1).find((n) => n.start_ms > s.start_ms);
    s.end_ms = next ? next.start_ms : lastEnd;
  });

  const tips = (llm.tips || []).map((tip, i) => {
    const ids = citations(tip.evidence, byId, `tip ${i + 1}`, warnings);
    return { id: `tip_${String(i + 1).padStart(2, '0')}`, text: tip.text, start_ms: earliestStart(ids, byId), evidence: evidenceRefs(ids, byId) };
  });

  const servingIds = citations(llm.servings_evidence, byId, 'servings', warnings);
  const servings = optional(llm.servings) && servingIds.length ? optional(llm.servings) : null;

  const real = ingredients.filter((i) => !i.is_group_header);
  const status = llm.not_a_recipe ? 'not_a_recipe' : !real.length && !steps.length ? 'insufficient' : 'ok';

  return {
    status,
    title: llm.title,
    servings_text: servings,
    servings_evidence: evidenceRefs(servings ? servingIds : [], byId),
    summary: {
      ingredients: real.length,
      amounts_confirmed: real.filter((i) => i.amount_status === 'confirmed').length,
      amounts_needs_review: real.filter((i) => i.amount_status === 'needs_review').length,
      amounts_conflict: real.filter((i) => i.amount_status === 'conflict').length,
      steps: steps.filter((s) => !s.is_group_header).length,
      steps_timed: timed.length,
    },
    ingredients,
    steps,
    tips,
    warnings,
  };
}

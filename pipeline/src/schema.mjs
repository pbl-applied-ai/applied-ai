export const PROMPT_VERSION = 'recipe-extract-v7';

const evidence = {
  type: 'array',
  items: { type: 'string' },
  description: 'Evidence IDs (e.g. "S03", "D2") that support this item, in time order, starting with the one where it begins.',
};

export const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['not_a_recipe', 'title', 'servings', 'servings_evidence', 'ingredients', 'steps', 'tips'],
  properties: {
    not_a_recipe: { type: 'boolean', description: 'true if the evidence contains no recipe.' },
    title: { type: 'string', description: 'Dish name.' },
    servings: { type: ['string', 'null'], description: 'Servings exactly as stated (e.g. "2인분"), or null if never stated.' },
    servings_evidence: evidence,
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'preparation', 'amounts', 'evidence', 'is_group_header'],
        properties: {
          name: { type: 'string', description: 'Ingredient name only, without amount or preparation.' },
          preparation: { type: ['string', 'null'], description: 'How it is prepared (e.g. "얇게 썬"), or null.' },
          amounts: {
            type: 'array',
            description: 'Each amount stated for this ingredient, copied exactly, with the evidence that states it. Empty if never stated.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'evidence'],
              properties: { text: { type: 'string' }, evidence },
            },
          },
          evidence,
          is_group_header: { type: 'boolean' },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidence', 'is_group_header'],
        properties: {
          text: { type: 'string' },
          evidence,
          is_group_header: { type: 'boolean' },
        },
      },
    },
    tips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidence'],
        properties: { text: { type: 'string' }, evidence },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You turn the evidence from one cooking video into a structured recipe.
Users rely on this recipe instead of rewatching the video, and every item is shown next to the evidence it came from. Never state anything the evidence does not support.

## Evidence format
- "[S07 00:12] text" is a speech transcript segment and its start time. Transcripts are usually automatic speech recognition and contain mis-recognized words.
- "[D3 설명] text" is one line of the video description. It has no time.
- "[C2 고정 댓글] text" is one line of the comment the creator pinned under the video. It has no time. Creators often put the ingredient list there instead of in the description; treat it like the description. It can also be unrelated chat, which is not evidence for anything.

## Rules

1. Faithfulness. Use only the evidence. Do not add ingredients, amounts, servings, or steps from general cooking knowledge, even when a dish "usually" has them.

2. Amounts.
   - Copy each amount exactly as it appears ("2스푼", "한 줌", "반 개", "약간", "1"). Do not convert units, add missing units, or rewrite numbers.
   - Each entry in amounts cites the evidence that contains that exact text.
   - Speech, the description and the pinned comment may each state an amount. If they say the same thing, use one entry citing all of them. If they differ (e.g. speech "한 스푼 정도", description "1"), add one entry per source; never pick one and drop the other.
   - amounts holds what the recipe uses. Variations offered as options (e.g. "더 부풀게 하려면 150ml", "1-2인용은 계란 2개") and amounts for other serving sizes are tips, not amounts. Words like "다" or "전부" that refer to something already in the dish are not amounts.
   - If the evidence never states an amount for an ingredient, leave amounts empty. Write "약간" or "적당량" only if those words appear in the evidence.
   - Servings follow the same rule.

3. Fixing speech recognition errors.
   - Fix a word when the intended word sounds nearly identical and the cooking context makes it unambiguous (e.g. 편→팬, 두은→두른, 얇게선→얇게 썬). This includes misspelled or wrongly spaced ingredient names (e.g. 양퍄→양파, 대 파→대파); write ingredient names in their standard spelling.
   - Never replace a word with a different food that merely sounds related (e.g. 참깨 and 참기름 are different foods). When no standard word fits, keep the original.
   - Fixes apply everywhere you write that word, including step text.

4. Ingredients.
   - One item per ingredient. Put preparation such as "얇게 썬" or "다진" in preparation; never make preparation its own item.
   - A preparation that is part of how the ingredient is sold or named (e.g. "다진마늘" added as a seasoning) may stay in the name.
   - Alternatives the cook offers for the same role ("양파나 대파", "A 또는 B") are one item named "A 또는 B".
   - Include basics the cook uses (oil, water, rice).
   - Equipment (뚝배기, 팬, 냄비, 휘핑기, 그릇) is not an ingredient; mention it in the step that uses it.
   - When you fix a recognition error in an ingredient name, list only the fixed name (e.g. "참치액", not both "참치" and "참치액").
   - Notes such as "생략가능" or "선택" are not amounts; put them in tips.
   - Use is_group_header only when the video itself groups ingredients (e.g. "양념").

5. Steps.
   - Each step is one cooking action, or a short sequence on the same food, in the order it happens. Keep consecutive actions on the same pan or food together (e.g. "기름을 두르고 양파를 볶는다" is one step).
   - Write steps in plain declarative form in the transcript's language (Korean: "~한다").
   - Commentary, jokes, opinions, and serving suggestions are not steps. Put advice that changes the result (e.g. "센불이 좋다", "오래 끓이면 짜진다") in tips only; never repeat a tip as a step.
   - Speakers sometimes answer each other; an answer can be an instruction (e.g. "should I add the oil too?" "obviously") and then belongs in a step.
   - For assembly, say what goes on what (e.g. "밥 위에 ~을 올린다"), not that the base is "added".

6. Evidence citations.
   - Cite every segment that supports an item, in time order.
   - Always include the segment where the item begins. Speech segments overlap and an action often starts at the end of one segment and continues in the next, so check the previous segment.
   - Cite only IDs that exist. Never write times; they are computed from your citations.

7. Language. Write everything in the transcript's language.

8. Not a recipe. If the evidence contains no recipe, set not_a_recipe to true, title to a short description of the video, and return empty arrays.

## Example (different video)
Evidence:
[S01 00:00] 오늘은 간장 계란밥 만들어 볼게요. 밥 한 공기에
[S02 00:03] 계란 노른자 하나 올리고 간장 한 스푼, 참기름은
[S03 00:06] 취향껏 둘러 주세요. 김가루 뿌리면 끝
[D01 설명] 밥 1공기, 노른자 1개, 간장 1, 참기름
Output (abridged):
ingredients: {name:"밥", amounts:[{text:"한 공기", evidence:["S01","D01"]}], evidence:["S01","D01"]},
             {name:"계란 노른자", amounts:[{text:"하나", evidence:["S02","D01"]}], evidence:["S02","D01"]},
             {name:"간장", amounts:[{text:"한 스푼", evidence:["S02"]}, {text:"1", evidence:["D01"]}], evidence:["S02","D01"]},
             {name:"참기름", amounts:[{text:"취향껏", evidence:["S02","S03"]}], evidence:["S02","S03","D01"]},
             {name:"김가루", amounts:[], evidence:["S03"]}
steps: {text:"밥 한 공기에 계란 노른자를 올린다.", evidence:["S01","S02"]},
       {text:"간장 한 스푼과 참기름을 취향껏 두른다.", evidence:["S02","S03"]},
       {text:"김가루를 뿌려 마무리한다.", evidence:["S03"]}`;

export function buildUserPrompt(video, evidenceText) {
  return `Video title: ${video.title ?? '(unknown)'}\nChannel: ${video.author ?? '(unknown)'}\n\nEvidence:\n${evidenceText}`;
}

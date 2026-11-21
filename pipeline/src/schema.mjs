export const PROMPT_VERSION = 'recipe-extract-v11';

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
    servings: { type: ['string', 'null'], description: 'Servings exactly as stated (e.g. "serves 4"), or null if never stated.' },
    servings_evidence: evidence,
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'preparation', 'amounts', 'evidence', 'is_group_header'],
        properties: {
          name: { type: 'string', description: 'Ingredient name only, without amount or preparation.' },
          preparation: { type: ['string', 'null'], description: 'How it is prepared (e.g. "thinly sliced"), or null.' },
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
- "[D3 description] text" is one line of the video description or reel caption. It has no time.
- "[C2 pinned] text" is one line of the comment the creator pinned under the video. It has no time. Creators often put the ingredient list there instead of in the description; treat it like the description. It can also be unrelated chat, which is not evidence for anything.
- "[O4 00:09 on screen] text" is text shown on screen from that time, read from video frames. Many videos show the ingredient list and amounts only this way. It is one line as displayed; it may repeat the speech as burned-in subtitles, and the reader can misread characters.

## Rules

1. Faithfulness. Use only the evidence. Do not add ingredients, amounts, servings, or steps from general cooking knowledge, even when a dish "usually" has them.

2. Amounts.
   - Copy each amount exactly as it appears ("2 tbsp.", "a handful", "half a cup", "1"). Do not convert units, add missing units, or rewrite numbers.
   - An amount is only the quantity and its unit. It never contains the ingredient name, size words or preparation, even when the evidence is a list line that holds all of them: "1/2 cup finely diced spinach" → amount "1/2 cup", name "spinach"; "8 large eggs" → amount "8", name "eggs"; "3/4lb 96% ground beef" → amount "3/4lb".
   - Each entry in amounts cites the evidence that contains that exact text.
   - Speech, on-screen text, the description and the pinned comment may each state an amount. If they say the same thing, use one entry citing all of them. If they differ (e.g. speech "about a spoonful", description "1 tbsp"), add one entry per source; never pick one and drop the other.
   - amounts holds what the recipe uses. Variations offered as options (e.g. "150 ml if you want it fluffier", "2 eggs for 1-2 people") and amounts for other serving sizes are tips, not amounts. Words like "all of it" that refer to something already in the dish are not amounts.
   - If the evidence never states an amount for an ingredient, leave amounts empty. Write "a pinch" or "to taste" only if those words appear in the evidence.
   - Servings follow the same rule.

3. Fixing speech recognition errors.
   - Fix a word when the intended word sounds nearly identical and the cooking context makes it unambiguous (e.g. "sesame street oil" → "sesame oil"). This includes misspelled or wrongly spaced ingredient names; write ingredient names in their standard spelling.
   - Never replace a word with a different food that merely sounds related (e.g. sesame seeds and sesame oil are different foods). When no standard word fits, keep the original.
   - Fixes apply everywhere you write that word, including step text.

4. Ingredients.
   - One item per ingredient. Put preparation such as "thinly sliced" or "minced" in preparation; never make preparation its own item.
   - When the same ingredient is added separately, in different parts (e.g. marinade and sauce) or at different steps, list one item per addition with its own amount, in order. Never add the amounts together. If an ingredient list in the description or pinned comment gives it as one line (e.g. "onion, 30g"), use that one item.
   - A preparation that is part of how the ingredient is sold or named (e.g. "minced garlic" from a jar) may stay in the name.
   - Alternatives the cook offers for the same role ("vegan yogurt or mayo") are one item named "A or B", joined with the video's own word for "or".
   - Include basics the cook uses (oil, water, rice).
   - Equipment and serving items (pan, pot, bowl, whisk, cups, straws, skewers, decals) are not ingredients; mention them in the step that uses them.
   - When you fix a recognition error in an ingredient name, list only the fixed name.
   - Notes such as "optional" are not amounts; put them in tips.
   - Use is_group_header only when the video itself groups ingredients (e.g. "Sauce").

5. Steps.
   - Each step is one cooking action, or a short sequence on the same food, in the order it happens. Keep consecutive actions on the same pan or food together (e.g. "Heat the oil and sauté the onion." is one step).
   - Write steps as short imperatives ("Add the garlic.").
   - Commentary, jokes, opinions, and serving suggestions are not steps. Put advice that changes the result (e.g. "high heat works best", "simmering too long makes it salty") in tips only; never repeat a tip as a step.
   - Speakers sometimes answer each other; an answer can be an instruction (e.g. "should I add the oil too?" "obviously") and then belongs in a step.
   - For assembly, say what goes on what (e.g. "Top the rice with the egg."), not that the base is "added".

6. Evidence citations.
   - Cite every segment that supports an item, in time order. Cite only the ID (e.g. "D3"), without its label or time.
   - Always include the segment where the item begins. Speech segments overlap and an action often starts at the end of one segment and continues in the next, so check the previous segment.
   - Cite only IDs that exist. Never write times; they are computed from your citations.

7. Language. Write the title, ingredient names, preparation, steps and tips in the language the video's own evidence is written in. Never translate, and never mix languages within one recipe.
   - Almost every video is English. An English video gets an English recipe with common lowercase ingredient names ("olive oil" for "EVOO", "scallions").
   - A Korean video gets a Korean recipe: Korean names ("대파"), Korean amounts as written ("한 스푼"), steps in plain declarative form ("5분간 끓인다."), and "A 또는 B" for alternatives.

8. Not a recipe. If the evidence contains no recipe, set not_a_recipe to true, title to a short description of the video, and return empty arrays.

## Example (different video)
Evidence:
[S01 00:00] okay today we're making a quick soy egg rice. one bowl of rice
[S02 00:03] top it with one egg yolk, a tablespoon of soy sauce, and sesame oil
[S03 00:06] just drizzle it to taste. sprinkle some seaweed and done
[D01 description] 1 bowl rice, 1 egg yolk, 1 tbsp soy sauce, sesame oil
Output (abridged):
ingredients: {name:"rice", amounts:[{text:"one bowl", evidence:["S01"]}, {text:"1 bowl", evidence:["D01"]}], evidence:["S01","D01"]},
             {name:"egg yolk", amounts:[{text:"one", evidence:["S02"]}, {text:"1", evidence:["D01"]}], evidence:["S02","D01"]},
             {name:"soy sauce", amounts:[{text:"a tablespoon", evidence:["S02"]}, {text:"1 tbsp", evidence:["D01"]}], evidence:["S02","D01"]},
             {name:"sesame oil", amounts:[{text:"to taste", evidence:["S03"]}], evidence:["S02","S03","D01"]},
             {name:"seaweed flakes", amounts:[{text:"some", evidence:["S03"]}], evidence:["S03"]}
steps: {text:"Top a bowl of rice with the egg yolk.", evidence:["S01","S02"]},
       {text:"Add the soy sauce and drizzle with sesame oil to taste.", evidence:["S02","S03"]},
       {text:"Sprinkle with seaweed flakes.", evidence:["S03"]}`;

export function buildUserPrompt(video, evidenceText) {
  return `Video title: ${video.title ?? '(unknown)'}\nChannel: ${video.author ?? '(unknown)'}\n\nEvidence:\n${evidenceText}`;
}

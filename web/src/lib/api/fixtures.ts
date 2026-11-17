// 목 데이터. 직접 만든 가짜 fixture(pipeline/test/fixtures/sample-gochujang-bowl)의 파이프라인 출력이다.
// 실제 영상이 아니다. #13의 examples/example-002-pipeline-output/recipe.json과 같은 내용.
import type { RecommendationGroup, TeamRecipe } from './types';

// 목에서만 쓰는 가짜 추정값(KAN-52 amount_estimate 모양). 위 파이프라인 출력에는 없다.
// 로그인했을 때만 붙인다. 로그인 전 공개 링크에서는 서버가 추정값을 빼는 것과 맞춘다(#45).
// 홈 추천 묶음 목업. 화면 모양만 보기 위한 가짜 값이다. 실제 묶음은 KAN-60(저장 방식)·KAN-63(영상 고르기) 뒤에 붙인다.
// 목 getRun은 어떤 runId든 SAMPLE_RECIPE를 돌려주므로 카드를 누르면 요리명이 달라 보인다.
export const MOCK_RECOMMENDATIONS: RecommendationGroup[] = [
  {
    id: 'trending',
    title: 'Trending now',
    cards: [
      { runId: 'run-MockReco001', title: 'Kimchi Fried Rice', creator: 'Sample Creator A', ingredientCount: 9, categories: ['Late night'], saveCount: 1240 },
      { runId: 'run-MockReco002', title: 'Crispy Pan-Fried Tofu', creator: 'Sample Creator B', ingredientCount: 8, categories: ['Vegan'], saveCount: 860 },
      { runId: 'run-MockReco003', title: 'Garlic Butter Shrimp Pasta', creator: 'Sample Creator C', ingredientCount: 7, categories: ['Pasta'], saveCount: 2310 },
      { runId: 'run-MockReco004', title: 'Brown Butter Cookies', creator: 'Sample Creator D', ingredientCount: 6, categories: ['Dessert'], saveCount: 540 },
      { runId: 'run-MockReco005', title: 'Rolled Omelet', creator: 'Sample Creator E', ingredientCount: 7, categories: ['Late night'], saveCount: 410 },
    ],
  },
];

export const SAMPLE_ESTIMATES: Record<string, { text: string; basis?: string }> = {
  Garlic: { text: '4-5 cloves', basis: 'for one rice bowl' },
  'Pork shoulder': { text: '7 oz', basis: 'for one serving' },
  Gochujang: { text: '1 tbsp' },
  Sugar: { text: '1/2 tbsp', basis: 'to balance the gochujang' },
};

export const SAMPLE_RECIPE: TeamRecipe = {
  schema_version: '0.1',
  video_id: 'Smpl0Gochu1',
  title: 'Gochujang Pork Rice Bowl',
  servings_raw: null,
  ingredients: [
    { name: 'Oil', amount_raw: 'just a little', amount_status: 'confirmed', amount_source: 'voice', evidence: ['asr-2'] },
    { name: 'Garlic', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-2', 'asr-3'] },
    { name: 'Egg', amount_raw: '1', amount_status: 'confirmed', amount_source: 'on_screen', evidence: ['asr-5', 'asr-6'] },
    { name: 'Pork shoulder', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-9'] },
    { name: 'Gochujang', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: 'Ketchup', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: 'Soy sauce', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: 'Gochugaru (Korean chili flakes)', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: 'Sugar', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-13'] },
    { name: 'Minced garlic', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-13'] },
    { name: 'Cooked rice', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-14'] },
    { name: 'Scallions or green onion', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-18'] },
    { name: 'Sesame seeds', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-19'] },
  ],
  steps: [
    { order: 1, text: 'Heat a pan with just a little oil and toast thinly sliced garlic over low heat until golden.', evidence: ['asr-2', 'asr-3'] },
    { order: 2, text: 'Take the garlic out and set it aside.', evidence: ['asr-4'] },
    { order: 3, text: 'In the same pan, fry one egg.', evidence: ['asr-5', 'asr-6'] },
    { order: 4, text: 'Add the pork shoulder to the same pan and cook both sides.', evidence: ['asr-9', 'asr-10'] },
    { order: 5, text: 'Cut the cooked pork into bite-size pieces with kitchen scissors.', evidence: ['asr-10', 'asr-11'] },
    { order: 6, text: 'Add soy sauce, ketchup, gochugaru, gochujang, minced garlic, and sugar, and stir-fry until evenly coated.', evidence: ['asr-12', 'asr-13'] },
    { order: 7, text: 'Put the rice in a bowl, then top with the pork and all the sauce left in the pan.', evidence: ['asr-14', 'asr-15', 'asr-16'] },
    { order: 8, text: 'Add the toasted garlic and fried egg on top.', evidence: ['asr-17', 'asr-18'] },
    { order: 9, text: 'Finish with chopped scallions and sesame seeds.', evidence: ['asr-18', 'asr-19'] },
  ],
};

// 부분 결과(partial_recipe): 재료만 찾고 조리 순서는 못 찾은 경우. S4 부분 결과 화면용
export const PARTIAL_RECIPE: TeamRecipe = {
  ...SAMPLE_RECIPE,
  ingredients: SAMPLE_RECIPE.ingredients.slice(0, 4),
  steps: [],
};

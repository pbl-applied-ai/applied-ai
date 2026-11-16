// 목 데이터. 직접 만든 가짜 fixture(pipeline/test/fixtures/sample-gochujang-bowl)의 파이프라인 출력이다.
// 실제 영상이 아니다. #13의 examples/example-002-pipeline-output/recipe.json과 같은 내용.
import type { FeaturedCategory, FeaturedRecipe, TeamRecipe } from './types';

// 목에서만 쓰는 가짜 추정값(KAN-52 amount_estimate 모양). 위 파이프라인 출력에는 없다.
// 로그인했을 때만 붙인다. 로그인 전 공개 링크에서는 서버가 추정값을 빼는 것과 맞춘다(#45).
// 홈 추천 목업. 화면 모양만 보기 위한 가짜 값이다(요리명·크리에이터·숫자 모두 예시).
// 실제 목록은 KAN-60(저장 방식)·KAN-63(영상 고르기)·KAN-73(list_featured) 뒤에 붙인다.
// 목 getRun은 어떤 runId든 SAMPLE_RECIPE를 돌려주므로 카드를 누르면 요리명이 달라 보인다.
const featured = (
  n: number,
  title: string,
  categories: FeaturedCategory[],
  ingredientNames: string[],
  saveCount: number,
): FeaturedRecipe => ({
  runId: `run-MockFeat00${n}`,
  title,
  creator: `example_creator_${n}`,
  platform: 'youtube',
  durationMs: (20 + n * 7) * 1000,
  thumbnailUrl: null,
  ingredientNames,
  ingredientCount: ingredientNames.length + 3,
  stepCount: 4,
  categories,
  saveCount,
});

export const MOCK_FEATURED: FeaturedRecipe[] = [
  featured(1, 'Kimchi fried rice', ['budget', 'quick'], ['rice', 'kimchi', 'egg', 'scallion'], 2300),
  featured(2, 'Honey butter roast turkey', ['thanksgiving'], ['turkey', 'butter', 'honey', 'garlic'], 840),
  featured(3, 'Garlic butter shrimp', ['christmas', 'quick'], ['shrimp', 'butter', 'garlic', 'parsley'], 1200),
  featured(4, 'Tofu steak', ['budget'], ['tofu', 'soy sauce', 'garlic', 'sesame oil'], 5),
  featured(5, 'Mashed potatoes', ['thanksgiving', 'budget'], ['potato', 'butter', 'milk', 'salt'], 410),
  featured(6, 'Caprese skewers', ['christmas'], ['tomato', 'mozzarella', 'basil', 'olive oil'], 96),
  featured(7, 'Rolled omelette', ['budget', 'quick'], ['egg', 'carrot', 'scallion', 'salt'], 3100),
];

export const SAMPLE_ESTIMATES: Record<string, { text: string; basis?: string }> = {
  마늘: { text: '4~5쪽', basis: '1인분 덮밥 기준' },
  목살: { text: '200g', basis: '1인분 기준' },
  고추장: { text: '1큰술' },
  설탕: { text: '1/2큰술', basis: '고추장 양에 맞춤' },
};

export const SAMPLE_RECIPE: TeamRecipe = {
  schema_version: '0.1',
  video_id: 'Smpl0Gochu1',
  title: '고추장 목살덮밥',
  servings_raw: null,
  ingredients: [
    { name: '기름', amount_raw: '살짝만', amount_status: 'confirmed', evidence: ['asr-2'] },
    { name: '마늘', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-2', 'asr-3'] },
    { name: '계란', amount_raw: '하나', amount_status: 'confirmed', evidence: ['asr-5', 'asr-6'] },
    { name: '목살', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-9'] },
    { name: '고추장', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: '케첩', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: '진간장', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: '고춧가루', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-12'] },
    { name: '설탕', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-13'] },
    { name: '다진마늘', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-13'] },
    { name: '밥', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-14'] },
    { name: '쪽파 또는 대파', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-18'] },
    { name: '참깨', amount_raw: null, amount_status: 'unconfirmed', evidence: ['asr-19'] },
  ],
  steps: [
    { order: 1, text: '달군 팬에 살짝만 기름을 붓고 얇게 썬 마늘을 약한 불에 노릇하게 굽는다.', evidence: ['asr-2', 'asr-3'] },
    { order: 2, text: '익은 마늘은 따로 덜어 둔다.', evidence: ['asr-4'] },
    { order: 3, text: '같은 팬에 계란 프라이를 하나 부친다.', evidence: ['asr-5', 'asr-6'] },
    { order: 4, text: '같은 팬에 목살을 올려 앞뒤로 익힌다.', evidence: ['asr-9', 'asr-10'] },
    { order: 5, text: '익은 목살을 가위로 한입 크기로 자른다.', evidence: ['asr-10', 'asr-11'] },
    { order: 6, text: '진간장, 케첩, 고춧가루, 고추장, 다진마늘, 설탕을 넣고 골고루 볶는다.', evidence: ['asr-12', 'asr-13'] },
    { order: 7, text: '밥을 먼저 담고 볶은 목살과 팬에 남은 양념을 모두 올린다.', evidence: ['asr-14', 'asr-15', 'asr-16'] },
    { order: 8, text: '덜어 둔 마늘과 계란 프라이를 얹는다.', evidence: ['asr-17', 'asr-18'] },
    { order: 9, text: '다진 쪽파나 대파와 참깨를 뿌려 마무리한다.', evidence: ['asr-18', 'asr-19'] },
  ],
};

// 부분 결과(partial_recipe): 재료만 찾고 조리 순서는 못 찾은 경우. S4 부분 결과 화면용
export const PARTIAL_RECIPE: TeamRecipe = {
  ...SAMPLE_RECIPE,
  ingredients: SAMPLE_RECIPE.ingredients.slice(0, 4),
  steps: [],
};

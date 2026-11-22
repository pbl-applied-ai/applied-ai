// 홈 편집 파일(docs/screen-data.md 4절 11번, 7절 5번). 시즌 특집·주제별 줄을 팀이 PR로 고친다.
// run ID와 글만 둔다. 레시피 내용은 list_featured()에서 오므로, 여기 넣은 run은 배포 DB featured_runs에도 있어야 보인다.
// viewsLabel: 원본 플랫폼에서 직접 확인한 숫자와 그 날짜만 적는다(어림잡거나 지어낸 숫자 금지).
//   크리스마스 = 11/20 확인(reports/cardnews-christmas-2026-11-20), 원팟 = 11/21 확인(reports/cardnews-onepot-2026-11-21).
import type { HomeEditorial } from "@/lib/home-editorial";

export const HOME_EDITORIAL: HomeEditorial = {
  issue: {
    slug: "christmas-2026",
    label: "Holiday issue",
    title: "The Christmas Edit",
    dek: "The holiday recipes with the most plays this season, from a pull-apart pastry tree to a cocoa dip for the party table.",
    cover: {
      runId: "67022e63-2f84-4012-85b6-c3d6e9026d6b", // Anna Louisa At Home, w45wKJqfM1E
      kicker: "COVER STORY",
      headline: "A Nutella Christmas tree you tear and share",
      dek: "Two sheets of puff pastry and a layer of Nutella, shown in twelve seconds.",
      viewsLabel: "7.3M views",
    },
    stories: [
      { runId: "46fd5c2b-566e-4179-85c9-6a57b215a71b", kicker: "BREAKFAST", viewsLabel: "30.9M plays" }, // sugarspiceddreamss, DfLHNskSYIs
      { runId: "07d21331-7c80-4cbe-a912-8fa1ef052b2c", kicker: "COOKIES", viewsLabel: "11.5M plays" }, // bakeswithmarlene, De_mRZiCMPR
      { runId: "3d992d8e-decc-4394-8e81-3c076de7ac7c", kicker: "PARTY", viewsLabel: "3.8M views" }, // Julie Smith, Xr899xkDc0E
      { runId: "85e8a410-66b0-486d-8f17-ab7310167eee", kicker: "DRINKS", viewsLabel: "6.0M views" }, // Kate_cleanhome, W6u2NOTbr8g
    ],
    activeUntil: "2026-12-26",
  },
  note: null,
  shelves: [
    {
      title: "One pot, zero mess",
      runIds: [
        "bb2a4824-826b-46e8-b69a-b1508bdea023", // Andy Cooks, BGG7UWZ1YTw
        // Nutrient Matters(hKdWeq4LXFw)는 "your rice" 분량 버그(#79) 병합 뒤 다시 변환해서 넣는다
        "211a17dc-74a5-4721-95d5-ecd84e6ba319", // cookinginthemidwest, DfH0vZZRPp6
        "a06bddd6-7731-4d58-84ad-f1a51115428f", // recipe_tin, DfEaJHoMwPk
        "c7db1ea7-8c09-4088-8116-284c0a3152b7", // Ana Negoita, -SEUAt0mUsM
        "8a100c92-b77c-4905-a478-98034a340ab1", // dietitianrose, DaxJiqXRshs
      ],
    },
  ],
  collections: [],
};

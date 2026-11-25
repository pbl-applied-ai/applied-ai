-- 홈 취향 칩 태그로 featured_runs.categories 제약을 바꾼다(screen-data 3절 8번, 11/20 수빈 결정 #74, 11/24 홈 A안).
-- 칩: Vegan · Late night · Dessert · High protein. 시즌(크리스마스 등)은 칩이 아니라 홈 시즌 특집(content/home.ts)으로 둔다.
-- 배포 DB의 featured_runs는 지금 전부 categories = '{}'라서 옛 태그를 지울 데이터가 없다.
alter table public.featured_runs drop constraint featured_runs_categories_check;
alter table public.featured_runs add constraint featured_runs_categories_check
  check (categories <@ array['vegan', 'late_night', 'dessert', 'high_protein']);

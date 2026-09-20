# db/

Postgres 스키마는 `migrations/*.sql` 의 순서대로만 바뀐다. ORM 자동 생성 없음.

## 실행

```bash
# .env.local 에 DATABASE_URL_ADMIN(또는 DATABASE_URL), ANCHOR_APP_PASSWORD 설정 후
pnpm db:migrate            # 미적용 파일을 순서대로 적용 (각 파일은 하나의 트랜잭션)
pnpm db:migrate:status     # 적용 상태만 출력
```

적용 기록은 `schema_migrations(name, applied_at, checksum)` 에 남는다. 이미 적용된 파일의 내용이 바뀌면 체크섬 불일치로 중단한다. 새 변경은 항상 새 파일로.

## 두 개의 연결

| 변수 | 역할 | 쓰는 곳 |
| --- | --- | --- |
| `DATABASE_URL_ADMIN` (없으면 `DATABASE_URL`) | 테이블 소유자 (Neon 기본 역할). Vercel Neon 통합은 이걸 `DATABASE_URL` 로 주입한다 | 마이그레이션, 공용 참조 데이터 적재, 백업 |
| `ANCHOR_DATABASE_URL` | `anchor_app` (BYPASSRLS 없음, 0001 이 SQL로 생성) | 앱 런타임 전부 |

Neon 콘솔·API로 만든 역할은 `neon_superuser` 멤버라 RLS를 우회한다. 앱 역할을 콘솔에서 만들면 RLS가 무력화된다. 반드시 마이그레이션이 만든 `anchor_app` 을 쓴다.

## RLS 동작 방식

```
withUser(userId, tx => ...)
  BEGIN
  SELECT set_config('app.user_id', $userId, true)   -- 트랜잭션 로컬
  ...쿼리...                                          -- 정책: user_id = app.current_user_id()
  COMMIT
```

- 설정이 없으면 `app.current_user_id()` 가 NULL → 모든 정책이 false → 아무 행도 안 보인다.
- 모든 사용자 테이블은 `FORCE ROW LEVEL SECURITY` 라 소유자 연결에서도 정책이 적용된다. admin 연결로 사용자 데이터를 보려면 `SET app.user_id` 를 해야 한다. 이건 의도된 마찰이다.
- `nodes`, `edges` 는 `user_id IS NULL` 행이 공용 참조 데이터(KANJIDIC2, IDS, 한자음, 어원)다. 읽기는 모두, 쓰기는 admin 스크립트만.

## 테이블 요약

| 테이블 | 무엇 | 비고 |
| --- | --- | --- |
| `users` | 계정 프로필·설정 | id = Neon Auth user.id. 모든 FK의 뿌리 (CASCADE) |
| `inputs` | 붙여넣은 자료, 공유 시트, 못 한 말 메모 | `is_public` 기본 false |
| `nodes` | 앵커 그래프 노드 (부품·단어, 언어 무관) | 공용/개인 혼합 |
| `edges` | 부품∈단어, 한자음↔음독, 어근=코그네이트, 태도, 강도, 착지, 개념 | |
| `user_node_state` | 안다의 3층: `knows_sound` / `knows_meaning` / `can_say` + confidence | |
| `cards` | 발견 카드와 추측 기록 | CHECK: 정답 공개 전에 추측 또는 건너뛰기 필수 |
| `chunks` | 대화 덩어리 (상황 → 덩어리, 태도, 강도) | |
| `recordings` | 피치 곡선만. 원본 오디오는 key + 만료일만 | |
| `encounters` | 재만남 인식 기록 (지표용) | |
| `account_deletions` | 삭제 원장. 백업 복구 시 재삭제 근거 | 앱은 INSERT 만 |

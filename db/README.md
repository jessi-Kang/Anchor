# db/

Postgres 스키마는 `migrations/*.sql` 의 순서대로만 바뀐다. ORM 자동 생성 없음.

## 실행

```bash
# .env.local 에 DATABASE_URL_ADMIN(또는 DATABASE_URL), ANCHOR_APP_PASSWORD 설정 후
pnpm db:migrate            # 미적용 파일을 순서대로 적용 (각 파일은 하나의 트랜잭션)
pnpm db:migrate:status     # 적용 상태만 출력
```

적용 기록은 `schema_migrations(name, applied_at, checksum)` 에 남는다. 이미 적용된 파일의 내용이 바뀌면 체크섬 불일치로 중단한다. 새 변경은 항상 새 파일로.

## 프로덕션에 올라간 공용 씨앗

| 무엇 | 커밋 | 언제 |
| --- | --- | --- |
| `db/seed/kanji.json` 의 `meta.parts` | **모름** | — |

**이 칸이 비어 있으면 부품을 고칠 때마다 2,136자를 전부 찍어야 한다.** 무엇이 올라가 있는지 모르면 무엇이 달라졌는지도 모르기 때문이다. `pnpm seed:parts-sql --all` 은 그래서 안전하지만 파일이 길다.

적용한 사람이 여기 커밋을 적는다. 그 뒤부터는 `pnpm seed:parts-sql --since <그 커밋>` 으로 바뀐 것만 찍는다.

```bash
pnpm seed:parts-sql --all --out db/manual/parts-sync-<날짜>.sql   # 접속하지 않는다. SQL 만 찍는다
# 받은 사람이 파일을 읽고 돌린다. 1번 질의가 실제로 바뀔 줄 수를 먼저 알려 준다.
```

찍어낸 UPDATE 는 `meta->'parts'` 가 **실제로 다른 줄만** 건드린다. 두 번 돌리면 두 번째는 0 줄이다.

`manual/` 은 마이그레이션이 아니다. `pnpm db:migrate` 가 안 본다. 한 번 손으로 돌리고 나면 위 표에 커밋을 적고 파일은 기록으로 남긴다.

## 두 개의 연결

| 변수 | 역할 | 쓰는 곳 |
| --- | --- | --- |
| `DATABASE_URL_ADMIN` (없으면 `DATABASE_URL`) | 테이블 소유자 (Neon 기본 역할). Vercel Neon 통합은 이걸 `DATABASE_URL` 로 주입한다 | 마이그레이션, 공용 참조 데이터 적재, 백업 |
| `ANCHOR_DATABASE_URL` | `anchor_app` (BYPASSRLS 없음, 0001 이 SQL로 생성) | 앱 런타임 전부 |

Neon 콘솔·API로 만든 역할은 `neon_superuser` 멤버라 RLS를 우회한다. 앱 역할을 콘솔에서 만들면 RLS가 무력화된다. 반드시 마이그레이션이 만든 `anchor_app` 을 쓴다.

## DB 를 쓰는 테스트

```bash
pnpm test:db     # DATABASE_URL_ADMIN 과 ANCHOR_DATABASE_URL 둘 다 필요하다
```

`scripts/test/*.test.ts` 는 `node:test` 로 돈다(의존성 없음). **앱 역할로 붙어 진짜 코드 경로를 타므로 RLS 까지 같이 시험한다** — 질의를 테스트에 베껴 쓰면 코드가 아니라 사본을 시험하게 된다.

쓰는 계정은 `fixture-` 로 시작하는 것뿐이고 끝나면 지운다. **프로덕션 연결로 돌리지 않는다.** 로컬이나 일회용 DB 를 쓴다.

붙들어 두는 것 둘. **재전송 멱등 키**(0008)가 스키마에 서 있는가 — 이게 빠지면 다시 보낸 녹음이 새 회차로 앉아 5회차 자리에 4회차 소리가 앉는다. 그리고 **`encounters` 가 덧붙이는가**. 뒤쪽은 한 번 덮어쓰기로 돌아간 적이 있고, 그때 코드에는 반대로 적힌 주석이 또렷하게 달려 있었다. **틀려도 화면은 똑같이 돌고 인식률만 위로 부푼 채 D+14 까지 간다** — 그런 문장은 주석이 아니라 테스트로 적는다.

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
| `recordings` | 피치 곡선만. 원본 오디오는 key + 만료일만 | `target_voice_kind`·`target_voice_id` = 겨눈 기준선을 무엇으로 만들었는지 (0007). `client_id` = 재전송 멱등 키 (0008) |
| `encounters` | 재만남 인식 기록 (지표용) | 읽을 때마다 **쌓는다**. `recognized` 는 셋: true·false·NULL(판정할 자리가 아니었다) |
| `account_deletions` | 삭제 원장. 백업 복구 시 재삭제 근거 | 앱은 INSERT 만 |

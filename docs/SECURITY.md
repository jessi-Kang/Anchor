# 보안 점검 (데이터 원칙이 실제로 성립하는가)

`CLAUDE.md` 의 데이터 원칙은 협상 불가 전제다. 이 문서는 그 전제가 코드와 DB 에서 실제로 성립하는지를 항목으로 풀고, 항목마다 지금 상태를 적는다.

기능이 예쁜지, 코드가 깔끔한지는 여기서 보지 않는다. 보는 것은 셋이다. 데이터를 잃지 않는가, 남에게 새지 않는가, 지운다고 한 것이 실제로 지워지는가.

점검 시각: 2026-09-20. 대상: `main` (`405a0c5`) 과 프로덕션 배포.

2장의 판정 중 `src/**` 를 근거로 한 것은 개발이 F02~F11 을 올리기 전의 코드를 읽고 매긴 것이다. 새로 들어온 코드는 아직 보지 않았다.

## 1. 점검 항목

### A. 계정 간 분리

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| A1 | 사용자 데이터를 담는 모든 표에 `user_id` 가 있고 `users(id)` 로 FK + `ON DELETE CASCADE` 다 | `db/migrations/*.sql` 의 `CREATE TABLE` 전부 |
| A2 | 모든 표에 RLS 가 켜져 있다 | `/api/health` 의 `rls_all_enabled`, `tables[].rowsecurity` |
| A3 | 앱 런타임 역할은 `anchor_app` 이고 `BYPASSRLS` 가 없다 | `/api/health` 의 `db_role`, `role_bypasses_rls` |
| A4 | 정책은 `anchor_app` 에만 걸려 있고 `app.current_user_id()` 와 비교한다. 이 값이 없으면 어떤 행도 보이지 않는다 | `db/migrations/0002_rls.sql` |
| A5 | 사용자 데이터 쿼리는 전부 `withUser()` 안에서 돈다. `withoutUser()` 는 공용 참조 데이터와 헬스체크에만 쓴다 | `src/lib/db/index.ts` 와 `withoutUser` 호출처 |
| A6 | `USING (true)` 정책이 있는 표는 사용자 자료를 담지 않고, 남이 쓴 것이 내 화면에 뜨지 않는다 | `pg_policies` 또는 RLS 마이그레이션 |
| A7 | 앱은 소유자 연결(`DATABASE_URL`)을 쓰지 않는다. 소유자 연결은 마이그레이션·백업·복구 전용이다 | `src/lib/env.ts`, `src/**` 의 `process.env` 사용처 |

### B. 비밀값

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| B1 | 추적되는 env 파일은 `.env.example` 하나다 | `git ls-files` |
| B2 | `.env.example` 에는 자리표시자만 있다 | 파일과 그 이력 |
| B3 | 저장소 이력 전체에 연결 문자열·API 키가 없다 | `git grep` 을 전 커밋에 |
| B4 | 서버 전용 값이 클라이언트 번들에 섞이지 않는다. `NEXT_PUBLIC_` 변수가 없다 | `"use client"` 파일의 import, `process.env` 검색 |
| B5 | 인증 안 된 응답에 호스트·연결 문자열·스택이 실리지 않는다 | 각 라우트의 오류 경로 |
| B6 | 커밋 메시지에 키·내부 URL·개인정보가 없다 | `git log` 전문 검색 |

### C. 지운다고 한 것이 지워지는가

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| C1 | `POST /api/account/delete` 는 로그인한 본인만, 확인 문구가 있어야 돈다 | `src/app/api/account/delete/route.ts` |
| C2 | `users` 행 삭제가 모든 사용자 표로 CASCADE 된다. 빠진 표가 없다 | A1 의 FK 목록과 표 목록을 맞춰 본다 |
| C3 | 삭제 원장 `account_deletions` 에 행이 남고, CASCADE 에 딸려 지워지지 않는다 | `0001_init.sql` 의 `account_deletions` (FK 없음) |
| C4 | 보존 기간이 지난 백업 사본이 실제로 지워지고 `backups_purged_at` 이 채워진다 | `/api/cron/backup` 의 `list`+`del` 경로, 스토어의 실제 파일 목록 |
| C5 | 원장이 "사본이 사라졌다"고 표시하는 시각이 마지막 사본이 사라지는 시각보다 이르지 않다 | 백업 주기와 보존 기간 계산 |

음성 원본은 아직 코드가 없다. C6~C13 은 녹음이 들어오는 순간부터 참이어야 하는 것이고, 지금 적어 두는 이유는 3장 N4 에 있다.

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| C6 | 원본 오디오가 계정 전용 비공개 스토어에 있다. 링크를 아는 것만으로 열리지 않는다 | 업로드 호출의 access 설정, 오브젝트 URL 을 로그아웃 상태로 열어 본다 |
| C7 | 읽기 경로가 요청자의 세션 사용자와 오브젝트 키의 사용자를 대조한다 | 재생·내려받기 라우트 |
| C8 | 업로드가 `audio_expires_at` 을 그 사용자의 `voice_retention_days` 로 정한다. 코드에 30 을 상수로 쓰지 않는다 | 업로드 경로 |
| C9 | 만료된 오브젝트를 지우는 주기 작업이 있다. 오브젝트를 지운 **뒤에** `audio_object_key` 를 NULL 로 만든다 | 주기 작업의 순서 |
| C10 | 원본이 사라져도 `pitch`·`target_pitch` 는 남아 곡선 비교가 계속된다 | 만료 뒤의 F10 화면 |
| C11 | 설정에서 기간을 줄이면 이미 있는 녹음의 `audio_expires_at` 도 함께 당겨진다 | 설정 저장 경로 |
| C12 | 계정 삭제가 그 사용자의 오브젝트를 전부 지운다. 스토리지 삭제가 실패하면 성공으로 응답하지 않는다 | 삭제 라우트의 스토리지 호출과 오류 처리 |
| C13 | 녹음 업로드가 남의 `chunk_id`·`card_id` 로 행을 만들지 못한다 | `recordings` 의 INSERT 정책 |

### D. 외부로 나가는 것

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| D1 | Claude API 호출이 학습에 쓰지 않는 설정으로 나간다 | 호출부의 요청 헤더·옵션 |
| D2 | ElevenLabs 호출도 같다 | 같음 |
| D3 | 한 번 호출에 필요한 것만 싣는다. 사용자 자료 전체를 보내지 않는다 | 호출부가 만드는 payload |
| D4 | 외부 호출 결과가 다른 사용자에게 닿는 캐시에 사용자 자료를 남기지 않는다 | 캐시 표의 키와 값 |

### E. 백업과 복구

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| E1 | 매일 JSON 백업이 비공개 스토어에 저장된다 | `put(..., access: "private")` 와 스토어 설정 |
| E2 | `/api/cron/backup` 이 `CRON_SECRET` 없이 호출되지 않는다 | 헤더 없이 호출해 본다 |
| E3 | 어떤 백업에도 Google OAuth 토큰이 담기지 않는다 | 백업이 뜨는 표와 컬럼 목록 (세 층 전부) |
| E4 | 복구 절차가 역할·권한·RLS 까지 되살린다 | `db/recovery/reapply-roles-and-rls.sql` |
| E5 | 복구 절차가 프로덕션에 실제로 적용된 스키마를 그대로 다시 만든다 | `/api/health` 의 `latest_migration` 과 `main` 의 `db/migrations/` 를 맞춰 본다 |
| E6 | 복구 뒤 같은 Google 계정이 같은 `user_id` 로 이어진다 | 복원 스크립트가 넣는 표 목록 |
| E7 | 복구 리허설이 분기마다 실제로 수행된다 | `docs/BACKUP.md` 의 리허설 표 |

### F. 인증

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| F1 | 세션 쿠키가 `HttpOnly`·`Secure`·`SameSite`·`__Secure-` 접두사를 갖는다 | 로그인해서 `Set-Cookie` 를 본다 |
| F2 | 쿠키 서명 비밀이 32자 이상이다 | `src/lib/env.ts` |
| F3 | 로그인 없이 보호 경로에 닿으면 로그인 화면으로 돌아간다 | 세션 없이 각 경로를 호출해 본다 |
| F4 | 모든 API 라우트와 서버 액션이 스스로 사용자 확인을 한다. 미들웨어에만 기대지 않는다 | `src/app/api/**`, `**/actions.ts` 전부 |
| F5 | 미들웨어 matcher 에서 뺀 경로는 각자 다른 방식으로 막혀 있다 | `src/proxy.ts` 의 matcher 와 뺀 경로들 |

## 2. 지금 상태

| # | 판정 | 근거 |
| --- | --- | --- |
| A1 | 확인함 | `inputs`·`nodes`·`edges`·`user_node_state`·`cards`·`chunks`·`recordings`·`encounters` 전부 `REFERENCES users(id) ON DELETE CASCADE` |
| A2 | 확인함 | 프로덕션 `/api/health` 200, `rls_all_enabled: true`, 표 10개 모두 `rowsecurity: true` |
| A3 | 확인함 | 같은 응답의 `db_role: anchor_app`, `role_bypasses_rls: false`. 역할은 `0001` 이 `NOBYPASSRLS` 로 만든다 |
| A4 | **확인 못 함** | `0002` 의 모든 정책이 `TO anchor_app` 이고 `app.current_user_id()` 와 비교한다. 여기까지는 파일을 읽어 확인했다. 정책이 실제로 남의 행을 막는지는 두 계정으로 돌려야 하고, 아직 돌리지 못했다 (4장) |
| A5 | 확인함 | `withoutUser()` 를 쓰는 곳은 `/api/health` 하나다. 나머지 사용자 데이터 경로는 전부 `withUser()` |
| A6 | 확인함 | `node_cards` 만 `USING (true)` 를 쓰고 그것은 SELECT 전용이다. INSERT·UPDATE 는 `nodes.user_id IS NULL` 인 공용 노드로 제한된다. 그 표는 카드 문안만 담고 사용자 자료를 담지 않는다 |
| A7 | 확인함 | `src/lib/env.ts` 는 `ANCHOR_DATABASE_URL` 만 읽는다. `DATABASE_URL` 을 읽는 런타임 코드는 `/api/cron/backup` 뿐이고, 그것은 백업이라 소유자 연결이 필요하다 |
| B1 | 확인함 | `.gitignore` 의 `.env*` + `!.env.example`. 추적되는 env 파일은 `.env.example` 하나 |
| B2 | 확인함 | 값이 있는 줄은 자리표시자와 공개된 voice_id 뿐. 이 파일의 모든 과거 버전도 같다 |
| B3 | 확인함 | 전 커밋 검색에서 연결 문자열·API 키 형태 0건. `.env` 가 커밋된 적 없다 |
| B4 | 확인함 | `NEXT_PUBLIC_` 0건. 클라이언트 컴포넌트가 `@/lib/db/onboarding` 에서 가져오는 것은 `import type` 뿐이라 번들에서 지워진다 |
| B5 | **못 지킴** | `/api/health` 의 예외 경로가 인증 없이 드라이버 오류 문구를 돌려준다 (3장 N2). `405a0c5` 기준 그대로다 |
| B6 | 확인함 | 커밋 메시지 전문 검색에서 0건 |
| C1 | 확인함 | `requireUser()` 로 401, `confirm: "삭제"` 아니면 400. 미들웨어가 `/api/account/*` 도 막는다 |
| C2 | 확인함 | A1 의 FK 목록에 빠진 사용자 표가 없다. CASCADE 는 참조 무결성 동작이라 RLS 와 무관하게 돈다 |
| C3 | 확인함 | `account_deletions` 는 `users` 를 참조하지 않는다. 원장 INSERT 와 `users` DELETE 가 같은 트랜잭션이고 INSERT 가 먼저다 |
| C4 | **확인 못 함** | 코드 경로는 있다. 첫 백업이 2026-09-20 이라 35일 만료 삭제는 아직 한 번도 돌지 않았다. 2026-10-25 이후에 실제 파일 목록으로 확인한다 |
| C5 | 확인함 | 삭제 요청 뒤의 백업에는 그 계정이 없다. 마지막 사본은 요청 직전 백업이고 `requested_at` 보다 이르다. 원장 표시 시각(`requested_at` + 보존 기간)이 그보다 늦다 |
| C6~C13 | **확인 못 함** | 녹음 기능이 아직 없다. 원본을 지우는 코드도, 계정 삭제가 스토리지를 지우는 코드도 없다 (3장 N4) |
| D1 | **확인 못 함** | Claude API 호출이 `main` 에 들어왔다(`src/lib/kanji/card-content.ts`). 호출에 학습 미사용을 켜는 인자는 없다. Anthropic API 에는 요청 단위 설정이 없고 상용 API 약관이 기본으로 학습에서 제외하므로, 이 원칙은 코드가 아니라 **계정 약관으로 지켜진다**. 계정 쪽을 확인해야 판정이 끝난다 (3장 D-계정) |
| D2 | **확인 못 함** | ElevenLabs 호출이 `main` 에 들어왔다(`src/app/api/tts/route.ts`). 같은 모양이다. ElevenLabs 는 계정 단위 보관·학습 설정이 따로 있어 콘솔에서 확인해야 한다 (3장 D-계정) |
| D3 | 확인함 | 카드 생성은 사전 데이터(음독·한국 한자음·영어 뜻·부품)만 보낸다. 추측 판정은 추측 한 줄과 정답만 보낸다. TTS 는 200자로 자른다. 사용자 자료를 통째로 보내는 경로가 없다 |
| D4 | 확인함 | 외부 호출 결과를 담는 캐시는 `node_cards` 하나고, 쓰기가 공용 노드로 제한된다(A6). 담기는 것은 사전 데이터에서 만든 카드 문안이다. 추측 판정 결과는 캐시하지 않는다 |
| E1 | 확인함 (코드) | `/api/cron/backup` 이 `access: "private"` 로 올린다. 스토어 자체의 설정은 Vercel 콘솔에서만 보이고 이 세션은 보지 않는다 |
| E2 | 확인함 | 프로덕션에서 헤더 없이 호출하면 403 |
| E3 | 확인함 | 두 층 모두 토큰을 뺀다. 매일 JSON 백업은 매핑 컬럼만 뜨고, `pg_dump` 는 `--exclude-table-data='neon_auth.account'` 로 그 표의 행을 뺀다 |
| E4 | 확인함 | `db/recovery/reapply-roles-and-rls.sql` 이 역할·권한·`0002`·`0003` 을 다시 적용한다 |
| E5 | 확인함 | `main` 이 `0006` 까지 담고 프로덕션은 `0005` 다. `main` 이 앞서므로 `main` 을 체크아웃한 복구가 프로덕션 스키마를 빠짐없이 다시 만든다 |
| E6 | **못 지킴** | 백업은 `neon_auth.user`·`account` 를 담지만 복원 스크립트는 `public.*` 만 넣는다 (3장 L2) |
| E7 | **확인 못 함** | `docs/BACKUP.md` 의 리허설 표가 비어 있다. 백업에서 실제로 복구된 적이 없다 (3장 L3) |
| F1 | **확인 못 함** | 로그인 시작이 내려주는 쿠키는 `__Secure-` 접두사에 `HttpOnly; Secure; SameSite=Lax; Path=/` 를 모두 갖는다. 로그인을 마친 뒤의 세션 쿠키는 실제 Google 로그인이 있어야 본다 |
| F2 | 확인함 | `src/lib/env.ts` 가 32자 미만이면 시작 시점에 던진다 |
| F3 | 확인함 | 세션 없이 `/today`·`/settings`·`/onboarding/languages`·`/api/export`·`/api/account/delete` 가 모두 307 로 `/` 로 간다 |
| F4 | 확인함 | API 라우트 둘(`export`·`account/delete`)과 서버 액션 여덟이 전부 `requireUser()` 를 먼저 부른다. 페이지는 `currentUser()` 가 없으면 리다이렉트한다 |
| F5 | 확인함 | matcher 에서 뺀 셋은 `/api/auth`(인증 자체), `/api/health`(사용자 데이터 없음), `/api/cron`(`CRON_SECRET` 으로 막힘) |

## 3. 못 지키는 것과 그 이유

등급 셋. **샘** = 남의 데이터가 보이거나 비밀값이 나간다. **잃음** = 데이터가 사라지거나 되돌릴 수 없다. **나중에** = 지금 사용자가 한 명이라 영향이 없지만 다수 계정에서 문제가 된다.

고치는 곳은 전부 `src/**` · `db/**` · `scripts/**` · `.github/**` 라 Anchor · 개발 소유다. 아래 제안은 제안이고, 이 세션은 코드를 고치지 않는다.

고쳐진 것은 이 장에서 뺀다. 무엇이 언제 고쳐졌는지는 git 이 담는다.

### D-계정 · 나중에 — 학습 미사용이 코드가 아니라 계정에 달려 있다

`CLAUDE.md` 는 "사용자 자료를 외부 LLM 에 보낼 때 학습에 쓰지 않는 설정으로 호출한다" 를 전제로 둔다. 지금 밖으로 나가는 것은 둘이다.

| 어디로 | 무엇이 나가나 | 사용자 자료인가 |
| --- | --- | --- |
| Claude API (`card-content.ts` 카드 생성) | 한자 하나의 사전 데이터 | 아니다 |
| Claude API (`card-content.ts` 추측 판정) | **사용자가 쓴 추측 한 줄**과 정답 | 그렇다 |
| ElevenLabs (`/api/tts`) | 읽어 줄 텍스트 200자 이하 | 학습 항목이다 |

두 API 모두 **요청 단위로 "학습에 쓰지 마라"를 켜는 인자가 없다.** 코드에서 할 수 있는 것이 없다는 뜻이고, 실제로 코드는 아무것도 넘기지 않는다. 보장은 계정 약관과 콘솔 설정에서 나온다.

그래서 이 항목은 코드를 읽어서는 끝나지 않는다. Jessi 가 두 곳을 한 번 확인하고 그 사실을 여기 적어야 판정이 닫힌다. 지금 사용자가 한 명이고 나가는 양이 적어 급하지는 않다.

### L2 · 잃음 — 복구해도 사용자가 자기 데이터에 닿지 못한다

매일 JSON 백업은 `neon_auth.user` 와 `neon_auth.account` 를 담는다. `scripts/backup/restore-json.ts` 의 복원 목록은 `public.*` 열 개뿐이다.

그래서 복구한 DB 에는 행이 다 있는데, 같은 Google 계정으로 다시 로그인하면 Neon Auth 가 새 `user.id` 를 발급하고, RLS 가 옛 행을 전부 가린다. 데이터는 남아 있고 주인만 닿지 못한다. 사용자에게는 유실과 같다.

`docs/BACKUP.md` C-4 는 이것을 "콘솔에서 사용자를 다시 만들 때 id 를 맞춘다" 는 수동 단계로 적어 두었다. 그 단계는 한 번도 수행된 적이 없어서 실제로 가능한지, 얼마나 걸리는지 아무도 모른다.

제안: 다음 리허설(L3)에서 C-4 를 실제로 해 보고 걸린 시간을 표에 적는다. 콘솔에서 id 를 맞출 수 없으면 복원 스크립트가 `neon_auth` 매핑도 넣도록 바꾼다.

### L3 · 잃음 — 복구 리허설이 한 번도 없었다

`docs/BACKUP.md` 설정 체크리스트의 마지막 칸이 비어 있고 리허설 표가 비어 있다. 백업이 떠지는 것은 확인됐고, 그 백업에서 실제로 복구되는 것은 확인된 적이 없다. 백업은 복구된 적이 있어야 백업이다.

L2 는 리허설을 한 번만 했어도 나왔을 문제다.

리허설은 `docs/TEAM.md` 7장이 PM 의 일로 정했다. 임시 Neon 브랜치에서 하고 프로덕션 브랜치는 건드리지 않는다.

### N2 · 나중에 — `/api/health` 예외 응답이 내부 오류 문구를 그대로 돌려준다

`/api/health` 는 인증이 필요 없다. DB 연결이 끊기면 드라이버 오류 문구가 그대로 나가고, 거기에 DB 호스트 이름이 섞일 수 있다. 그 호스트는 로그인 시작 응답에도 이미 나오므로 새로 새는 것은 없다.

제안: 예외 경로는 `{ ok: false }` 만 돌려주고 자세한 것은 서버 로그로 남긴다.

### N3 · 나중에 — `user_node_state` 가 남의 개인 노드를 가리킬 수 있다

`recordSeedJudgement` 는 `node_id` 의 uuid 모양만 확인한다. `user_node_state` 의 RLS 는 `user_id` 만 본다. 그래서 다른 사용자의 개인 노드 id 를 알면 그 id 로 자기 상태 행을 만들 수 있다.

남의 데이터가 읽히지는 않는다. `nodes_read` 가 공용 노드와 자기 노드만 돌려주므로 그 행은 아무것도 보여 주지 않는다. 쓰레기 행이 남을 뿐이다. 다수 계정에서 그래프 통계가 어긋난다.

제안: INSERT 정책에 노드 조건을 더한다.

```sql
WITH CHECK (user_id = app.current_user_id()
  AND EXISTS (SELECT 1 FROM nodes n
              WHERE n.id = node_id AND (n.user_id IS NULL OR n.user_id = app.current_user_id())))
```

### N4 · 나중에 — 음성 원본을 지우는 경로가 없다

`recordings.audio_object_key`·`audio_expires_at` 과 `users.voice_retention_days` 는 표에만 있다. 만료된 오브젝트를 지우는 코드도, 계정 삭제가 오브젝트를 지우는 코드도 없다.

녹음 기능이 아직 없어 지금 남아 있는 원본이 하나도 없다. 그래서 오늘은 영향이 없다. 녹음이 들어오는 순간 C6~C13 이 한꺼번에 못 지킴이 된다. 녹음을 붙이는 커밋과 삭제 경로가 같이 들어와야 한다.

세 가지는 나중에 고치기 특히 비싸서 설계할 때 정해 두는 편이 싸다.

- **DB CASCADE 는 스토리지를 지우지 않는다.** `users` 행을 지우면 `recordings` 행이 함께 사라지고, 그 행에 있던 `audio_object_key` 도 같이 사라진다. 키가 사라지면 어떤 오브젝트를 지워야 하는지 알 방법이 없다. 그래서 계정 삭제는 DB 를 지우기 **전에** 그 사용자의 오브젝트를 지워야 한다. 순서가 반대면 스토리지에 주인 없는 오디오가 영구히 남는다 (C12).
- **주기 삭제도 순서가 있다.** 오브젝트를 먼저 지우고 그다음 `audio_object_key` 를 NULL 로 만든다. 반대로 하면 실패한 삭제가 고아 오브젝트로 남고, 남았다는 사실조차 DB 에 없다 (C9).
- **`recordings` 의 INSERT 정책이 `user_id` 만 본다.** `chunk_id`·`card_id` 가 남의 행을 가리킬 수 있다. N3 와 같은 모양이고, 같은 방식으로 막는다 (C13).

키를 사용자별 경로(`<user_id>/<recording_id>`)로 두면 계정 삭제가 접두사 하나로 끝나고, 키가 사라진 뒤에도 정리할 길이 남는다.

### N5 · 나중에 — `db/README.md` 가 지금의 RLS 와 다르게 적혀 있다

`db/README.md` 는 "모든 사용자 테이블은 `FORCE ROW LEVEL SECURITY` 라 소유자 연결에서도 정책이 적용된다" 고 적는다. `0003` 이후 거짓이다. 소유자 연결은 정책을 통과해 전체를 읽는다. 백업이 그래야 해서 일부러 푼 것이고, 앱 역할의 격리는 그대로다.

다음 사람이 소유자 연결을 실제보다 안전하다고 오해한다. `db/**` 는 Anchor · 개발 소유다.

## 4. 다음에 볼 것

- `main` 에 없는 것은 보지 않았다. 개발 브랜치의 `0006`·Claude API 호출(D1~D4)은 P0 가 끝나면 본다.
- RLS 가 실제로 남의 행을 막는지(A4)는 두 계정으로 돌려 봐야 확인이 끝난다. 임시 브랜치 `sec-rls-check` 는 만들어 뒀고 프로덕션과 같은 스키마(`0005`)다. **보안 세션의 환경에서는 이 검증을 할 수 없다.** 네 경로가 다 막힌다: Neon MCP 의 SQL 실행(읽기 포함)은 승인 거부, `psql` 은 이 컨테이너가 HTTPS 만 내보내고 5432 가 막혀서 불가, 연결 문자열을 명령에 싣는 것과 환경에서 자격증명을 찾는 것은 가드레일이 막는다. 도구 선택의 문제가 아니라 환경의 성질이라 허용 목록을 고쳐도 열리지 않는다.
  - 그래서 부록의 스크립트를 **DB 에 닿는 다른 세션이나 사람이 돌린다.** 결과를 받아 이 문서의 A4 를 갱신하는 것이 보안 세션의 몫이다.
  - 그 브랜치에서 확인된 것: 소유자 역할 `neondb_owner` 는 `BYPASSRLS` 가 **있다**. 앱이 소유자 연결을 쓰면 RLS 가 통째로 무력화된다는 뜻이고, A7 이 지켜져야 하는 이유다. `anchor_app` 은 `BYPASSRLS`·`SUPERUSER` 둘 다 없다.
- C4(보존 기간 만료 삭제)는 2026-10-25 이후에 스토어의 실제 파일 목록으로 확인한다.

## 부록. A4 검증 스크립트 (두 계정 RLS)

**임시 브랜치에서만 돌린다.** 테스트 계정을 만들고 지운다. 프로덕션 브랜치에 돌리지 않는다.

`anchor_app` 연결로 돌린다. 소유자 연결(`neondb_owner`)은 `BYPASSRLS` 가 있어 아무것도 검증하지 못한다. 기대값이 하나라도 어긋나면 그것이 "샘" 이다.

```sql
\set ON_ERROR_STOP off
SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls;
-- 기대: anchor_app / false

-- 1) 컨텍스트 없음 → 어떤 행도 보이지 않는다
SELECT set_config('app.user_id','',false);
SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM inputs) i,
       (SELECT count(*) FROM cards) c, (SELECT count(*) FROM recordings) r;
-- 기대: 0 0 0 0

-- 2) A 와 B 를 각자의 컨텍스트에서 만든다 (앱이 쓰는 경로 그대로)
SELECT set_config('app.user_id','sec_test_a',false);
INSERT INTO users (id,email) VALUES ('sec_test_a','a@sec.test');
INSERT INTO nodes (id,user_id,lang,kind,key,display) VALUES ('aaaaaaaa-0000-4000-8000-00000000000a','sec_test_a','en','word','sec_a','A');
INSERT INTO inputs (user_id,kind,lang,body) VALUES ('sec_test_a','paste','en','A body');
INSERT INTO cards (id,user_id,kind,lang,node_id,payload) VALUES ('cccccccc-0000-4000-8000-00000000000a','sec_test_a','discover','en','aaaaaaaa-0000-4000-8000-00000000000a','{"answer":"A"}');

SELECT set_config('app.user_id','sec_test_b',false);
INSERT INTO users (id,email) VALUES ('sec_test_b','b@sec.test');
INSERT INTO nodes (id,user_id,lang,kind,key,display) VALUES ('bbbbbbbb-0000-4000-8000-00000000000b','sec_test_b','en','word','sec_b','B');
INSERT INTO inputs (user_id,kind,lang,body) VALUES ('sec_test_b','paste','en','B body');
INSERT INTO cards (id,user_id,kind,lang,node_id,payload) VALUES ('cccccccc-0000-4000-8000-00000000000b','sec_test_b','discover','en','bbbbbbbb-0000-4000-8000-00000000000b','{"answer":"B"}');

-- 3) A 는 A 만 본다
SELECT set_config('app.user_id','sec_test_a',false);
SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM inputs) i, (SELECT count(*) FROM cards) c;
-- 기대: 1 1 1
SELECT count(*) FROM cards WHERE id='cccccccc-0000-4000-8000-00000000000b';
-- 기대: 0  (id 를 알아도 안 보인다)

-- 4) A 는 B 를 고치거나 지우지 못한다
UPDATE cards SET guess='x' WHERE id='cccccccc-0000-4000-8000-00000000000b';  -- 기대: UPDATE 0
DELETE FROM inputs WHERE user_id='sec_test_b';                               -- 기대: DELETE 0
INSERT INTO inputs (user_id,kind,lang,body) VALUES ('sec_test_b','paste','en','x');
-- 기대: ERROR  new row violates row-level security policy

-- 5) 삭제 원장은 앱이 읽지 못한다
SELECT count(*) FROM account_deletions;   -- 기대: ERROR  permission denied

-- 6) 공용 노드는 읽고, 공용 노드를 만들지는 못한다
SELECT count(*) > 0 AS shared_readable FROM nodes WHERE user_id IS NULL;   -- 기대: true
INSERT INTO nodes (user_id,lang,kind,key,display) VALUES (NULL,'en','word','sec_shared','X');
-- 기대: ERROR  new row violates row-level security policy

-- 7) 계정 삭제가 CASCADE 된다
DELETE FROM users WHERE id='sec_test_a';   -- 기대: DELETE 1
SELECT (SELECT count(*) FROM inputs) i, (SELECT count(*) FROM cards) c, (SELECT count(*) FROM nodes WHERE user_id IS NOT NULL) n;
-- 기대: 0 0 0

-- 8) 정리
SELECT set_config('app.user_id','sec_test_b',false);
DELETE FROM users WHERE id='sec_test_b';
```

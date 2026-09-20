# 보안 점검 (데이터 원칙이 실제로 성립하는가)

`CLAUDE.md` 의 데이터 원칙은 협상 불가 전제다. 이 문서는 그 전제가 코드와 DB 에서 실제로 성립하는지를 항목으로 풀고, 항목마다 지금 상태를 적는다.

기능이 예쁜지, 코드가 깔끔한지는 여기서 보지 않는다. 보는 것은 셋이다. 데이터를 잃지 않는가, 남에게 새지 않는가, 지운다고 한 것이 실제로 지워지는가.

점검 시각: 2026-09-20. 대상: `main` (`4c02ff5`) 과 프로덕션 배포(마이그레이션 `0006`).


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

C6~C13 은 음성 원본에 대한 것이다. `/api/recordings` 가 들어오면서 실제 항목이 됐다.

| # | 무엇이 참이어야 하는가 | 어떻게 확인하는가 |
| --- | --- | --- |
| C6 | 원본 오디오가 계정 전용 비공개 스토어에 있다. 링크를 아는 것만으로 열리지 않는다 | 업로드 호출의 access 설정, 오브젝트 URL 을 로그아웃 상태로 열어 본다 |
| C7 | 읽기 경로가 요청자의 세션 사용자와 오브젝트 키의 사용자를 대조한다 | 재생·내려받기 라우트 |
| C8 | 업로드가 `audio_expires_at` 을 그 사용자의 `voice_retention_days` 로 정한다. 코드에 30 을 상수로 쓰지 않는다 | 업로드 경로 |
| C9 | 만료된 오브젝트를 지우는 주기 작업이 있다. 오브젝트를 지운 **뒤에** `audio_object_key` 를 NULL 로 만든다 | 주기 작업의 순서 |
| C10 | 원본이 사라져도 `pitch`·`target_pitch` 는 남아 곡선 비교가 계속된다 | 만료 뒤의 F10 화면 |
| C11 | 설정에서 기간을 줄이면 이미 있는 녹음의 `audio_expires_at` 도 함께 당겨진다 | 설정 저장 경로 |
| C12 | 계정 삭제가 그 사용자의 오브젝트를 전부 지운다. 스토리지 삭제가 실패하면 성공으로 응답하지 않는다 | 삭제 라우트의 스토리지 호출과 오류 처리 |
| C13 | 녹음 업로드가 남의 `chunk_id`·`card_id` 로 행을 만들지 못한다 | 업로드 경로의 주인 확인, 또는 `recordings` 의 INSERT 정책 |

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
| F6 | 로컬 전용 문(시험 로그인)은 프로덕션 빌드에 들어가지 않는다 | 빌드 라우트 목록, `.next` 문자열 검색, 프로덕션 호출 |

## 2. 지금 상태

판정은 넷이다. **돌림** = 실제로 실행해 결과를 봤다. **절반** = 한쪽은 돌려 봤고 나머지 한쪽은 이 환경에서 못 돌린다. **읽음** = 코드·설정을 읽었다. 그 밖에 **못 지킴**·**확인 못 함**·**해당 없음**.

돌림에는 **어디서 돌렸는지**를 같이 적는다. 로컬에서 닫은 것은 "로컬에서 확인함"이지 "프로덕션에서 확인함"이 아니다. 로컬은 PG16, 프로덕션은 PG18 이다.

읽음과 돌림을 나누는 이유가 있다. 읽어서 내린 판정은 "그렇게 쓰여 있다"이지 "그렇게 동작한다"가 아니다. 권한·정책·트랜잭션 경계·삭제가 실제로 일어나는지는 **런타임에만 드러나고 읽어서는 잡히지 않는다.** 계정 삭제가 그 자리에서 났다 — 코드는 맞게 보였고 권한이 모자라 한 번도 성공한 적이 없었다.

| # | 판정 | 근거 |
| --- | --- | --- |
| A1 | 돌림 (로컬) | 여덟 표 전부 `REFERENCES users(id) ON DELETE CASCADE`. 로컬 DB 에 마이그레이션을 적용하고 한 계정을 지워 여덟 표가 모두 0행이 되는 것을 봤다 |
| A2 | 돌림 (프로덕션) | `/api/health` 200, `rls_all_enabled: true`, `node_cards` 를 포함한 표 11개 모두 `rowsecurity: true` |
| A3 | 돌림 (프로덕션) | `/api/health` 응답의 `db_role: anchor_app`, `role_bypasses_rls: false`. 역할은 `0001` 이 `NOBYPASSRLS` 로 만든다. 소유자 역할은 `BYPASSRLS` 를 가지고 `anchor_app` 에 ADMIN 도 가지므로 언제든 앱 역할이 될 수 있다. 격리는 소유자를 막는 것이 아니라 앱이 소유자 연결을 쓰지 않는 것(A7)으로 선다 |
| A4 | 돌림 (임시 브랜치) | 부록 스크립트를 임시 브랜치에서 두 계정으로 돌렸다(2026-09-20, `0005` 기준). 14단계 전부 기대값과 같다. 컨텍스트 없이 0행, A 는 A 만, B 의 행은 id 를 알아도 0행, B 를 고치거나 지우면 0행, B 소유로 INSERT 는 `42501`, 삭제 원장 읽기는 `permission denied`, 공용 노드는 읽히고 만들 수는 없다 |
| A5 | 읽음 | `withoutUser()` 를 쓰는 곳은 `/api/health` 하나다. 나머지 사용자 데이터 경로는 전부 `withUser()` |
| A6 | 돌림 (로컬) | `node_cards` 만 `USING (true)` 를 쓰고 SELECT 전용이다. 로컬 DB 에서 `anchor_app` 으로 돌렸다 — 공용 노드에 쓰기는 되고, **내 개인 노드에 쓰면 `42501` 로 막히고**, 읽기와 공용 행 UPDATE 는 되고, DELETE 는 권한이 없다 |
| A7 | 돌림 (프로덕션) | `/api/health` 가 `db_role: anchor_app` 을 돌려준다 — 앱이 실제로 앱 역할로 붙어 있다. `src/lib/env.ts` 는 `ANCHOR_DATABASE_URL` 만 읽고, `DATABASE_URL` 을 읽는 런타임 코드는 크론 둘뿐이다 |
| B1 | 읽음 | `.gitignore` 의 `.env*` + `!.env.example`. 추적되는 env 파일은 `.env.example` 하나 |
| B2 | 읽음 | 값이 있는 줄은 자리표시자와 공개된 voice_id 뿐. 이 파일의 모든 과거 버전도 같다 |
| B3 | 읽음 | 전 커밋 검색에서 연결 문자열·API 키 형태 0건. `.env` 가 커밋된 적 없다 |
| B4 | 읽음 | `NEXT_PUBLIC_` 0건. 클라이언트 컴포넌트가 `@/lib/db/onboarding` 에서 가져오는 것은 `import type` 뿐이라 번들에서 지워진다 |
| B5 | **못 지킴** | `/api/health` 의 예외 경로가 인증 없이 드라이버 오류 문구를 돌려준다 (3장 N2) |
| B6 | 읽음 | 커밋 메시지 전문 검색에서 0건 |
| C1 | 읽음 | `requireUser()` 로 401, `confirm: "삭제"` 아니면 400. 미들웨어가 `/api/account/*` 도 막고, 세션 없이 부르면 307 이다(프로덕션). HTTP 계층 전체를 돌려 보지는 못했다 — **이 항목이 한 번 거짓이었다.** 원장 INSERT 가 권한에 막혀 삭제가 500 으로 끝나던 것을 읽어서는 못 잡았다 |
| C2 | 돌림 (로컬·임시 브랜치) | 한 계정을 지워 `inputs`·`cards`·`chunks`·`recordings`·`user_node_state`·`encounters`·개인 `nodes` 가 전부 0행이 되는 것을 봤다(로컬). 임시 브랜치에서는 같은 순간 다른 계정의 행이 그대로인 것도 확인했다 — CASCADE 가 계정 경계를 넘지 않는다 |
| C3 | 돌림 (로컬) | 로컬 DB 에서 계정을 지운 뒤 **소유자 연결로 원장을 보니 그 행이 남아 있다**. `account_deletions` 는 `users` 를 참조하지 않아 CASCADE 에 딸려 가지 않는다. 앱 역할로는 원장을 읽지 못한다(`permission denied`, 같이 확인) |
| C4 | **확인 못 함** | 코드 경로는 있다. 첫 백업이 2026-09-20 이라 35일 만료 삭제는 아직 한 번도 돌지 않았다. 2026-10-25 이후에 실제 파일 목록으로 확인한다 |
| C5 | 읽음 | 삭제 요청 뒤의 백업에는 그 계정이 없다. 마지막 사본은 요청 직전 백업이고 `requested_at` 보다 이르다. 원장 표시 시각(`requested_at` + 보존 기간)이 그보다 늦다 |
| C6 | 절반 | (읽음) `/api/recordings` 가 `access: "private"` 로 올리고, 키가 `voice/<user_id>/…` 라 계정별로 갈린다. DB 에는 URL 이 아니라 pathname 만 남는다. **못 돌린 쪽**: 올라간 오브젝트 URL 을 로그아웃 상태로 열어 막히는지. Blob 이 걸려 로컬로는 안 된다 |
| C7 | 해당 없음 | 원본을 다시 들려주는 경로가 아직 없다. 생기는 순간 확인한다 |
| C8 | 읽음 | 업로드가 그 사용자의 `voice_retention_days` 를 읽어 `audio_expires_at` 을 정한다. 30 은 행이 없을 때의 대비값일 뿐이다 |
| C9 | 읽음 | `/api/cron/voice` 가 매일 돈다. 오브젝트를 지운 뒤에만 `audio_object_key` 를 NULL 로 만들고, 실패한 건은 행을 남겨 다음 번에 다시 집는다. `CRON_SECRET` 없이 부르면 403(프로덕션에서 확인) |
| C10 | 읽음 | `pitch` 는 `recordings` 행에 있고 오브젝트와 따로 산다 |
| C11 | 해당 없음 | 설정에 보관 기간을 바꾸는 행이 아직 없다 |
| C12 | 절반 | (로컬에서 돌림) DB 쪽은 확인했다 — 계정을 지우면 `recordings` 행이 CASCADE 로 사라진다. (읽음) 삭제 라우트가 스토리지를 **DB 보다 먼저** 지우고, 실패하면 DB 를 건드리지 않고 502, 토큰이 없으면 남은 원본을 세어 503 으로 멈춘다. **못 돌린 쪽**: 오브젝트가 실제로 사라지는지. Blob 이 걸려 로컬로는 안 된다 |
| C13 | 읽음 | `card_id`·`chunk_id` 둘 다 `WHERE id = $1 AND user_id = $2` 로 주인을 확인하고, 아니면 404 로 아무것도 만들지 않는다. 스토리지 키에는 입력값이 아니라 DB 가 돌려준 id 를 쓴다 |
| D1 | **확인 못 함** | Claude API 호출이 `main` 에 들어왔다(`src/lib/kanji/card-content.ts`). 호출에 학습 미사용을 켜는 인자는 없다. Anthropic API 에는 요청 단위 설정이 없고 상용 API 약관이 기본으로 학습에서 제외하므로, 이 원칙은 코드가 아니라 **계정 약관으로 지켜진다**. 계정 쪽을 확인해야 판정이 끝난다 (3장 N6) |
| D2 | **확인 못 함** | ElevenLabs 호출이 `main` 에 들어왔다(`src/app/api/tts/route.ts`). 같은 모양이다. ElevenLabs 는 계정 단위 보관·학습 설정이 따로 있어 콘솔에서 확인해야 한다 (3장 N6) |
| D3 | 읽음 | 카드 생성은 사전 데이터(음독·한국 한자음·영어 뜻·부품)만 보낸다. 추측 판정은 추측 한 줄과 정답만 보낸다. TTS 는 200자로 자른다. 사용자 자료를 통째로 보내는 경로가 없다 |
| D4 | 읽음 | 외부 호출 결과를 담는 캐시는 `node_cards` 하나고, 쓰기가 공용 노드로 제한된다(A6). 담기는 것은 사전 데이터에서 만든 카드 문안이다. 추측 판정 결과는 캐시하지 않는다 |
| E1 | 절반 | (읽음) `/api/cron/backup` 이 `access: "private"` 로 올린다. **못 돌린 쪽**: 백업 파일 URL 을 인증 없이 열어 막히는지, 스토어 설정이 실제로 비공개인지. 둘 다 Vercel 콘솔과 Blob 이 걸려 이 세션에서는 안 된다 |
| E2 | 돌림 (프로덕션) | 헤더 없이 호출하면 403 |
| E3 | 돌림 (로컬) | 백업 라우트와 같은 표 목록·컬럼 제한으로 덤프를 떠 보니 `neon_auth.account` 에 `id,accountId,providerId,userId,createdAt,updatedAt` 만 실리고 토큰 컬럼은 없다. 매일 JSON 백업은 매핑 컬럼만 뜨고, `pg_dump` 는 `--exclude-table-data='neon_auth.account'` 로 그 표의 행을 뺀다 |
| E4 | 돌림 (로컬) | 빈 DB 에 `pnpm db:migrate` → `pnpm backup:restore` 를 실제로 돌렸다. `anchor_app` 이 `BYPASSRLS` 없이 되살아나고, 표 전부 RLS 가 켜지고, 정책 19개가 선다. 복원된 DB 에서 두 계정이 각자 자기 행만 본다. 절차 C 에서 역할·RLS 를 되살리는 것은 마이그레이션이다 — `db/recovery/reapply-roles-and-rls.sql` 은 pg_dump 경로용이라 아직 읽음 |
| E5 | 돌림 (프로덕션) | `main` 과 프로덕션이 둘 다 `0006` 이다. `main` 을 체크아웃한 복구가 프로덕션 스키마를 그대로 다시 만든다 |
| E6 | **못 지킴** | 백업은 `neon_auth.user`·`account` 를 담지만 복원 스크립트는 `public.*` 만 넣는다 (3장 L2) |
| E7 | **확인 못 함** | `docs/BACKUP.md` 의 리허설 표가 비어 있다. 백업에서 실제로 복구된 적이 없다 (3장 L3) |
| F1 | **확인 못 함** | 로그인 시작이 내려주는 쿠키는 `__Secure-` 접두사에 `HttpOnly; Secure; SameSite=Lax; Path=/` 를 모두 갖는다. 로그인을 마친 뒤의 세션 쿠키는 실제 Google 로그인이 있어야 본다 |
| F2 | 읽음 | `src/lib/env.ts` 가 32자 미만이면 시작 시점에 던진다 |
| F3 | 돌림 (프로덕션) | 세션 없이 `/today`·`/settings`·`/onboarding/languages`·`/api/export`·`/api/account/delete` 가 모두 307 로 `/` 로 간다 |
| F4 | 읽음 | `src/app/api/**` 와 `**/actions.ts` 를 훑어 `requireUser()`·`currentUser()` 가 없는 것을 찾으면 셋뿐이고 각각 이유가 있다 — 인증 프록시, `CRON_SECRET` 으로 막힌 크론 둘, 사용자 데이터가 없는 헬스체크. 나머지는 전부 먼저 부른다 |
| F5 | 읽음 | matcher 에서 뺀 셋은 `/api/auth`(인증 자체), `/api/health`(사용자 데이터 없음), `/api/cron`(`CRON_SECRET` 으로 막힘) |
| F6 | 돌림 (프로덕션) | 시험 로그인은 세 겹으로 닫힌다. `next.config.ts` 가 `dev.ts` 를 `pageExtensions` 에 넣을 때만 라우트가 되고(`next build` 는 `NODE_ENV=production` 을 스스로 켠다), 부르는 쪽은 빌드 시점에 접히는 조건 안에서만 동적 import 하며, `testLoginEnabled()` 가 런타임에 다시 본다. 빌드 라우트 목록에 없고 `.next` 문자열 0건이며, 프로덕션에서 `/api/test-login` 은 없는 주소와 똑같이 307 이다 |

## 3. 못 지키는 것과 그 이유

등급 넷. 항목 번호의 앞 글자가 등급이다 (S·L·U·N).

| 등급 | 뜻 |
| --- | --- |
| **샘** (S) | 남의 데이터가 보이거나 비밀값이 나간다 |
| **잃음** (L) | 데이터가 사라지거나 되돌릴 수 없다 |
| **안 지워짐** (U) | 지우겠다고 약속한 데이터가 실제로는 남는다. 새는 것도 잃는 것도 아니지만 약속이 깨지고, 대개 되돌릴 수 없게 된다 |
| **나중에** (N) | 지금 사용자가 한 명이라 영향이 없지만 다수 계정에서 문제가 된다 |

어느 칸인지 분명하지 않으면 되돌릴 수 없게 되는 쪽을 무겁게 본다.

고치는 곳은 전부 `src/**` · `db/**` · `scripts/**` · `.github/**` 라 Anchor · 개발 소유다. 아래 제안은 제안이고, 이 세션은 코드를 고치지 않는다.

고쳐진 것은 이 장에서 뺀다. 무엇이 언제 고쳐졌는지는 git 이 담는다.

### L2 · 잃음 — 복구해도 사용자가 자기 데이터에 닿지 못한다 (재현됨)

매일 JSON 백업은 `neon_auth.user` 와 `neon_auth.account` 를 담는다. `scripts/backup/restore-json.ts` 의 복원 목록은 `public.*` 열 개뿐이다.

그래서 복구한 DB 에는 행이 다 있는데, 같은 Google 계정으로 다시 로그인하면 Neon Auth 가 새 `user.id` 를 발급하고, RLS 가 옛 행을 전부 가린다. 데이터는 남아 있고 주인만 닿지 못한다. 사용자에게는 유실과 같다.

`docs/BACKUP.md` C-4 는 이것을 "콘솔에서 사용자를 다시 만들 때 id 를 맞춘다" 는 수동 단계로 적어 두었다. 그 단계는 한 번도 수행된 적이 없어서 실제로 가능한지, 얼마나 걸리는지 아무도 모른다.

제안: 다음 리허설(L3)에서 C-4 를 실제로 해 보고 걸린 시간을 표에 적는다. 콘솔에서 id 를 맞출 수 없으면 복원 스크립트가 `neon_auth` 매핑도 넣도록 바꾼다.

**로컬에서 재현했다.** 시험 계정 둘을 만들어 백업 형식 그대로 덤프를 뜨고, 빈 DB 에 `pnpm db:migrate` → `pnpm backup:restore` 를 돌렸다.

| 무엇 | 결과 |
| --- | --- |
| `public.*` 열 표 | 전부 복원됨 |
| `neon_auth` 스키마 | **돌아오지 않음** (스키마 자체가 없다) |
| 옛 id 로 보는 행 | `inputs=1 cards=1 recordings=1` |
| 새 id 로 보는 행 | **`inputs=0 cards=0 recordings=0`** |
| 소유자로 보는 행 | `inputs=2` — 데이터는 DB 에 그대로 있다 |

마지막 두 줄이 이 항목의 전부다. 데이터는 살아 있고 주인만 닿지 못한다. 사용자에게는 유실과 구별되지 않는다.

### L3 · 잃음 — 진짜 백업 파일로는 복구해 본 적이 없다

절차 C 자체는 로컬에서 끝까지 돌았다(L2·E4). 우리가 만든 백업 형식이 빈 DB 에서 되살아나고, 역할·RLS 도 함께 선다.

닫히지 않은 절반은 **프로덕션 백업 파일**이다. 스토어에 실제로 쌓이는 `.json.gz` 를 내려받아 같은 절차를 밟아 본 적이 없다. 형식이 같으므로 돌 것으로 보지만, 그것은 읽어서 내린 판정이고 이 문서는 그 둘을 구분한다.

`docs/BACKUP.md` 의 리허설 표도 비어 있다. 분기 리허설은 PM 의 몫이다.

### N2 · 나중에 — `/api/health` 예외 응답이 내부 오류 문구를 그대로 돌려준다

`/api/health` 는 인증이 필요 없다. DB 연결이 끊기면 드라이버 오류 문구가 그대로 나가고, 거기에 DB 호스트 이름이 섞일 수 있다. 그 호스트는 로그인 시작 응답에도 이미 나오므로 새로 새는 것은 없다.

제안: 예외 경로는 `{ ok: false }` 만 돌려주고 자세한 것은 서버 로그로 남긴다.

### N3 · 나중에 — `user_node_state` 가 남의 개인 노드를 가리킬 수 있다

`recordSeedJudgement` 는 `node_id` 의 uuid 모양만 확인한다. `user_node_state` 의 RLS 는 `user_id` 만 본다. 그래서 다른 사용자의 개인 노드 id 를 알면 그 id 로 자기 상태 행을 만들 수 있다.

남의 데이터가 읽히지는 않는다. `nodes_read` 가 공용 노드와 자기 노드만 돌려주므로 그 행은 아무것도 보여 주지 않는다. 쓰레기 행이 남을 뿐이다. 다수 계정에서 그래프 통계가 어긋난다.

`/api/recordings` 는 앱에서 주인을 확인하도록 고쳐졌다. `user_node_state` 는 DB 층이 그대로다. 앱 경로는 대개 DB 에서 꺼낸 노드 id 를 넘기지만, 막는 것은 코드이지 표가 아니다.

**다음에 같은 모양이 될 표가 하나 더 있다.** `encounters` 는 지금 코드에 `INSERT` 가 한 곳도 없어 영원히 빈 표다. 행이 생기기 시작하면 `node_id`·`input_id` 를 받게 되는데, 그 표의 RLS 도 `user_id` 만 본다. 녹음이 겪은 것과 같은 자리다 — **INSERT 를 쓰는 커밋에서 주인 확인을 같이 넣는 편이 나중에 찾는 것보다 싸다.**

제안: INSERT 정책에 노드 조건을 더한다.

```sql
WITH CHECK (user_id = app.current_user_id()
  AND EXISTS (SELECT 1 FROM nodes n
              WHERE n.id = node_id AND (n.user_id IS NULL OR n.user_id = app.current_user_id())))
```

### N5 · 나중에 — `db/README.md` 가 지금의 RLS 와 다르게 적혀 있다

`db/README.md` 는 "모든 사용자 테이블은 `FORCE ROW LEVEL SECURITY` 라 소유자 연결에서도 정책이 적용된다" 고 적는다. `0003` 이후 거짓이다. 소유자 연결은 정책을 통과해 전체를 읽는다. 백업이 그래야 해서 일부러 푼 것이고, 앱 역할의 격리는 그대로다.

다음 사람이 소유자 연결을 실제보다 안전하다고 오해한다. `db/**` 는 Anchor · 개발 소유다.

### N6 · 나중에 — 학습 미사용이 코드가 아니라 계정에 달려 있다

`CLAUDE.md` 는 "사용자 자료를 외부 LLM 에 보낼 때 학습에 쓰지 않는 설정으로 호출한다" 를 전제로 둔다. 지금 밖으로 나가는 것은 둘이다.

| 어디로 | 무엇이 나가나 | 사용자 자료인가 |
| --- | --- | --- |
| Claude API (`card-content.ts` 카드 생성) | 한자 하나의 사전 데이터 | 아니다 |
| Claude API (`card-content.ts` 추측 판정) | **사용자가 쓴 추측 한 줄**과 정답 | 그렇다 |
| ElevenLabs (`/api/tts`) | 읽어 줄 텍스트 200자 이하 | 학습 항목이다 |

두 API 모두 **요청 단위로 "학습에 쓰지 마라"를 켜는 인자가 없다.** 코드에서 할 수 있는 것이 없다는 뜻이고, 실제로 코드는 아무것도 넘기지 않는다. 보장은 계정 약관과 콘솔 설정에서 나온다.

그래서 이 항목은 코드를 읽어서는 끝나지 않는다. Jessi 가 두 곳을 한 번 확인하고 그 사실을 여기 적어야 판정이 닫힌다. 지금 사용자가 한 명이고 나가는 양이 적어 급하지는 않다.

## 4. 다음에 돌려 볼 것

읽어서 내린 판정 중 **런타임에만 드러나는 성질**에 걸린 것들이다. 코드가 맞게 보여도 권한·정책·순서가 어긋나면 동작하지 않는다. 계정 삭제가 그렇게 한 번도 성공한 적이 없었다.

| # | 무엇을 돌려야 하는가 |
| --- | --- |
| C1 | 로그인한 계정으로 `POST /api/account/delete` 를 실제로 눌러 200 이 오는지. 확인 문구 없이 400, 세션 없이 401 인지 |
| C6 | 업로드된 오브젝트 URL 을 로그아웃 상태로 열어 막히는지 |
| C8 | 업로드 뒤 `audio_expires_at` 이 그 사용자의 보관 기간으로 실제로 찍히는지 |
| C9 | 만료된 행을 만들어 크론을 돌려 오브젝트가 사라지고 키가 NULL 이 되는지. 삭제가 실패했을 때 행이 남는지 |
| C12 | 녹음이 있는 계정을 지워 오브젝트가 실제로 사라지는지. 스토리지 삭제가 실패할 때 DB 가 남는지 |
| C13 | 남의 `card_id` 로 녹음을 올려 실제로 거부되는지 |
| C5 | 보존 기간이 지난 뒤 원장의 `backups_purged_at` 이 채워지는지 (2026-10-25 이후) |
| E1 | 백업 Blob 이 실제로 비공개인지 (URL 을 인증 없이 열어 본다) |
| F4 | 미들웨어를 우회한 요청이 라우트 자체에서 막히는지 |

로컬 Postgres 를 띄워 마이그레이션을 적용하면 DB 에 걸린 것들은 연결 문자열 없이 돌릴 수 있다. 실제로 그렇게 A1·A6·C2·C3 를 돌렸다. 로컬은 PG16 이고 프로덕션은 PG18 이라, 버전에 걸리는 성질은 그 차이를 감안한다.

## 4-1. 그 밖에 볼 것

- **`0001` 이 데이터베이스 이름을 `neondb` 로 박아 두었다.** `GRANT CONNECT ON DATABASE neondb TO anchor_app` 한 줄 때문에, 이름이 다른 빈 DB 에 `pnpm db:migrate` 를 돌리면 `database "neondb" does not exist` 로 `0001` 에서 멈춘다(로컬에서 확인). Neon 이 기본으로 `neondb` 를 주므로 대개는 걸리지 않지만, 사고가 난 날 이름이 다른 DB 를 만들면 복구 첫 단계에서 막힌다. `docs/BACKUP.md` 절차 C 에 "새 DB 의 이름은 `neondb` 여야 한다"를 적거나, 그 GRANT 가 현재 DB 를 가리키게 고치면 된다.

- `src/app/api/test-login/route.dev.ts` 만 `safeNext` 를 쓰지 않고 옛 가드를 그대로 둔다. 그 라우트는 프로덕션 빌드에 없어 지금 뚫릴 곳이 아니다. 파일 이름이나 빌드 조건이 바뀌는 날 같이 본다.
- 소유자 역할 `neondb_owner` 는 `BYPASSRLS` 가 **있다**. 앱이 소유자 연결을 쓰면 RLS 가 통째로 무력화된다 — A7 이 협상 불가인 이유다. `anchor_app` 은 `BYPASSRLS`·`SUPERUSER` 둘 다 없다.
- 프로덕션 DB 에는 이 세션이 닿지 못한다(SQL 실행 거부, 5432 막힘, 자격증명 취급 차단). 프로덕션에서만 드러나는 것은 DB 에 닿는 세션이 돌리고 출력을 받아 판정한다. **로컬 Postgres 로 되는 것은 직접 돌린다.**

## 부록. A4 검증 스크립트 (두 계정 RLS)

**임시 브랜치에서만 돌린다.** 테스트 계정을 만들고 지운다. 프로덕션 브랜치에 돌리지 않는다.

`anchor_app` 연결로 돌린다. 소유자 연결(`neondb_owner`)은 `BYPASSRLS` 가 있어 아무것도 검증하지 못한다. 기대값이 하나라도 어긋나면 그것이 "샘" 이다.

`anchor_app` 자격 증명이 없으면 소유자 연결에서 `SET LOCAL ROLE anchor_app` 으로 돌려도 된다. RLS 정책 적용·`BYPASSRLS`·테이블 권한은 모두 `current_user` 로 평가되고 `SET ROLE` 이 그것을 바꾼다. `session_user` 가 소유자로 남는 것은 이 셋 중 어디에도 쓰이지 않는다. 시작 전에 `current_user`·`rolbypassrls` 를 찍어 `anchor_app`·`false` 인지 확인한다.

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

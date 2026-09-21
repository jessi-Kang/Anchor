# 현재 상태

**기준 커밋: `ef6f482` · 2026-09-21** · 프로덕션 `https://anchor-jessikang.vercel.app`

지금 저장소에 무엇이 있고 무엇이 없는지만 적는다. 계획과 우선순위는 `docs/TEAM.md` 4장에 있다.

이 문서는 MVP 단계가 닫힐 때 갱신한다. 데이터 원칙에 닿는 변화(RLS·백업·삭제·내보내기)만 단계와 무관하게 바로 들어온다. 그래서 여기 적힌 것은 "지금"이 아니라 **기준 커밋 시점의 참**이다. 그 뒤가 궁금하면 커밋 목록을 본다.

## 1. 라우트

`docs/SITEMAP.md` 의 라우트 순서대로. "있음"은 `main` 의 그 경로에 `page.tsx` 가 있다는 뜻이다.

| 라우트 | 화면 | 상태 | 파일 / 메모 |
| --- | --- | --- | --- |
| `/` | O01 | 있음 | `src/app/page.tsx` |
| `/onboarding/languages` | O02a | 있음 | "다음" → 고른 언어의 `/inputs/new` |
| `/onboarding/kana` | O03 | 있음 | |
| `/onboarding/kana/module` | O03b | 있음 | |
| `/today` | F01 | 있음 | 빈 상태와 자료 행 둘 다 있다 |
| `/today/done` | F15 | 없음 | MVP 5단계. 지금 범위 밖 |
| `/inputs/new` | F02 | 있음 | |
| `/inputs/[id]` | F03 | 있음 | |
| `/inputs/[id]/read` | F12 | 없음 | MVP 5단계. 지금 범위 밖 |
| `/cards/[id]` | F04 | 있음 | |
| `/cards/[id]/1..5` | Scene1–5 | 있음 | `src/app/cards/[id]/[scene]/page.tsx` |
| `/cards/[id]/speak` | F10 | 있음 | |
| `/graph` | F11 | 있음 | |
| `/talk` · `/talk/[id]` | F13 · F14 | 없음 | MVP 4단계 |
| `/settings` | — | 있음 | 언어 행, 이메일, 로그아웃, 음성 보관 기간, 내보내기, 계정 삭제, "홈으로" |
| `/settings/delete` | — | 있음 | 계정 삭제 확인 1장 |
| `not-found` · `error` | — | 있음 | `src/app/not-found.tsx` · `src/app/error.tsx` |

`docs/FLOW.md` 5장이 버린 화면(`/onboarding/purpose` · `kanji` · `seed`)은 코드에서 사라졌다.

로컬 전용 시험 로그인은 **`main` 에 없다.** 브랜치에만 있고 병합 대기 중이다. 그때까지 QA 는 실제 계정으로 첫 방문 경로를 끝까지 돌 수 없다 (`docs/QA.md` 2장).

### API

| 경로 | 상태 |
| --- | --- |
| `/api/auth/[...path]` · `/api/health` · `/api/export` · `/api/account/delete` · `/api/cron/backup` · `/api/cron/voice` · `/api/tts` · `/api/recordings` | 있음 |
| `/api/inputs` · `/api/cards` · `/api/graph/next` · `/api/talk` · `/api/pitch` | 없음 |

## 2. 데이터와 운영

| 항목 | 상태 |
| --- | --- |
| 마이그레이션 | `db/migrations/` 에 0001 스키마·역할, 0002 RLS, 0003 소유자 읽기, 0004 `users.settings` 구조, 0005 준비 단계 제거, 0006 `node_cards`, 0007 측정 열, 0008 `recordings.client_id`. **프로덕션은 0008 까지 적용됨** — 0007 은 2026-09-21 04:29:38 UTC, 0008 은 04:29:48 UTC. 원장에서 읽은 체크섬은 `db/README.md` 에 있다 |
| 표 | 11개. `users` · `inputs` · `nodes` · `edges` · `user_node_state` · `cards` · `node_cards` · `chunks` · `recordings` · `encounters` · `account_deletions` |
| RLS | 11개 표 전부 `ENABLE` + `anchor_app` 정책. `FORCE` 는 0003 이 해제한다(소유자 연결이 백업을 위해 전체를 읽는다) |
| 프로덕션 확인 | `GET /api/health` → `ok:true`, `db_role: anchor_app`, `role_bypasses_rls: false`, `rls_all_enabled: true`. `latest_migration` 은 0006 시점에 읽은 값이라 **지금 다시 읽어야 한다** — 원장은 0008 이다 |
| 백업 1층 PITR | Neon 히스토리. 상시. 보존 기간은 `docs/BACKUP.md` |
| 백업 2층 배포 전 스냅샷 | `pnpm vercel-build` 가 `scripts/backup/neon-snapshot.ts --pre-deploy` 를 먼저 돌린다 |
| 백업 3층 매일 JSON | `vercel.json` cron 이 매일 18:17 UTC 에 `/api/cron/backup` 호출 → Vercel Blob `anchor-backups`. 보존 35일 |
| 선택 pg_dump | `.github/workflows/backup.yml`. 외부 S3 Secrets 가 없어 실행되지 않는다 |
| 내보내기 | `GET /api/export` 동작. 설정 화면에 행 있음 |
| 계정 삭제 | `POST /api/account/delete` 동작. 설정 → `/settings/delete` 확인 1장에서 부른다 |
| 음성 원본 삭제 | `vercel.json` cron 이 매일 18:47 UTC 에 `/api/cron/voice` 호출. 보관 기간이 지난 원본을 지우고 피치는 남긴다. 기간은 계정마다 `users.voice_retention_days` |
| 복구 리허설 | 기록 없음. `docs/BACKUP.md` 의 표가 비어 있다 |
| 공용 참조 노드 | `db/seed/`. `pnpm db:seed` 로 적재. **프로덕션에는 거의 안 들어가 있다** — 2026-09-21 에 읽으니 공용 한자 노드가 **40행**, `db/seed/kanji.json` 은 2,136자다. 부품 동기화(`db/manual/parts-sync-*.sql`)는 있는 행만 고치므로 **씨앗 적재가 먼저다** |

## 3. 남은 것

`docs/FLOW.md` 1장 첫 방문 경로의 화면은 아홉 개 모두 `main` 에 있다. 실제로 끝까지 도는지는 판정되지 않았다 — 시험 로그인이 아직 `main` 에 없어 QA 가 미리보기로만 돌았고, 저장·큐·5분·버튼 17번은 판정 밖이다 (`docs/QA.md`).

첫 방문 경로 밖에서 없는 화면.

| 화면 | 라우트 | 어느 단계 |
| --- | --- | --- |
| F13 · F14 못 한 말 | `/talk` · `/talk/[id]` | MVP 4 |
| F12 재만남 | `/inputs/[id]/read` | MVP 5 |
| F15 하루 끝 | `/today/done` | MVP 5 |

참고 HTML 은 `design/screens/` 에 위 화면 모두 있다.

## 4. 지금 열려 있는 것 (2026-09-21 05:1x, 리더 교대 시점)

**다음 리더가 여기서 시작한다.** 아래는 "해야 할 일 목록"이 아니라 **끝나지 않은 채로 넘어가는 것**이다. 끝난 것은 위 1~3장에 있다.

| 무엇 | 지금 상태 | 다음 한 걸음 |
| --- | --- | --- |
| **M0 거짓말 없애기** | **열려 있다.** `README.md` 표에 세 줄 (카드 정답 폴백 · 덩어리 폴백 · 홈 "오늘" 라벨) | 앞 두 줄은 **같은 한 가지**다 — 폴백이 못 만들었으면 원본을 내보내지 말고 못 만들었다고 말해야 한다. 그 패턴이 다른 곳에도 있는지 훑는 것이 남았다 |
| **프로덕션 씨앗** | 공용 한자 40 / 2,136. **이 상태에서는 일본어 축의 첫 칸이 프로덕션에서 안 선다** | 적재가 부품 동기화보다 먼저다. `db/manual/parts-sync-2026-09-21.sql` 은 **안 돌렸다** — 지금 돌리면 40행만 고치고 "부품 맞췄다"가 참이 아닌 채로 기록된다.<br>화면에서 무슨 일이 나는지는 세 줄이다: 공용 노드는 읽기만 하고 없으면 그때 만들지 않는다(`src/lib/db/kanji.ts:57-67`) · 노드 없는 글자는 뽑기에서 **조용히 빠진다**(`src/app/inputs/[id]/page.tsx:60-61` 의 `chars.filter((c) => nodes.has(c))`) · 카드를 열면 `사전에 없는 한자` 로 던진다(`src/app/inputs/[id]/actions.ts:31-32`). **자료를 넣어도 뽑을 게 거의 없고, 왜인지 화면이 말하지 않는다** |
| **클론 기준선 시험** | 안 돌렸다. `ELEVENLABS_API_KEY` 가 없다 | Jessi 손에 있는 일이다. 키가 들어오기 전에는 판정 밖 |
| **측정 D+0** | 표본 0. **실패가 아니라 "아직 안 씀"** | `encounters` 쓰기와 `target_pitch` 저장은 오늘 들어간 코드다. Jessi 가 한 바퀴 돌아야 진짜 D+0 이 된다 |
| **기준선 없는 회차** | `docs/MEASURE.md` 2장에 적혔다. **아직 모르는 사실이 하나 있다** | 어제 녹음 두 행이 **같은 분(22:59)** 에 붙어 있다. 두 번 말한 것인지 한 번이 두 번 저장된 것인지 안 읽었다. `created_at`(초) · `client_id` · `duration` · 대상 chunk 를 읽으면 갈린다. 중복이면 세는 문제가 아니라 데이터 문제다 |
| **로컬 Postgres 불안정** | PM 축 보고: 비정상 재시작 10회, 약 15분 간격 | 원인이 샌드박스 아래라 세션이 못 고친다. 재현되면 판정이 흔들리므로 **판정 전에 확인**해야 한다 |
| **앵커 낱말이 없는 한자의 카드** | 문안은 나왔다(`7a82604` · `design/screens/Scene1a.html`). **코드는 아직 안 들어갔다** | `条` 처럼 부를 낱말이 없는 글자가 지금은 모델이 지어낸 낱말을 받는다 — 뽑기가 "부를 낱말이 아직 없어" 라고 한 다음 화면이 낱말을 댄다. 고칠 자리: `src/app/inputs/[id]/actions.ts:71-74`(`ko_word && ko_sound` 를 둘 다 요구하는 갈래) · `src/lib/kanji/card-content.ts:27`(`hook` 이 필수라 모델이 "없음" 을 못 말한다) · `src/lib/cards/landing.ts:21`. 발판은 한국 한자음 하나다 |
| **프록시 matcher 경계** | 판정 났다. 지금 새는 곳은 없다 | `src/proxy.ts:48` 의 `(?!auth\|health\|cron)` 가 빼는 것은 세 경로가 아니라 **세 접두사**다(`/api/cron-admin` 이 프록시를 안 탄다). 지금은 각 라우트가 스스로 `requireUser()` 나 `Bearer CRON_SECRET` 을 봐서 안 새지만, 그 접두사로 시작하는 라우트를 새로 만들면서 자기 검사를 빠뜨리는 날 소리 없이 열린다 |
| **시험 로그인** | `main` 에 없다. 브랜치에만 있다 | 이게 없으면 QA 가 실제 계정으로 첫 방문 경로를 끝까지 못 돈다 (`docs/QA.md` 2장) |

**프로덕션 행 삭제·되돌리기는 어느 세션도 하지 않는다.** 가드레일이다 (`docs/TEAM.md` 9장). 막히면 막힌 채로 알린다.

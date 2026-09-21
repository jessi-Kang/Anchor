# 현재 상태

**기준 커밋: `6afb185` · 2026-09-21** · 프로덕션 `https://anchor-jessikang.vercel.app`

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
| `/today/done` | F15 | 있음 | `src/app/today/done/page.tsx` |
| `/inputs/new` | F02 | 있음 | |
| `/inputs/[id]` | F03 | 있음 | |
| `/inputs/[id]/read` | F12 | 있음 | `src/app/inputs/[id]/read/page.tsx` |
| `/cards/[id]` | F04 | 있음 | |
| `/cards/[id]/1..5` | Scene1–5 | 있음 | `src/app/cards/[id]/[scene]/page.tsx` |
| `/cards/[id]/speak` | F10 | 있음 | |
| `/graph` | F11 | 있음 | |
| `/talk` · `/talk/[id]` | F13 · F14 | 있음 | 추측(F17)은 `/talk/[id]/guess`, 지난 덩어리는 `/talk/past` |
| `/inputs` | F19 | 있음 | 홈에서 넘친 자료 |
| `/inputs/[id]/no-card` | F04a | 있음 | 문안을 못 만들었을 때 서는 자리 |
| `/settings` | — | 있음 | 언어 행, 이메일, 로그아웃, 음성 보관 기간, 내보내기, 계정 삭제, "홈으로" |
| `/settings/delete` | — | 있음 | 계정 삭제 확인 1장 |
| `not-found` · `error` | — | 있음 | `src/app/not-found.tsx` · `src/app/error.tsx` |

`docs/FLOW.md` 5장이 버린 화면(`/onboarding/purpose` · `kanji` · `seed`)은 코드에서 사라졌다.

로컬 전용 시험 로그인은 **`main` 에 있다** — `src/app/api/test-login/route.dev.ts` + `src/lib/auth/test-login.ts` + `next.config.ts` 의 `pageExtensions` 문. 파일 이름이 `route.dev.ts` 라서 보통은 라우트가 아니고, `NODE_ENV !== production && ANCHOR_TEST_LOGIN=1 && VERCEL 아님` 일 때만 라우트가 된다. 프로덕션 빌드에는 **경로가 아예 안 만들어진다**(조건부 404 가 아니다). 그래서 QA 는 지금 실제 계정으로 첫 방문 경로를 돌 수 있다 — 띄우는 순서는 `docs/QA.md` 2장에 그대로 있다.

> 이 문단은 2026-09-21 06시까지 "`main` 에 없다, 병합 대기 중" 이라고 적혀 있었다. **기준 커밋에서도 이미 있었다.** 아래 F12·F15·F13·F14 행도 같이 틀려 있었다. 문서가 없다고 적으면 팀은 있는 것을 안 쓴다 — QA 가 미리보기로만 돈 것이 이것 때문인지 다시 볼 것.

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
| 프로덕션 확인 | `GET /api/health` → `ok:true`, `db_role: anchor_app`, `role_bypasses_rls: false`, `rls_all_enabled: true`, 표 11개 전부 `rowsecurity: true`. **2026-09-21 06시에 다시 읽었다: 당시 필드 `latest_migration` 이 `0008_recordings_client_id.sql`** — 원장과 같다. 그 필드는 지금 `migrations`(`ledger_latest`·`repo_latest`·`ledger_only`·`missing`·`applied`)로 갈렸다. `latest_migration` 은 원장 이름 역순 첫 줄이라 **원장에만 있는 줄을 못 보여 준다** — 다음에 읽을 때는 `ledger_only` 가 빈 배열인지까지 적는다 |
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

`docs/FLOW.md` 1장 첫 방문 경로의 화면은 아홉 개 모두 `main` 에 있다. 실제로 끝까지 도는지는 아직 판정되지 않았다 — 저장·큐·5분·버튼 17번은 판정 밖이다 (`docs/QA.md`). **막고 있던 것이 시험 로그인이라고 적혀 있었는데 그게 사실이 아니었다**(1장 참고). 그러니 지금 QA 를 막는 것이 무엇인지는 다시 봐야 한다.

**첫 방문 경로 밖 화면도 전부 `main` 에 있다.** F12 재만남(`/inputs/[id]/read`) · F13·F14 못 한 말(`/talk` · `/talk/[id]`) · F15 하루 끝(`/today/done`) 이 그렇다. 이 문서는 6시까지 셋 다 "없음 · MVP 4~5단계 · 지금 범위 밖" 으로 적고 있었다.

그래서 **남은 것은 화면이 아니라 확인이다.** 화면은 다 섰고, 그 화면들이 실제 계정으로 이어 붙는지가 안 밟혔다.

참고 HTML 은 `design/screens/` 에 위 화면 모두 있다.

## 4. 지금 열려 있는 것 (2026-09-21 06시, 리더 교대 뒤 첫 갱신)

**다음 사람이 여기서 시작한다.** 아래는 "해야 할 일 목록"이 아니라 **끝나지 않은 채로 넘어가는 것**이다. 끝난 것은 위 1~3장에 있다.

| 무엇 | 지금 상태 | 다음 한 걸음 |
| --- | --- | --- |
| ~~**M0 거짓말 없애기**~~ | **닫혔다** (`c332153` · `6afb185` · `f953df6`). 세 번 비웠다 — 두 번째로 비운 뒤 한 시간도 안 돼 뽑기(F03)가 한자 열아홉 개짜리 기사에 "이 자료엔 한자가 없어" 라고 하는 것이 나왔다. **내 훑기가 `catch` 만 보고 `filter` 를 안 봐서 놓친 것**이다 | **키를 빼고 한 바퀴 돌아 폴백 화면을 눈으로 보는 것**이 남았다. 지금까지 확인은 전부 코드를 읽은 것이다. 근거와 안 본 것은 `README.md` 의 표 아래에 적었다 |
| **프로덕션 씨앗** | 공용 한자 40 / 2,136. **이 상태에서는 일본어 축의 첫 칸이 프로덕션에서 안 선다.** M0 이 닫힌 지금 **이게 제품을 가장 크게 막는다** — 한자 2,096자가 카드가 될 수 없다 | 적재가 부품 동기화보다 먼저다. `db/manual/parts-sync-2026-09-21.sql` 은 **안 돌렸다** — 지금 돌리면 40행만 고치고 "부품 맞췄다"가 참이 아닌 채로 기록된다.<br>화면에서 무슨 일이 나는지는 세 줄이다: 공용 노드는 읽기만 하고 없으면 그때 만들지 않는다(`src/lib/db/kanji.ts:57-67`) · 노드 없는 글자는 뽑기에서 **조용히 빠진다**(`src/app/inputs/[id]/page.tsx:60-61` 의 `chars.filter((c) => nodes.has(c))`) · 카드를 열면 `사전에 없는 한자` 로 던진다(`src/app/inputs/[id]/actions.ts:31-32`). **자료를 넣어도 뽑을 게 거의 없고, 왜인지 화면이 말하지 않는다** |

**2026-09-21 06시, 로컬에서 실제로 돌려 봤다** (샌드박스 Postgres 16, 마이그레이션 0001~0008 새로 적용). `pnpm db:seed` 는 **3.5초**에 끝나고 이렇게 선다: 한자 **2,136** · 부품 **505** · 한국 한자음 **429** · 영어 씨앗 **40** · 엣지 **6,043**(`part_of` 3,913 + `ko_sound_of` 2,130). **두 번 돌려 행 수가 한 자리도 안 변했다** — 세는 질의로 확인했고, 스크립트가 찍는 입력 개수가 아니라 실제 행 수다.

**프로덕션의 40 은 고장이 아니라 「옛 씨앗」으로 보인다** — `db/seed/ja-seed.json` 이 정확히 **40항목**이고, 프로덕션의 `ja/kanji` 가 40행이다. `kanji.json`(2,136)이 씨앗 스크립트에 들어오기 전에 한 번 돌린 자리로 읽힌다. 그러면 지금 돌리는 것은 **고치는 것이 아니라 이어 넣는 것**이고, 기존 40행은 `meta = nodes.meta || EXCLUDED.meta` 라 덮이지 않고 합쳐진다.
| **클론 기준선 시험** | 안 돌렸다. `ELEVENLABS_API_KEY` 가 없다 | Jessi 손에 있는 일이다. 키가 들어오기 전에는 판정 밖 |
| **측정 D+0** | 표본 0. **실패가 아니라 "아직 안 씀"** | `encounters` 쓰기와 `target_pitch` 저장은 코드에 있다. Jessi 가 한 바퀴 돌아야 진짜 D+0 이 된다 |
| **기준선 없는 회차** | `docs/MEASURE.md` 2장에 적혔다. **아직 모르는 사실이 하나 있다** | 어제 녹음 두 행이 **같은 분(22:59)** 에 붙어 있다. 두 번 말한 것인지 한 번이 두 번 저장된 것인지 안 읽었다. `created_at`(초) · `client_id` · `duration` · 대상 chunk 를 읽으면 갈린다. 중복이면 세는 문제가 아니라 데이터 문제다 |
| **로컬 Postgres 불안정** | PM 축 보고: 비정상 재시작 10회, 약 15분 간격 | 원인이 샌드박스 아래라 세션이 못 고친다. 재현되면 판정이 흔들리므로 **판정 전에 확인**해야 한다 |
| **앵커 낱말이 없는 한자의 카드** | 문안은 나왔다(`7a82604` · `design/screens/Scene1a.html`). **코드는 아직 안 들어갔다** | `条` 처럼 부를 낱말이 없는 글자가 지금은 모델이 지어낸 낱말을 받는다 — 뽑기가 "부를 낱말이 아직 없어" 라고 한 다음 화면이 낱말을 댄다. 고칠 자리: `src/app/inputs/[id]/actions.ts:71-74`(`ko_word && ko_sound` 를 둘 다 요구하는 갈래) · `src/lib/kanji/card-content.ts:27`(`hook` 이 필수라 모델이 "없음" 을 못 말한다) · `src/lib/cards/landing.ts:21`. 발판은 한국 한자음 하나다 |
| **프록시 matcher 경계** | 판정 났다. 지금 새는 곳은 없다 | `src/proxy.ts:48` 의 `(?!auth\|health\|cron)` 가 빼는 것은 세 경로가 아니라 **세 접두사**다(`/api/cron-admin` 이 프록시를 안 탄다). 지금은 각 라우트가 스스로 `requireUser()` 나 `Bearer CRON_SECRET` 을 봐서 안 새지만, 그 접두사로 시작하는 라우트를 새로 만들면서 자기 검사를 빠뜨리는 날 소리 없이 열린다 |
| ~~**시험 로그인**~~ | **`main` 에 있다.** 이 문서가 없다고 적고 있었을 뿐이다 (1장) | QA 가 `docs/QA.md` 2장 순서대로 실제 계정으로 돌면 된다. **막힌 적이 없다** |

### 이 문서를 믿는 법

이 문서는 6시까지 **자기 기준 커밋에서도 이미 틀린 것을 네 줄** 담고 있었다 — F12·F15·F13·F14 가 "없음", 시험 로그인이 "`main` 에 없음". 그 네 줄은 다음 사람에게 **이미 있는 것을 다시 짓게 하고, 쓸 수 있는 것을 안 쓰게** 만든다. 그게 M0("화면이 사실이 아닌 것을 말하는 자리")의 문서판이고, 화면보다 조용하게 비싸다.

그래서 이 장을 고칠 때의 규칙 하나: **"없음" 이라고 적기 전에 그 경로에 파일이 있는지 본다.** 표를 옮겨 적지 말고 그때 확인한다.

**프로덕션 행 삭제·되돌리기는 어느 세션도 하지 않는다.** 가드레일이다 (`docs/TEAM.md` 9장). 막히면 막힌 채로 알린다.

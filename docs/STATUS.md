# 현재 상태

지금 저장소에 무엇이 있고 무엇이 없는지만 적는다. 계획과 우선순위는 `docs/TEAM.md` 4장에 있다.

기준: 2026-09-20 · `main` `dcc7514` · 프로덕션 `https://anchor-jessikang.vercel.app`

## 1. 라우트

`docs/SITEMAP.md` 의 라우트 순서대로. "있음"은 그 경로에 `page.tsx` 가 있다는 뜻이다.

| 라우트 | 화면 | 상태 | 파일 / 메모 |
| --- | --- | --- | --- |
| `/` | O01 | 있음 | `src/app/page.tsx` |
| `/onboarding/languages` | O02a | 있음 | `src/app/onboarding/languages/page.tsx`. "다음"이 `/inputs/new` 가 아니라 `/onboarding/purpose` 로 간다 |
| `/onboarding/kana` | O03 | 있음 | `src/app/onboarding/kana/page.tsx`. 첫 카드 직전 게이트가 아니라 온보딩 단계 페이지다 |
| `/onboarding/kana/module` | — | 없음 | |
| `/today` | F01 | 있음 | `src/app/today/page.tsx`. 자료 행 없음. "인풋 / 아직 없어 / 0분" 과 남은 온보딩 단계 행만 |
| `/today/done` | F15 | 없음 | |
| `/inputs/new` | F02 | 없음 | 홈의 주 버튼 "자료 넣기"가 이 경로로 간다. 404 |
| `/inputs/[id]` | F03 | 없음 | |
| `/inputs/[id]/read` | F12 | 없음 | |
| `/cards/[id]` | F04 | 없음 | |
| `/cards/[id]/1..5` | Scene1–5 | 없음 | |
| `/cards/[id]/speak` | F10 | 없음 | |
| `/graph` | F11 | 없음 | |
| `/talk` · `/talk/[id]` | F13 · F14 | 없음 | |
| `/settings` | — | 있음 | `src/app/settings/page.tsx`. 언어 행, 계정 이메일, 내보내기 링크. 홈으로 가는 길·로그아웃·계정 삭제 없음 |
| `not-found` · `error` | — | 없음 | 프레임워크 기본 영문 페이지가 뜬다 |

사이트맵에 없는데 코드에 남아 있는 라우트. `docs/FLOW.md` 5장이 버린 화면이다.

| 라우트 | 파일 |
| --- | --- |
| `/onboarding/purpose` | `src/app/onboarding/purpose/page.tsx` |
| `/onboarding/kanji` | `src/app/onboarding/kanji/page.tsx` |
| `/onboarding/seed` | `src/app/onboarding/seed/page.tsx` |

`src/lib/onboarding-flow.ts` 가 이 세 단계를 순서로 묶고 있고, `/today` 와 `/settings` 가 그 남은 단계를 행으로 보여 준다.

### API

| 경로 | 상태 |
| --- | --- |
| `/api/auth/[...path]` · `/api/health` · `/api/export` · `/api/account/delete` · `/api/cron/backup` | 있음 |
| `/api/inputs` · `/api/cards` · `/api/graph/next` · `/api/talk` · `/api/tts` · `/api/pitch` | 없음 |

## 2. 데이터와 운영

| 항목 | 상태 |
| --- | --- |
| 마이그레이션 | `db/migrations/` 에 0001 스키마·역할, 0002 RLS, 0003 소유자 읽기, 0004 `users.settings` 구조 변경. 프로덕션은 0004 까지 적용됨 |
| RLS | 10개 테이블 전부 `ENABLE` + `anchor_app` 정책. `FORCE` 는 0003 이 해제한다(소유자 연결이 백업을 위해 전체를 읽는다) |
| 프로덕션 확인 | `GET /api/health` → `ok:true`, `db_role: anchor_app`, `role_bypasses_rls: false`, `rls_all_enabled: true` |
| 백업 1층 PITR | Neon 히스토리. 무료 플랜이라 6시간 |
| 백업 2층 배포 전 스냅샷 | `pnpm vercel-build` 가 `scripts/backup/neon-snapshot.ts --pre-deploy` 를 먼저 돌린다 |
| 백업 3층 매일 JSON | `vercel.json` cron 이 매일 18:17 UTC 에 `/api/cron/backup` 호출 → Vercel Blob `anchor-backups`. 보존 35일 |
| 선택 pg_dump | `.github/workflows/backup.yml`. 외부 S3 Secrets 가 없어 실행되지 않는다 |
| 내보내기 | `GET /api/export` 동작. 설정 화면에 링크 있음 |
| 계정 삭제 | `POST /api/account/delete` 동작(`confirm: "삭제"` 필요). 이걸 부르는 화면은 없다 |
| 복구 리허설 | 기록 없음. `docs/BACKUP.md` 의 표가 비어 있다 |
| 공용 참조 노드 | `db/seed/en-seed.json`(40) · `ja-seed.json`(40). `pnpm db:seed` 로 적재 |

## 3. 남은 것

`docs/FLOW.md` 1장 첫 방문 경로에서 아직 없는 화면.

| # | 화면 | 라우트 |
| --- | --- | --- |
| 3 | F02 자료 넣기 | `/inputs/new` |
| 4 | F03 뽑기 | `/inputs/[id]` |
| 5 | F04 카드 출처 | `/cards/[id]` |
| 6 | Scene1~5 | `/cards/[id]/1..5` |
| 7 | F10 말하기 | `/cards/[id]/speak` |
| 8 | F11 그래프 | `/graph` |

4′ O03 가나는 화면이 있으나 첫 카드 직전 게이트가 아니고, 9 F01 홈은 화면이 있으나 자료 행이 없다.

참고 HTML 은 `design/screens/` 에 위 화면 모두 있다.

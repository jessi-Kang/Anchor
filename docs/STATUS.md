# 현재 상태

지금 저장소에 무엇이 있고 무엇이 없는지만 적는다. 계획과 우선순위는 `docs/TEAM.md` 4장에 있다.

기준: 2026-09-20 · `main` `20e2a0f` · 프로덕션 `https://anchor-jessikang.vercel.app`

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
| `/api/auth/[...path]` · `/api/health` · `/api/export` · `/api/account/delete` · `/api/cron/backup` · `/api/tts` · `/api/recordings` | 있음 |
| `/api/inputs` · `/api/cards` · `/api/graph/next` · `/api/talk` · `/api/pitch` | 없음 |

## 2. 데이터와 운영

| 항목 | 상태 |
| --- | --- |
| 마이그레이션 | `db/migrations/` 에 0001 스키마·역할, 0002 RLS, 0003 소유자 읽기, 0004 `users.settings` 구조, 0005 준비 단계 제거, 0006 `node_cards`. 프로덕션은 0006 까지 적용됨 |
| 표 | 11개. `users` · `inputs` · `nodes` · `edges` · `user_node_state` · `cards` · `node_cards` · `chunks` · `recordings` · `encounters` · `account_deletions` |
| RLS | 11개 표 전부 `ENABLE` + `anchor_app` 정책. `FORCE` 는 0003 이 해제한다(소유자 연결이 백업을 위해 전체를 읽는다) |
| 프로덕션 확인 | `GET /api/health` → `ok:true`, `db_role: anchor_app`, `role_bypasses_rls: false`, `rls_all_enabled: true`, `latest_migration: 0006_node_cards.sql` |
| 백업 1층 PITR | Neon 히스토리. 상시. 보존 기간은 `docs/BACKUP.md` |
| 백업 2층 배포 전 스냅샷 | `pnpm vercel-build` 가 `scripts/backup/neon-snapshot.ts --pre-deploy` 를 먼저 돌린다 |
| 백업 3층 매일 JSON | `vercel.json` cron 이 매일 18:17 UTC 에 `/api/cron/backup` 호출 → Vercel Blob `anchor-backups`. 보존 35일 |
| 선택 pg_dump | `.github/workflows/backup.yml`. 외부 S3 Secrets 가 없어 실행되지 않는다 |
| 내보내기 | `GET /api/export` 동작. 설정 화면에 행 있음 |
| 계정 삭제 | `POST /api/account/delete` 동작. 설정 → `/settings/delete` 확인 1장에서 부른다 |
| 복구 리허설 | 기록 없음. `docs/BACKUP.md` 의 표가 비어 있다 |
| 공용 참조 노드 | `db/seed/`. `pnpm db:seed` 로 적재 |

## 3. 남은 것

`docs/FLOW.md` 1장 첫 방문 경로의 화면은 아홉 개 모두 `main` 에 있다. 실제로 끝까지 도는지는 판정되지 않았다 — 시험 로그인이 아직 `main` 에 없어 QA 가 미리보기로만 돌았고, 저장·큐·5분·버튼 17번은 판정 밖이다 (`docs/QA.md`).

첫 방문 경로 밖에서 없는 화면.

| 화면 | 라우트 | 어느 단계 |
| --- | --- | --- |
| F13 · F14 못 한 말 | `/talk` · `/talk/[id]` | MVP 4 |
| F12 재만남 | `/inputs/[id]/read` | MVP 5 |
| F15 하루 끝 | `/today/done` | MVP 5 |

참고 HTML 은 `design/screens/` 에 위 화면 모두 있다.

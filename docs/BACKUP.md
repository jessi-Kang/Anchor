# 백업과 복구

"데이터 유실 = 즉시 이탈." 백업은 기능이 아니라 전제다. 세 층으로 겹친다.

| 층 | 무엇 | 어디 | 주기 | 보존 |
| --- | --- | --- | --- | --- |
| 1. PITR | Neon 히스토리(instant restore) | Neon 안 | 상시 | **6시간**. MVP 동안 무료 플랜을 유지한다 |
| 2. 배포 전 스냅샷 | Neon 브랜치 스냅샷 | Neon 안 | 프로덕션 빌드마다 (`scripts/backup/neon-snapshot.ts`, `NEON_API_KEY` 있을 때) | 14일. 플랜 제한으로 실패하면 경고만 |
| 3. 매일 JSON 백업 | 전체 테이블 + 로그인 계정 매핑(OAuth 토큰 제외)을 gzip JSON 으로 | **Neon 밖** Vercel Blob 비공개 스토어 `anchor-backups` (`/api/cron/backup`, Vercel cron) | 매일 03:17 KST | 35일 (`BACKUP_RETENTION_DAYS`) |
| (선택) pg_dump | 원본 형식 덤프 | S3 호환 스토리지 (`.github/workflows/backup.yml`) | GitHub Actions | 외부 스토리지 계정(카드)이 있을 때만 |

1·2는 Neon 장애나 계정 문제에 함께 사라질 수 있다. 3이 그 경우의 사본이다. 1이 6시간뿐이라 하루 넘게 지난 사고는 3으로만 되돌린다.

PITR 을 유료 플랜으로 늘릴지는 실사용을 시작하는 날 다시 본다. 그때까지 이 값은 정해진 것이다 (`docs/TEAM.md` 7장).

3이 pg_dump 가 아니라 JSON 인 이유: 서버리스에는 pg_dump 가 없고, 외부 스토리지(R2 등)는 카드 등록이 필요했다. Vercel Blob 은 이미 결제 중인 Vercel 안에 있어 추가 계정이 없고, Neon 과는 다른 회사·다른 저장소다. 데이터 양이 작은 MVP 에서는 테이블별 JSON 으로 충분하며, 복구는 `pnpm backup:restore` 로 한다.

## 설정 체크리스트

- [x] Vercel Blob 스토어 `anchor-backups`(비공개, 싱가포르) 생성, `BLOB_READ_WRITE_TOKEN` 주입됨
- [x] `CRON_SECRET`, `BACKUP_RETENTION_DAYS` 프로덕션 환경 변수
- [x] `vercel.json` crons: `/api/cron/backup` 매일 18:17 UTC
- [x] 첫 배포 뒤 한 번 수동 호출해 `ok: true` 와 `counts` 확인 (아래) — 2026-09-20 19:46 KST, 200
- [ ] 아래 복구 리허설을 한 번 수행하고 날짜를 기록

수동 확인 (터미널, CRON_SECRET 은 Vercel 환경 변수에서):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://anchor-jessikang.vercel.app/api/cron/backup
```

파일 보기: https://vercel.com/jessikang/anchor/stores → `anchor-backups` → `daily/`.

## 복구 절차

### A. 몇 분 전으로 되돌리기 (실수로 지운 데이터)

Neon 콘솔 → Branches → 프로덕션 브랜치 → Restore → 시각 선택. 되돌리기 전 상태는 자동으로 백업 브랜치로 남는다. 앱 재배포 불필요.

### B. 배포 직전 상태로 (마이그레이션 사고)

Neon 콘솔 → Snapshots → `pre-deploy-<시각>-<커밋>` → Restore. 그다음 해당 커밋으로 Vercel 롤백.

### C. Neon 밖 JSON 백업에서 (최악)

```bash
# 1. 파일 내려받기: https://vercel.com/jessikang/anchor/stores → anchor-backups → daily/ → 원하는 날짜의 .json.gz

# 2. 새 Neon 프로젝트(또는 빈 브랜치)에 스키마 만들기 (역할·RLS 포함)
DATABASE_URL_ADMIN=<새 DB 소유자 연결> ANCHOR_APP_PASSWORD=<앱 비밀번호> pnpm db:migrate

# 3. 행 복원. 삭제 원장에 있는 계정은 자동으로 빼고 넣는다.
DATABASE_URL_ADMIN=<새 DB 소유자 연결> pnpm backup:restore anchor-<STAMP>.json.gz

# 4. Neon Auth: 새 브랜치의 Auth 를 켜고 Google 제공자 확인. 백업 안의 neon_auth.user/account 는
#    같은 Google 계정이 같은 user_id 로 이어지게 하는 참고 자료다 (Neon Auth 콘솔에서 사용자를 다시 만들 때 id 를 맞춘다).

# 5. /api/health 가 rls_all_enabled=true, role_bypasses_rls=false, db_role=anchor_app 를 돌려주는지 확인 후
#    Vercel 의 ANCHOR_DATABASE_URL 을 새 DB 로 교체
```

(선택) pg_dump 덤프가 있으면 `pg_restore --no-owner --no-privileges` 뒤 `db/recovery/reapply-roles-and-rls.sql` 을 적용한다.

## 계정 삭제와 백업

계정 삭제(`POST /api/account/delete`)는 즉시 CASCADE 로 지우고 `account_deletions` 에 기록한다. 이미 만들어진 덤프 파일 속 사본은 수정할 수 없으므로:

- 보존 기간(35일)이 지나면 `/api/cron/backup` 이 파일을 지우고 `backups_purged_at` 을 채운다. 그 시점에 사본이 완전히 사라진다.
- 그 사이 복구를 해도 삭제된 계정은 되살아나지 않는다. 절차 C-3(`pnpm backup:restore`)이 백업 안 `account_deletions` 의 user_id 를 빼고 넣는다.
- Neon PITR/스냅샷 안의 사본은 각각 6시간/14일 후 사라진다.

사용자에게는 "삭제 후 최대 35일 안에 백업 사본까지 사라진다"고 명시한다.

## 분기 복구 리허설

분기마다 절차 C 를 임시 Neon 브랜치에 실제로 수행한다. 프로덕션 브랜치는 건드리지 않는다.

Neon 브랜치는 부모의 역할 비밀번호를 물려받는다. 부모에서 비밀번호를 바꿔도 이미 만들어진 브랜치에는 옛 값이 남는다. 그래서 검증용 브랜치는 쓰고 나면 지운다.

기록:

| 날짜 | 덤프 | 소요 시간 | 결과 / 발견한 문제 |
| --- | --- | --- | --- |
| | | | |

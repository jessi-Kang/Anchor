# 백업과 복구

"데이터 유실 = 즉시 이탈." 백업은 기능이 아니라 전제다. 세 층으로 겹친다.

| 층 | 무엇 | 어디 | 주기 | 보존 |
| --- | --- | --- | --- | --- |
| 1. PITR | Neon 히스토리(instant restore) | Neon 안 | 상시 | **7일 이상**으로 설정 (프로젝트 → Settings → History retention). 기본 6시간은 부족하다 |
| 2. 배포 전 스냅샷 | Neon 브랜치 스냅샷 | Neon 안 | 프로덕션 빌드마다 (`scripts/backup/neon-snapshot.ts`) | 14일 (`SNAPSHOT_RETENTION_DAYS`) |
| 3. 매일 pg_dump | 전체 덤프(-Fc) + sha256 | **Neon 밖** S3 호환 스토리지 (`.github/workflows/backup.yml`) | 매일 03:17 KST | 35일 (`BACKUP_RETENTION_DAYS`) |

1·2는 Neon 장애나 계정 문제에 함께 사라질 수 있다. 3이 그 경우의 유일한 사본이다.

## 설정 체크리스트 (첫 배포 전)

- [ ] Neon 프로젝트 History retention ≥ 7일
- [ ] Vercel 환경 변수: `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_BRANCH_ID` (프로덕션만)
- [ ] GitHub Secrets: `DATABASE_URL_ADMIN`, `BACKUP_S3_*` 5개. 버킷은 Neon과 다른 제공자(예: Cloudflare R2, Backblaze B2, AWS S3)
- [ ] `nightly-backup` 워크플로를 `workflow_dispatch` 로 한 번 수동 실행해 객체가 올라가는지 확인
- [ ] 아래 복구 리허설을 한 번 수행하고 날짜를 기록

## 복구 절차

### A. 몇 분 전으로 되돌리기 (실수로 지운 데이터)

Neon 콘솔 → Branches → 프로덕션 브랜치 → Restore → 시각 선택. 되돌리기 전 상태는 자동으로 백업 브랜치로 남는다. 앱 재배포 불필요.

### B. 배포 직전 상태로 (마이그레이션 사고)

Neon 콘솔 → Snapshots → `pre-deploy-<시각>-<커밋>` → Restore. 그다음 해당 커밋으로 Vercel 롤백.

### C. Neon 밖 덤프에서 (최악)

```bash
# 1. 덤프 내려받기 + 검증
aws s3 cp s3://$BUCKET/anchor/daily/anchor-<STAMP>.dump .
aws s3 cp s3://$BUCKET/anchor/daily/anchor-<STAMP>.dump.sha256 .
sha256sum -c anchor-<STAMP>.dump.sha256

# 2. 새 Neon 프로젝트(또는 빈 브랜치)에 복원
pg_restore --no-owner --no-privileges -d "$NEW_DATABASE_URL_ADMIN" anchor-<STAMP>.dump

# 3. 앱 역할·권한·RLS 는 덤프에 포함되지 않는다(--no-privileges). 마이그레이션 러너로 재적용:
#    schema_migrations 가 덤프에 있으므로 0001/0002 는 "이미 적용"으로 뜬다. 역할과 GRANT/POLICY 만 다시 만든다:
psql "$NEW_DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/recovery/reapply-roles-and-rls.sql   # (아래 참고)

# 4. 삭제 원장 재적용: 덤프 이후 삭제를 요청한 계정은 복원본에서도 지운다
psql "$NEW_DATABASE_URL_ADMIN" -c "DELETE FROM users WHERE id IN (SELECT user_id FROM account_deletions)"

# 5. /api/health 가 rls_all_forced=true, role_bypasses_rls=false 를 돌려주는지 확인 후 ANCHOR_DATABASE_URL 교체
```

`db/recovery/reapply-roles-and-rls.sql` 은 0001 의 역할 생성 블록과 GRANT, 0002 전체를 이어붙인 파일이다. 0002 가 바뀌면 함께 갱신한다.

## 계정 삭제와 백업

계정 삭제(`POST /api/account/delete`)는 즉시 CASCADE 로 지우고 `account_deletions` 에 기록한다. 이미 만들어진 덤프 파일 속 사본은 수정할 수 없으므로:

- 보존 기간(35일)이 지나면 `nightly-backup` 이 파일을 지우고 `backups_purged_at` 을 채운다. 그 시점에 사본이 완전히 사라진다.
- 그 사이 복구를 하면 절차 C-4 로 해당 계정을 다시 지운다.
- Neon PITR/스냅샷 안의 사본은 각각 7일/14일 후 사라진다.

사용자에게는 "삭제 후 최대 35일 안에 백업 사본까지 사라진다"고 명시한다.

## 분기 복구 리허설

분기마다 절차 C 를 임시 Neon 브랜치에 실제로 수행한다. 기록:

| 날짜 | 덤프 | 소요 시간 | 결과 / 발견한 문제 |
| --- | --- | --- | --- |
| | | | |

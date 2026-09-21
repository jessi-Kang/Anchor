/**
 * 매일 JSON 백업(`/api/cron/backup`)이 뜨는 표 목록. **손으로 적은 목록이라 스키마에서 샐 수 있다.**
 *
 * 표를 새로 만들고 여기 안 넣으면 백업이 그 표를 **조용히 빠뜨린다.** 응답은 여전히 `ok: true` 고
 * `counts` 에 그 이름이 없을 뿐이라 **티가 안 난다.** 백업은 `CLAUDE.md` 가 말하는 세 층 중 하나
 * ("Neon 밖 매일 JSON 백업(최악의 경우)")이고, 최악의 경우에 없는 표는 그때 처음 발견된다.
 *
 * **실제로 한 번 샜다.** `0006` 이 만든 `node_cards` 가 목록에 안 따라와서, 매일 도는 백업이 그
 * 표를 빼고 있었다. 카드 문안 캐시라 "다시 만들 수 있다" 고 넘길 수 없다 — 다시 만들면 **글이
 * 달라진다.** 사용자가 실제로 본 문안이 사라지면 재만남도 측정도 같은 것을 두 번 못 본다.
 *
 * 그래서 목록을 코드에 두고 **`pnpm test:db` 가 스키마와 견준다**
 * (`scripts/test/backup-tables.test.ts`). 차이가 있으면 **아래에 선언된 차이여야 한다.**
 *
 * **내보내기(`export-tables.ts`)와 렌즈가 다르다.** 내보내기는 *그 사람의* 데이터를 뜨니까
 * `user_id` 칼럼으로 세고, 백업은 **전부** 뜨니까 `public` 의 모든 BASE TABLE 로 센다. `node_cards`
 * 는 PK 가 `node_id` 라 `user_id` 렌즈에 원래 안 잡힌다 — **그래서 내보내기 시험이 이걸 못 잡았다.**
 * 같은 시험을 복사했으면 또 놓쳤을 자리다.
 */
export const BACKUP_TABLES = [
  "schema_migrations",
  "users",
  "inputs",
  "nodes",
  "node_cards",
  "edges",
  "user_node_state",
  "cards",
  "chunks",
  "recordings",
  "encounters",
  "account_deletions",
] as const;

/**
 * **뜨는 것과 되돌리는 것은 다른 목록이다.** 복구(`scripts/backup/restore-json.ts`)는 FK 순서대로
 * 넣어야 해서 제 `ORDER` 를 따로 들고 있고, **그쪽에도 `node_cards` 가 없다.** 여기만 고치면
 * 백업 파일에는 담기는데 복구가 그 표를 안 넣는다 — 구멍이 반만 막힌다. 그 파일은 내 자리가
 * 아니라 **적어만 둔다**(PM 에게 올렸다). 그쪽이 고쳐지면 이 문단을 지운다.
 */

/**
 * **선언된 차이.** `public` 의 BASE TABLE 과 위 목록이 어긋나는 자리는 여기뿐이고, 각각 이유가 있다.
 * 지금은 비어 있다 — 열두 표를 전부 뜬다. **빼는 표가 생기면 여기에 이유를 적는다.**
 * 비워 두면 다음 사람이 "원래 다 뜨는 것" 으로 읽고, 그 읽기는 맞다.
 */
export const BACKUP_EXCEPTIONS: Record<string, string> = {};

/**
 * `neon_auth` 스키마의 로그인 매핑(`user`·`account`)은 **이 목록 밖이다.** 스키마가 다르고
 * `account` 는 칼럼을 골라 뜨기 때문에(토큰 사본을 Neon 밖에 두지 않는다) 같은 렌즈로 못 센다.
 * 실제 목록은 `/api/cron/backup` 의 `AUTH_TABLES` 에 있고, 여기서 시험하지 않는다 — 지금 범위 밖이다.
 */
export const AUTH_TABLES_NOTE = "neon_auth.user · neon_auth.account 는 /api/cron/backup 의 AUTH_TABLES 에 있다";

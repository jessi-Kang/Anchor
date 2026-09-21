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
 * **되돌리는 순서.** 복구(`scripts/backup/restore-json.ts`)가 이 차례대로 넣는다 — 위 목록과
 * 달리 **순서가 뜻을 가진다.** 외래키를 가리키는 쪽이 가리켜지는 쪽보다 뒤에 와야 한다
 * (`node_cards.node_id → nodes.id` 라서 `nodes` 바로 뒤다).
 *
 * **뜨는 목록과 되돌리는 목록은 따로 샌다.** 백업에만 넣으면 파일에는 담기는데 복구가 그 표를
 * 건너뛰고, 그러면 **복구 리허설이 「됐다」고 말하면서 표 하나를 빼먹는다** — `docs/BACKUP.md` 가
 * 재는 바로 그 자리다. 그래서 둘을 한 파일에 두고 `scripts/test/backup-tables.test.ts` 가
 * **같은 잣대로, 그리고 서로도** 견준다.
 */
export const RESTORE_ORDER = [
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
 * **뜨지만 되돌리지 않는 표.** 백업 목록과 복구 목록이 어긋나는 자리는 여기뿐이다.
 */
export const RESTORE_EXCEPTIONS: Record<string, string> = {
  schema_migrations:
    "원장은 러너가 쓰는 기록이다. 복구는 `pnpm db:migrate` 로 스키마를 세운 뒤 행만 넣는 절차라" +
    "(`docs/BACKUP.md` 절차 C), 그 DB 의 원장은 **거기서 실제로 돌린 것**을 이미 적고 있다." +
    "백업 속 원장을 덧씌우면 그 기록이 남의 기록으로 바뀌고, 옛 사본에 원장에만 있는 줄이 있으면" +
    "그것까지 같이 들어간다. 뜨기는 한다 — 사고 뒤에 「그 DB 가 무엇을 돌렸었나」 를 읽을 데가 있어야 한다",
};

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

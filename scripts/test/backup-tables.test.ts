/**
 * **매일 백업이 표를 빠뜨리지 않는지** 붙든다.
 *   pnpm test:db
 *
 * `/api/cron/backup` 은 손으로 적은 목록을 돈다. 표를 새로 만들고 그 목록에 안 넣으면 백업이 그
 * 표를 **조용히 빠뜨리는데**, 응답은 `ok: true` 고 `counts` 에 이름이 하나 없을 뿐이다. 최악의
 * 경우에 쓰라고 두는 층이라(`CLAUDE.md` 백업 세 층) **없는 표는 그때 처음 발견된다.**
 *
 * **실제로 샜다.** `0006` 이 만든 `node_cards` 가 목록에 안 따라왔다.
 *
 * **렌즈가 내보내기와 다르다.** `export-tables.test.ts` 는 `user_id` 칼럼이 있는 표만 모은다 —
 * 그 사람의 데이터를 뜨는 것이라서다. 백업은 **전부** 뜨니까 `public` 의 **모든 BASE TABLE** 로
 * 센다. `node_cards` 는 PK 가 `node_id` 라 `user_id` 렌즈에 원래 안 잡히고, **그래서 저쪽 시험이
 * 이걸 못 잡았다.** 같은 시험을 복사했으면 또 놓쳤을 자리다.
 *
 * **목록을 여기 베껴 쓰지 않는다** — 라우트가 실제로 쓰는 값을 그대로 불러 견준다. 베끼면 코드가
 * 아니라 사본을 시험하게 된다.
 *
 * DB 는 읽기만 한다. `information_schema` 만 보므로 어느 계정도 안 만들고 안 지운다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { BACKUP_TABLES, BACKUP_EXCEPTIONS } from "../../src/lib/db/backup-tables";

loadEnv();

const admin = adminClient();
let inSchema: string[] = [];

before(async () => {
  await admin.connect();
  const { rows } = await admin.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  inSchema = rows.map((r) => r.table_name);
});

after(async () => {
  await admin.end();
});

test("public 의 표 중 백업이 빠뜨린 것은 없다 (선언된 것 빼고)", () => {
  assert.ok(inSchema.length > 0, "information_schema 를 못 읽었다. 마이그레이션이 올라간 DB 인가");
  const backed = new Set<string>(BACKUP_TABLES);
  const missing = inSchema.filter((t) => !backed.has(t) && !(t in BACKUP_EXCEPTIONS));
  assert.deepEqual(
    missing,
    [],
    `매일 백업에서 빠진 표: ${missing.join(", ")}. 넣거나, 왜 안 뜨는지 BACKUP_EXCEPTIONS 에 적어라`,
  );
});

test("백업 목록에 있는데 스키마에 없는 표는 없다 — 표가 사라지면 목록도 줄인다", () => {
  const real = new Set(inSchema);
  const ghost = [...BACKUP_TABLES].filter((t) => !real.has(t));
  assert.deepEqual(ghost, [], `없는 표를 뜨려 한다: ${ghost.join(", ")}. 백업이 그 줄에서 터진다`);
});

test("선언된 예외는 전부 실재하는 표다 — 표가 사라지면 이유도 지운다", () => {
  const known = new Set([...inSchema, ...BACKUP_TABLES]);
  const stale = Object.keys(BACKUP_EXCEPTIONS).filter((t) => !known.has(t));
  assert.deepEqual(stale, [], `없는 표에 이유가 붙어 있다: ${stale.join(", ")}`);
});

test("뜨는 표는 소유자가 읽을 수 있다 — 권한이 없으면 백업이 통째로 터진다", async () => {
  /*
    백업은 소유자(`DATABASE_URL_ADMIN`)로 돈다. 표 하나가 SELECT 를 잃으면 그 줄에서 예외가 나고
    **그날 백업이 통째로 안 남는다** — 한 표를 빠뜨리는 것보다 크다. 실제로 읽어 본다.
  */
  for (const t of BACKUP_TABLES) {
    await admin.query(`SELECT 1 FROM public.${t} LIMIT 1`);
  }
});

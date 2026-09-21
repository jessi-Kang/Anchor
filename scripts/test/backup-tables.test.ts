/**
 * **매일 백업이 표를 빠뜨리지 않는지, 그리고 복구가 그걸 도로 넣는지** 붙든다.
 *   pnpm test:db
 *
 * `/api/cron/backup` 은 손으로 적은 목록을 돈다. 표를 새로 만들고 그 목록에 안 넣으면 백업이 그
 * 표를 **조용히 빠뜨리는데**, 응답은 `ok: true` 고 `counts` 에 이름이 하나 없을 뿐이다. 최악의
 * 경우에 쓰라고 두는 층이라(`CLAUDE.md` 백업 세 층) **없는 표는 그때 처음 발견된다.**
 *
 * **실제로 샜다.** `0006` 이 만든 `node_cards` 가 **두 목록에 다** 안 따라왔다. 뜨는 목록만
 * 고쳤으면 파일에는 담기는데 복구가 그 표를 건너뛰어서, **복구 리허설이 「됐다」고 말하면서 표
 * 하나를 빼먹는** 상태가 됐을 것이다 — `docs/BACKUP.md` 가 재는 바로 그 자리다. 그래서 이
 * 파일이 **두 목록을 같은 잣대로, 그리고 서로도** 견준다.
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
import { BACKUP_TABLES, BACKUP_EXCEPTIONS, RESTORE_ORDER, RESTORE_EXCEPTIONS } from "../../src/lib/db/backup-tables";

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

test("뜬 표는 복구가 도로 넣는다 (선언된 것 빼고) — 반만 막힌 구멍이 안 생기게", () => {
  const restored = new Set<string>(RESTORE_ORDER);
  const dropped = [...BACKUP_TABLES].filter((t) => !restored.has(t) && !(t in RESTORE_EXCEPTIONS));
  assert.deepEqual(
    dropped,
    [],
    `백업은 뜨는데 복구가 안 넣는 표: ${dropped.join(", ")}. 넣거나, 왜 안 넣는지 RESTORE_EXCEPTIONS 에 적어라`,
  );
});

test("복구 목록에 있는데 백업이 안 뜨는 표는 없다 — 없는 것을 넣으려 들지 않게", () => {
  const backed = new Set<string>(BACKUP_TABLES);
  const orphan = [...RESTORE_ORDER].filter((t) => !backed.has(t));
  assert.deepEqual(orphan, [], `복구가 넣으려는데 백업 파일에 없는 표: ${orphan.join(", ")}`);
});

test("선언된 복구 예외는 실제로 뜨는 표다 — 안 뜨는 표를 「안 넣는다」 고 적어 둘 일은 없다", () => {
  const backed = new Set<string>(BACKUP_TABLES);
  const stale = Object.keys(RESTORE_EXCEPTIONS).filter((t) => !backed.has(t));
  assert.deepEqual(stale, [], `백업이 안 뜨는 표에 복구 예외가 붙어 있다: ${stale.join(", ")}`);
});

test("복구 차례가 외래키를 지킨다 — 가리키는 쪽이 가리켜지는 쪽보다 뒤다", async () => {
  /*
    `RESTORE_ORDER` 는 위 둘과 달리 **순서가 뜻을 가진다.** 이름만 맞고 차례가 틀리면 복구가 그
    줄에서 FK 위반으로 통째로 롤백된다 — 백업이 멀쩡해도 못 되돌린다. 목록을 손으로 견주지 않고
    **스키마의 외래키를 읽어서** 센다.
  */
  const { rows } = await admin.query<{ child: string; parent: string }>(
    `SELECT c.relname AS child, p.relname AS parent
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_class p ON p.oid = k.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE k.contype = 'f' AND n.nspname = 'public'`,
  );
  const at = new Map<string, number>([...RESTORE_ORDER].map((t, i) => [t, i]));
  const wrong = rows.filter(
    (r) => r.child !== r.parent && at.has(r.child) && at.has(r.parent) && at.get(r.child)! < at.get(r.parent)!,
  );
  assert.deepEqual(
    wrong.map((r) => `${r.child} → ${r.parent}`),
    [],
    "복구 차례가 외래키를 거스른다. 가리키는 표를 가리켜지는 표 뒤로 옮겨라",
  );
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

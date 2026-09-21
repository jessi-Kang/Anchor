/**
 * **공용 소리 노드를 지우는 자리가 사용자 행을 같이 죽이지 않는지** 잰다
 * (`src/lib/db/node-guard.ts`, 씨앗의 고아 정리).
 *
 * `nodes(id)` 를 가리키는 FK 일곱 중 **여섯이 `ON DELETE CASCADE`** 다. 공용 노드 하나를
 * 지우면 판정(`user_node_state`)·카드(`cards`)·**재만남(`encounters`)**·문안 캐시(`node_cards`)가
 * 조용히 같이 죽는다. `encounters` 는 `docs/MEASURE.md` 의 분자·분모이고 다시 만들 수 없다.
 *
 * **오늘은 소리 노드에 사용자 행이 안 붙는다.** 그래서 가드가 있으나 없으나 같은 값이 나오고,
 * 그게 이 시험이 있어야 하는 이유다 — **지금 아무 일도 안 일어나는 자리는 바뀌는 날에 아무도 안 본다.**
 *
 * 그리고 손 목록은 **스키마가 자라는 쪽에 늘 진다**: 실제로 `0006_node_cards.sql` 이 `0001` 만
 * 본 목록을 조용히 모자라게 했다. 그래서 목록을 눈으로 세지 않고 `pg_constraint` 에 물어 견준다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { NODE_GUARD_TABLES, NODE_GUARD_EXCEPT, ORPHAN_SOUND_DELETE } from "../../src/lib/db/node-guard";

loadEnv();

const admin = adminClient();
const USER = "fixture-node-guard";
const KEY = "fixture소리";
let fks: { table: string; col: string; rule: string }[] = [];

before(async () => {
  await admin.connect();
  const { rows } = await admin.query<{ table: string; col: string; rule: string }>(
    `SELECT c.conrelid::regclass::text AS "table", a.attname AS col,
            CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' ELSE c.confdeltype::text END AS rule
       FROM pg_constraint c
       JOIN unnest(c.conkey) k(att) ON true
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.att
      WHERE c.contype = 'f' AND c.confrelid = 'nodes'::regclass`,
  );
  fks = rows;
  await admin.query("DELETE FROM nodes WHERE user_id IS NULL AND lang = 'ko' AND kind = 'sound' AND key = $1", [KEY]);
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
});

after(async () => {
  await admin.query("DELETE FROM nodes WHERE user_id IS NULL AND lang = 'ko' AND kind = 'sound' AND key = $1", [KEY]);
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.end();
});

test("nodes 를 CASCADE 로 가리키는 표는 전부 가드에 들거나 이유가 적혀 있다", () => {
  assert.ok(fks.length > 0, "pg_constraint 를 못 읽었다. 마이그레이션이 올라간 DB 인가");
  const guarded = new Set<string>(NODE_GUARD_TABLES);
  const loose = fks
    .filter((f) => f.rule === "CASCADE" && !guarded.has(f.table) && !(f.table in NODE_GUARD_EXCEPT))
    .map((f) => `${f.table}.${f.col}`);
  assert.deepEqual(loose, [], `공용 노드를 지우면 이 표의 행이 같이 죽는다: ${loose.join(", ")}. NODE_GUARD_TABLES 에 넣거나 왜 안 넣는지 NODE_GUARD_EXCEPT 에 적어라`);
});

test("가드 목록의 표는 실재하고 칸 이름이 node_id 다 — 아니면 가드 SQL 이 거짓말이다", () => {
  const byTable = new Map(fks.map((f) => [f.table, f.col]));
  const off = NODE_GUARD_TABLES.filter((t) => byTable.get(t) !== "node_id").map((t) => `${t}(${byTable.get(t) ?? "FK 없음"})`);
  assert.deepEqual(off, [], `가드가 g.node_id 로 짜는데 그 칸이 아니다: ${off.join(", ")}`);
});

test("선언된 예외는 실재하고 아직 nodes 를 가리킨다 — 사라지면 이유도 지운다", () => {
  const known = new Set(fks.map((f) => f.table));
  const stale = Object.keys(NODE_GUARD_EXCEPT).filter((t) => !known.has(t));
  assert.deepEqual(stale, [], `nodes 를 안 가리키는 표에 이유가 붙어 있다: ${stale.join(", ")}`);
});

test("아무도 안 가리키는 소리 노드는 지워진다", async () => {
  await admin.query("INSERT INTO nodes (user_id, lang, kind, key, display) VALUES (NULL, 'ko', 'sound', $1, $1)", [KEY]);
  const gone = await admin.query(ORPHAN_SOUND_DELETE);
  assert.ok((gone.rowCount ?? 0) >= 1, "엣지가 없는 소리 노드는 정리돼야 한다");
  const left = await admin.query("SELECT 1 FROM nodes WHERE user_id IS NULL AND lang='ko' AND kind='sound' AND key=$1", [KEY]);
  assert.equal(left.rowCount, 0);
});

test("사용자 행이 붙은 소리 노드는 안 지워진다 — 가드를 빼면 판정이 CASCADE 로 같이 죽는다", async () => {
  const { rows } = await admin.query<{ id: string }>(
    "INSERT INTO nodes (user_id, lang, kind, key, display) VALUES (NULL, 'ko', 'sound', $1, $1) RETURNING id",
    [KEY],
  );
  await admin.query("INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING", [USER, `${USER}@example.com`]);
  await admin.query("INSERT INTO user_node_state (user_id, node_id, knows_sound) VALUES ($1, $2, true)", [USER, rows[0].id]);

  await admin.query(ORPHAN_SOUND_DELETE);

  const node = await admin.query("SELECT 1 FROM nodes WHERE id = $1", [rows[0].id]);
  assert.equal(node.rowCount, 1, "판정이 붙은 노드는 살아 있어야 한다");
  const state = await admin.query("SELECT 1 FROM user_node_state WHERE user_id = $1", [USER]);
  assert.equal(state.rowCount, 1, "판정 행이 남아 있어야 한다 — 노드가 죽으면 이것도 CASCADE 로 죽는다");
});

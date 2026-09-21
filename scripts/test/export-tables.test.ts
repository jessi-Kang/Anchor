/**
 * 내보내기 목록이 **스키마에서 새지 않는지** 붙든다.
 *   pnpm test:db
 *
 * `/api/export` 는 손으로 적은 표 목록을 돈다. `user_id` 를 가진 표를 새로 만들고 그 목록에 안
 * 넣으면 내보내기가 그 표를 **조용히 빠뜨리는데**, 파일은 여전히 `format: "anchor-export"` 라고
 * 말한다. 받는 사람은 그게 전부인 줄 안다 — `CLAUDE.md` 의 "전체 내보내기(JSON) 언제든" 이 그
 * 자리에서 거짓이 되고 **티가 안 난다.**
 *
 * 그래서 **차이가 있으면 선언된 차이여야 한다.** 조용한 차이는 없다. 새 표를 내면 이 테스트가
 * 먼저 떨어지고, 넣든 빼든 **왜인지를 적게** 된다.
 *
 * **목록을 여기 베껴 쓰지 않는다** — 앱이 실제로 쓰는 값을 그대로 불러 견준다. 베끼면 코드가
 * 아니라 사본을 시험하게 되고, 이 테스트가 막으려는 것이 바로 두 곳이 갈리는 일이다.
 *
 * DB 는 읽기만 한다. `information_schema` 만 보므로 어느 계정도 안 만들고 안 지운다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { USER_TABLES, EXPORT_EXCEPTIONS } from "../../src/lib/db/export-tables";

loadEnv();

const admin = adminClient();
let withUserId: string[] = [];

before(async () => {
  await admin.connect();
  const { rows } = await admin.query<{ table_name: string }>(
    `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'user_id'
      ORDER BY c.table_name`,
  );
  withUserId = rows.map((r) => r.table_name);
});

after(async () => {
  await admin.end();
});

test("스키마에 user_id 가 있는데 내보내기가 빠뜨린 표는 없다 (선언된 것 빼고)", () => {
  assert.ok(withUserId.length > 0, "information_schema 를 못 읽었다. 마이그레이션이 올라간 DB 인가");
  const exported = new Set<string>(USER_TABLES);
  const missing = withUserId.filter((t) => !exported.has(t) && !(t in EXPORT_EXCEPTIONS));
  assert.deepEqual(
    missing,
    [],
    `내보내기에서 빠진 표: ${missing.join(", ")}. 넣거나, 왜 안 넣는지 EXPORT_EXCEPTIONS 에 적어라`,
  );
});

test("내보내기 목록에 있는데 user_id 가 없는 표는 없다 (선언된 것 빼고)", () => {
  const hasCol = new Set(withUserId);
  const odd = [...USER_TABLES].filter((t) => !hasCol.has(t) && !(t in EXPORT_EXCEPTIONS));
  assert.deepEqual(odd, [], `user_id 가 없는데 내보내는 표: ${odd.join(", ")}. 이유를 EXPORT_EXCEPTIONS 에 적어라`);
});

test("선언된 예외는 전부 실재하는 표다 — 표가 사라지면 이유도 지운다", () => {
  const known = new Set([...withUserId, ...USER_TABLES]);
  const stale = Object.keys(EXPORT_EXCEPTIONS).filter((t) => !known.has(t));
  assert.deepEqual(stale, [], `없는 표에 이유가 붙어 있다: ${stale.join(", ")}`);
});

test("내보내는 표는 앱 역할이 읽을 수 있다 — 권한이 없으면 내보내기가 터진다", async () => {
  /*
    `account_deletions` 를 빼는 이유 중 하나가 "앱 역할은 INSERT 만 있다" 인데, 그 사실이 바뀌어도
    아무도 모른다. 반대로 **내보내는 표 중 하나가 SELECT 를 잃으면 내보내기가 통째로 터진다** —
    그건 사용자가 데이터를 못 가져가는 것이라 데이터 원칙에 바로 걸린다.
  */
  const { rows } = await admin.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.role_table_grants
      WHERE grantee = 'anchor_app' AND privilege_type = 'SELECT' AND table_schema = 'public'`,
  );
  const readable = new Set(rows.map((r) => r.table_name));
  const blind = [...USER_TABLES].filter((t) => !readable.has(t));
  assert.deepEqual(blind, [], `앱 역할이 못 읽는데 내보내는 표: ${blind.join(", ")}`);
});

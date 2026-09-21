/**
 * 계정 삭제가 **정말 전부 지우는지** 붙든다.
 *   pnpm test:db
 *
 * `/api/account/delete` 는 표 목록을 돌지 않는다. `users` 행 하나를 지우고 FK 가 CASCADE 로
 * 흘리게 둔다. 목록이 없으니 목록 표류도 없다 — 내보내기보다 나은 설계다. 대신 **가정이
 * 하나 생긴다**: 사용자 행을 가진 표가 전부 `users` 까지 이어져 있다는 것.
 *
 * 안 이어진 표가 하나 생기면 삭제가 그 표의 행을 **조용히 남긴다.** 오류도 안 나고 응답은
 * `{ ok: true }` 다. 사용자는 다 지웠다고 믿는다.
 *
 * **FK 가 있다는 것과 지워진다는 것은 다르다.** 이 파일이 견주는 것은 FK 의 존재가 아니라
 * **삭제 규칙**이다 — 자세한 이유는 `src/lib/db/delete-paths.ts` 의 머리말에 있다.
 *
 * **목록을 여기 베껴 쓰지 않는다** — 스키마에서 읽어 `delete-paths.ts` 의 선언과 견준다.
 * DB 는 읽기만 한다. 카탈로그만 보므로 어느 계정도 안 만들고 안 지운다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { REQUIRED_RULE, DELETE_EXCEPTIONS } from "../../src/lib/db/delete-paths";

loadEnv();

const admin = adminClient();

type Fk = { child: string; parent: string; cols: string; rule: string };

let tables: string[] = [];
let withUserId = new Set<string>();
let fks: Fk[] = [];
/** CASCADE 만 밟아 users 에 닿는 표. */
let reaches = new Set<string>();

before(async () => {
  await admin.connect();

  const t = await admin.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  tables = t.rows.map((r) => r.table_name);

  const c = await admin.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'user_id'`,
  );
  withUserId = new Set(c.rows.map((r) => r.table_name));

  /*
    `information_schema.referential_constraints` 도 `delete_rule` 을 주지만 어느 칸에 걸린
    FK 인지 이어 붙이려면 표 두 개를 더 조인해야 한다. `pg_constraint` 는 칸과 규칙을 한 줄에
    준다 — 이 테스트는 "어느 칸이 어느 규칙인가" 가 전부라 그쪽이 맞다.
  */
  const f = await admin.query<Fk>(
    `SELECT con.conrelid::regclass::text AS child,
            con.confrelid::regclass::text AS parent,
            (SELECT string_agg(a.attname, ',' ORDER BY x.ord)
               FROM unnest(con.conkey) WITH ORDINALITY x(att, ord)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.att) AS cols,
            CASE con.confdeltype
              WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
              WHEN 'n' THEN 'SET NULL'  WHEN 'd' THEN 'SET DEFAULT' END AS rule
       FROM pg_constraint con
       JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE con.contype = 'f' AND n.nspname = 'public'`,
  );
  fks = f.rows;

  // CASCADE 인 FK 만 간선으로 놓고 users 에서 거꾸로 퍼뜨린다.
  reaches = new Set(["users"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const fk of fks) {
      if (fk.rule !== REQUIRED_RULE) continue;
      if (reaches.has(fk.parent) && !reaches.has(fk.child)) {
        reaches.add(fk.child);
        grew = true;
      }
    }
  }
});

after(async () => {
  await admin.end();
});

test("user_id 를 가진 표는 users 로 CASCADE 되는 FK 가 있다 (선언된 것 빼고)", () => {
  assert.ok(tables.length > 0, "카탈로그를 못 읽었다. 마이그레이션이 올라간 DB 인가");
  const direct = new Set(
    fks.filter((f) => f.parent === "users" && f.cols === "user_id" && f.rule === REQUIRED_RULE).map((f) => f.child),
  );
  const orphan = [...withUserId].filter((t) => !direct.has(t) && !(t in DELETE_EXCEPTIONS)).sort();
  assert.deepEqual(
    orphan,
    [],
    `user_id 가 있는데 users 로 CASCADE 되지 않는 표: ${orphan.join(", ")}. ` +
      `계정을 지워도 이 표의 행은 남는다. FK 를 걸거나, 왜 안 거는지 DELETE_EXCEPTIONS 에 적어라`,
  );
});

test("users 로 가는 FK 의 규칙은 전부 CASCADE 다 — SET NULL 은 행을 남긴다", () => {
  /*
    **이게 "FK 가 있나" 만 보는 검사가 놓치는 자리다.** 규칙이 SET NULL 이면 FK 는 있는데
    행은 살아남는다. 그리고 이 스키마에서 그건 잔존이 아니라 **누수**다 — `nodes` · `edges` 는
    `user_id` 가 NULL 을 허용하고 NULL 은 "공용 참조 데이터" 를 뜻하므로(0001_init.sql:92),
    지운 계정의 개인 노드가 주인만 잃고 남아 **모든 계정이 읽게 된다**(0002_rls.sql 의 nodes_read).
    로컬에서 실제로 규칙만 SET NULL 로 바꿔 확인했다: users 는 지워지고, 그 사람의 개인 노드는
    user_id 가 NULL 인 채 그대로 남았다.
  */
  const loose = fks
    .filter((f) => f.parent === "users" && f.rule !== REQUIRED_RULE)
    .map((f) => `${f.child}.${f.cols} → ${f.rule}`)
    .sort();
  assert.deepEqual(loose, [], `users 로 가는데 CASCADE 가 아닌 FK: ${loose.join(", ")}`);
});

test("users 에 닿는데 user_id 칸이 없는 표는 선언돼 있다", () => {
  /*
    반대 방향. 내보내기 쪽에서 `users` 가 이 방향으로 걸렸다 — `user_id` 가 있는 표만 세면
    키가 `id` 이거나 남의 표를 거쳐 오는 표를 놓친다. 한 방향만 세는 것이 실제로 틀렸던 자리다.
  */
  const odd = [...reaches].filter((t) => !withUserId.has(t) && !(t in DELETE_EXCEPTIONS)).sort();
  assert.deepEqual(odd, [], `user_id 없이 users 에 딸린 표: ${odd.join(", ")}. 무엇의 주인인지 DELETE_EXCEPTIONS 에 적어라`);
});

test("어떤 경로로도 users 에 안 닿는 표는 선언돼 있다", () => {
  /*
    주인 칸 이름이 `user_id` 가 아닌 표(`owner_id` 같은)는 위 두 검사를 통째로 빠져나간다.
    그래서 마지막 그물은 이름을 안 본다 — **닿거나, 왜 안 닿는지 적혀 있거나.**
  */
  const loose = tables.filter((t) => !reaches.has(t) && !(t in DELETE_EXCEPTIONS)).sort();
  assert.deepEqual(
    loose,
    [],
    `계정 삭제가 닿지 않는 표: ${loose.join(", ")}. 사용자 데이터면 FK 를 걸고, 아니면 DELETE_EXCEPTIONS 에 적어라`,
  );
});

test("선언된 예외는 전부 실재하는 표다 — 표가 사라지면 이유도 지운다", () => {
  const known = new Set(tables);
  const stale = Object.keys(DELETE_EXCEPTIONS).filter((t) => !known.has(t)).sort();
  assert.deepEqual(stale, [], `없는 표에 이유가 붙어 있다: ${stale.join(", ")}`);
});

test("앱 역할은 users 행을 지울 수 있다 — 못 지우면 오류 없이 0행이 지워진다", async () => {
  /*
    **내보내기의 권한 검사와 같은 자리인데 결과가 더 나쁘다.** 내보내기는 권한을 잃으면 질의가
    터져서 티가 난다. 삭제는 안 터진다 —
      · GRANT 에서 DELETE 가 빠지면 `permission denied` (터진다, 그나마 낫다)
      · **RLS 정책이 DELETE 를 안 덮으면 `DELETE 0` 에 오류가 없다.** 라우트는 그대로
        `{ ok: true }` 를 돌려주고, 뒤이어 `auth.deleteUser()` 가 로그인까지 지운다.
        사용자는 다 지웠다고 믿는데 전부 남아 있고, **다시 들어와 지울 길도 없다.**
    로컬에서 정책만 SELECT/INSERT/UPDATE 로 좁혀 확인했다: `DELETE 0`, 오류 없음, 행 전부 생존.
    그래서 권한과 정책을 둘 다 본다.
  */
  const g = await admin.query(
    `SELECT 1 FROM information_schema.role_table_grants
      WHERE grantee = 'anchor_app' AND privilege_type = 'DELETE'
        AND table_schema = 'public' AND table_name = 'users'`,
  );
  assert.equal(g.rows.length, 1, "anchor_app 에 users DELETE 권한이 없다");

  // polcmd: '*' = ALL, 'd' = DELETE. polroles 에 역할 oid 가 있거나 0(PUBLIC)이면 걸린다.
  const p = await admin.query<{ polname: string }>(
    `SELECT polname FROM pg_policy
      WHERE polrelid = 'public.users'::regclass
        AND polcmd IN ('*', 'd')
        AND (0 = ANY(polroles) OR 'anchor_app'::regrole = ANY(polroles))`,
  );
  assert.ok(
    p.rows.length > 0,
    "users 의 RLS 정책 중 DELETE 를 덮는 것이 없다. 이러면 계정 삭제가 오류 없이 0행을 지운다",
  );
});

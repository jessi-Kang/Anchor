/**
 * `encounters` 가 **덧붙이는지** 붙들어 둔다.
 *   pnpm test:db
 *
 * **왜 주석이 아니라 테스트인가.** 이 표는 한 번 덮어쓰기로 돌아간 적이 있다. 그때 코드에는
 * "같은 자료를 다시 읽으면 그 줄의 값을 고친다" 는 주석이 또렷하게 달려 있었다 — 주석은 자기가
 * 틀렸다는 걸 말해 주지 못한다. 그리고 이 자리는 **틀려도 조용하다**: 화면은 똑같이 돌고,
 * 인식률이 위로만 부푼 채로 D+14 까지 간다. 그런 문장은 테스트로 적는다.
 *
 * 무엇을 잡는가 (`docs/MEASURE.md` 0′장):
 *  1. 같은 (계정·글자·자료) 를 두 번 적으면 **줄이 둘**이다. 덮어쓰면 첫 판정이 사라지는데,
 *     그 오차는 한쪽으로만 난다 — 다시 읽으면 알아볼 확률이 올라가니 인식률이 위로만 부푼다.
 *  2. 첫 줄의 값이 **그대로 남는다.** 세는 쪽이 `created_at` 으로 첫 줄을 고르기 때문이다.
 *  3. 판정할 수 없던 만남은 `NULL` 로 남는다. 안 적는 것과 다르다.
 *  4. 내 것도 공용도 아닌 노드는 **줄을 안 만든다** (보안 C13). 나머지 줄은 살아남는다.
 *
 * **진짜 코드 경로를 탄다.** `recordEncounters` 를 그대로 부르므로 `withUser` 와 RLS 를 함께 지난다.
 * 질의를 여기 베껴 쓰면 코드가 아니라 사본을 시험하게 된다.
 *
 * 쓰는 계정은 `fixture-` 로 시작하는 것뿐이고, 끝나면 지운다. 실제 데이터가 있는 계정에는 아무것도
 * 만들지 않는다. 프로덕션 연결로 돌리지 말 것 — 로컬이나 일회용 DB 를 쓴다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { FIXTURE_PREFIX } from "../lib/fixture";
// 진짜 코드 경로를 탄다. 연결 풀은 첫 질의에서야 만들어지므로(`src/lib/db/index.ts` 의 getPool)
// 아래 환경 확인이 먼저 도는 데 문제가 없다.
import { recordEncounters } from "../../src/lib/db/encounters";

loadEnv();

const USER = `${FIXTURE_PREFIX}test-encounters`;
const OTHER = `${FIXTURE_PREFIX}test-encounters-other`;

if (!USER.startsWith(FIXTURE_PREFIX) || !OTHER.startsWith(FIXTURE_PREFIX)) {
  throw new Error(`테스트 계정은 ${FIXTURE_PREFIX} 로 시작해야 한다`);
}
if (!process.env.ANCHOR_DATABASE_URL) {
  throw new Error("ANCHOR_DATABASE_URL 이 필요하다 — 앱 역할(anchor_app)로 붙어야 RLS 까지 함께 시험한다");
}

const admin = adminClient();

let inputId = "";
let sharedNode = "";
let otherNode = "";

before(async () => {
  await admin.connect();
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[USER, OTHER]]);
  for (const id of [USER, OTHER]) {
    await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [id, `${id}@anchor.invalid`]);
  }
  const { rows: inp } = await admin.query<{ id: string }>(
    "INSERT INTO inputs (user_id, kind, lang, body) VALUES ($1, 'paste', 'ja', '協力') RETURNING id",
    [USER],
  );
  inputId = inp[0].id;
  // 공용 노드(주인 없음)와 **남의** 개인 노드. 둘을 같은 배치에 넣어 C13 걸림돌을 시험한다.
  const { rows: shared } = await admin.query<{ id: string }>(
    "INSERT INTO nodes (user_id, lang, kind, key, display) VALUES (NULL, 'ja', 'kanji', $1, $1) RETURNING id",
    [`테스트협${Date.now()}`],
  );
  sharedNode = shared[0].id;
  const { rows: mine } = await admin.query<{ id: string }>(
    "INSERT INTO nodes (user_id, lang, kind, key, display) VALUES ($1, 'ja', 'kanji', $2, $2) RETURNING id",
    [OTHER, `테스트남${Date.now()}`],
  );
  otherNode = mine[0].id;
});

after(async () => {
  await admin.query("DELETE FROM nodes WHERE id = $1", [sharedNode]);
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[USER, OTHER]]);
  await admin.end();
});

const rowsOf = async (nodeId: string) =>
  (
    await admin.query<{ recognized: boolean | null }>(
      "SELECT recognized FROM encounters WHERE user_id = $1 AND node_id = $2 ORDER BY created_at, id",
      [USER, nodeId],
    )
  ).rows;

test("같은 자료를 다시 읽으면 줄이 쌓인다 — 첫 판정을 덮어쓰지 않는다", async () => {
  await recordEncounters(USER, inputId, [{ nodeId: sharedNode, recognized: false }]);
  await recordEncounters(USER, inputId, [{ nodeId: sharedNode, recognized: true }]);

  const rows = await rowsOf(sharedNode);
  assert.equal(rows.length, 2, "두 번 읽었으면 줄도 둘이어야 한다 (덮어쓰면 1이 된다)");
  assert.equal(rows[0].recognized, false, "첫 줄은 처음 판정 그대로여야 한다 — 세는 쪽이 이 줄을 고른다");
  assert.equal(rows[1].recognized, true, "두 번째 판정도 남아야 한다");
});

test("판정할 수 없던 만남은 NULL 로 남는다 — 안 적는 것과 다르다", async () => {
  const { rows: n } = await admin.query<{ id: string }>(
    "INSERT INTO nodes (user_id, lang, kind, key, display) VALUES (NULL, 'ja', 'kanji', $1, $1) RETURNING id",
    [`테스트널${Date.now()}`],
  );
  await recordEncounters(USER, inputId, [{ nodeId: n[0].id, recognized: null }]);
  const rows = await rowsOf(n[0].id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recognized, null, "NULL 이어야 분모에서 빠지면서 '몇 자가 갇혔는가' 를 셀 수 있다");
  await admin.query("DELETE FROM nodes WHERE id = $1", [n[0].id]);
});

test("내 것도 공용도 아닌 노드는 줄을 안 만든다 — 나머지는 살아남는다", async () => {
  await recordEncounters(USER, inputId, [
    { nodeId: otherNode, recognized: true },
    { nodeId: sharedNode, recognized: true },
  ]);
  assert.equal((await rowsOf(otherNode)).length, 0, "남의 개인 노드로는 내 이름의 줄이 생기면 안 된다");
  assert.equal((await rowsOf(sharedNode)).length, 3, "걸린 줄 하나 때문에 같은 배치의 나머지를 버리지 않는다");
});

test("남의 자료 id 로는 아무것도 안 적는다", async () => {
  const { rows: theirs } = await admin.query<{ id: string }>(
    "INSERT INTO inputs (user_id, kind, lang, body) VALUES ($1, 'paste', 'ja', '協力') RETURNING id",
    [OTHER],
  );
  await assert.rejects(() => recordEncounters(USER, theirs[0].id, [{ nodeId: sharedNode, recognized: true }]));
  const { rows } = await admin.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM encounters WHERE user_id = $1 AND input_id = $2",
    [USER, theirs[0].id],
  );
  assert.equal(rows[0].n, "0");
});

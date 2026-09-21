/**
 * 재전송 멱등 키가 **스키마에서** 서 있는지 붙든다 (0008).
 *   pnpm test:db
 *
 * **이건 라우트가 아니라 제약을 시험한다.** `/api/recordings` 는 먼저 SELECT 로 값싸게 거르지만,
 * 두 요청이 같은 키로 동시에 들어오면 둘 다 그 확인을 빠져나간다. 그때 막는 것은 유니크 인덱스
 * 하나뿐이다 — **마지막 방어선이 서 있는지**가 여기서 확인된다. 라우트 질의를 여기 베껴 쓰면
 * 코드가 아니라 사본을 시험하게 되므로 안 베낀다.
 *
 * 무엇이 걸리는가. 이 인덱스가 사라지면 재전송한 녹음이 **새 회차로 앉는다.** 회차는
 * `count(*)+1` 로 세니까 5회차 자리에 4회차 소리가 앉고, 곡선 통과 기준이 그 자리에서 아무 말도
 * 안 하게 된다 (`docs/MEASURE.md` 2장). 화면은 그래도 똑같이 돈다.
 *
 * 쓰는 계정은 `fixture-` 로 시작하는 것뿐이고 끝나면 지운다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { FIXTURE_PREFIX } from "../lib/fixture";

loadEnv();

const USER = `${FIXTURE_PREFIX}test-recordings`;
const OTHER = `${FIXTURE_PREFIX}test-recordings-other`;

const admin = adminClient();
const chunkOf = new Map<string, string>();

const insert = (user: string, attempt: number, clientId: string | null) =>
  admin.query(
    "INSERT INTO recordings (user_id, chunk_id, attempt, pitch, client_id) VALUES ($1, $2, $3, '[]'::jsonb, $4)",
    [user, chunkOf.get(user), attempt, clientId],
  );

before(async () => {
  await admin.connect();
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[USER, OTHER]]);
  for (const id of [USER, OTHER]) {
    await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [id, `${id}@anchor.invalid`]);
    const { rows } = await admin.query<{ id: string }>(
      "INSERT INTO chunks (user_id, lang, situation, text) VALUES ($1, 'en', '상황', 'push this to') RETURNING id",
      [id],
    );
    chunkOf.set(id, rows[0].id);
  }
});

after(async () => {
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[USER, OTHER]]);
  await admin.end();
});

test("같은 계정에서 같은 키는 두 번 들어가지 않는다 — 재전송이 회차가 되지 않게", async () => {
  await insert(USER, 1, "key-same");
  await assert.rejects(() => insert(USER, 2, "key-same"), /duplicate key|unique/i);
});

test("키가 같아도 계정이 다르면 막지 않는다 — 남의 키와 부딪히면 안 된다", async () => {
  await insert(OTHER, 1, "key-same");
  const { rows } = await admin.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM recordings WHERE client_id = $1",
    ["key-same"],
  );
  assert.equal(rows[0].n, "2");
});

test("키 없는 회차는 계속 쌓인다 — 키를 못 만드는 브라우저가 녹음을 잃으면 안 된다", async () => {
  await insert(USER, 2, null);
  await insert(USER, 3, null);
  const { rows } = await admin.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM recordings WHERE user_id = $1 AND client_id IS NULL",
    [USER],
  );
  assert.equal(rows[0].n, "2");
});

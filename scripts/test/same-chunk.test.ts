/**
 * **같은 덩어리는 새로 만들지 않는다** 를 붙들어 둔다 (`docs/FLOW.md` 4장).
 *   pnpm test:db
 *
 * **왜 테스트인가.** 이 자리가 틀려도 화면은 멀쩡하게 돈다 — 같은 말을 다섯 번 해도 1회차짜리
 * 다섯 개가 조용히 생기고, 그때는 아무도 모른다. 아는 순간은 통과 기준을 재려는 날이고
 * (`docs/SPEC.md` 9장 "같은 덩어리 5회차 곡선 일치도"), 그때는 이미 2주치가 갈려 있다.
 * **한쪽으로만 나는 오차**라 더 그렇다: 안 이으면 회차는 늘 낮게 나오지 높게 나오지 않는다.
 *
 * 무엇을 잡는가:
 *  1. 정규화해 같으면 **오늘 행이 먼저 것을 가리킨다.** 오늘 행은 지워지지 않는다.
 *  2. 사슬이 안 생긴다 — 셋째도 **첫 행**을 가리킨다. 사슬이 생기면 곡선이 다시 갈린다.
 *  3. 다른 언어·다른 사람 것과는 안 엮인다.
 *  4. 목록(F18)과 개수(홈)가 **같은 것을 뺀다.** 어긋나면 개수는 있는데 목록이 빈다.
 *  5. 묶음이 내놓는 상황 한 줄은 **가장 최근 것**이다.
 *
 * 진짜 코드 경로를 탄다(`findSameChunk`·`pointAt`·`pastChunks`·`countChunks`·`chunkGroup`).
 * 질의를 여기 베껴 쓰면 코드가 아니라 사본을 시험하게 된다.
 *
 * 쓰는 계정은 `fixture-` 로 시작하는 것뿐이고 끝나면 지운다. 프로덕션 연결로 돌리지 말 것.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { FIXTURE_PREFIX } from "../lib/fixture";
import { chunkGroup, countChunks, createChunk, findSameChunk, pastChunks, pointAt } from "../../src/lib/db/chunks";

loadEnv();

const USER = `${FIXTURE_PREFIX}test-same-chunk`;
const OTHER = `${FIXTURE_PREFIX}test-same-chunk-other`;

if (!USER.startsWith(FIXTURE_PREFIX) || !OTHER.startsWith(FIXTURE_PREFIX)) {
  throw new Error(`테스트 계정은 ${FIXTURE_PREFIX} 로 시작해야 한다`);
}
if (!process.env.ANCHOR_DATABASE_URL) {
  throw new Error("ANCHOR_DATABASE_URL 이 필요하다 — 앱 역할(anchor_app)로 붙어야 RLS 까지 함께 시험한다");
}

const admin = adminClient();

before(async () => {
  await admin.connect();
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[USER, OTHER]]);
  for (const id of [USER, OTHER]) {
    await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [id, `${id}@anchor.invalid`]);
  }
});

after(async () => {
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[USER, OTHER]]);
  await admin.end();
});

/** F17 이 끝난 행 하나. 문장과 덩어리가 다 들어간 상태다. */
const said = (user: string, situation: string, chunk: string, lang: "en" | "ja" = "en") =>
  createChunk(user, {
    lang,
    situation,
    text: `I would ${chunk} today.`,
    attitude: null,
    meta: { chunk, content_source: "authored" },
  });

/** 실제 순서대로: 문장을 적은 뒤 먼저 만난 것이 있으면 가리킨다 (`app/talk/actions.ts` 의 land). */
async function landed(user: string, situation: string, chunk: string): Promise<{ id: string; goesTo: string }> {
  const id = await said(user, situation, chunk);
  const first = await findSameChunk(user, "en", chunk, id);
  if (first) await pointAt(user, id, first);
  return { id, goesTo: first ?? id };
}

const metaOf = async (id: string) =>
  (await admin.query<{ meta: { same_as?: string } }>("SELECT meta FROM chunks WHERE id = $1", [id])).rows[0]?.meta;

test("정규화해 같으면 오늘 행이 먼저 것을 가리킨다 — 오늘 행은 지워지지 않는다", async () => {
  const first = await landed(USER, "이건 다음 스프린트로 미루죠", "push this to");
  assert.equal(first.goesTo, first.id, "처음 만난 덩어리는 제 화면으로 간다");

  // 대소문자·앞뒤 공백·가운데 공백·앞뒤 문장부호만 다르다. 같은 말이다.
  const again = await landed(USER, "오늘도 같은 말을 못 했다", "  Push   this  to.  ");
  assert.equal(again.goesTo, first.id, "같은 덩어리면 먼저 것의 F14 로 가야 회차가 이어진다");
  assert.equal((await metaOf(again.id))?.same_as, first.id, "오늘 행은 먼저 것을 가리킨다");

  const kept = await admin.query<{ situation: string; guess: string | null }>(
    "SELECT situation, meta ->> 'guess' AS guess FROM chunks WHERE id = $1",
    [again.id],
  );
  assert.equal(kept.rows.length, 1, "오늘 행은 남아 있어야 한다 — 쓴 줄은 하나도 없어지지 않는다");
  assert.equal(kept.rows[0].situation, "오늘도 같은 말을 못 했다", "오늘 쓴 상황이 그 행에 그대로 있다");
});

test("사슬이 안 생긴다 — 셋째도 첫 행을 가리킨다", async () => {
  const third = await landed(USER, "또 같은 데서 막혔다", "PUSH THIS TO!");
  const rows = await admin.query<{ id: string; same_as: string | null }>(
    "SELECT id, meta ->> 'same_as' AS same_as FROM chunks WHERE user_id = $1 ORDER BY created_at",
    [USER],
  );
  const firstId = rows.rows[0].id;
  assert.equal(third.goesTo, firstId, "가리킬 곳은 늘 묶음의 첫 행이다");
  assert.equal(rows.rows[1].same_as, firstId);
  assert.equal(rows.rows[2].same_as, firstId, "둘째를 가리키면 곡선이 둘째와 셋째에 나눠 쌓인다");
});

test("다른 언어·다른 사람 것과는 안 엮인다", async () => {
  const ja = await said(USER, "일본어 쪽 같은 글자", "push this to", "ja");
  assert.equal(await findSameChunk(USER, "en", "push this to", ja), (await admin.query<{ id: string }>(
    "SELECT id FROM chunks WHERE user_id = $1 AND lang = 'en' ORDER BY created_at LIMIT 1", [USER],
  )).rows[0].id, "영어 쪽 후보만 봐야 한다");

  const mine = await said(OTHER, "남의 같은 말", "push this to");
  assert.equal(await findSameChunk(OTHER, "en", "push this to", mine), null, "남의 행은 내 후보가 아니다");
});

test("목록과 개수가 같은 것을 뺀다 — 가리키는 행은 둘 다에서 빠진다", async () => {
  const list = await pastChunks(USER, "en");
  const n = await countChunks(USER, "en");
  assert.equal(list.length, 1, "한 덩어리는 한 줄이다 — 셋이 한 묶음이면 목록에도 하나다");
  assert.equal(n, list.length, "개수가 목록보다 크면 홈이 F18 로 보내 놓고 빈 목록을 띄운다");
});

test("묶음이 내놓는 상황 한 줄은 가장 최근 것이다", async () => {
  const { rows } = await admin.query<{ id: string }>(
    "SELECT id FROM chunks WHERE user_id = $1 AND lang = 'en' ORDER BY created_at LIMIT 1",
    [USER],
  );
  const group = await chunkGroup(USER, rows[0].id);
  assert.equal(group?.situation, "또 같은 데서 막혔다", "오늘 나를 여기 데려온 것은 오늘 쓴 줄이다");
  assert.equal(group?.repeated, true, "가리키는 행이 있으면 '전에도 막혔어' 한 줄이 뜬다");

  const list = await pastChunks(USER, "en");
  assert.equal(list[0].situation, "또 같은 데서 막혔다", "목록 부제도 같은 줄을 쓴다");
});

test("가리키는 행이 없으면 전에도 막혔다고 말하지 않는다", async () => {
  const alone = await landed(USER, "처음 하는 말", "wrap this up");
  const group = await chunkGroup(USER, alone.id);
  assert.equal(group?.repeated, false, "첫 만남에 '전에도' 라고 하면 거짓말이다");
});

/**
 * **게이트 전에 들어간 폴백 행이 열면 낫는지** 붙들어 둔다.
 *   pnpm test:db
 *
 * 폴백 행은 `text` 에 **사용자가 쓴 한국어**가 들어 있다. 게이트가 선 뒤로 새로 안 생기지만
 * (`lib/talk/chunk-content.ts`), 이미 들어간 행은 지우지도 숨기지도 않고 **열면 낫게** 한다 —
 * 숨기면 닿을 길이 없어져서 영영 안 낫는다 (PM 판정).
 *
 * 무엇을 잡는가:
 *  1. `hasEnglish` 가 폴백 행을 영어 없는 것으로 친다 → F14 가 F17 로 돌려보낸다.
 *  2. `getSituation.done` 도 같은 눈으로 본다. **여기만 "있다" 고 하면 두 화면이 끝없이 돈다** —
 *     F17 은 done 이라 F14 로 보내고, F14 는 영어가 없다며 다시 F17 로 보낸다.
 *  3. `saveEnglish` 가 그 행에는 쓴다. 안 쓰면 다시 만들어도 제자리다.
 *  4. 멀쩡한 영어는 여전히 안 덮인다 — 그 조건의 원래 일이다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { FIXTURE_PREFIX } from "../lib/fixture";
import { createChunk, getChunk, getSituation, hasEnglish, saveEnglish } from "../../src/lib/db/chunks";

loadEnv();

const USER = `${FIXTURE_PREFIX}test-chunk-fallback`;
if (!USER.startsWith(FIXTURE_PREFIX)) throw new Error(`테스트 계정은 ${FIXTURE_PREFIX} 로 시작해야 한다`);
if (!process.env.ANCHOR_DATABASE_URL) {
  throw new Error("ANCHOR_DATABASE_URL 이 필요하다 — 앱 역할(anchor_app)로 붙어야 RLS 까지 함께 시험한다");
}

const admin = adminClient();
let fallbackId = "";
let realId = "";

before(async () => {
  await admin.connect();
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [USER, `${USER}@anchor.invalid`]);
  // 게이트가 서기 전에 들어가던 모양 그대로 — 영어 자리에 사용자가 쓴 한국어가 들어 있다.
  fallbackId = await createChunk(USER, {
    lang: "en",
    situation: "이건 다음 스프린트로 미루죠",
    text: "이건 다음 스프린트로 미루죠",
    attitude: null,
    meta: { chunk: "이건 다음 스프린트로 미루죠", content_source: "fallback" },
  });
  realId = await createChunk(USER, {
    lang: "en",
    situation: "금요일까지 마무리하죠",
    text: "Let's wrap this up by Friday.",
    attitude: null,
    meta: { chunk: "wrap this up", content_source: "claude" },
  });
});

after(async () => {
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.end();
});

test("폴백 행은 영어가 있는 것으로 안 친다 — 그래야 F17 로 돌아가 다시 만든다", async () => {
  const row = await getChunk(USER, fallbackId);
  assert.ok(row);
  assert.equal(hasEnglish(row), false, "한국어가 들어앉은 행을 영어로 치면 다시 만들 길이 없다");
});

test("getSituation 도 같은 눈으로 본다 — 어긋나면 두 화면이 끝없이 돈다", async () => {
  const seen = await getSituation(USER, fallbackId);
  assert.equal(seen?.done, false, "F17 이 done 이라 F14 로 보내면, F14 는 영어가 없다며 다시 여기로 보낸다");
});

test("폴백 행에는 새 영어가 써진다", async () => {
  await saveEnglish(USER, fallbackId, {
    text: "Let's push this to the next sprint.",
    attitude: "제안",
    chunk: "push this to",
    source: "claude",
  });
  const row = await getChunk(USER, fallbackId);
  assert.equal(row?.text, "Let's push this to the next sprint.", "안 써지면 다시 만들어도 제자리다");
  assert.equal(row?.meta.content_source, "claude", "나은 행은 폴백 표식을 안 달고 있어야 한다");
  assert.equal(hasEnglish(row!), true, "나았으면 이제 영어가 있는 행이다");
});

test("멀쩡한 영어는 여전히 안 덮인다", async () => {
  await saveEnglish(USER, realId, {
    text: "Something else entirely.",
    attitude: null,
    chunk: "something else",
    source: "claude",
  });
  const row = await getChunk(USER, realId);
  assert.equal(row?.text, "Let's wrap this up by Friday.", "덮으면 그 대상의 1회차 곡선 기준선이 딴 문장 것이 된다");
});

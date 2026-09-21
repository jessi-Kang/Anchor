/**
 * **안 끝낸 오래된 자료가 사라지지 않는지** 붙들어 둔다 (`docs/FLOW.md` 1′장 F19).
 *   pnpm test:db
 *
 * **왜 테스트인가.** 이 자리는 틀려도 오류가 없다. 목록이 조용히 한 줄을 안 내고, 하루 끝 화면이
 * "오늘은 끝났다" 고 말한다. 사용자가 보는 것은 **카드가 남았는데 끝났다는 말을 듣고, 남은 걸
 * 찾아갈 길도 없는 상태**다. 그리고 이 상태는 자료 열 개면 닿는다 — 평범한 열흘이다.
 *
 * 무엇을 잡는가:
 *  1. 홈과 F19 가 **같은 목록**을 봐서, 열한 번째 아래의 자료도 둘 중 하나에는 뜬다.
 *     `splitForHome` 은 순수 함수지만 **넣는 목록이 다르면 같은 함수도 다른 답을 낸다.**
 *  2. `cardsLeft` 가 목록 상한에 안 걸린다. 여기서 0 이 나오면 하루 끝이 거짓말을 한다.
 *
 * 열두 개를 만들고 **가장 오래된 것에만** 안 만난 한자를 둔다. 상한이 10 이던 때 정확히 그 줄이
 * 사라졌다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { FIXTURE_PREFIX } from "../lib/fixture";
import { listInputs } from "../../src/lib/db/inputs";
import { cardsLeft } from "../../src/lib/cards/progress";
import { inputRowData, splitForHome } from "../../src/lib/cards/input-rows";

loadEnv();

const USER = `${FIXTURE_PREFIX}test-input-list`;
/** 오래된 자료에만 남아 있는 글자. 나머지 자료의 글자(`KNOWN`)는 "알아" 로 내려 둔다. */
const KANJI = "協";
const KNOWN = "力";
const OLD_TITLE = "가장 오래된 안 끝낸 자료";
const COUNT = 12;

if (!USER.startsWith(FIXTURE_PREFIX)) throw new Error(`테스트 계정은 ${FIXTURE_PREFIX} 로 시작해야 한다`);
if (!process.env.ANCHOR_DATABASE_URL) {
  throw new Error("ANCHOR_DATABASE_URL 이 필요하다 — 앱 역할(anchor_app)로 붙어야 RLS 까지 함께 시험한다");
}

const admin = adminClient();

before(async () => {
  await admin.connect();
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [USER, `${USER}@anchor.invalid`]);
  /*
    나머지 열한 개의 글자는 **"알아" 로 내려 둔다.** 뽑을 한자가 아예 없는 자료는
    `actionable` 이 참이라(아직 안 뽑은 자료로 친다) 홈이 그걸로 다 차 버려서, 재현하려는
    상황("할 일이 남은 건 오래된 그것 하나뿐")이 안 만들어진다.
  */
  await admin.query(
    `INSERT INTO user_node_state (user_id, node_id, knows_sound, knows_meaning)
     SELECT $1, id, true, true FROM nodes WHERE key = $2 AND kind = 'kanji'`,
    [USER, KNOWN],
  );
  // 가장 오래된 것부터 넣는다. `created_at` 이 목록 순서라 이 순서가 곧 화면 순서다.
  for (let i = 0; i < COUNT; i++) {
    // 맨 처음 것에만 **안 만난** 한자가 있다. 나머지는 아는 글자뿐이라 할 일이 없다.
    const kanji = i === 0 ? [KANJI] : [KNOWN];
    await admin.query(
      `INSERT INTO inputs (user_id, kind, lang, title, body, extracted_at, meta, created_at)
       VALUES ($1, 'paste', 'ja', $2, $3, now(), $4, now() - ($5 || ' minutes')::interval)`,
      [USER, i === 0 ? OLD_TITLE : `자료 ${i}`, `본문 ${i}`, JSON.stringify({ kanji }), String(COUNT - i)],
    );
  }
});

after(async () => {
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.end();
});

test("열한 번째 아래의 안 끝낸 자료도 홈이나 지난 자료 둘 중 하나에는 뜬다", async () => {
  const all = await inputRowData(USER, await listInputs(USER));
  assert.equal(all.length, COUNT, "목록이 먼저 열둘을 다 불러와야 한다");

  const { home, rest } = splitForHome(all);
  const seen = [...home, ...rest].map((d) => d.input.title);
  assert.equal(seen.length, COUNT, "홈과 지난 자료를 합치면 목록 그대로여야 한다 — 어느 쪽에도 없는 줄이 생기면 안 된다");
  assert.ok(seen.includes(OLD_TITLE), "안 끝낸 가장 오래된 자료가 어디에도 없으면 돌아갈 길이 없다");
  assert.ok(
    home.some((d) => d.input.title === OLD_TITLE),
    "그 자료는 할 일이 남았으니 홈이 먼저 집어야 한다 (splitForHome 은 actionable 을 먼저 고른다)",
  );
});

test("cardsLeft 가 목록 상한에 안 걸린다 — 0 이면 하루 끝이 거짓말을 한다", async () => {
  const left = await cardsLeft(USER);
  assert.equal(left, 1, `열두 번째 자료의 ${KANJI} 하나가 남아 있다. 최근 열 개만 보면 여기서 0 이 나온다`);
});

/**
 * **"이 자료엔 한자가 없어" 가 다시 거짓이 되지 않게** 붙들어 둔다.
 *   pnpm test:db
 *
 * F03 은 우리가 아는 한자가 0이면 무조건 "이 자료엔 한자가 없어" 라고 하고 "다른 자료를 넣어 봐"
 * 로 돌려보냈다. 한자가 스무 개인 기사에도 그렇게 말했다 — **없던 것은 자료의 한자가 아니라 우리
 * 쪽 행**이었는데, `found` 하나만 보고 둘을 같은 것으로 쳤다.
 *
 * 프로덕션에서 이 말이 실제로 나오는 상태다(공용 한자 40 / 2,136). 씨앗을 다 넣으면 거의 사라지지만
 * **없어지지는 않는다** — 상용한자 2,136 밖의 글자(인명용·옛 글자)는 그 뒤에도 노드가 없다.
 * 그래서 씨앗과 별개로 화면이 둘을 갈라 말해야 한다.
 *
 * 무엇을 잡는가: `judgeItems` 가 **뽑아낸 것(`seen`)과 아는 것(`found`)을 따로** 돌려주는가.
 * 둘이 도로 하나가 되면 화면은 갈라 말할 재료를 잃는다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { FIXTURE_PREFIX } from "../lib/fixture";
import { judgeItems } from "../../src/lib/cards/judge-items";

loadEnv();

const USER = `${FIXTURE_PREFIX}test-judge-missing`;
if (!USER.startsWith(FIXTURE_PREFIX)) throw new Error(`테스트 계정은 ${FIXTURE_PREFIX} 로 시작해야 한다`);

/** 씨앗(상용한자 2,136)에 **없는** 글자. 있으면 이 시험이 뜻을 잃으므로 먼저 확인한다. */
const ABSENT = ["彁", "龘"];
/** 씨앗에 **있는** 글자. */
const PRESENT = "闇";

const admin = adminClient();

before(async () => {
  await admin.connect();
  const { rows } = await admin.query<{ key: string }>(
    "SELECT key FROM nodes WHERE user_id IS NULL AND kind = 'kanji' AND key = ANY($1)",
    [[...ABSENT, PRESENT]],
  );
  const keys = new Set(rows.map((r) => r.key));
  assert.ok(keys.has(PRESENT), `씨앗이 안 들어가 있다 — 먼저 pnpm db:seed`);
  for (const ch of ABSENT) {
    assert.ok(!keys.has(ch), `${ch} 가 이제 씨앗에 있다. 이 시험은 씨앗 밖 글자로 해야 뜻이 있다`);
  }
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [USER, `${USER}@anchor.invalid`]);
});

after(async () => {
  await admin.query("DELETE FROM users WHERE id = $1", [USER]);
  await admin.end();
});

test("모르는 글자만 있는 자료 — 뽑아낸 것은 있고 아는 것만 0이다", async () => {
  const { seen, found } = await judgeItems(USER, `この${ABSENT.join("")}をよむ`);
  assert.equal(seen.length, ABSENT.length, "자료에 있는 한자를 못 셌다");
  assert.equal(found.length, 0, "씨앗 밖 글자를 안다고 세면 안 된다");
  // 화면이 이 둘로 갈라 말한다. seen 이 0 이 아닌데 "한자가 없어" 라고 하면 그게 그 거짓말이다.
  assert.notEqual(seen.length, found.length, "둘이 같아지면 화면이 갈라 말할 재료를 잃는다");
});

test("한자가 정말 없는 자료 — 그때만 둘 다 0이다", async () => {
  const { seen, found } = await judgeItems(USER, "ひらがなだけの ぶんしょう");
  assert.equal(seen.length, 0, "가나만 있는 자료에서 한자를 뽑으면 안 된다");
  assert.equal(found.length, 0);
});

test("아는 글자와 모르는 글자가 섞인 자료 — seen 이 둘 다 센다", async () => {
  const { seen, found } = await judgeItems(USER, `${PRESENT}${ABSENT.join("")}`);
  assert.equal(seen.length, 1 + ABSENT.length, "모르는 글자가 seen 에서 빠지면 개수가 거짓이 된다");
  assert.deepEqual(found, [PRESENT], "아는 것은 씨앗에 있는 글자 하나뿐이다");
});

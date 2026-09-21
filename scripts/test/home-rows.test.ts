/**
 * **어제 것으로 돌아갈 길이 있는가** 를 붙든다 (`docs/FLOW.md` 4장, `docs/SPEC.md` 9장).
 *   pnpm verify   (DB 를 안 쓴다 — 순수 함수만 부른다)
 *
 * **왜 시험인가.** 이 자리가 틀려도 **화면은 멀쩡하게 돈다.** 홈은 네 줄을 똑바로 그리고, 목록도
 * 제 줄을 그린다. 다만 **어느 쪽에도 안 선 자료가 조용히 생긴다** — 그 자료로 들어갈 길이 앱
 * 어디에도 없어지고, 일본어 축의 재만남(F12)은 자료 행 하나가 유일한 입구라 **재만남이 통째로
 * 안 생긴다.** 통과 기준 둘 중 하나("2주 후 재만남 인식률")가 거기 걸려 있는데, 아는 순간은
 * D+14 고 그때는 2주치가 이미 갈려 있다. 한쪽으로만 나는 오차라 더 그렇다.
 *
 * 실제로 한 번 일어났다: 홈이 10개, F19 가 100개를 넣던 때 **열한 번째 아래의 안 끝낸 자료가
 * 두 화면 어디에도 안 떴다** (`input-rows.ts` 의 같은 주석, `input-list.test.ts`).
 *
 * 무엇을 잡는가:
 *  1. 자료 1개·4개 — 전부 홈에 선다. 목록으로 넘어가는 것이 없다.
 *  2. 자료 5개 — 홈 넷 + 목록 하나.
 *  3. **겹치지 않고 합이 전부다.** 이 줄이 이 시험의 값이다 — 둘 중 하나만 깨져도 자료가
 *     화면에서 사라지는데 그때도 화면은 멀쩡해 보인다.
 *  4. 다 본 자료는 자리가 남을 때 **하나만** 올라간다. 여럿 올리면 홈이 다시 목록이 된다.
 *  5. 홈 순서는 들어온 순서(최근 순) 그대로다 — 고른 순서가 아니라.
 *  6. 영어 "못 한 말" 행은 덩어리가 있으면 목록(F18)으로, 없으면 쓰기(F13)로 간다.
 *
 * **화면이 아니라 행을 만드는 쪽을 부른다.** 화면을 부르면 DB 와 로그인이 따라오고, 그러면
 * 이 시험이 무거워서 아무도 안 돌린다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitForHome, HOME_MAX, type InputRowData } from "@/lib/cards/input-rows";
import { talkPath } from "@/lib/languages";

/** 자료 하나. 가르는 값은 `actionable` 하나라 나머지는 최소로 둔다. */
function row(id: string, actionable: boolean): InputRowData {
  return {
    input: { id, lang: "ja", title: null, body: "", created_at: "", extracted_at: null, meta: {} },
    kanji: 0,
    remaining: actionable ? 1 : 0,
    next: null,
    actionable,
  };
}

/** 홈에 선 것과 목록에 선 것을 합치면 넣은 것 전부고, 겹치는 것은 하나도 없다. */
function assertWhole(all: InputRowData[]) {
  const { home, rest } = splitForHome(all);
  const ids = (xs: InputRowData[]) => xs.map((x) => x.input.id);
  assert.deepEqual([...ids(home), ...ids(rest)].sort(), ids(all).sort(), "홈 + 목록이 전부가 아니다");
  assert.equal(new Set([...ids(home), ...ids(rest)]).size, all.length, "홈과 목록에 같은 자료가 두 번 섰다");
}

test("자료 하나 — 홈에 서고 목록으로 넘어가는 것이 없다", () => {
  const all = [row("a", true)];
  const { home, rest } = splitForHome(all);
  assert.deepEqual(home.map((d) => d.input.id), ["a"]);
  assert.deepEqual(rest, []);
  assertWhole(all);
});

test("자료 넷 — 넷 다 홈에 선다", () => {
  const all = ["a", "b", "c", "d"].map((id) => row(id, true));
  const { home, rest } = splitForHome(all);
  assert.equal(home.length, HOME_MAX);
  assert.deepEqual(rest, []);
  assertWhole(all);
});

test("자료 다섯 — 홈 넷 + 목록 하나. 다섯째가 사라지지 않는다", () => {
  const all = ["a", "b", "c", "d", "e"].map((id) => row(id, true));
  const { home, rest } = splitForHome(all);
  assert.equal(home.length, HOME_MAX);
  assert.deepEqual(rest.map((d) => d.input.id), ["e"]);
  assertWhole(all);
});

test("겹치지 않고 합이 전부다 — 섞인 목록에서도", () => {
  // 할 일이 있는 것과 다 본 것이 섞이고, 홈 정원보다 많다.
  const all = [
    row("a", false), row("b", true), row("c", false), row("d", true),
    row("e", true), row("f", false), row("g", true), row("h", true),
  ];
  assertWhole(all);
});

test("다 본 자료는 자리가 남을 때 하나만 올라간다 — 홈이 다시 목록이 되지 않게", () => {
  const all = [row("a", true), row("b", false), row("c", false), row("d", false)];
  const { home, rest } = splitForHome(all);
  assert.deepEqual(home.map((d) => d.input.id), ["a", "b"]);
  assert.deepEqual(rest.map((d) => d.input.id), ["c", "d"]);
  assertWhole(all);
});

test("다 본 자료뿐이어도 하나는 홈에 선다 — 재만남 입구가 그 행 하나다", () => {
  const all = ["a", "b", "c"].map((id) => row(id, false));
  const { home } = splitForHome(all);
  assert.equal(home.length, 1, "다 본 자료만 있는 날 홈에 자료 행이 하나도 없으면 F12 로 갈 길이 없다");
  assertWhole(all);
});

test("홈 순서는 들어온 순서(최근 순) 그대로다", () => {
  // 고른 순서대로 담으면 다 본 "b" 가 맨 뒤로 가서 화면이 최근 순이 아니게 된다.
  const all = [row("a", true), row("b", false), row("c", true)];
  const { home } = splitForHome(all);
  assert.deepEqual(home.map((d) => d.input.id), ["a", "b", "c"]);
});

test("못 한 말 행 — 덩어리가 있으면 목록으로, 없으면 쓰기로", () => {
  assert.equal(talkPath(0), "/talk", "덩어리가 없는데 목록으로 보내면 빈 목록이 뜬다");
  assert.equal(talkPath(1), "/talk/past", "덩어리가 있는데 쓰기로 보내면 지난 덩어리로 돌아갈 길이 없다");
  assert.equal(talkPath(3), "/talk/past");
});

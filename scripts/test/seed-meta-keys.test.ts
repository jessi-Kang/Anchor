/**
 * 적재가 `nodes.meta` 를 **합치지 않고 덮는지** 잰다.
 *
 * `scripts/seed.ts` 의 upsert 는 `meta = EXCLUDED.meta` 다. 전에는 `nodes.meta || EXCLUDED.meta`
 * 였는데, jsonb `||` 는 **오른쪽에 없는 키를 왼쪽에서 그대로 살린다.** 그래서 칸이 하나라도 빠지면
 * **파일에서 지운 값이 DB 에서 안 지워졌다** — 적재가 "파일이 말하는 상태"가 아니라 "파일이 말한
 * 적 있는 모든 상태의 합"이 됐다.
 *
 * 돌려서 봤다(로컬, 2026-09-21): `駅` 의 앵커를 「역」으로 넣어 두고 그 글자가 빠진 파일로 다시
 * 적재하니 `meta.ko_word` 가 「역」 그대로 남았다. F03 은 그 한 칸으로 두 묶음을 가르므로 화면은
 * 계속 **"역의 역"** 이라고 말한다. **눈으로는 안 잡힌다** — 적재는 성공하고 행 수도 안 변한다.
 *
 * **이 시험은 전에 칸의 모양(`...(x ? { k: x } : {})`)을 쟀다.** 그게 `const meta: Record<…> = {`
 * 한 모양만 찾아서, `JSON.stringify({ … })` 안에 인라인으로 짠 세 자리를 **안 보고도 초록이었다.**
 * 「하나라도 찾았으면 통과」와 「전부 봤다」는 다른 물음이다. 그래서 세는 대상을 바꿨다 — 칸이 아니라
 * **upsert** 를 하나씩 꺼내 놓고 전부에 대해 묻는다. 칸을 조건부로 빼도 이제 DB 는 파일이 말한
 * 것만 갖는다.
 *
 * **주석은 빼고 읽는다.** 안 그러면 위 문단의 `nodes.meta ||` 가 스스로 빨강을 만들고, 더 나쁘게는
 * **설명 주석을 지우면 초록이 되는 시험**이 된다.
 *
 * 같은 칸이 두 번 적히는 것은 여기서 안 잰다. `pnpm typecheck` 이 TS1117 로 파일 전체에서 잡는다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILE = "scripts/seed.ts";
const src = readFileSync(FILE, "utf8");

/** 주석을 뺀 코드. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** `nodes` 로 가는 INSERT 를 통째로 집는다. 한 덩어리 = 역따옴표 문자열 하나. */
function nodeUpserts(): string[] {
  return [...code.matchAll(/`[^`]*INSERT INTO nodes[^`]*`/g)].map((m) => m[0]);
}

/** 지금 seed.ts 가 nodes 에 쓰는 자리: en-seed · 부품 · 한자 · 한국 한자음. */
const EXPECTED_UPSERTS = 4;

test("nodes 에 쓰는 자리를 실제로 다 찾았다 — 못 찾고 조용히 통과하지 않게", () => {
  const found = nodeUpserts();
  assert.ok(
    found.length >= EXPECTED_UPSERTS,
    `${FILE} 에서 nodes INSERT 를 ${found.length}개만 찾았다 (${EXPECTED_UPSERTS}개 이상이어야 한다). ` +
      "자리가 진짜로 줄었으면 EXPECTED_UPSERTS 를 내리고, 아니면 이 시험이 아무것도 안 재고 있다",
  );
});

test("meta 를 합치는 자리가 하나도 없다 — 빠진 칸은 옛 값을 살린다", () => {
  const merging = [...code.matchAll(/.*nodes\.meta\s*\|\|.*/g)].map((m) => m[0].trim());
  assert.deepEqual(
    merging,
    [],
    "`nodes.meta || EXCLUDED.meta` 가 남아 있다. jsonb || 는 오른쪽에 없는 키를 왼쪽에서 살리므로, " +
      "파일에서 지운 값이 DB 에 남는다. `meta = EXCLUDED.meta` 로 적어라",
  );
});

test("meta 를 건드리는 upsert 는 전부 EXCLUDED.meta 로 덮는다", () => {
  const wrong = nodeUpserts()
    .filter((sql) => /\bmeta\s*=/.test(sql))
    .filter((sql) => !/\bmeta = EXCLUDED\.meta\b/.test(sql));
  assert.deepEqual(
    wrong.map((sql) => sql.replace(/\s+/g, " ").slice(0, 120)),
    [],
    "meta 를 EXCLUDED.meta 가 아닌 것으로 쓰는 upsert 가 있다",
  );
});

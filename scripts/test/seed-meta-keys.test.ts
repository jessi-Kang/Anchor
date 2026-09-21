/**
 * 적재가 `nodes.meta` 에 쓰는 칸이 **조건부가 아닌지** 잰다.
 *
 * `scripts/seed.ts` 의 upsert 는 `meta = nodes.meta || EXCLUDED.meta` 다. jsonb `||` 는
 * **오른쪽에 없는 키를 왼쪽에서 그대로 살린다.** 그래서 칸을 조건부로 빼면 **파일에서 지운 값이
 * DB 에서 안 지워진다** — 적재가 "파일이 말하는 상태" 가 아니라 "파일이 말한 적 있는 모든 상태의
 * 합" 이 된다.
 *
 * 돌려서 봤다(로컬, 2026-09-21): `駅` 의 앵커를 「역」으로 넣어 두고 그 글자가 빠진 파일로 다시
 * 적재하니 `meta.ko_word` 가 「역」 그대로 남았다. F03 은 그 한 칸으로 두 묶음을 가르므로 화면은
 * 계속 **"역의 역"** 이라고 말한다. **눈으로는 안 잡힌다** — 적재는 성공하고 행 수도 안 변한다.
 *
 * 그래서 값이 아니라 **모양**을 잰다. 칸을 하나 더 만드는 사람이 `...(x ? { k: x } : {})` 를 쓰면
 * 여기서 걸리고, 이 주석이 왜 안 되는지 말한다. 조건이 필요하면 `k: x ?? null` 로 적으면 된다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("scripts/seed.ts", "utf8");

/** `const meta: Record<string, unknown> = { … };` 한 덩어리를 통째로 집는다. */
function metaLiterals(): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/const meta: Record<string, unknown> = \{/g)) {
    const start = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          out.push(src.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

test("meta 리터럴을 실제로 찾았다 — 빈 배열로 조용히 통과하지 않게", () => {
  assert.ok(metaLiterals().length > 0, "scripts/seed.ts 에서 meta 리터럴을 못 찾았다. 이 시험이 아무것도 안 재고 있다");
});

test("meta 의 칸은 조건부로 들어가지 않는다 — 빠진 칸은 옛 값을 살린다", () => {
  const off = metaLiterals().filter((lit) => /\.\.\./.test(lit));
  assert.deepEqual(
    off,
    [],
    "meta 리터럴에 전개(...)가 있다. jsonb || 는 오른쪽에 없는 키를 왼쪽에서 살리므로, " +
      "조건부로 빠진 칸은 파일에서 지워도 DB 에 남는다. `k: x ?? null` 로 적어라",
  );
});

test("적재가 쓰는 칸은 다 한 번씩만 적혀 있다", () => {
  for (const lit of metaLiterals()) {
    const keys = [...lit.matchAll(/^\s{8}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    assert.deepEqual(dup, [], `meta 에 같은 칸이 두 번 적혀 있다 (뒤엣것만 산다): ${dup.join(", ")}`);
  }
});

/**
 * 손으로 적은 카드가 **화면이 읽는 모양 그대로인지** 잰다.
 *
 * `seed.ts` 는 이 파일을 `Record<string, unknown>` 으로 읽어 `nodes.meta.card` 에 그대로 넣는다.
 * 타입이 안 걸리니 **없어진 칸이 조용히 살아남는다** — 실제로 `hook: { word, mark }` 가 스키마에서
 * 빠진 뒤에도 스물여덟 장에 그대로 실려 DB 로 들어가고 있었고, 그 칸을 설명하는 문단이 남아서
 * 읽는 사람을 이미 고쳐진 버그로 보냈다. 화면이 안 읽는 칸은 조용하지만, 죽은 설명은 안 조용하다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KEYS = ["parts_meaning", "question", "answer", "landing", "pattern"] as const;
const cards = (JSON.parse(readFileSync("db/seed/kanji-cards.json", "utf8")) as { cards: Record<string, Record<string, unknown>> }).cards;

test("카드 칸은 CardContent 다섯 개뿐이다 — 없어진 칸이 남아 있지 않다", () => {
  const off = Object.entries(cards)
    .map(([k, v]) => [k, Object.keys(v).filter((n) => !(KEYS as readonly string[]).includes(n))] as const)
    .filter(([, extra]) => extra.length > 0)
    .map(([k, extra]) => `${k}: ${extra.join(", ")}`);
  assert.deepEqual(off, [], `화면이 안 읽는 칸이 남아 있다:\n  ${off.join("\n  ")}`);
});

test("다섯 칸이 다 차 있다 — 빈 채로 실리지 않는다", () => {
  const missing = Object.entries(cards)
    .map(([k, v]) => [k, KEYS.filter((n) => v[n] === undefined)] as const)
    .filter(([, gaps]) => gaps.length > 0)
    .map(([k, gaps]) => `${k}: ${gaps.join(", ")}`);
  assert.deepEqual(missing, []);
});

test("착지 낱말은 둘 다 일본어 표기·요미가나·한국어를 지고 있다", () => {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(cards)) {
    const landing = v.landing as { word?: string; reading?: string; ko?: string }[];
    if (!Array.isArray(landing) || landing.length < 2) { bad.push(`${k}: 착지가 ${Array.isArray(landing) ? landing.length : "없음"}개`); continue; }
    for (const w of landing) if (!w.word || !w.reading || !w.ko) bad.push(`${k}: ${JSON.stringify(w)}`);
  }
  assert.deepEqual(bad, []);
});

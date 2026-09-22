/**
 * **다음 카드를 정하는 것이 그래프인가 자료인가.**  `pnpm measure:drive`
 *
 * PM 측정이 정의한 수다(2026-09-22). Jessi 가 「이러면 다른 서비스와 크게 다르지 않은 것
 * 같은데」라고 물었고, 답을 말로 하지 않으려고 만든 자다.
 *
 * **재는 것:** 한 자료를 처음부터 끝까지 카드로 따라갈 때, 각 결정에서 **아는 것이 순서를
 * 실제로 바꿨나.** `nextCandidates` 의 `via` 가 그 신호다 — 공유 부품이 하나라도 있을 때만 선다.
 *
 * **왜 이 수인가.** `score = 공유 부품 수 + (한국어 앵커 ? 0.5 : 0)` 인데, 공유 부품이 전부 0 이면
 * 남는 건 노드의 성질(0/0.5)뿐이라 **동점**이고, 안정 정렬이라 **자료에 나온 차례**가 순서를
 * 정한다. 그 비율이 높으면 **우리가 고르는 게 아니라 자료가 고르는 것**이고, 그건 주제별 코스다.
 *
 * **DB 를 안 탄다.** `nextCandidates` 는 순수 함수고 노드는 씨앗 JSON 으로 세운다. 프로덕션을
 * 안 읽고 안 쓴다.
 *
 * **한계 둘 — 수를 인용할 때 같이 인용한다.**
 *  1. **자료 한 편이다.** 후보 집합이 그 자료의 한자뿐이라 이 수는 「그 자료 안에서」의 값이다.
 *     범위가 그래프 전체로 바뀌면 다시 재야 한다 (`docs/SPEC.md` 9장, 열린 물음).
 *  2. **맞히는 사람을 흉내 낸다.** 매 단계 최고점을 맞힌 것으로 치고 아는 것을 늘린다.
 *     실제 사용자는 틀리기도 하니 이 수는 **그래프에 가장 유리한 쪽**이다.
 */
import { readFileSync } from "node:fs";
import { nextCandidates, type InputProgress } from "../src/lib/cards/progress";

const R = new URL("../db/seed/", import.meta.url).pathname;
const items = JSON.parse(readFileSync(R + "kanji.json", "utf8")).items as {
  kanji: string; ko: string | null; parts: string[];
}[];
const koWords = JSON.parse(readFileSync(R + "kanji-ko.json", "utf8")) as Record<string, string>;

const BODY =
  "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。条件をめぐって妥協が必要だったという。";

// 자료에 나온 차례 그대로, 중복 없이
const chars: string[] = [];
for (const ch of BODY) if (/\p{Script=Han}/u.test(ch) && !chars.includes(ch)) chars.push(ch);

const byKanji = new Map(items.map((i) => [i.kanji, i]));
const nodes = chars
  .map((c) => {
    const it = byKanji.get(c);
    if (!it) return null;
    return {
      id: c, key: c,
      meta: { parts: it.parts ?? [], ko_sound: it.ko ?? null, ko_word: koWords[c] ?? null },
    };
  })
  .filter(Boolean) as InputProgress["nodes"];

console.log(`자료의 한자 ${chars.length}자 · 씨앗에 있는 것 ${nodes.length}자`);
console.log(`발판(한국 한자음) 있는 것 ${nodes.filter((n) => n.meta.ko_sound).length}자\n`);

const known = new Set<string>();
const anchors = new Set<string>();
const solved = new Set<string>();
const landed: string[] = [];

const prog = () =>
  ({
    input: { id: "x", meta: { kanji: chars } } as InputProgress["input"],
    nodes, known, anchors, solved, landedKanji: landed,
    remaining: 0, total: nodes.length,
  }) as InputProgress;

let steps = 0, graphDrove = 0, changedOrder = 0;
const log: string[] = [];

for (;;) {
  const cands = nextCandidates(prog());
  if (!cands.length) break;
  const pick = cands[0];

  // 문서 순서만으로 고르면 무엇이 뽑히나 — 같은 거르개를 통과한 것 중 자료에 먼저 나온 것
  const pool = nodes.filter((n) => n.meta.ko_sound && !known.has(n.key) && !landed.includes(n.key));
  const byDoc = pool[0];

  // `via` 는 shared.length > 0 일 때만 선다 (progress.ts: viaKanji = shared.length ? ... : null)
  const graph = pick.via !== null;
  steps++;
  if (graph) graphDrove++;
  if (byDoc.key !== pick.kanji) changedOrder++;

  log.push(
    `${String(steps).padStart(2)}. ${pick.kanji}  ${graph ? `← ${pick.via!.kanji} 을 맞혀서` : "  (아는 것이 안 밀었다 — 자료 차례)"}` +
      `${byDoc.key !== pick.kanji ? `   [문서순이면 ${byDoc.key}]` : ""}`,
  );

  known.add(pick.kanji); anchors.add(pick.kanji); solved.add(pick.kanji); landed.push(pick.kanji);
}

console.log(log.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`결정 ${steps}회`);
console.log(`  아는 것이 점수에 실제로 들어간 결정 : ${graphDrove} / ${steps}  (${((graphDrove / steps) * 100).toFixed(0)}%)`);
console.log(`  그 때문에 순서가 바뀐 결정          : ${changedOrder} / ${steps}  (${((changedOrder / steps) * 100).toFixed(0)}%)`);

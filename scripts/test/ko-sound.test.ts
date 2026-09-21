/**
 * 앵커 낱말과 한국 한자음이 **같은 것을 가리키는지** 잰다.
 *
 * 이 망이 없던 동안 `金` 의 한국 한자음이 「김」이었다. KANJIDIC2 는 金 에 김·금을 둘 다 싣고
 * 빌드가 첫 값을 집었다. 1학년·빈도 53 이고 F03·Scene1 이 앵커 없는 글자에 그 소리를 그대로
 * 세우는 자리라, **앱의 전제가 그 줄에서 끊긴다** — きん 은 금에서 오지 김에서 안 온다.
 * 눈으로는 안 잡힌다(2,136자 중 열여섯 자였다). 그래서 잰다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anchorHits, headSound, pickKoSound } from "../../src/lib/kanji/ko-sound";

type Item = { kanji: string; ko: string | null; ko_all: string[] };
const items = (JSON.parse(readFileSync("db/seed/kanji.json", "utf8")) as { items: Item[] }).items;
const words = (JSON.parse(readFileSync("db/seed/kanji-ko.json", "utf8")) as { words: Record<string, string> }).words;

/*
  **「앵커가 그 글자의 소리를 품는가」는 여기서 안 잰다** — `anchor-shape.test.ts` 로 옮겼고,
  거기서는 **두음법칙을 안 봐준다**(기획 `dfa1ea1`). 料/요리 는 소리를 "요" 로 부르는데 카드는
  "료 りょう" 를 가르쳐서, 접어서 이어지는 것이 앵커로 서도 된다는 뜻은 아니기 때문이다.
  이 파일이 재는 것은 **고르는 규칙**(여러 소리 중 어느 것)이고, 거기서는 접는 것이 여전히 맞다.
*/
test("고른 소리는 늘 KANJIDIC2 목록 안에 있다 — 지어낸 값이 없다", () => {
  const made = items.filter((it) => it.ko !== null && !it.ko_all.includes(it.ko));
  assert.deepEqual(made.map((it) => `${it.kanji} ${it.ko} ∉ ${JSON.stringify(it.ko_all)}`), []);
});

test("소리가 없는 글자는 목록도 비어 있다 — 있는데 안 고른 자리는 없다", () => {
  const skipped = items.filter((it) => it.ko === null && it.ko_all.length > 0);
  assert.deepEqual(skipped.map((it) => it.kanji), []);
});

test("한 글자는 앵커 표에 한 번만 적혀 있다", () => {
  /*
    JSON 은 겹친 키의 **뒤엣것만** 남긴다. 전에 812줄에 133자가 겹쳐 있었고, 그래서 `理` 는
    여섯 번 적힌 채(이해·이유·관리·요리·처리·정리) 「정리」가 살고 있었다. 조용히 덮이는 것만도
    문제인데, 이제 앵커가 그 글자의 `ko` 를 정하므로 **줄을 위에 끼워 넣는 것만으로 소리가 바뀐다.**
    어느 낱말이 살지는 기획이 고를 일이고, 여기서 재는 것은 **고르는 자리가 파일 순서가 아닌 것**뿐이다.
  */
  const raw = readFileSync("db/seed/kanji-ko.json", "utf8");
  const body = raw.slice(raw.indexOf('"words"'));
  const seen = new Map<string, number>();
  for (const m of body.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} ${n}번`);
  assert.deepEqual(dup, [], `한 글자가 여러 번 적혀 있다 (뒤엣것만 산다):\n  ${dup.join("\n  ")}`);
  assert.equal(seen.size, Object.keys(words).length);
});

test("ja-seed 40자는 두 표가 같은 낱말을 말한다", () => {
  /*
    `seed.ts` 는 `koWords[…] ?? seed?.ko_word` 라 **`kanji-ko.json` 이 `ja-seed.json` 을 이긴다.**
    그런데 `kanji-ko` 의 그 줄들은 겹쳐 적힌 순서로 밀려 들어온 값이었고, 그래서 적재 한 번이
    Jessi 가 이미 본 40행 중 **스물셋의 낱말을 바꾸는** 상태였다(実 실제→과실, 入 입력→수입 …).
    **이유가 적힌 쪽이 순서를 이긴다**(PM 판정): 40장은 예문·읽기·패턴까지 손으로 적힌 값이다.
    값을 맞춰 두는 것으로는 다시 어긋나는 것을 못 막아서, 어긋나면 여기서 빨개지게 한다.
  */
  const ja = (JSON.parse(readFileSync("db/seed/ja-seed.json", "utf8")) as { items: { kanji: string; ko_word: string }[] }).items;
  const off = ja.filter((it) => words[it.kanji] && words[it.kanji] !== it.ko_word)
    .map((it) => `${it.kanji}: ja-seed=${it.ko_word} kanji-ko=${words[it.kanji]}`);
  assert.deepEqual(off, [], `두 표가 다른 낱말을 말한다:\n  ${off.join("\n  ")}`);
});

test("앵커가 가리키는 글자는 모두 씨앗 안에 있다", () => {
  const seed = new Set(items.map((it) => it.kanji));
  assert.deepEqual(Object.keys(words).filter((k) => !seed.has(k)), []);
});

test("두음법칙은 낱말 첫머리에서만 편다", () => {
  assert.equal(headSound("량"), "양");
  assert.equal(headSound("래"), "내");
  assert.equal(headSound("녀"), "여");
  assert.equal(headSound("금"), "금");
  // 両 은 사전에 「량」이지만 앵커는 「양사」다 — 접지 않으면 멀쩡한 값이 틀린 것으로 잡힌다
  assert.deepEqual(anchorHits(["량"], "양사"), ["량"]);
  // 肉(육·유)은 「육류」의 「류」에 걸리면 안 된다. 둘째 음절은 접히지 않으니 류는 유가 아니다
  assert.deepEqual(anchorHits(["육", "유"], "육류"), ["육"]);
});

test("앵커가 하나를 못 집으면 첫 값에 머문다 — 값을 지어내지 않는다", () => {
  assert.equal(pickKoSound(["식", "사"], "식사"), "식"); // 둘 다 걸린다 → 첫 값
  assert.equal(pickKoSound(["삼", "참"], undefined), "삼"); // 앵커 없음 → 첫 값
  assert.equal(pickKoSound(["삼", "참"], "참고"), "참"); // 앵커가 하나를 집는다
  assert.equal(pickKoSound([], "수입"), null); // 목록이 비면 없는 것이다
});

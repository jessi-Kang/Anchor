/**
 * 앵커 낱말이 **앵커로 설 수 있는 모양인지** 잰다 (`src/lib/kanji/anchor-shape.ts` 의 두 규칙).
 *
 * 지금은 규칙 1 에 11줄, 규칙 2 에 17줄이 어긋나 있고 **그 줄들은 선언돼 있다.** 값을 고치는 것은
 * 기획 몫이라 여기서는 **새 줄이 조용히 들어오는 것**만 막는다. 어긋난 줄을 선언으로 두는 까닭은
 * `export-tables.ts` 와 같다 — **차이가 있으면 선언된 차이여야 한다. 조용한 차이는 없다.**
 * 빨간 채로 두면 빨간 것이 상수가 되고, 그러면 다음 빨간 것을 아무도 안 본다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOUND_ECHO_EXCEPTIONS, TWO_SYLLABLE_EXCEPTIONS } from "../../src/lib/kanji/anchor-shape";

const words = (JSON.parse(readFileSync("db/seed/kanji-ko.json", "utf8")) as { words: Record<string, string> }).words;
const sound = new Map(
  (JSON.parse(readFileSync("db/seed/kanji.json", "utf8")) as { items: { kanji: string; ko: string | null }[] }).items.map((i) => [i.kanji, i.ko]),
);

const echoes = (k: string) => words[k] === sound.get(k);
const notTwo = (k: string) => Array.from(words[k]).length !== 2;

test("앵커 낱말은 그 글자의 한국 한자음과 같을 수 없다 (선언된 것 빼고)", () => {
  // 같으면 F03 부제가 "역의 역" 이 되고, 그 글자가 「아는 낱말에서 시작」 묶음에 선다 — 낱말이 없는데.
  const off = Object.keys(words).filter((k) => echoes(k) && !(k in SOUND_ECHO_EXCEPTIONS));
  assert.deepEqual(off, [], `낱말이 소리와 같다: ${off.map((k) => `${k}=${words[k]}`).join(", ")}. 고치거나 SOUND_ECHO_EXCEPTIONS 에 적어라`);
});

test("앵커 낱말은 두 글자다 (선언된 것 빼고)", () => {
  // 착지는 "한국어와 일본어가 같은 두 글자 조합" 만 쓴다 (card-content.ts).
  const off = Object.keys(words).filter((k) => notTwo(k) && !(k in TWO_SYLLABLE_EXCEPTIONS));
  assert.deepEqual(off, [], `낱말이 두 글자가 아니다: ${off.map((k) => `${k}=${words[k]}`).join(", ")}. 고치거나 TWO_SYLLABLE_EXCEPTIONS 에 적어라`);
});

test("선언된 줄은 아직 어긋나 있다 — 고쳐졌으면 선언을 지운다", () => {
  const stale: string[] = [];
  const check = (list: Record<string, string>, name: string, broken: (k: string) => boolean, fixed: string) => {
    for (const [k, declared] of Object.entries(list)) {
      if (!(k in words)) stale.push(`${name} ${k}: 표에 없는 글자다`);
      else if (words[k] !== declared) stale.push(`${name} ${k}: 선언은 "${declared}" 인데 표는 "${words[k]}" 다`);
      else if (!broken(k)) stale.push(`${name} ${k}: ${fixed}`);
    }
  };
  check(SOUND_ECHO_EXCEPTIONS, "SOUND_ECHO", echoes, "이제 소리와 다르다");
  check(TWO_SYLLABLE_EXCEPTIONS, "TWO_SYLLABLE", notTwo, "이제 두 글자다");
  assert.deepEqual(stale, [], `선언이 낡았다 — 줄을 지워라:\n  ${stale.join("\n  ")}`);
});

test("규칙 1 을 어기는 줄은 규칙 2 도 어긴다 — 두 목록이 어긋나지 않는다", () => {
  // 소리는 한 글자이므로 소리와 같은 낱말도 한 글자다. 둘째 목록이 첫째를 품어야 한다.
  const missing = Object.keys(SOUND_ECHO_EXCEPTIONS).filter((k) => !(k in TWO_SYLLABLE_EXCEPTIONS));
  assert.deepEqual(missing, [], `소리와 같은데 길이 목록에 없다: ${missing.join(", ")}`);
});

/**
 * 앵커 낱말이 **앵커로 설 수 있는 모양인지** 잰다 (`db/seed/kanji-ko.json` 의 641개).
 *
 * **규칙 1 — 앵커는 그 글자의 소리와 같을 수 없다.** `judge-items.ts` 가 F03 부제를
 * `${ko_word}의 ${ko_sound}` 로 짜므로 둘이 같으면 화면에 **"역의 역"·"몽의 몽"** 이 선다.
 * 게다가 `hasWord` 가 참이 되어 그 글자가 **첫 묶음 "아는 낱말에서 시작"** 에 서는데,
 * 가진 것은 소리뿐이다. 둘째 묶음 "부를 낱말이 아직 없어"가 정확히 이 경우인데 거기 안 간다.
 * **앱이 없는 것을 있다고 말하는 자리라, 흠이 아니라 거짓말이다.**
 *
 * **규칙 2 — 앵커는 두 글자다.** 착지(`landing`)가 "한국어와 일본어가 같은 두 글자 조합"만
 * 쓰기 때문이다(`card-content.ts` 의 landing 규칙). 세 글자 앵커는 착지가 못 선다.
 *
 * **규칙 3 — 앵커는 그 글자의 한국 한자음을 「글자 그대로」 품는다.** 두음법칙(료 → **요**리)도
 * 사이시옷(수 → **숫**자)도 **바뀐 소리**라 통과시키지 않는다(기획 `dfa1ea1`·`801c97f`).
 * 까닭은 카드다: `料` 를 「요리」로 부르면(2026-09-21 까지 표가 그랬다) 발판은 "요" 인데 Scene1 은 `node.meta.ko_sound` 를
 * 그대로 찍어 **"이 료, 한자로는"** 이라 하고, 패턴 줄은 **"료 りょう"** 를 가르친다.
 * **앵커가 부른 소리와 카드가 가르치는 소리가 갈리면 발판이 발판이 아니다** — 그리고 료 → りょう 는
 * 맞지만 요 → りょう 는 틀리다. 한국 한자음에서 음독으로 가는 다리가 거기서 끊긴다(원칙 2).
 *
 * 셋을 한 규칙으로 묶지 않는다. 1번은 **화면이 이미 새는 것**이고 2번은 **착지가 못 서는 것**이라
 * 고치는 사람도 급한 정도도 다르다. 묶으면 나중에 2번을 느슨하게 할 때 1번까지 같이 풀린다.
 *
 * **`ko-sound.ts` 의 `headSound` 는 그대로 둔다.** 거기서 접는 것은 "이 앵커가 **어느 소리**를
 * 가리키나" 를 푸는 일이고, 여기서 묻는 것은 "그러니 **앵커로 서도 되나**" 다. 두 물음은 다르다.
 *
 * **어긋난 줄의 선언은 없다.** 2026-09-21 까지 세 목록에 서른둘이 선언돼 있었다 — 값을 고르는
 * 것이 기획 몫이라 그동안은 "차이가 있으면 선언된 차이여야 한다" 로 버텼다. 기획이 33종을 보고
 * 스물여섯의 값을 바꾸고 열둘을 표에서 빼면서 셋이 다 비었고, 목록이 비었으므로 목록째 지웠다.
 * **다시 어긋나는 줄이 생기면 선언이 아니라 값을 고친다** — 선언으로 돌아가려면 이 문단부터 지워라.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const words = (JSON.parse(readFileSync("db/seed/kanji-ko.json", "utf8")) as { words: Record<string, string> }).words;
const sound = new Map(
  (JSON.parse(readFileSync("db/seed/kanji.json", "utf8")) as { items: { kanji: string; ko: string | null }[] }).items.map((i) => [i.kanji, i.ko]),
);

test("앵커 낱말은 그 글자의 한국 한자음과 같을 수 없다", () => {
  // 같으면 F03 부제가 "역의 역" 이 되고, 그 글자가 「아는 낱말에서 시작」 묶음에 선다 — 낱말이 없는데.
  const off = Object.keys(words).filter((k) => words[k] === sound.get(k));
  assert.deepEqual(off, [], `낱말이 소리와 같다: ${off.map((k) => `${k}=${words[k]}`).join(", ")}. 낱말을 고쳐라 — 없으면 표에서 빼라(그 글자는 둘째 묶음으로 간다)`);
});

test("앵커 낱말은 두 글자다", () => {
  // 착지는 "한국어와 일본어가 같은 두 글자 조합" 만 쓴다 (card-content.ts).
  const off = Object.keys(words).filter((k) => Array.from(words[k]).length !== 2);
  assert.deepEqual(off, [], `낱말이 두 글자가 아니다: ${off.map((k) => `${k}=${words[k]}`).join(", ")}`);
});

test("앵커 낱말은 그 글자의 한국 한자음을 글자 그대로 품는다", () => {
  /*
    두음법칙도 사이시옷도 **바뀐 소리**다. `料` 를 「요리」로 부르면(옛 값이다) 발판은 "요" 인데
    Scene1 은 `ko_sound` 를 그대로 찍어 "이 료, 한자로는" 이라 하고 패턴 줄은 "료 りょう" 를
    가르친다. **료 → りょう 는 맞고 요 → りょう 는 틀리다** — 원칙 2 의 다리가 거기서 끊긴다.
    `ko-sound.ts` 가 접는 것은 "어느 소리인가" 이고 여기서 묻는 것은 "앵커로 서도 되나" 다.
  */
  const off = Object.keys(words).filter((k) => {
    const s = sound.get(k);
    return Boolean(s) && !Array.from(words[k]).includes(s!);
  });
  assert.deepEqual(off, [], `낱말이 소리를 바뀐 꼴로만 품는다: ${off.map((k) => `${k}=${words[k]}(소리 ${sound.get(k)})`).join(", ")}`);
});

test("앵커가 있는 글자는 소리도 있다 — 「○○의 ?」 가 되는 자리는 없다", () => {
  const off = Object.keys(words).filter((k) => !sound.get(k));
  assert.deepEqual(off, [], `앵커는 있는데 소리가 없다: ${off.join(", ")}`);
});

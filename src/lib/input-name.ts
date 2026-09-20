import type { InputRow } from "@/lib/db/inputs";
import { withParticle } from "@/lib/ko";
import { EXAMPLE_INPUT } from "@/lib/example-input";

/**
 * 자료를 화면에서 부르는 이름. **부르는 자리는 여기 하나다** (docs/FLOW.md 4장).
 *
 * 왜 한 곳인가: 같은 자료가 화면마다 "이 기사" · "오늘 아침 기사" · 12자로 자른 제목 · 14자로 자른
 * 제목 · "자료" · "이 자료" · "내 자료" 로 불렸다. 조사가 네 번 난 것과 같은 모양이라 같은 방식으로 막는다.
 *
 * 규칙:
 *  - 예시 자료의 이름은 **언어마다 다르다** — 일본어 "아침 기사", 영어 "회의 노트", 스페인어 "안내문".
 *    이름을 한 곳으로 모으려다 세 언어를 한 이름에 욱여넣어, 영어 회의 노트를 "아침 기사" 라고 불렀다.
 *    한 곳으로 모으는 것이 늘 옳은 게 아니라, **무엇이 같고 무엇이 다른지를 먼저 갈라야 한다.**
 *    이름은 `EXAMPLE_INPUT` 에서 온다 — F02 예시 행 이름과 같은 자리라 구조적으로 어긋날 수 없다.
 *  - 사용자 자료는 제목 그대로. 제목이 없거나 12자를 넘으면 **"내 자료"**.
 *
 * **자르지 않는다.** 자르면 "トヨタとNTT、協力して" 가 나오고, 띄어쓰기 없는 일본어는 단어 중간에서
 * 끊겨 더 나쁘다. 넘으면 통째로 바꾸므로 "어디서 끊을까" 를 판단할 일 자체가 없어진다.
 */

const MAX = 12;

type NamedInput = Pick<InputRow, "title" | "meta" | "lang"> | null | undefined;

/** 상단 "지금 어디" 라벨처럼 **이름만** 놓는 자리. 라벨은 이름이지 문장이 아니다. */
export function inputName(input: NamedInput): string {
  if (!input) return "내 자료";
  if (input.meta.example) return EXAMPLE_INPUT[input.lang].name;
  const t = input.title?.trim();
  return t && [...t].length <= MAX ? t : "내 자료";
}

/** 문장 안에서 출처를 대는 자리 ("아침 기사에서"). 이름과 조사가 갈라지지 않게 같이 둔다. */
export function inputFrom(input: NamedInput): string {
  return `${inputName(input)}에서`;
}

/**
 * 이름 뒤에 로/으로가 붙는 자리 ("아침 기사로", "회의록으로"). 뒤에 오는 말은 화면이 붙인다.
 *
 * 이름이 고정 문자열이던 때는 "아침 기사로" 하나로 됐지만, 이름이 변수가 되면 조사가 갈린다.
 * 소리는 넘기지 않는다 — 자료 제목은 한자·가나·한글이 다 오고 읽는 소리를 알 길이 없다.
 * 글자로 떨어지면 한글 제목은 맞고("회의록으로"), 일본어 제목은 "로" 로 간다(예전과 같다).
 */
export function inputTo(input: NamedInput): string {
  return withParticle({ text: inputName(input), sound: null }, "로으로");
}

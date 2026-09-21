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
 *  - 사용자 자료는 제목 그대로. 12자를 넘으면 **자르고 말줄임표**, 제목이 아예 없을 때만 "내 자료".
 *
 * **전에는 넘치면 통째로 "내 자료" 였다.** "자르면 단어 중간에서 끊긴다" 가 이유였고 자료 하나만
 * 볼 때는 맞는 말인데, 떨어지는 값이 **상수**라 **넘치는 자료가 전부 같은 이름**이 됐다. 붙여넣은
 * 일본어는 첫 줄이 거의 다 12자를 넘어서, 실제로는 자료 목록 아홉 줄이 전부 "내 자료" 로 떴다.
 * 홈이 넷으로 잘리고 지난 자료(F19)가 서면서 한 화면에 여러 개가 같이 보이니 더 나빠졌다.
 *
 * **못생긴 이름과 구분 안 되는 이름 중에는 못생긴 쪽이 낫다.** 끊긴 자리는 말줄임표가 말해 주지만,
 * 같은 이름 아홉 개는 어느 것이 어느 자료인지 말해 줄 방법이 없다 (PM 판정).
 */

const MAX = 12;

type NamedInput = Pick<InputRow, "title" | "meta" | "lang"> | null | undefined;

/** 상단 "지금 어디" 라벨처럼 **이름만** 놓는 자리. 라벨은 이름이지 문장이 아니다. */
export function inputName(input: NamedInput): string {
  if (!input) return "내 자료";
  if (input.meta.example) return EXAMPLE_INPUT[input.lang].name;
  const t = input.title?.trim();
  if (!t) return "내 자료";
  const chars = [...t];
  // 글자 수로 센다 — 일본어·한글은 코드 단위로 세면 자리 수와 안 맞는다.
  return chars.length <= MAX ? t : `${chars.slice(0, MAX).join("")}…`;
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

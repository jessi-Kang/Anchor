import type { Lang3 } from "@/lib/db/settings";

/**
 * 첫 방문 예시 자료 (docs/FLOW.md 4장). 빈 손이어도 첫 카드가 생기게, 자료 넣기에서 탭 한 번으로 넣는다.
 * 일본어 문구는 design/screens/F02.html 그대로.
 *
 * 예시 자료가 갖춰야 하는 것 둘 (design/SCREENS.md):
 *  1. 앵커가 본문 안에 있을 것 — 탭하면 곧바로 첫 카드가 된다. 발판 없는 문장이면 F03 이 "발판 없음"만 내놓는다.
 *  2. 다른 입구의 예시와 같은 덩어리를 쓰지 않을 것 — F13 의 "못 한 말" 예시와 겹치면 같은 화면을 두 번 보는 것처럼 느껴진다.
 *
 * `name` 은 **이 자료를 부르는 이름**이고, F02 예시 행 이름과 뒷 화면들의 자료 이름이 둘 다 여기서
 * 나온다 (`exampleLabel`, `lib/input-name.ts`). 두 곳에 같은 문자열을 적어 두면 한쪽만 고쳐진다 —
 * 실제로 F02 가 "日経 기사" 라고 부른 것을 다음 화면이 "아침 기사" 라고 불렀다.
 */
export const EXAMPLE_INPUT: Record<Lang3, { name: string; title: string; body: string }> = {
  ja: {
    // 발행처("日経")를 떼도 "진짜 일본 기사"라는 신호는 안 죽는다 — 그건 이름이 아니라 본문이 나른다.
    name: "아침 기사",
    title: "トヨタとNTT、協力して次世代の車を開発",
    body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。新しい基盤は安全な運転を支える。",
  },
  en: {
    // 본문에 앵커(spect 어근)가 retrospective·inspect 둘 들어간다 — 예시를 탭하면 바로 첫 카드가
    // 되는데, 어근 없는 문장이면 F03 이 "발판 없음"만 내놓는다 (design/SCREENS.md 예시 자료 조건).
    // "회의에서 나온"은 말인지 글인지 모호하다. F02 에 붙여넣는 건 글이고, F13 의 "회의에서 못 한 말"과도 갈린다.
    name: "회의 노트",
    title: "Let's review the deployment schedule",
    body: "Let's review the deployment schedule before the retrospective. I want to inspect the numbers first.",
  },
  es: {
    name: "안내문",
    title: "La inspección es la próxima semana",
    body: "La inspección es la próxima semana. Necesitamos preparar la presentación antes.",
  },
};

/** F02 예시 행에 보이는 이름. 자료 이름(`lib/input-name.ts`)과 같은 `name` 에서 나온다. */
export function exampleLabel(lang: Lang3): string {
  return `${EXAMPLE_INPUT[lang].name} 한 문장`;
}

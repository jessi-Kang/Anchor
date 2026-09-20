import type { Lang3 } from "@/lib/db/settings";

/**
 * 첫 방문 예시 자료 (docs/FLOW.md 4장). 빈 손이어도 첫 카드가 생기게, 자료 넣기에서 탭 한 번으로 넣는다.
 * 일본어 문구는 design/screens/F02.html 그대로.
 *
 * 예시 자료가 갖춰야 하는 것 둘 (design/SCREENS.md):
 *  1. 앵커가 본문 안에 있을 것 — 탭하면 곧바로 첫 카드가 된다. 발판 없는 문장이면 F03 이 "발판 없음"만 내놓는다.
 *  2. 다른 입구의 예시와 같은 덩어리를 쓰지 않을 것 — F13 의 "못 한 말" 예시와 겹치면 같은 화면을 두 번 보는 것처럼 느껴진다.
 */
export const EXAMPLE_INPUT: Record<Lang3, { label: string; title: string; body: string }> = {
  ja: {
    // label 은 F02 의 예시 행에 보이는 이름이다. 일본어는 design/screens/F02.html 그대로.
    label: "日経 기사 한 문장",
    title: "トヨタとNTT、協力して次世代の車を開発",
    body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。新しい基盤は安全な運転を支える。",
  },
  en: {
    // 본문에 앵커(spect 어근)가 retrospective·inspect 둘 들어간다 — 예시를 탭하면 바로 첫 카드가
    // 되는데, 어근 없는 문장이면 F03 이 "발판 없음"만 내놓는다 (design/SCREENS.md 예시 자료 조건).
    // "회의에서 나온"은 말인지 글인지 모호하다. F02 에 붙여넣는 건 글이고, F13 의 "회의에서 못 한 말"과도 갈린다.
    label: "회의 노트 한 문장",
    title: "Let's review the deployment schedule",
    body: "Let's review the deployment schedule before the retrospective. I want to inspect the numbers first.",
  },
  es: {
    label: "안내문 한 문장",
    title: "La inspección es la próxima semana",
    body: "La inspección es la próxima semana. Necesitamos preparar la presentación antes.",
  },
};

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
    /*
      셋째 문장이 **둘째 묶음을 채우려고** 있다. FLOW 96 이 "예시 자료는 F03 의 두 묶음이 다 차게
      고른다" 고 요구하는데, 옛 문장(`新しい基盤は安全な運転を支える。`)은 스물한 자가 **전부**
      앵커 낱말이 있어서 **첫 방문에 둘째 묶음이 빈다** — 규칙이 있는데 화면에 한 번도 안 나타난다.

      채우는 것은 `条`·`件` 이다(둘 다 `ko_word` 가 없다). `妥` 는 낱말이 있어서 **첫 묶음**이다 —
      여기서 헷갈리면 바꿔도 둘째 묶음이 그대로 빈다 (PM 이 표로 다시 세서 확인).

      **씨앗 카드가 먼저 들어와야 했다.** 새로 들어오는 `条`·`件`·`必`·`要` 에 손으로 적은 카드가
      없으면 키 없는 환경에서 그 넷이 전부 F04a("이 카드는 지금 못 만들었어")로 간다 —
      **빈 묶음에서 막힌 묶음으로 옮기는 건 고친 게 아니다.** 넷은 `4c4239e` 로 들어왔다.
    */
    body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。条件をめぐって妥協が必要だったという。",
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

import type { Lang3 } from "@/lib/db/settings";

/**
 * 첫 방문 예시 자료 (docs/FLOW.md 4장). 빈 손이어도 첫 카드가 생기게, 자료 넣기에서 탭 한 번으로 넣는다.
 * 일본어 문구는 design/screens/F02.html 그대로.
 *
 * 예시 자료가 갖춰야 하는 것 둘 (design/SCREENS.md):
 *  1. **부를 낱말이 있는 글자가 있을 것.** 그래야 탭하자마자 첫 카드가 된다.
 *  2. 다른 입구의 예시와 같은 덩어리를 쓰지 않을 것 — F13 의 "못 한 말" 예시와 겹치면 같은 화면을 두 번 보는 것처럼 느껴진다.
 *
 * **둘째 묶음(「부를 낱말이 아직 없어」)이 첫 방문에 서는 것은 조건이 아니다.** 한때 여기 그렇게
 * 적혀 있었는데 `5e0e8f6` 이 그 규칙을 지웠다 — 그 묶음은 학습의 갈래가 아니라 **우리 표가 아직
 * 못 따라온 자리**라, 표를 채우면 사라진다. 예시로 그걸 보증하려면 표를 일부러 비워 둬야 하고
 * 그건 사용자에게 거짓 상태를 보이는 것이다. 지금 `docs/FLOW.md` 4장의 그 자리는 정반대로
 * **"예시 자료로 F03 의 둘째 묶음을 보증하지 않는다"** 라고 적혀 있다.
 *
 * 그러니 **이 예시에서 둘째 묶음이 비는 날이 와도 고치지 마라.** 그건 표가 채워졌다는 뜻이다.
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
      셋째 문장은 **처음에 둘째 묶음을 채우려고** 넣었는데, **그 이유는 이제 없다** — 그 규칙이
      지워졌다(위 주석). 그래도 문장은 그대로 둔다. **남은 이유가 따로 있기 때문이다**: `妥` 가
      여기 있어야 F12·F12a·F12b 세 장이 첫 방문에서 서고, 그건 지금도 유효하다 (기획 판정).

      **`条`·`件` 은 곧 첫 묶음으로 옮겨간다.** 지금은 둘 다 `ko_word` 가 없어 둘째 묶음에 서지만,
      기획이 둘 다 앵커를 "조건" 으로 넣기로 정했다(`21793d5`). 들어오면 이 자료의 둘째 묶음은
      빈다 — **그게 정상이고, 그때 이 문장을 바꿀 일이 아니다.**

      `妥` 는 낱말이 있어서 처음부터 **첫 묶음**이다. 여기서 헷갈린 적이 있어 적어 둔다.

      **씨앗 카드가 먼저 들어와야 했다.** 새로 들어오는 `条`·`件`·`必`·`要` 에 손으로 적은 카드가
      없으면 키 없는 환경에서 그 넷이 전부 F04a("이 카드는 지금 못 만들었어")로 간다 —
      **빈 묶음에서 막힌 묶음으로 옮기는 건 고친 게 아니다.** 넷은 `4c4239e` 로 들어왔다.
    */
    body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。条件をめぐって妥協が必要だったという。",
  },
  en: {
    // 본문에 앵커(spect 어근)가 retrospective·inspect 둘 들어간다 — 예시를 탭하면 바로 첫 카드가
    // 되는데, 어근 없는 문장이면 F03 이 「부를 낱말이 아직 없어」만 내놓는다 (design/SCREENS.md 예시 자료 조건).
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

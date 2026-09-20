import type { Lang3 } from "@/lib/db/settings";

/**
 * 첫 방문 예시 자료 (docs/FLOW.md 4장). 빈 손이어도 첫 카드가 생기게, 자료 넣기에서 탭 한 번으로 넣는다.
 * 일본어 문구는 design/screens/F02.html 그대로. 영어·스페인어는 못 한 말 루프(F13)가 붙기 전까지 짧은 문장 하나.
 */
export const EXAMPLE_INPUT: Record<Lang3, { label: string; title: string; body: string }> = {
  ja: {
    // label 은 F02 의 예시 행에 보이는 이름이다. 일본어는 design/screens/F02.html 그대로.
    label: "日経 기사 한 문장",
    title: "トヨタとNTT、協力して次世代の車を開発",
    body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。新しい基盤は安全な運転を支える。",
  },
  en: {
    label: "회의에서 나온 한 문장",
    title: "Can we push this to next week?",
    body: "Can we push this to next week? I want to double-check the numbers before we present them.",
  },
  es: {
    label: "안내문 한 문장",
    title: "La inspección es la próxima semana",
    body: "La inspección es la próxima semana. Necesitamos preparar la presentación antes.",
  },
};

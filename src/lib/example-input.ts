import type { Lang3 } from "@/lib/db/settings";

/**
 * 첫 방문 예시 자료 (docs/FLOW.md 4장). 빈 손이어도 첫 카드가 생기게, 자료 넣기에서 탭 한 번으로 넣는다.
 * 일본어 문구는 design/screens/F02.html 그대로. 영어·스페인어는 못 한 말 루프(F13)가 붙기 전까지 짧은 문장 하나.
 */
export const EXAMPLE_INPUT: Record<Lang3, { title: string; body: string }> = {
  ja: {
    title: "トヨタとNTT、協力して次世代の車を開発",
    body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。新しい基盤は安全な運転を支える。",
  },
  en: {
    title: "Can we push this to next week?",
    body: "Can we push this to next week? I want to double-check the numbers before we present them.",
  },
  es: {
    title: "La inspección es la próxima semana",
    body: "La inspección es la próxima semana. Necesitamos preparar la presentación antes.",
  },
};

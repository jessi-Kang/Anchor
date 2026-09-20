import type { Lang3 } from "@/lib/db/onboarding";

/** O02 상황 선택지. 수준이 아니라 "어디서 쓰나". 대화는 기본이라 묻지 않는다. 문구는 O02.html 그대로. */
export const PURPOSE_OPTIONS: Record<Lang3, string[]> = {
  en: ["회의", "학위 수업", "이메일", "여행"],
  ja: ["기사·뉴스", "드라마", "여행", "업무"],
  es: ["릴스·노래", "여행", "드라마", "업무"],
};

/**
 * O03 가나 6개. 히라가나 4 + 가타카나 2, 행이 겹치지 않게.
 * `say` 는 마이크 인식 결과와 맞춰 볼 히라가나(가타카나는 히라가나로 정규화해서 비교).
 */
export const KANA_SET = [
  { glyph: "あ", say: "あ" },
  { glyph: "き", say: "き" },
  { glyph: "そ", say: "そ" },
  { glyph: "ヌ", say: "ぬ" },
  { glyph: "ホ", say: "ほ" },
  { glyph: "ん", say: "ん" },
];

/** 가나 통과 기준: 6개 중 4개 이상 인식 */
export const KANA_PASS = 4;

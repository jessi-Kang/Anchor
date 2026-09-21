import type { Lang3, UserSettings } from "@/lib/db/settings";

/**
 * 언어는 세트가 아니라 하나씩 켠다 (CLAUDE.md, docs/FLOW.md 1·3장).
 *
 * - O02a `/onboarding/languages` 에서 시작할 언어를 고른다 (여러 개 가능, 최소 1).
 * - 언어를 켜면 준비 단계 없이 바로 그 언어의 자료 넣기(`/inputs/new?lang=`)로 간다.
 *   가나 확인(O03)은 일본어 첫 카드 직전에 한 번만 (src/lib/kana.ts).
 * - 언어 순서는 사용자가 고른 순서 (enabled_at).
 *
 * 리다이렉트는 두 곳뿐이다: 홈은 켠 언어가 0개일 때만 O02a 로, O02a 는 절대 리다이렉트하지 않는다.
 */

export const LANGS: Lang3[] = ["en", "ja", "es"];
export const LANG_LABEL: Record<Lang3, string> = { en: "영어", ja: "일본어", es: "스페인어" };
/** O02a 행의 부제: 그 언어가 어디서 출발하는지 (아는 것 위에만 쌓는다) */
export const LANG_START: Record<Lang3, string> = { en: "업무 어휘에서 시작", ja: "한국어 한자음에서 시작", es: "영어 어근에서 시작" };

export function isLang(v: unknown): v is Lang3 {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

/** 켠 언어, 고른 순서대로 */
export function enabledLanguages(s: UserSettings): Lang3[] {
  const langs = s.languages ?? {};
  return LANGS.filter((l) => Boolean(langs[l])).sort((a, b) => (langs[a]?.enabled_at ?? "").localeCompare(langs[b]?.enabled_at ?? ""));
}

/** 홈이 리다이렉트해야 하는 유일한 경우: 켠 언어가 하나도 없다. */
export function homeRedirect(s: UserSettings): string | null {
  return enabledLanguages(s).length === 0 ? "/onboarding/languages" : null;
}

/** 언어는 라우트가 아니라 데이터 속성이라 쿼리로 넘긴다. 자료 넣기가 언어의 첫 화면. */
export function inputPath(lang: Lang3): string {
  return `/inputs/new?lang=${lang}`;
}

/**
 * 홈의 "못 한 말" 행이 가는 곳. **덩어리가 있으면 목록(F18), 없으면 쓰기(F13)** 다.
 *
 * 늘 F13 으로 보내면 덩어리가 셋이어도 빈 입력 칸에 떨어지고 **지난 덩어리로 돌아갈 길이 어디에도
 * 없다** — 같은 말의 2회차가 안 생겨 곡선 표본이 1회차짜리만 쌓인다 (`docs/SPEC.md` 9장).
 * 화면 안에 두면 이 한 줄이 시험에 안 걸려서, `inputPath` 와 같은 자리로 꺼내 둔다.
 */
export function talkPath(chunkCount: number): string {
  return chunkCount > 0 ? "/talk/past" : "/talk";
}

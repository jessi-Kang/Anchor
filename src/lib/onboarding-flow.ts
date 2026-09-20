import type { Lang3, UserSettings } from "@/lib/db/onboarding";

/**
 * 언어는 세트가 아니라 하나씩 켠다.
 *
 * - 언어가 "켜졌다" = O02 에서 그 언어의 상황을 하나 이상 골랐다.
 * - 온보딩 단계는 켠 언어에 필요한 것만 돈다:
 *     ja      → 가나 6개 읽기 (O03, 문지방) → 한자 씨앗 40장 (O05, 그래프의 첫 아는 한자)
 *     en, es  → 영어 씨앗 40장 (O04), 끝내거나 "여기까지"로 넘긴 적이 없을 때만
 *               (스페인어는 영어 어근 위에 서므로 같은 씨앗을 쓰고, 뒤집으면 스페인어 대응을 함께 보인다)
 * - 나중에 설정에서 언어를 추가하면 같은 규칙으로 빠진 단계만 이어서 한다.
 *   그래서 모든 온보딩 페이지는 "내가 필요한가?"를 먼저 묻고, 아니면 다음 단계로 넘긴다.
 */

export const LANGS: Lang3[] = ["en", "ja", "es"];

export const LANG_LABEL: Record<Lang3, string> = { en: "영어", ja: "일본어", es: "스페인어" };

export function activeLanguages(settings: UserSettings): Lang3[] {
  const p = settings.purposes;
  if (!p) return [];
  return LANGS.filter((l) => (p[l]?.length ?? 0) > 0);
}

export type StepId = "purpose" | "kana" | "kanji" | "seed";

const ORDER: StepId[] = ["purpose", "kana", "kanji", "seed"];

export const STEP_PATH: Record<StepId, string> = {
  purpose: "/onboarding/purpose",
  kana: "/onboarding/kana",
  kanji: "/onboarding/kanji",
  seed: "/onboarding/seed",
};

/** 현재 설정에서 아직 남은 단계들 (순서대로). */
export function pendingSteps(settings: UserSettings): StepId[] {
  const langs = activeLanguages(settings);
  const steps: StepId[] = [];
  if (langs.length === 0) steps.push("purpose");
  if (langs.includes("ja") && !settings.kana) steps.push("kana");
  if (langs.includes("ja") && !settings.kanji) steps.push("kanji");
  if ((langs.includes("en") || langs.includes("es")) && !settings.seed) steps.push("seed");
  return steps;
}

/** 이 언어 조합에서 도는 단계 전부 (완료 여부 무관, 순서대로) */
export function stepsFor(langs: Lang3[]): StepId[] {
  const steps: StepId[] = ["purpose"];
  if (langs.includes("ja")) steps.push("kana", "kanji");
  if (langs.includes("en") || langs.includes("es")) steps.push("seed");
  return steps;
}

/** 이 언어 조합에서 온보딩이 전부 몇 단계인지 (상단 "n / N" 표시용) */
export function totalSteps(langs: Lang3[]): number {
  return stepsFor(langs).length;
}

/** 단계 번호 (1부터) */
export function stepIndex(step: StepId, langs: Lang3[]): number {
  return Math.max(1, stepsFor(langs).indexOf(step) + 1);
}

/** `after` 단계를 마친 뒤 갈 곳. 남은 게 없으면 /today. */
export function nextPath(settings: UserSettings, after: StepId): string {
  const pending = pendingSteps(settings).filter((s) => ORDER.indexOf(s) > ORDER.indexOf(after));
  return pending.length ? STEP_PATH[pending[0]] : "/today";
}

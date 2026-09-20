import type { Lang3, UserSettings } from "@/lib/db/onboarding";

/**
 * 언어는 세트가 아니라 하나씩 켠다.
 *
 * - 언어가 "켜졌다" = O02 에서 그 언어의 상황을 하나 이상 골랐다.
 * - 온보딩 단계는 켠 언어에 필요한 것만 돈다:
 *     ja      → 가나 6개 읽기 (O03), 아직 안 했을 때만
 *     en, es  → 영어 씨앗 40장 (O04), 끝내거나 "여기까지"로 넘긴 적이 없을 때만
 *               (스페인어는 영어 어근 위에 서므로 같은 씨앗을 쓴다)
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

export type StepId = "purpose" | "kana" | "seed";

export const STEP_PATH: Record<StepId, string> = {
  purpose: "/onboarding/purpose",
  kana: "/onboarding/kana",
  seed: "/onboarding/seed",
};

/** 현재 설정에서 아직 남은 단계들 (순서대로). */
export function pendingSteps(settings: UserSettings): StepId[] {
  const langs = activeLanguages(settings);
  const steps: StepId[] = [];
  if (langs.length === 0) steps.push("purpose");
  if (langs.includes("ja") && !settings.kana) steps.push("kana");
  if ((langs.includes("en") || langs.includes("es")) && !settings.seed) steps.push("seed");
  return steps;
}

/** 이 언어 조합에서 온보딩이 전부 몇 단계인지 (상단 "n / N" 표시용). purpose 는 항상 1단계. */
export function totalSteps(langs: Lang3[]): number {
  let n = 1;
  if (langs.includes("ja")) n++;
  if (langs.includes("en") || langs.includes("es")) n++;
  return n;
}

/** 단계 번호 (1부터). purpose=1, kana=2, seed=마지막. */
export function stepIndex(step: StepId, langs: Lang3[]): number {
  if (step === "purpose") return 1;
  if (step === "kana") return 2;
  return totalSteps(langs);
}

/** `after` 단계를 마친 뒤 갈 곳. 남은 게 없으면 /today. */
export function nextPath(settings: UserSettings, after: StepId): string {
  const order: StepId[] = ["purpose", "kana", "seed"];
  const pending = pendingSteps(settings).filter((s) => order.indexOf(s) > order.indexOf(after));
  return pending.length ? STEP_PATH[pending[0]] : "/today";
}

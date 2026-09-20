import type { Lang3, StepKey, StepState, UserSettings } from "@/lib/db/onboarding";

/**
 * 언어는 세트가 아니라 하나씩 켠다.
 *
 * 1. O02a `/onboarding/languages` 에서 시작할 언어를 고른다 (여러 개 가능, 최소 1).
 * 2. 고른 언어를 한 언어씩 준비한다: 그 언어의 상황(O02b) → 그 언어의 단계 → 다음 언어.
 *      ja      → 가나 6개 읽기 (O03, 문지방) → 한자 씨앗 40장 (O05, 그래프의 첫 아는 한자)
 *      en, es  → 영어 씨앗 40장 (O04). 스페인어는 영어 어근 위에 서므로 같은 씨앗을 쓴다.
 *               영어도 켜져 있으면 스페인어에는 seed 단계가 없다.
 * 3. 가나·한자·씨앗은 "나중에 할게"로 건너뛸 수 있다 (skipped). 홈 진입 조건은 "언어 1개 이상 켬"뿐이고,
 *    홈과 설정이 남은 단계를 행으로 보여 주며 탭하면 이어서 한다. 나중에 언어를 추가해도 같은 규칙.
 *
 * 리다이렉트 루프 방지 3원칙:
 *  - `/today` 는 켠 언어가 0개일 때만 리다이렉트한다 (→ /onboarding/languages).
 *  - `/onboarding/languages` 는 절대 리다이렉트하지 않는다.
 *  - 단계 페이지 가드는 그 단계가 'done' 일 때만 nextPath 로 보낸다 (nextPath 는 자기 자신을 돌려주지 않음). skipped 는 통과.
 */

export const LANGS: Lang3[] = ["en", "ja", "es"];
export const LANG_LABEL: Record<Lang3, string> = { en: "영어", ja: "일본어", es: "스페인어" };
/** O02a 행의 부제: 그 언어가 어디서 출발하는지 (아는 것 위에만 쌓는다) */
export const LANG_START: Record<Lang3, string> = { en: "업무 어휘에서 시작", ja: "한국어 한자음에서 시작", es: "영어 어근에서 시작" };

export type StepId = "purpose" | StepKey;

export const STEPS_BY_LANG: Record<Lang3, StepId[]> = {
  en: ["purpose", "seed"],
  ja: ["purpose", "kana", "kanji"],
  es: ["purpose", "seed"],
};

export const STEP_LABEL: Record<StepId, string> = {
  purpose: "상황 고르기",
  kana: "가나 읽기",
  kanji: "한자 씨앗",
  seed: "영어 씨앗",
};

export const SKIPPABLE: StepKey[] = ["kana", "kanji", "seed"];

export function isLang(v: unknown): v is Lang3 {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

export function isSkippable(v: unknown): v is StepKey {
  return typeof v === "string" && (SKIPPABLE as string[]).includes(v);
}

export function enabledLanguages(s: UserSettings): Lang3[] {
  return LANGS.filter((l) => Boolean(s.languages?.[l]));
}

export function purposesOf(s: UserSettings, lang: Lang3): string[] {
  return s.languages?.[lang]?.purposes ?? [];
}

/** 이 언어에 필요한 단계 (완료 여부 무관). es 인데 en 도 켜져 있으면 seed 는 en 쪽 것이라 뺀다. */
export function stepsFor(s: UserSettings, lang: Lang3): StepId[] {
  const steps = STEPS_BY_LANG[lang];
  if (lang === "es" && s.languages?.en) return steps.filter((x) => x !== "seed");
  return steps;
}

/** 단계 상태. purpose 는 상황 유무로, 나머지는 steps 로. 없으면 null(아직 안 함). */
export function stepState(s: UserSettings, lang: Lang3, step: StepId): StepState | null {
  if (step === "purpose") return purposesOf(s, lang).length > 0 ? "done" : null;
  return s.steps?.[step] ?? null;
}

/** 아직 상태가 없는 단계 (자동 진행용: skipped 는 다시 밀어넣지 않는다) */
export function remainingSteps(s: UserSettings, lang: Lang3): StepId[] {
  return stepsFor(s, lang).filter((st) => stepState(s, lang, st) === null);
}

/** done 이 아닌 단계 (홈·설정 리마인더용: skipped 포함) */
export function unfinishedSteps(s: UserSettings, lang: Lang3): StepId[] {
  return stepsFor(s, lang).filter((st) => stepState(s, lang, st) !== "done");
}

/** 켰지만 상황을 아직 안 고른 언어 (O02a 직후 한 언어씩 준비할 순서) */
export function setupQueue(s: UserSettings): Lang3[] {
  return enabledLanguages(s).filter((l) => purposesOf(s, l).length === 0);
}

/** 언어는 라우트가 아니라 데이터 속성이라 쿼리로 넘긴다. */
export function stepPath(step: StepId, lang: Lang3): string {
  return `/onboarding/${step}?lang=${lang}`;
}

/** 상단 "지금 어디": "일본어 2 / 3" */
export function stepHeader(s: UserSettings, lang: Lang3, step: StepId): string {
  const steps = stepsFor(s, lang);
  return `${LANG_LABEL[lang]} ${Math.max(1, steps.indexOf(step) + 1)} / ${steps.length}`;
}

/**
 * `after` 단계를 마친(또는 넘긴) 뒤 갈 곳.
 *  ① 이 언어에서 상태가 없는 다음 단계 → ② 아직 상황을 안 고른 다음 언어의 purpose → ③ /today
 */
export function nextPath(s: UserSettings, lang: Lang3, after: StepId): string {
  const order = stepsFor(s, lang);
  const rest = remainingSteps(s, lang).filter((st) => order.indexOf(st) > order.indexOf(after));
  if (rest.length) return stepPath(rest[0], lang);
  const queue = setupQueue(s).filter((l) => l !== lang);
  if (queue.length) return stepPath("purpose", queue[0]);
  return "/today";
}

/** 홈이 리다이렉트해야 하는 유일한 경우: 켠 언어가 하나도 없다. */
export function homeRedirect(s: UserSettings): string | null {
  return enabledLanguages(s).length === 0 ? "/onboarding/languages" : null;
}

/** 홈·설정의 행에서 이어서 할 첫 단계 */
export function resumePath(s: UserSettings, lang: Lang3): string | null {
  const st = unfinishedSteps(s, lang)[0];
  return st ? stepPath(st, lang) : null;
}

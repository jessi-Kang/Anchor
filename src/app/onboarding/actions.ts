"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getOnboardingState, setStepState } from "@/lib/db/onboarding";
import { isLang, isSkippable, nextPath, stepsFor } from "@/lib/onboarding-flow";

/**
 * "나중에 할게" — 이 언어의 이 단계를 건너뛴다. 상태는 skipped 로 남아 홈·설정에서 이어서 할 수 있다.
 * ("여기까지" 는 done: 다시 묻지 않는다.)
 */
export async function skipStep(step: string, lang: string) {
  if (!isLang(lang) || !isSkippable(step)) throw new Error("bad step");
  const user = await requireUser();
  const before = await getOnboardingState(user.id);
  if (!stepsFor(before.settings, lang).includes(step)) throw new Error("step not in this language");
  await setStepState(user.id, step, "skipped");
  const state = await getOnboardingState(user.id);
  redirect(nextPath(state.settings, lang, step));
}

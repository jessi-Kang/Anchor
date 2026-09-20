"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { finishOnboarding, getOnboardingState, markStepFinished, recordSeedJudgement } from "@/lib/db/onboarding";
import { nextPath } from "@/lib/onboarding-flow";

export async function judgeSeed(nodeId: string, recalled: boolean) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(nodeId)) throw new Error("bad node id");
  await recordSeedJudgement(user.id, nodeId, recalled);
}

/** 40장을 다 봤거나 "여기까지"를 눌렀을 때. 이 단계는 끝난 것으로 표시하고 남은 단계로 (없으면 홈). */
export async function finishSeed() {
  const user = await requireUser();
  await markStepFinished(user.id, "seed");
  const state = await getOnboardingState(user.id);
  const next = nextPath(state.settings, "seed");
  if (next === "/today") await finishOnboarding(user.id);
  redirect(next);
}

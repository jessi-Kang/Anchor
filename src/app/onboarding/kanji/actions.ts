"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { finishOnboarding, getOnboardingState, markStepFinished, recordSeedJudgement } from "@/lib/db/onboarding";
import { nextPath } from "@/lib/onboarding-flow";

export async function judgeKanji(nodeId: string, recalled: boolean) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(nodeId)) throw new Error("bad node id");
  await recordSeedJudgement(user.id, nodeId, recalled);
}

export async function finishKanji() {
  const user = await requireUser();
  await markStepFinished(user.id, "kanji");
  const state = await getOnboardingState(user.id);
  const next = nextPath(state.settings, "kanji");
  if (next === "/today") await finishOnboarding(user.id);
  redirect(next);
}

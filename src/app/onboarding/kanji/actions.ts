"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getOnboardingState, recordSeedJudgement, setStepState } from "@/lib/db/onboarding";
import { nextPath } from "@/lib/onboarding-flow";

export async function judgeKanji(nodeId: string, recalled: boolean) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(nodeId)) throw new Error("bad node id");
  await recordSeedJudgement(user.id, nodeId, recalled);
}

/** 40장을 다 봤거나 "여기까지"를 눌렀을 때. done 으로 두고(다시 묻지 않음) 다음으로. */
export async function finishKanji() {
  const user = await requireUser();
  await setStepState(user.id, "kanji", "done");
  const state = await getOnboardingState(user.id);
  redirect(nextPath(state.settings, "ja", "kanji"));
}

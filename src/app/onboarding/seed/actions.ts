"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { finishOnboarding, markSeedFinished, recordSeedJudgement } from "@/lib/db/onboarding";

export async function judgeSeed(nodeId: string, recalled: boolean) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(nodeId)) throw new Error("bad node id");
  await recordSeedJudgement(user.id, nodeId, recalled);
}

/** 40장을 다 봤거나 "여기까지"를 눌렀을 때. 씨앗 단계는 끝난 것으로 표시하고 온보딩을 마친다. */
export async function finishSeed() {
  const user = await requireUser();
  await markSeedFinished(user.id);
  await finishOnboarding(user.id);
  redirect("/today");
}

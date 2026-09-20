"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { finishOnboarding, recordSeedJudgement } from "@/lib/db/onboarding";

export async function judgeSeed(nodeId: string, recalled: boolean) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(nodeId)) throw new Error("bad node id");
  await recordSeedJudgement(user.id, nodeId, recalled);
}

export async function finishSeed() {
  const user = await requireUser();
  await finishOnboarding(user.id);
  redirect("/today");
}

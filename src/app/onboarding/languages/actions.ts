"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { enableLanguages, getOnboardingState, type Lang3 } from "@/lib/db/onboarding";
import { isLang, setupQueue, stepPath } from "@/lib/onboarding-flow";

/** O02a "다음". 고른 언어를 켜고, 상황을 아직 안 고른 첫 언어의 O02b 로. */
export async function submitLanguages(raw: string[]) {
  const user = await requireUser();
  const picked = Array.from(new Set(raw.filter(isLang))) as Lang3[];
  if (picked.length === 0) throw new Error("언어를 하나는 골라야 한다");
  await enableLanguages(user.id, picked);
  const state = await getOnboardingState(user.id);
  const queue = setupQueue(state.settings);
  redirect(queue.length ? stepPath("purpose", queue[0]) : "/today");
}

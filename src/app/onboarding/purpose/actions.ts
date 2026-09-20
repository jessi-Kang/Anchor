"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getOnboardingState, saveLanguagePurposes } from "@/lib/db/onboarding";
import { PURPOSE_OPTIONS } from "@/lib/onboarding-options";
import { isLang, nextPath } from "@/lib/onboarding-flow";

/** O02b "다음 / 저장". 한 언어의 상황만 저장하고, 그 언어의 다음 단계(없으면 다음 언어, 없으면 홈)로. */
export async function submitPurposes(lang: string, raw: string[]) {
  if (!isLang(lang)) throw new Error("bad lang");
  const user = await requireUser();
  // 선택지 밖의 값은 버린다 (자유 입력 없음)
  const clean = Array.from(new Set(raw.filter((v) => PURPOSE_OPTIONS[lang].includes(v))));
  if (clean.length === 0) throw new Error("상황을 하나는 골라야 한다");
  await saveLanguagePurposes(user.id, lang, clean);
  const state = await getOnboardingState(user.id);
  redirect(nextPath(state.settings, lang, "purpose"));
}

"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { finishOnboarding, getOnboardingState, savePurposes, type Purposes } from "@/lib/db/onboarding";
import { PURPOSE_OPTIONS } from "@/lib/onboarding-options";
import { activeLanguages, nextPath } from "@/lib/onboarding-flow";

export async function submitPurposes(raw: Purposes) {
  const user = await requireUser();
  // 선택지 밖의 값은 버린다 (자유 입력 없음)
  const clean: Purposes = { en: [], ja: [], es: [] };
  for (const lang of Object.keys(clean) as Array<keyof Purposes>) {
    clean[lang] = (raw[lang] ?? []).filter((v) => PURPOSE_OPTIONS[lang].includes(v));
  }
  if (activeLanguages({ purposes: clean }).length === 0) {
    throw new Error("언어를 하나는 켜야 한다");
  }
  await savePurposes(user.id, clean);

  // 켠 언어에 필요한 단계만 이어서. 남은 게 없으면(예: 스페인어만 추가) 바로 홈.
  const state = await getOnboardingState(user.id);
  const next = nextPath(state.settings, "purpose");
  if (next === "/today") await finishOnboarding(user.id);
  redirect(next);
}

"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { savePurposes, type Purposes } from "@/lib/db/onboarding";
import { PURPOSE_OPTIONS } from "@/lib/onboarding-options";

export async function submitPurposes(raw: Purposes) {
  const user = await requireUser();
  // 선택지 밖의 값은 버린다 (자유 입력 없음)
  const clean: Purposes = { en: [], ja: [], es: [] };
  for (const lang of Object.keys(clean) as Array<keyof Purposes>) {
    clean[lang] = (raw[lang] ?? []).filter((v) => PURPOSE_OPTIONS[lang].includes(v));
  }
  await savePurposes(user.id, clean);
  redirect("/onboarding/kana");
}

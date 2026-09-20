"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { saveKanaResult } from "@/lib/db/onboarding";
import { KANA_PASS } from "@/lib/onboarding-options";

export async function submitKana(input: { recognized: number; total: number; supported: boolean; kanaModule: boolean }) {
  const user = await requireUser();
  const recognized = Math.max(0, Math.min(input.total, Math.floor(input.recognized)));
  // 인식이 불가능한 브라우저면 본인이 "다 읽었어"를 누른 것을 통과로 본다.
  const passed = !input.kanaModule && (input.supported ? recognized >= KANA_PASS : true);
  await saveKanaResult(
    user.id,
    { recognized, total: input.total, passed, supported: input.supported, checked_at: new Date().toISOString() },
    // 못 읽겠다고 했거나, 인식이 됐는데 기준 미달이면 가나 모듈(v2) 대상
    !passed,
  );
  redirect("/onboarding/seed");
}

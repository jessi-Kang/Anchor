"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { saveKanaResult } from "@/lib/db/settings";
import { KANA_PASS } from "@/lib/kana";

/**
 * O03 결과 저장. 자기 보고로 통과시키지 않는다:
 *  - 인식 기준 이상 → passed
 *  - 미지원·거부·기준 미달 → recheck ("다음에 다시 확인", 카드는 연다)
 *  - "못 읽겠어" → locked (가나 모듈 v2 예고, 한자 카드 잠금)
 */
export async function submitKana(input: { recognized: number; total: number; supported: boolean; kanaModule: boolean }) {
  const user = await requireUser();
  const recognized = Math.max(0, Math.min(input.total, Math.floor(input.recognized)));
  const status = input.kanaModule ? "locked" : input.supported && recognized >= KANA_PASS ? "passed" : "recheck";
  await saveKanaResult(user.id, { status, recognized, total: input.total, supported: input.supported, checked_at: new Date().toISOString() });
  redirect("/today");
}

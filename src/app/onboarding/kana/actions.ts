"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { saveKanaResult } from "@/lib/db/settings";
import { KANA_PASS } from "@/lib/kana";
import { safeNext } from "@/lib/safe-next";

/**
 * O03 결과 저장. 자기 보고로 통과시키지 않는다 (docs/FLOW.md 1장 4′):
 *  - 마이크가 기준 이상 인식 → passed → 카드로
 *  - 미지원·거부·기준 미달 → recheck ("다음에 다시 확인") → O03b(마이크 문구) 1장 → 카드로
 *  - "못 읽겠어" → module → O03b 가나 모듈 예고 1장 → 그대로 카드로 (잠그지 않는다)
 */
export async function submitKana(input: { recognized: number; total: number; supported: boolean; cannotRead: boolean; next?: string; from?: string }) {
  const user = await requireUser();
  const recognized = Math.max(0, Math.min(input.total, Math.floor(input.recognized)));
  const status = input.cannotRead ? "module" : input.supported && recognized >= KANA_PASS ? "passed" : "recheck";
  await saveKanaResult(user.id, { status, recognized, total: input.total, supported: input.supported, checked_at: new Date().toISOString() });
  const next = safeNext(input.next);
  if (status === "passed") redirect(next);
  const why = status === "module" ? "" : "&why=mic";
  const from = `&from=${encodeURIComponent(safeNext(input.from))}`;
  redirect(`/onboarding/kana/module?next=${encodeURIComponent(next)}${from}${why}`);
}

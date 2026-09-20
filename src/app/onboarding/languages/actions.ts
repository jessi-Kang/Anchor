"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { enableLanguages, getSettings, type Lang3 } from "@/lib/db/settings";
import { enabledLanguages, inputPath, isLang } from "@/lib/languages";

/**
 * O02a "다음". 고른 언어를 고른 순서대로 켜고, 이번에 새로 켠 첫 언어의 자료 넣기(F02)로 바로 간다.
 * 준비 단계 없음 (docs/FLOW.md 1장). 둘 이상 골랐으면 나머지는 홈에서 이어서.
 */
export async function submitLanguages(raw: string[]) {
  const user = await requireUser();
  const picked = Array.from(new Set(raw.filter(isLang))) as Lang3[];
  if (picked.length === 0) throw new Error("언어를 하나는 골라야 한다");
  const before = await getSettings(user.id);
  const already = enabledLanguages(before.settings);
  const fresh = picked.filter((l) => !already.includes(l));
  await enableLanguages(user.id, fresh);
  redirect(inputPath(fresh[0] ?? picked[0]));
}

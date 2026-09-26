"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { enableLanguages, getSettings, type Lang3 } from "@/lib/db/settings";
import { enabledLanguages, inputPath, isLang } from "@/lib/languages";

/**
 * O02a "다음". 고른 언어를 고른 순서대로 켜고, 이번에 새로 켠 첫 언어의 자료 넣기(F02)로 보낸다.
 * 둘 이상 골랐으면 나머지는 홈에서 이어서.
 *
 * **이 목적지는 근간 경로가 아니다.** `docs/FLOW.md` 1장 2′ 는 다음을 **상황 고르기**(앵커를
 * 그래프에 심는 자리)로 두고, 자료 넣기는 옆에 붙은 선택 가지다(`README.md` 근간). 그 화면이
 * 코드에 아직 없어서 여기로 보낸다 — `docs/STATUS.md` 3장. 화면이 서면 이 줄과 아래 redirect 를
 * 같이 고친다.
 *
 * 이 자리에 「준비 단계 없음 (docs/FLOW.md 1장)」 이 적혀 있었다. **FLOW 1장이 말하는 것과
 * 반대다** — 0장이 「상황 고르기는 금지가 아니라 필수다」로 못 박고 있다. 근간 개정 전에 맞던
 * 줄이 그대로 남아, 고치러 온 사람에게 지금 목적지가 기준이라고 말하고 있었다.
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

"use server";

import { redirect } from "next/navigation";
import { auth, requireUser } from "@/lib/auth/server";
import { disableLanguage, enableLanguages } from "@/lib/db/settings";
import { isLang } from "@/lib/languages";

/** 설정 언어 행 탭: 켜져 있으면 끄고, 꺼져 있으면 켠다. 자료·카드는 남는다. */
export async function toggleLanguage(lang: string, on: boolean) {
  if (!isLang(lang)) throw new Error("bad lang");
  const user = await requireUser();
  if (on) await enableLanguages(user.id, [lang]);
  else await disableLanguage(user.id, lang);
}

/** 로그아웃 → 로그인 화면 */
export async function signOut() {
  await auth.signOut();
  redirect("/");
}

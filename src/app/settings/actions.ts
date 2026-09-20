"use server";

import { redirect } from "next/navigation";
import { auth, requireUser } from "@/lib/auth/server";
import { disableLanguage } from "@/lib/db/settings";
import { isLang } from "@/lib/languages";

/** 설정 "언어 끄기". 자료·카드는 남는다. 다시 켜면 이어서. */
export async function turnOffLanguage(lang: string) {
  if (!isLang(lang)) throw new Error("bad lang");
  const user = await requireUser();
  await disableLanguage(user.id, lang);
}

/** 로그아웃 → 로그인 화면 */
export async function signOut() {
  await auth.signOut();
  redirect("/");
}

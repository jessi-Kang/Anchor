"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { createInput } from "@/lib/db/inputs";
import { EXAMPLE_INPUT } from "@/lib/example-input";
import { isLang } from "@/lib/languages";

/** F02 "모르는 것만 뽑기". 자료를 저장하고 뽑기(F03)로. example 이면 예시 자료 그대로. */
export async function submitInput(lang: string, body: string, example: boolean) {
  if (!isLang(lang)) throw new Error("bad lang");
  const user = await requireUser();
  const ex = EXAMPLE_INPUT[lang];
  const id = example
    ? await createInput(user.id, lang, ex.body, { title: ex.title, example: true })
    : await createInput(user.id, lang, body);
  redirect(`/inputs/${id}`);
}

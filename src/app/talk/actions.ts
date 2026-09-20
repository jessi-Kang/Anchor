"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { createChunk } from "@/lib/db/chunks";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { getChunkContent } from "@/lib/talk/chunk-content";

/**
 * F13 → F14. 한국어 한 줄을 받아 그 상황에서 쓸 영어 문장과 덩어리를 만들고 저장한다.
 * 유실 방지: 문안 생성이 실패해도(키 없음·API 실패) 사용자가 쓴 줄은 그대로 저장한다 (fallback).
 */
export async function submitMissed(line: string) {
  const user = await requireUser();
  // 화면만이 아니라 여기서도 본다. 액션은 화면을 거치지 않고도 불린다.
  const { settings } = await getSettings(user.id);
  if (!enabledLanguages(settings).includes("en")) redirect("/today");
  const situation = line.trim().slice(0, 300);
  if (!situation) redirect("/talk");

  const { content, source } = await getChunkContent(situation);
  const id = await createChunk(user.id, {
    lang: "en",
    situation,
    text: content.english,
    attitude: content.attitude,
    meta: { chunk: content.chunk, note: content.note, content_source: source },
  });
  redirect(`/talk/${id}`);
}

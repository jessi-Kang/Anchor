"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { createChunk, getChunk, saveGuessAndEnglish } from "@/lib/db/chunks";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { getChunkContent } from "@/lib/talk/chunk-content";

/** 영어를 켠 계정만 이 축을 쓴다. 화면만이 아니라 여기서도 본다 — 액션은 화면을 거치지 않고도 불린다. */
async function requireEnglishUser() {
  const user = await requireUser();
  const { settings } = await getSettings(user.id);
  if (!enabledLanguages(settings).includes("en")) redirect("/today");
  return user;
}

/**
 * F13 → F17. 한국어 한 줄만 저장하고 추측 화면으로 보낸다.
 *
 * **영어 문장은 여기서 만들지 않는다.** F17 은 답이 하나도 없어야 하는 화면인데(원칙 1),
 * 여기서 만들어 두면 그 문장이 F17 이 열려 있는 내내 DB 에 있고, 화면이 같은 행을 읽는 이상
 * "안 읽으면 된다" 는 규율로만 막게 된다. 규율은 다음 사람이 한 줄 고치면 깨진다.
 * 만들지 않으면 **샐 것이 없다** — HTML 에도, RSC 페이로드에도, 프리페치에도.
 * 대신 "이제 확인" 을 누른 뒤 기다림이 생기고, F17 에서 그만둔 사람 몫의 호출은 아예 안 나간다.
 *
 * 유실 방지: 쓴 줄은 문안 생성과 무관하게 이 시점에 이미 저장돼 있다 (데이터 원칙).
 */
export async function submitMissed(line: string) {
  const user = await requireEnglishUser();
  const situation = line.trim().slice(0, 300);
  if (!situation) redirect("/talk");

  const id = await createChunk(user.id, {
    lang: "en",
    situation,
    // 빈 text = 아직 안 만들었다 (lib/db/chunks.ts hasEnglish).
    text: "",
    attitude: null,
    meta: {},
  });
  redirect(`/talk/${id}/guess`);
}

/**
 * F17 → F14. 추측을 저장하고, **그때** 영어 문장을 만든다.
 *
 * 저장하는 것은 사용자가 쓴 말뿐이다. 맞았는지 틀렸는지는 남기지 않는다 — 채점을 안 하니
 * 남길 값이 없고(docs/FLOW.md 4장), 남겨 두면 언젠가 화면에 뜬다.
 */
export async function submitGuess(id: string, guess: string) {
  const user = await requireEnglishUser();
  const line = guess.trim().slice(0, 300);
  if (!line) redirect(`/talk/${id}/guess`);

  const row = await getChunk(user.id, id);
  if (!row) redirect("/talk");

  const { content, source } = await getChunkContent(row.situation);
  await saveGuessAndEnglish(user.id, id, line, {
    text: content.english,
    attitude: content.attitude,
    chunk: content.chunk,
    source,
  });
  redirect(`/talk/${id}`);
}

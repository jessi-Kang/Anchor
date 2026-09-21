"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { createChunk, getChunk, hasEnglish, saveEnglish, saveGuess } from "@/lib/db/chunks";
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
  // 화면만이 아니라 여기서도 본다 — 액션은 화면을 거치지 않고도 불린다.
  // 막는 것 둘: 첫 추측이 덮이는 것(유실), 그리고 영어 문장을 **다시 만드는 것**. 이미 듣고 따라
  // 말한 덩어리가 발밑에서 바뀌면 "같은 덩어리 5회차" 를 잴 수 없다 (docs/SPEC.md 9장).
  if (row.meta.guess !== undefined || hasEnglish(row)) redirect(`/talk/${id}`);

  /*
    **추측을 먼저 저장한다.** 문안 생성이 그 앞에 있으면, 생성이 실패했을 때 추측까지 안 써진다.
    그런데 `guess-form` 은 보내기 전에 기기 임시본을 지우므로 **그 줄이 통째로 사라진다** —
    데이터 원칙("추측 한 번도 유실 없음")이 여기서 걸린다. 순서 하나가 그 원칙을 지킨다.
  */
  await saveGuess(user.id, id, line);

  const made = await getChunkContent(row.situation);
  // 못 만들었으면 **추측을 낸 자리에 그대로 세워 둔다.** F14 로 보내면 곡선·듣기·말하기가 할 일이
  // 없어 껍데기가 된다. 여기 남으면 "없어졌다" 도 "답이 비었다" 도 아니고 "아직 확인 중" 으로 읽힌다.
  if (!made) redirect(`/talk/${id}/guess`);
  await saveEnglish(user.id, id, {
    text: made.content.english,
    attitude: made.content.attitude,
    chunk: made.content.chunk,
    source: made.source,
  });
  redirect(`/talk/${id}`);
}

/**
 * F17a "다시 만들기". **추측은 안 건드리고 영어 문장만 채운다.**
 *
 * `submitGuess` 를 다시 부르면 안 되는 이유가 둘이다. 하나는 그 함수가 추측이 이미 있으면 F14 로
 * 보내는데, 문장이 없는 F14 는 다시 F17 로 보내서 **두 화면이 끝없이 돈다.** 다른 하나는 화면의
 * 추측 칸이 읽기 전용이어야 한다는 것 — 다시 누르는 건 **새 추측이 아니라 문장을 다시 만드는
 * 것**이고, 추측을 같이 보내면 고쳐 쓴 줄이 첫 추측을 덮을 길이 생긴다(유실).
 */
export async function retryEnglish(id: string) {
  const user = await requireEnglishUser();
  const row = await getChunk(user.id, id);
  if (!row) redirect("/talk");
  // 이미 있으면 다시 만들지 않는다 — 발밑에서 덩어리가 바뀌면 "같은 덩어리 5회차" 를 못 잰다.
  if (hasEnglish(row)) redirect(`/talk/${id}`);

  const made = await getChunkContent(row.situation);
  if (!made) redirect(`/talk/${id}/guess`);
  await saveEnglish(user.id, id, {
    text: made.content.english,
    attitude: made.content.attitude,
    chunk: made.content.chunk,
    source: made.source,
  });
  redirect(`/talk/${id}`);
}

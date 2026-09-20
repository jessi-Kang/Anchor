"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getCard, land, reveal, saveGuess } from "@/lib/db/cards";
import { lightUp, markSaid } from "@/lib/db/kanji";

/**
 * Scene3 "확인": 추측을 저장하고 정답 화면으로.
 * 추측이 정답보다 먼저라는 원칙은 이 순서와 DB 제약(cards CHECK)이 함께 지킨다.
 *
 * **채점하지 않는다.** 쓴 말과 정답은 여기서 이미 행에 남으므로, 나중에 정답률을 재는 데
 * 필요한 것은 다 있다(docs/SPEC.md 9장). 지금 재는 것과 나중에 재는 것은 다른 일이다 —
 * 지금 채점하면 추측 한 번마다 사용자가 쓴 말이 밖으로 나가고, 그렇게 얻은 값을 읽는 자리는
 * `src` 와 `db/migrations` 어디에도 없다. 화면 판정 글자도 뺐다(원칙 1: "틀려도 돼" 라고 해 놓고
 * 다음 화면에서 판정을 붙이지 않는다).
 *
 * 그래서 `guess_correct` 는 null 로 남는다. 맞혔는지 모르니 모른다고 두는 것이고, 화면도 그에 맞게
 * 말한다 — 이유 한 줄의 "맞혔으니" 갈래(`KNEW_VERB`)는 저절로 안 쓰이고 "켰으니" 가 된다.
 * 그 갈래를 지우지는 않는다. 채점이 다시 서는 날 되살아날 자리다.
 */
export async function submitGuess(cardId: string, guess: string) {
  const user = await requireUser();
  const card = await getCard(user.id, cardId);
  if (!card) throw new Error("카드가 없다");
  if (!card.revealed_at) {
    await saveGuess(user.id, cardId, guess);
    await reveal(user.id, cardId, null);
  }
  redirect(`/cards/${cardId}/4`);
}

/** Scene5 를 떠난다: 착지 + 한자가 켜진다. 말하기(F10)로 가거나 그래프(F11)로. */
export async function finishCard(cardId: string, to: "speak" | "graph") {
  const user = await requireUser();
  const card = await getCard(user.id, cardId);
  if (!card) throw new Error("카드가 없다");
  await land(user.id, cardId);
  await lightUp(user.id, card.node_id, card.guess_correct);
  redirect(to === "speak" ? `/cards/${cardId}/speak` : `/graph?card=${cardId}`);
}

/** F10 "됐어, 다음": 말해봤다(can_say) → 그래프 */
export async function finishSpeak(cardId: string, said: boolean) {
  const user = await requireUser();
  const card = await getCard(user.id, cardId);
  if (!card) throw new Error("카드가 없다");
  if (said) await markSaid(user.id, card.node_id);
  redirect(`/graph?card=${cardId}`);
}

"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import { getCard, land, reveal, saveGuess } from "@/lib/db/cards";
import { lightUp, markSaid } from "@/lib/db/kanji";
import { judgeGuess } from "@/lib/kanji/card-content";

/**
 * Scene3 "확인": 추측을 먼저 저장하고(guess_at), 판정을 내린 뒤 정답 화면으로.
 * 추측이 정답보다 먼저라는 원칙은 이 순서와 DB 제약(cards CHECK)이 함께 지킨다.
 */
export async function submitGuess(cardId: string, guess: string) {
  const user = await requireUser();
  const card = await getCard(user.id, cardId);
  if (!card) throw new Error("카드가 없다");
  if (!card.revealed_at) {
    await saveGuess(user.id, cardId, guess);
    const verdict = guess.trim() ? await judgeGuess(guess, card.payload.answer, []) : null;
    await withUser(user.id, async (tx) => {
      await tx.query("UPDATE cards SET payload = payload || jsonb_build_object('verdict', $3::text) WHERE user_id = $1 AND id = $2", [
        user.id,
        cardId,
        verdict ?? "",
      ]);
    });
    await reveal(user.id, cardId, verdict === null ? null : verdict !== "다름");
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

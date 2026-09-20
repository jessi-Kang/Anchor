"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getInput } from "@/lib/db/inputs";
import { getKanjiNodes, getPartNames, judgeKanji } from "@/lib/db/kanji";
import { createCard, findOpenCard, type CardPart, type CardPayload } from "@/lib/db/cards";
import { getSettings } from "@/lib/db/settings";
import { getCardContent } from "@/lib/kanji/card-content";
import { findWordWith } from "@/lib/kanji/extract";
import { kanaGate } from "@/lib/kana";

/** F03 "알아 / 몰라" 한 탭 */
export async function judge(nodeId: string, knows: boolean) {
  const user = await requireUser();
  await judgeKanji(user.id, nodeId, knows);
}

/**
 * F03 "協부터" → 카드 1장 (있으면 재사용) → 일본어 첫 카드 직전 가나 게이트 → F04.
 * payload 는 여기서 굳힌다: 문안(손·Claude·사전) + 부품 이름 + 출처 문장.
 */
export async function startCard(inputId: string, kanji: string) {
  const user = await requireUser();
  const input = await getInput(user.id, inputId);
  if (!input) throw new Error("자료가 없다");
  const node = (await getKanjiNodes([kanji])).get(kanji);
  if (!node) throw new Error("사전에 없는 한자");

  let cardId = await findOpenCard(user.id, node.id, input.id);
  if (!cardId) {
    const names = await getPartNames(node.meta.parts ?? []);
    const { content, source } = await getCardContent(node, names);
    const counts = new Map<string, number>();
    for (const p of node.meta.parts ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
    const parts: CardPart[] = [...counts.entries()].map(([ch, count]) => ({ ch, name: names.get(ch) ?? null, count }));
    const payload: CardPayload = {
      ...content,
      kanji: node.key,
      reading: node.reading ?? node.meta.on?.[0] ?? "",
      parts,
      source: findWordWith(input.body, node.key),
      content_source: source,
    };
    cardId = await createCard(user.id, node.id, input.id, payload);
  }

  const { settings } = await getSettings(user.id);
  const gate = kanaGate(settings);
  if (gate === "ask" || gate === "locked") redirect(`/onboarding/kana?next=${encodeURIComponent(`/cards/${cardId}`)}`);
  redirect(`/cards/${cardId}`);
}

"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getInput } from "@/lib/db/inputs";
import { getKanjiNodes, getPartNames, judgeKanji } from "@/lib/db/kanji";
import { recordEncounter } from "@/lib/db/encounters";
import { createCard, findOpenCard, type CardPart, type CardPayload } from "@/lib/db/cards";
import { getSettings } from "@/lib/db/settings";
import { getCardContent } from "@/lib/kanji/card-content";
import { findWordWith } from "@/lib/kanji/extract";
import { getFurigana } from "@/lib/kanji/furigana";
import { kanaGate } from "@/lib/kana";

/**
 * F03 "알아 / 몰라" 한 탭. 두 군데에 적는다.
 *
 * `user_node_state` 는 **지금 상태**라 덮어쓴다 — 이력이 없다. `encounters` 는 **일어난 일**이라
 * 쌓인다. 통과 기준의 "재만남 인식률" 은 쌓인 쪽에서만 나오고, 지나간 날은 나중에 못 채운다
 * (lib/db/encounters.ts).
 */
export async function judge(nodeId: string, inputId: string, knows: boolean) {
  const user = await requireUser();
  await judgeKanji(user.id, nodeId, knows);
  // 기록이 실패해도 판정은 이미 남았다 — 화면을 멈춰 세우지 않는다.
  await recordEncounter(user.id, nodeId, inputId, knows).catch((e) => console.error("[encounters] 기록 실패", e));
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
    // 문안과 후리가나는 서로를 안 쓴다. F03 의 "협부터 풀어보기" 한 탭이 두 번 기다리지 않게 같이 띄운다.
    const src = findWordWith(input.body, node.key);
    const [{ content, source }, readings] = await Promise.all([
      getCardContent(node, names),
      src ? getFurigana(src.sentence) : Promise.resolve(null),
    ]);
    const counts = new Map<string, number>();
    for (const p of node.meta.parts ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
    const parts: CardPart[] = [...counts.entries()].map(([ch, count]) => ({ ch, name: names.get(ch) ?? null, count }));
    // F03 은 nodes.meta 의 ko_word·ko_sound 로 "지출의 지" 를 보여 준다. 카드의 후킹도 같은 단어여야
    // "지출은 알아. 支만 모르지" 로 이어진다. 문안 생성이 다른 단어를 골라 오면 두 화면이 다른 말을
    // 하게 되므로, 사전에 앵커가 있으면 그쪽을 쓴다 (docs/FLOW.md 1장 4·5).
    const hook =
      node.meta.ko_word && node.meta.ko_sound
        ? { word: node.meta.ko_word, mark: node.meta.ko_sound }
        : content.hook;
    // 후리가나도 payload 에 굳힌다. 한 번 만들면 그대로라, 나중에 읽기가 바뀌어 이 카드의 문장만
    // 달라지는 일이 없다. 못 구하면 undefined — 그 문장은 ruby 없이 간다.
    const payload: CardPayload = {
      ...content,
      hook,
      kanji: node.key,
      reading: node.reading ?? node.meta.on?.[0] ?? "",
      parts,
      source: src ? { ...src, readings: readings ?? undefined } : null,
      content_source: source,
    };
    cardId = await createCard(user.id, node.id, input.id, payload);
  }

  const { settings } = await getSettings(user.id);
  // from 은 O03 상단 "지금 어디" 라벨의 목적지다. 라벨은 한 단계 위로 가는 링크이고, O03 위는 이 자료(F03)다.
  if (kanaGate(settings) === "ask")
    redirect(`/onboarding/kana?next=${encodeURIComponent(`/cards/${cardId}`)}&from=${encodeURIComponent(`/inputs/${input.id}`)}`);
  redirect(`/cards/${cardId}`);
}

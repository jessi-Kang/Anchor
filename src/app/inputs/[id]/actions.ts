"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getInput } from "@/lib/db/inputs";
import { inputProgress } from "@/lib/cards/progress";
import { runStates } from "@/lib/kanji/runs";
import { recordEncounters } from "@/lib/db/encounters";
import { getKanjiNodes, getPartNames, judgeKanji } from "@/lib/db/kanji";
import { createCard, findOpenCard, type CardPart, type CardPayload } from "@/lib/db/cards";
import { getSettings } from "@/lib/db/settings";
import { getCardContent } from "@/lib/kanji/card-content";
import { findWordWith } from "@/lib/kanji/extract";
import { getFurigana } from "@/lib/kanji/furigana";
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

/**
 * F12 "읽기 끝". **여기서 재만남 기록이 한 번에 남는다** (`docs/MEASURE.md` 1장).
 *
 * `opened` 는 사용자가 탭해서 읽기를 연 덩어리 번호다(`runStates` 와 같은 순서). 그 덩어리 안의
 * 만난 한자는 전부 `recognized = false`, 안 연 덩어리의 만난 한자는 `true` 다 — 실제로 일어난
 * 행동 하나가 그것이다. 묻지 않았으니 자기 보고가 아니고, 점수도 정답도 없으니 시험이 아니다.
 *
 * **판정이 일어날 수 없었던 자리는 `null` 로 적는다.** 그런 자리가 둘이다. 妥協 처럼 안 만난
 * 글자가 섞인 덩어리, 그리고 **읽기를 못 구해 애초에 열 수가 없던 덩어리**(후리가나 생성 실패,
 * 또는 키가 없는 환경). 둘 다 그 안의 만난 글자에 **판정이 일어난 적이 없다.** true 로 적으면
 * 기회가 없던 것을 "열지 않고 읽었다" 로 세게 되어 분자가 부푼다. 그렇다고 안 적으면 분모가 왜 작은지를 못 가른다 — 자료에 안
 * 나와서 작은 것과 섞인 덩어리에 갇혀서 작은 것은 손쓸 방법이 다르다. 그래서 적되 분모에서 빼고,
 * 그 수를 `pnpm measure` 가 따로 보여 준다 (`docs/MEASURE.md` 0′장).
 *
 * 화면을 그냥 떠나면 이 함수가 안 불린다. 반쯤 읽은 것을 판정으로 만들지 않는다.
 */
export async function finishRead(inputId: string, opened: number[]) {
  const user = await requireUser();
  const input = await getInput(user.id, inputId);
  if (input && input.lang === "ja") {
    const prog = await inputProgress(user.id, input);
    const nodeOf = new Map(prog.nodes.map((n) => [n.key, n.id]));
    const open = new Set(opened);
    /*
      **읽기가 없으면 판정도 없다.** 화면이 그 덩어리를 눌리지 않게 두므로(`met-text.tsx`)
      사용자는 열 수도, 안 열고 읽어 낼 수도 없다. 그런데 "안 열었다" 는 여기서 true 가 되므로,
      거르지 않으면 **읽기를 한 번도 못 만든 자료가 인식률 100% 로 들어온다.** 화면과 같은 값을
      봐야 갈라지지 않는다 — 그래서 `meta.readings` 를 여기서도 읽는다.
    */
    const readings = input.meta.readings;
    const rows = runStates(input.body, prog.anchors)
      .flatMap((run, i) =>
        run.allMet && readings?.[i]
          ? run.chars.map((c) => ({ ch: c, recognized: !open.has(i) as boolean | null }))
          : // 안 만난 글자가 섞였거나 읽기가 없는 덩어리. 그 안의 **만난 글자**는 만나기는 했으나
            // 판정이 일어날 수 없었으므로 null 로 적는다. 안 만난 글자는 이 지표의 대상이 아니라 안 적는다.
            run.met.map((c) => ({ ch: c, recognized: null as boolean | null })),
      )
      // 같은 글자가 두 덩어리에 나오면 **판정이 일어난 쪽**이 이긴다 — 한 자리에서 실제로 읽어 낸
      // 사실이 "판정할 자리가 아니었다" 보다 무겁다. 판정이 둘이면 **연 적이 있는 쪽**을 남긴다:
      // 한 번이라도 막혔으면 막힌 것이다.
      .reduce<Map<string, boolean | null>>((acc, r) => {
        const had = acc.get(r.ch);
        if (r.recognized === null) return acc.has(r.ch) ? acc : acc.set(r.ch, null);
        return acc.set(r.ch, had === null || had === undefined ? r.recognized : had && r.recognized);
      }, new Map());
    const payload = [...rows].flatMap(([ch, recognized]) => {
      const nodeId = nodeOf.get(ch);
      return nodeId ? [{ nodeId, recognized }] : [];
    });
    // 기록이 실패해도 읽기는 끝난 것이다 — 화면을 붙잡지 않는다.
    await recordEncounters(user.id, inputId, payload).catch((e) => console.error("[encounters] 기록 실패", e));
  }
  redirect("/today");
}

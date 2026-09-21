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

/**
 * 못 만든 한자를 달고 F04a 로 가는 주소. 같은 글자가 두 번 들어가지 않게 모으고 순서는 그대로 둔다.
 * 쌓는 이유는 하나다 — F04a 의 "다음 글자" 가 방금 못 만든 글자를 다시 내밀면 제자리를 돈다.
 */
function noCard(inputId: string, kanji: string, failed: string[]): string {
  const all = [...new Set([...failed, kanji])];
  return `/inputs/${inputId}/no-card?failed=${encodeURIComponent(all.join(","))}`;
}

/** F03 "알아 / 몰라" 한 탭 */
export async function judge(nodeId: string, knows: boolean) {
  const user = await requireUser();
  await judgeKanji(user.id, nodeId, knows);
}

/**
 * F03 "協부터" → 카드 1장 (있으면 재사용) → 일본어 첫 카드 직전 가나 게이트 → F04.
 * payload 는 여기서 굳힌다: 문안(손·Claude) + 부품 이름 + 출처 문장.
 *
 * **문안을 못 만들면 카드를 안 만들고 F04a 로 보낸다** (design/SCREENS.md "못 만들었을 때").
 * 추측 화면까지 가지 않는다 — 거기 가면 물을 것도 답도 없다.
 * `failed` 는 이번에 이미 못 만든 한자들이고, 여기서 하나 더 붙어 주소로 따라간다.
 * **저장하지 않는 이유**: 적어 두면 API 가 한 번 죽은 날의 한자가 영영 갇힌다.
 * 주소는 화면을 떠나면 사라지므로 다음에 들어오면 다시 해 본다.
 */
export async function startCard(inputId: string, kanji: string, failed: string[] = []) {
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
    const [made, readings] = await Promise.all([
      getCardContent(node, names),
      src ? getFurigana(src.sentence) : Promise.resolve(null),
    ]);
    /*
      **문지기는 둘이다. 카드가 통째로 빌 자리냐로 가른다.**

      하나는 문안이다 — 질문도 정답도 착지도 거기서 나온다. 다른 하나는 **발판**, 곧 이 한자의
      한국 한자음 하나다. Scene1 이 통째로 그것으로 서고(`이 조, 한자로는 어떤 모양일까?`),
      F04 의 주 버튼도 그것을 부른다(`조부터 풀어보기`). 2,136자 중 **`枠` 한 자**에 그 소리가 없다
      (일본 국자라 한국 한자음이 애초에 없다). 넣을 것이 없는 자리에 한자를 그대로 넣으면
      "이 枠, 한자로는 어떤 모양일까?" 가 되는데, 그건 묻는 게 아니라 **답을 보여 주고 묻는 것**이다.
      없는 말을 지어내는 대신 못 만들었다고 말한다 — 문안을 못 만들었을 때와 같은 길(F04a)로 보낸다.

      **전에는 여섯이라고 적혀 있었다.** 나머지 다섯(収 塡 頰 𠮟 剝)은 KANJIDIC2 가 제 항목에서
      정자로 링크를 걸어 두었는데 빌드가 그 링크를 안 따라갔던 것이고, `d79ba91` 로 되살아났다.
      **동작은 그때도 지금도 같다** — 이 줄은 `ko_sound` 가 있나 없나를 보지 그 수를 안 본다.

      **후리가나는 문지기가 아니다.** 없으면 그 문장만 ruby 없이 가고 카드는 선다. 셋을 같이 막으면
      읽기를 못 구한 날 카드가 안 열린다.
    */
    const sound = node.meta.ko_sound ?? null;
    if (!made || !sound) redirect(noCard(inputId, kanji, failed));
    const { content, source } = made;
    const counts = new Map<string, number>();
    for (const p of node.meta.parts ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
    const parts: CardPart[] = [...counts.entries()].map(([ch, count]) => ({ ch, name: names.get(ch) ?? null, count }));
    /*
      **발판은 사전에서만 온다.** F03 은 `nodes.meta` 의 ko_word·ko_sound 로 "지출의 지" 를 보여 주고,
      카드도 같은 자리를 봐야 "지출은 알아. 支만 모르지" 로 이어진다.

      **없으면 없는 채로 간다.** 전에는 이 갈래가 문안 생성이 골라 온 낱말로 떨어졌는데, 문안 쪽
      스키마가 그 칸을 필수로 잡고 있어서 **그 낱말은 언제나 지어낸 것**이었다. 그래서 F03 이
      "부를 낱말이 아직 없어" 로 내려놓은 `条` 가 다음 화면에서 "조건은 알아" 가 됐다 — 한 탭 만에
      앞 화면을 거짓으로 만든 것이다. 뒤집힘은 낱말이 화면에 있어서가 아니라 **앱이 아직 못 골랐다고
      해 놓고 그 낱말을 사용자가 안다고 말해서** 생긴다 (design/SCREENS.md, `docs/FLOW.md` 1′장
      F03 행의 "그 묶음의 주어는 앱이다").

      소리 없이 낱말만 있는 `収`("수입")은 위 문지기에서 이미 걸린다. F03 도 낱말과 소리를 **둘 다**
      보고 둘째 묶음에 두므로, 두 화면이 같은 글자를 같은 쪽에 놓는다.
    */
    const anchor = node.meta.ko_word ?? null;
    // 후리가나도 payload 에 굳힌다. 한 번 만들면 그대로라, 나중에 읽기가 바뀌어 이 카드의 문장만
    // 달라지는 일이 없다. 못 구하면 undefined — 그 문장은 ruby 없이 간다.
    const payload: CardPayload = {
      ...content,
      sound,
      anchor,
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

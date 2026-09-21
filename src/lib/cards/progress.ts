import { withUser } from "@/lib/db";
import { countingInputs, getInput, type InputRow } from "@/lib/db/inputs";
import { getKanjiNodes, getKanjiStates, isJudged, type KanjiNode } from "@/lib/db/kanji";
import type { CardRow } from "@/lib/db/cards";

/**
 * 자료 하나의 진행: 한자 노드(나온 순서), 아는 것, 착지한 카드, 남은 카드 수, 다음 카드 후보.
 * 홈(F01)의 자료 행과 카드 안의 "카드 n / N"(docs/FLOW.md 6장)이 같은 계산을 쓴다.
 */
export type InputProgress = {
  input: InputRow;
  nodes: KanjiNode[];
  known: Set<string>;
  /**
   * 「아는 것」이라고 부를 수 있는 것: 아는 것 중 **사용자가 판정한** 것만 (docs/FLOW.md 4장).
   * `known` 과 갈라 둔 이유 — 순서 계산에는 추론으로 올라간 것도 쓰지만, 이름을 부르는 자리에는 못 쓴다.
   */
  anchors: Set<string>;
  /** 카드에서 **추측을 맞힌** 한자. 틀렸거나 건너뛴 카드는 여기 없다 — "맞혔으니" 는 맞혔을 때만 쓴다. */
  solved: Set<string>;
  landedKanji: string[];
  /** 아직 카드로 안 본 모르는 한자 수 */
  remaining: number;
  /** 카드가 될 한자 수 = 착지 + 남음 */
  total: number;
};

export async function inputProgress(userId: string, input: InputRow): Promise<InputProgress> {
  const chars = input.meta.kanji ?? [];
  const nodeMap = await getKanjiNodes(chars);
  const nodes = chars.map((c) => nodeMap.get(c)).filter((n): n is KanjiNode => Boolean(n));
  const states = await getKanjiStates(
    userId,
    nodes.map((n) => n.id),
  );
  const known = new Set(nodes.filter((n) => states.get(n.id)?.knows_meaning).map((n) => n.key));
  const anchors = new Set(nodes.filter((n) => states.get(n.id)?.knows_meaning && isJudged(states.get(n.id))).map((n) => n.key));
  const landedRows = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ key: string; guess_correct: boolean | null }>(
      `SELECT n.key, c.guess_correct FROM cards c JOIN nodes n ON n.id = c.node_id
       WHERE c.user_id = $1 AND c.input_id = $2 AND c.landed_at IS NOT NULL ORDER BY c.landed_at`,
      [userId, input.id],
    );
    return rows;
  });
  const landed = landedRows.map((r) => r.key);
  const solved = new Set(landedRows.filter((r) => r.guess_correct).map((r) => r.key));
  const landedSet = new Set(landed);
  const remaining = openKanji(nodes, known, landedSet).length;
  return { input, nodes, known, anchors, solved, landedKanji: landed, remaining, total: landedSet.size + remaining };
}

/**
 * **아직 카드가 안 된 한자.** "남았다" 의 정의는 이 한 줄이고, `inputProgress.remaining` 과
 * `cardsLeft` 가 같이 쓴다. 둘이 따로 세면 화면은 남았다고 하고 하루 끝은 끝났다고 한다.
 *
 * **카드가 될 수 없는 한자는 안 센다.** 한국 한자음이 없는 `枠` 한 자(일본 국자)는 발판이 없어
 * 카드가 서지 않는다 (`app/inputs/[id]/actions.ts`). 세면 그 글자가 든 자료는 "남았다" 가 영영
 * 안 줄어 하루 끝(F15)이 못 뜨고, 큐는 내밀 것이 없는데 수만 남는다 — **안 내미는 것을 세면
 * 화면이 못 가는 곳을 가리킨다.**
 */
function openKanji(nodes: KanjiNode[], known: Set<string>, landed: Set<string>): KanjiNode[] {
  return nodes.filter((n) => Boolean(n.meta.ko_sound) && !known.has(n.key) && !landed.has(n.key));
}

/**
 * 아직 안 만난 한자 — 재만남(F12)이 진하게 보여 주는 것, 하루 끝(F15)이 "또 만날 글자" 로 세는 것.
 * **두 화면이 같은 자리를 본다.** 따로 세면 F12 에서 하나로 보이는데 F15 는 둘이라고 말하게 된다.
 */
export function freshKanji(prog: InputProgress): string[] {
  return prog.nodes.filter((n) => !prog.anchors.has(n.key)).map((n) => n.key);
}

/**
 * 오늘 볼 카드가 더 남았는가 — **자료 하나가 아니라 계정 전체**를 본다.
 *
 * 하루 끝(F15)은 상태가 아니라 순간이다 (docs/FLOW.md 4장). 마지막 카드를 착지한 그 자리에서만
 * 띄우고 홈은 홈으로 둔다. 그래서 "띄울 때인가" 를 착지 직후 화면이 물어야 하는데, 그 화면은 자기
 * 자료밖에 모른다 — 이 자료를 다 봤어도 다른 기사에 카드가 남아 있으면 하루가 끝난 게 아니다.
 * 자료 하나만 보고 띄우면 남은 것을 끝났다고 말하게 된다.
 */
export async function cardsLeft(userId: string): Promise<number> {
  /*
    **상한이 없다.** 전에는 최근 10개만 봤는데, 그건 바로 위 주석이 막으려던 일("자료 하나만 보고
    띄우면 남은 것을 끝났다고 말하게 된다")을 "열 개만 보면" 으로 다시 한 것이다. 열한 번째 자료에
    카드가 남아 있으면 이 함수가 0 을 내고, 그래프 화면이 "오늘 켜진 것" 버튼을 세우고, 하루 끝이
    뜬다 — **카드가 남았는데 끝났다고 말한다.** 되돌릴 방법이 없는 종류의 거짓말이다.

    자료마다 `inputProgress` 를 돌리지 않고 **세 질의로 한 번에** 센다. 자료가 쉰이면 그쪽은
    백쉰 질의다. 대신 "남았다" 의 정의는 `openKanji` 한 곳에서 같이 가져다 쓴다 — 빠르게 세려고
    규칙을 베껴 쓰면 언젠가 둘이 갈린다.
  */
  const inputs = await countingInputs(userId);
  const chars = [...new Set(inputs.flatMap((i) => i.meta.kanji ?? []))];
  if (chars.length === 0) return 0;

  const nodeMap = await getKanjiNodes(chars);
  const states = await getKanjiStates(
    userId,
    [...nodeMap.values()].map((n) => n.id),
  );
  const known = new Set([...nodeMap.values()].filter((n) => states.get(n.id)?.knows_meaning).map((n) => n.key));
  const landed = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ input_id: string; key: string }>(
      `SELECT c.input_id, n.key FROM cards c JOIN nodes n ON n.id = c.node_id
        WHERE c.user_id = $1 AND c.landed_at IS NOT NULL AND c.input_id IS NOT NULL`,
      [userId],
    );
    const by = new Map<string, Set<string>>();
    for (const r of rows) (by.get(r.input_id) ?? by.set(r.input_id, new Set()).get(r.input_id)!).add(r.key);
    return by;
  });

  return inputs.reduce((n, i) => {
    const nodes = (i.meta.kanji ?? []).flatMap((c) => {
      const node = nodeMap.get(c);
      return node ? [node] : [];
    });
    return n + openKanji(nodes, known, landed.get(i.id) ?? new Set()).length;
  }, 0);
}

export type CardContext = InputProgress & { where: string; n: number };

export async function cardContext(userId: string, card: CardRow): Promise<CardContext> {
  const input = card.input_id ? await getInput(userId, card.input_id) : null;
  if (!input) {
    const empty: InputProgress = {
      input: { id: "", lang: "ja", title: null, body: "", created_at: "", extracted_at: null, meta: {} },
      nodes: [],
      known: new Set(),
      anchors: new Set(),
      solved: new Set(),
      landedKanji: [],
      remaining: 0,
      total: 1,
    };
    return { ...empty, where: "카드 1 / 1", n: 1 };
  }
  const prog = await inputProgress(userId, input);
  const total = Math.max(1, prog.total);
  const n = Math.min(total, prog.landedKanji.length + (card.landed_at ? 0 : 1));
  return { ...prog, total, where: `카드 ${n} / ${total}`, n };
}

/**
 * 발판을 어떻게 얻었는지. 이유 한 줄의 동사가 여기서 갈린다 — 틀린 추측을 "맞혔으니" 라고 부르면
 * 화면이 거짓말을 한다.
 *  - `knew`   F03 에서 "알아" 를 골랐다      → "支를 아니까"
 *  - `solved` 카드에서 추측을 맞혔다          → "協을 맞혔으니"
 *  - `lit`    카드는 끝냈지만 못 맞혔다/건너뛰었다 → "協을 켰으니"
 */
export type Knew = "knew" | "solved" | "lit";

/** 발판 하나를 화면 문장의 주어로 쓸 때의 동사. 홈과 그래프가 같은 말을 쓴다 (docs/FLOW.md 4장). */
export const KNEW_VERB: Record<Knew, string> = { knew: "아니까", solved: "맞혔으니", lit: "켰으니" };

export type Candidate = {
  kanji: string;
  koWord: string | null;
  /** 이 한자의 한국 한자음. 조사를 고를 때 쓴다 (한자는 받침을 셀 수 없다) */
  koSound: string | null;
  /**
   * 이 후보를 가깝게 만든 **판정된** 한자. 이유 한 줄의 주어가 되는 것은 이것뿐이다.
   * null 이면 부를 발판이 없다 — 억지로 붙이지 말고 자료를 대야 한다 (docs/FLOW.md 4장).
   */
  via: { kanji: string; koSound: string | null; how: Knew } | null;
};

/**
 * 다음 카드 = 아는 노드에서 가장 가까운 모르는 노드 (CLAUDE.md 앵커 그래프).
 * 가까움 = 아는 한자·부품과 공유하는 부품 수 (+ 한국어 앵커가 있으면 반 점). 같으면 자료에 나온 순서.
 *
 * **부품은 순서를 정하는 데만 쓰고 이름을 부르지 않는다.** 카드에서 十·力 을 보여 준 것은 판정이 아니라
 * 보여 준 것이라, "力을 아니까" 라고 하면 보여 준 것을 아는 것으로 바꿔 부르게 되고 같은 노드가
 * 「아는 것」과 「다음」에 동시에 선다. 그래서 주어 자리에는 그 부품을 가진 **판정된 한자**를 댄다
 * ("協을 맞혔으니 助가"). docs/FLOW.md 4장.
 */
export function nextCandidates(prog: InputProgress, justLit?: string): Candidate[] {
  const known = new Set(prog.known);
  if (justLit) known.add(justLit);
  // 방금 켠 카드는 판정된 것이다(끝까지 풀었다). 주어로 가장 자연스러우니 맨 앞에 둔다.
  const anchors = [...(justLit ? [justLit] : []), ...[...prog.anchors].filter((k) => k !== justLit)];
  const nodeOf = new Map(prog.nodes.map((n) => [n.key, n]));

  // 부품 → 그 부품을 가진 판정된 한자. 먼저 들어온 것이 이긴다(방금 켠 카드 우선).
  const owner = new Map<string, string>();
  for (const a of anchors) {
    if (!owner.has(a)) owner.set(a, a); // 아는 한자 자체도 부품이 된다 (協을 알면 協이 든 말로)
    for (const part of nodeOf.get(a)?.meta.parts ?? []) if (!owner.has(part)) owner.set(part, a);
  }

  const landed = new Set(prog.landedKanji);
  const soundOf = new Map(prog.nodes.map((n) => [n.key, n.meta.ko_sound ?? null]));
  const howOf = (k: string): Knew => (prog.solved.has(k) ? "solved" : landed.has(k) ? "lit" : "knew");
  return prog.nodes
    // 발판(한국 한자음)이 없는 글자는 카드가 못 선다. "다음 카드는 이거" 가 가리킬 수 없으니
    // `openKanji`·`nextKanji` 와 같은 규칙으로 뺀다 — 셋이 갈리면 화면마다 다음이 달라진다.
    .filter((n) => Boolean(n.meta.ko_sound) && !known.has(n.key) && !landed.has(n.key))
    .map((n) => {
      /*
        **후보 자신의 key 는 `owner` 에서 안 찾는다. 빠뜨린 게 아니라 일부러다.**

        `owner` 에는 방금 켠 한자의 **부품**도 들어간다(協 을 켜면 `十`·`力` 이 키가 된다). 그래서
        후보의 `key` 까지 여기서 보면, **방금 카드가 부품으로 보여 준 글자**가 바로 다음 카드로
        올라온다 — `協` 을 푼 직후의 `力` 이 그렇다.

        **그러면 발견이 없다** (원칙 1). Scene2 가 이미 그 모양을 띄우고 이름까지 불렀는데, 다음
        카드의 Scene1 이 "이 력, 한자로는 어떤 모양일까?" 를 묻는다. **답이 두 화면 전에 떠 있던**
        물음이라 추측할 자리가 아니다. 「아는 것 + 1」의 +1 은 **새로 발견할 것**이지 방금 화면에
        뜬 것이 아니다.

        부품으로 본 글자를 다시 만나는 일은 카드가 아니라 **F12(재만남)** 가 맡는다 (원칙 4,
        `docs/FLOW.md` 4장). 그래서 그 글자는 자료에 같이 나온 다른 글자들과 동점에서 출발하고,
        순서는 자료에 나온 차례가 정한다.

        **그래도 `owner` 에서 그 항목을 빼지는 않는다.** `力 → 協` 은 **`力` 을 부품으로 가진 다른
        후보**(예: `助`)가 쓴다 — 그때 `shared = [力]` 이 되고 이유 한 줄의 주어가 `協` 으로 선다.
        점수를 안 주는 것과 주어를 못 찾게 하는 것은 다른 일이다.
      */
      const shared = [...new Set(n.meta.parts ?? [])].filter((part) => owner.has(part));
      const viaKanji = shared.length ? owner.get(shared[0])! : null;
      return {
        kanji: n.key,
        koWord: n.meta.ko_word ?? null,
        koSound: n.meta.ko_sound ?? null,
        via: viaKanji ? { kanji: viaKanji, koSound: soundOf.get(viaKanji) ?? null, how: howOf(viaKanji) } : null,
        score: shared.length + (n.meta.ko_word ? 0.5 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ kanji, koWord, koSound, via }) => ({ kanji, koWord, koSound, via }));
}

import { withUser } from "@/lib/db";
import { getInput, type InputRow } from "@/lib/db/inputs";
import { getKanjiNodes, getKanjiStates, type KanjiNode } from "@/lib/db/kanji";
import type { CardRow } from "@/lib/db/cards";

/**
 * 자료 하나의 진행: 한자 노드(나온 순서), 아는 것, 착지한 카드, 남은 카드 수, 다음 카드 후보.
 * 홈(F01)의 자료 행과 카드 안의 "카드 n / N"(docs/FLOW.md 6장)이 같은 계산을 쓴다.
 */
export type InputProgress = {
  input: InputRow;
  nodes: KanjiNode[];
  known: Set<string>;
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
  const landed = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ key: string }>(
      `SELECT n.key FROM cards c JOIN nodes n ON n.id = c.node_id
       WHERE c.user_id = $1 AND c.input_id = $2 AND c.landed_at IS NOT NULL ORDER BY c.landed_at`,
      [userId, input.id],
    );
    return rows.map((r) => r.key);
  });
  const landedSet = new Set(landed);
  const remaining = nodes.filter((n) => !known.has(n.key) && !landedSet.has(n.key)).length;
  return { input, nodes, known, landedKanji: landed, remaining, total: landedSet.size + remaining };
}

export type CardContext = InputProgress & { where: string; n: number };

export async function cardContext(userId: string, card: CardRow): Promise<CardContext> {
  const input = card.input_id ? await getInput(userId, card.input_id) : null;
  if (!input) {
    const empty: InputProgress = {
      input: { id: "", lang: "ja", title: null, body: "", created_at: "", extracted_at: null, meta: {} },
      nodes: [],
      known: new Set(),
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

export type Candidate = { kanji: string; shared: string[]; koWord: string | null };

/**
 * 다음 카드 = 아는 노드에서 가장 가까운 모르는 노드 (CLAUDE.md 앵커 그래프).
 * 가까움 = 아는 한자·부품과 공유하는 부품 수 (+ 한국어 앵커가 있으면 반 점). 같으면 자료에 나온 순서.
 */
export function nextCandidates(prog: InputProgress, justLit?: string): Candidate[] {
  const known = new Set(prog.known);
  if (justLit) known.add(justLit);
  const knownParts = new Set<string>();
  for (const n of prog.nodes) if (known.has(n.key)) for (const p of n.meta.parts ?? []) knownParts.add(p);
  for (const k of known) knownParts.add(k); // 아는 한자 자체도 부품이 된다 (力을 알면 助·加)
  const landed = new Set(prog.landedKanji);
  return prog.nodes
    .filter((n) => !known.has(n.key) && !landed.has(n.key))
    .map((n) => {
      const shared = [...new Set(n.meta.parts ?? [])].filter((p) => knownParts.has(p));
      return { kanji: n.key, shared, koWord: n.meta.ko_word ?? null, score: shared.length + (n.meta.ko_word ? 0.5 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ kanji, shared, koWord }) => ({ kanji, shared, koWord }));
}

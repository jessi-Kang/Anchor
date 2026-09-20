import { withUser } from "@/lib/db";
import { getInput, type InputRow } from "@/lib/db/inputs";
import { getKanjiNodes, getKanjiStates, type KanjiNode } from "@/lib/db/kanji";
import type { CardRow } from "@/lib/db/cards";

/**
 * 카드 안에서만 보이는 진행 "카드 n / N" (docs/FLOW.md 6장). N = 이 자료에서 카드가 될 한자 수
 * (착지한 카드 + 아직 모르는 한자), n = 착지한 카드 수 + 1 (이 카드가 아직 안 끝났으면).
 */
export type CardContext = {
  input: InputRow | null;
  where: string;
  n: number;
  total: number;
  /** 이 자료의 한자 노드 (나온 순서) */
  nodes: KanjiNode[];
  known: Set<string>;
  /** 카드가 이미 있는(만들어진) 한자 */
  carded: Set<string>;
  landedKanji: string[];
};

export async function cardContext(userId: string, card: CardRow): Promise<CardContext> {
  const input = card.input_id ? await getInput(userId, card.input_id) : null;
  const chars = input?.meta.kanji ?? [];
  const nodeMap = await getKanjiNodes(chars);
  const nodes = chars.map((c) => nodeMap.get(c)).filter((n): n is KanjiNode => Boolean(n));
  const states = await getKanjiStates(
    userId,
    nodes.map((n) => n.id),
  );
  const known = new Set(nodes.filter((n) => states.get(n.id)?.knows_meaning).map((n) => n.key));

  const { landed, carded } = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ key: string; landed_at: string | null }>(
      `SELECT n.key, c.landed_at FROM cards c JOIN nodes n ON n.id = c.node_id
       WHERE c.user_id = $1 AND ($2::uuid IS NULL OR c.input_id = $2) ORDER BY c.created_at`,
      [userId, card.input_id],
    );
    return { landed: rows.filter((r) => r.landed_at).map((r) => r.key), carded: new Set(rows.map((r) => r.key)) };
  });
  const landedSet = new Set(landed);
  const unknownLeft = nodes.filter((n) => !known.has(n.key) && !landedSet.has(n.key)).length;
  const total = Math.max(1, landedSet.size + unknownLeft);
  const n = Math.min(total, landedSet.size + (card.landed_at ? 0 : 1));
  const where = `카드 ${n} / ${total}`;
  return { input, where, n, total, nodes, known, carded, landedKanji: landed };
}

/**
 * 다음 카드 = 아는 노드에서 가장 가까운 모르는 노드 (CLAUDE.md 앵커 그래프).
 * 가까움 = 아는 한자와 공유하는 부품 수. 같으면 자료에 나온 순서.
 * 결과: 후보 2개와 그 이유가 되는 공유 부품.
 */
export function nextCandidates(ctx: CardContext, justLit: string): { kanji: string; shared: string[]; koWord: string | null }[] {
  const known = new Set(ctx.known);
  known.add(justLit);
  const knownParts = new Set<string>();
  for (const n of ctx.nodes) if (known.has(n.key)) for (const p of n.meta.parts ?? []) knownParts.add(p);
  // 아는 한자 자체도 부품이 될 수 있다 (力을 알면 助·加)
  for (const k of known) knownParts.add(k);
  const cands = ctx.nodes
    .filter((n) => !known.has(n.key) && !ctx.landedKanji.includes(n.key))
    .map((n) => {
      const shared = [...new Set(n.meta.parts ?? [])].filter((p) => knownParts.has(p));
      return { kanji: n.key, shared, koWord: n.meta.ko_word ?? null, score: shared.length + (n.meta.ko_word ? 0.5 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return cands.slice(0, 2).map(({ kanji, shared, koWord }) => ({ kanji, shared, koWord }));
}

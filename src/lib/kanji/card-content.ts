import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { withoutUser } from "@/lib/db";
import { iGa, joinWaGwa } from "@/lib/ko";
import type { CardContent, KanjiNode } from "@/lib/db/kanji";

/**
 * 발견 카드 문안 (Scene1~5) 을 구한다. 순서:
 *  1. 손으로 적은 것 (db/seed/kanji-cards.json → nodes.meta.card)
 *  2. node_cards 캐시 (이전에 만든 것)
 *  3. Claude API 로 생성 → node_cards 에 저장
 *  4. API 키가 없거나 실패하면 사전 데이터 조합 (fallback). 캐시하지 않는다: 키가 생기면 다시 만들게.
 *
 * 외부 LLM 호출 원칙(CLAUDE.md): 사용자 자료는 보내지 않는다. 보내는 것은 공용 사전 데이터(한자·음독·한국 한자음·뜻·부품)뿐이다.
 * Anthropic API 는 기본적으로 API 입력을 학습에 쓰지 않는다 (소비자 제품과 다름).
 */

const MODEL = "claude-opus-5";

const CardSchema = z.object({
  hook: z.object({ word: z.string(), mark: z.string() }),
  parts_meaning: z.string(),
  question: z.string(),
  answer: z.string(),
  landing: z.array(z.object({ word: z.string(), reading: z.string(), ko: z.string() })),
  pattern: z.string(),
});

const SYSTEM = `너는 한국어 화자를 위한 일본어 한자 발견 카드의 문안을 만든다. 규칙:
- 사용자는 한국어 한자어의 "소리"를 이미 안다. 후킹(hook)은 그 사람이 이미 아는 한국어 한자어 하나(word)와 그 안에서 이 한자에 해당하는 음절(mark) 이다. 예: 協 → word "협력", mark "협". 주어진 ko_word 가 있으면 그것을 쓴다.
- parts_meaning: 부품(parts)의 뜻을 이어 한 구절로. 예: 十 + 力×3 → "열 사람의 힘". 부품 이름(훈)을 쓰되 설명하지 않는다.
- question: parts_meaning 에서 출발해 사용자가 먼저 뜻을 추측하게 하는 질문 한 줄. 정답을 말하지 않는다. 형식 "…이면\\n무슨 뜻이 될까?" (줄바꿈 한 번).
- answer: 이 한자의 뜻을 한국어 한 줄로 (5~12자). 문법·규칙 설명 금지.
- landing: 이 한자가 든, 한국어 화자가 이미 아는 한자어 2개. 일본어 표기(word), よみがな(reading, 히라가나), 한국어(ko). 첫 번째는 hook 의 단어. 한국어와 일본어가 같은 두 글자 조합만.
- pattern: 한국 한자음의 받침과 음독의 관계를 예 3개로 한 줄. 예: "ㅂ 받침은 장음 う로 끝나. 협 きょう, 십 じゅう, 업 ぎょう". 규칙 표가 아니라 예시 나열. 이 한자의 예를 첫 번째로.
- 모든 문장은 반말, 짧게. 이모지·마크다운 금지.`;

type Cached = { card: CardContent; source: string };

async function readCache(nodeId: string): Promise<Cached | null> {
  return withoutUser(async (tx) => {
    const { rows } = await tx.query<Cached>("SELECT card, source FROM node_cards WHERE node_id = $1", [nodeId]);
    return rows[0] ?? null;
  });
}

async function writeCache(nodeId: string, card: CardContent, model: string) {
  await withoutUser(async (tx) => {
    await tx.query(
      `INSERT INTO node_cards (node_id, card, source, model) VALUES ($1, $2, 'claude', $3)
       ON CONFLICT (node_id) DO UPDATE SET card = EXCLUDED.card, source = 'claude', model = EXCLUDED.model`,
      [nodeId, JSON.stringify(card), model],
    );
  });
}

function partsLine(node: KanjiNode, names: Map<string, string>): string {
  const counts = new Map<string, number>();
  for (const p of node.meta.parts ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()].map(([ch, n]) => `${ch}(${names.get(ch) ?? "이름 없음"})${n > 1 ? `×${n}` : ""}`).join(" + ");
}

/** 사전 데이터만으로 만든 문안. 후킹은 아는 단어가 있으면 그것, 없으면 한국 한자음만. */
export function fallbackContent(node: KanjiNode, names: Map<string, string>): CardContent {
  const m = node.meta;
  const sound = m.ko_sound ?? node.key;
  const word = m.ko_word ?? sound;
  const uniq = [...new Set(m.parts ?? [])];
  const partWords = uniq.map((p) => names.get(p)?.split(" ")[0] ?? p);
  // 이음말도 조사다. 앞말의 받침을 따른다 ("열과 힘", "나무와 힘") — src/lib/ko.ts 한 곳에서 고른다.
  const parts_meaning = partWords.length ? joinWaGwa(partWords) : `${node.key} 한 글자`;
  const landing = m.example && m.example_reading && m.ko_word ? [{ word: m.example, reading: m.example_reading, ko: m.ko_word }] : [];
  return {
    hook: { word, mark: sound },
    parts_meaning,
    question: partWords.length ? `${parts_meaning}${iGa(parts_meaning)} 모이면\n무슨 뜻이 될까?` : `이 모양이면\n무슨 뜻이 될까?`,
    answer: (m.meanings ?? []).slice(0, 2).join(", ") || node.key,
    landing,
    pattern: "",
  };
}

export async function getCardContent(node: KanjiNode, names: Map<string, string>): Promise<{ content: CardContent; source: "authored" | "claude" | "fallback" }> {
  if (node.meta.card) return { content: node.meta.card, source: "authored" };
  const cached = await readCache(node.id).catch(() => null);
  if (cached) return { content: cached.card, source: "claude" };

  if (!process.env.ANTHROPIC_API_KEY) return { content: fallbackContent(node, names), source: "fallback" };
  try {
    const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
    const m = node.meta;
    const user = [
      `한자: ${node.key}`,
      `음독: ${(m.on ?? []).join(", ") || "-"}`,
      `한국 한자음: ${m.ko_sound ?? "-"}`,
      `ko_word (이미 아는 한국어 한자어): ${m.ko_word ?? "없음 — 흔한 한자어를 하나 골라라"}`,
      `영어 뜻: ${(m.meanings ?? []).slice(0, 4).join(", ")}`,
      `부품: ${partsLine(node, names) || "없음(한 덩어리)"}`,
    ].join("\n");
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: zodOutputFormat(CardSchema) },
    });
    const parsed = res.parsed_output;
    if (!parsed) throw new Error("카드 문안 파싱 실패");
    await writeCache(node.id, parsed, MODEL).catch((e) => console.error("[card-content] 캐시 저장 실패", e));
    return { content: parsed, source: "claude" };
  } catch (e) {
    console.error("[card-content] 생성 실패, 사전 조합으로", e instanceof Error ? e.message : e);
    return { content: fallbackContent(node, names), source: "fallback" };
  }
}


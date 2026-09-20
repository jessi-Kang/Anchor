import { withoutUser, withUser } from "@/lib/db";

/**
 * 공용 한자 노드 (user_id IS NULL, lang 'ja', kind 'kanji') 와 사용자별 상태.
 * 노드 meta 는 scripts/seed.ts 가 kanji.json · kanji-ko.json · kanji-cards.json · ja-seed.json 에서 채운다.
 */

export type LandingWord = { word: string; reading: string; ko: string };
export type CardContent = {
  hook: { word: string; mark: string };
  parts_meaning: string;
  question: string;
  answer: string;
  landing: LandingWord[];
  pattern: string;
};

export type KanjiMeta = {
  on?: string[];
  kun?: string[];
  ko_sound?: string | null;
  /** 이미 아는 한국어 한자어 (앵커). 없으면 "발판 없음" */
  ko_word?: string;
  meanings?: string[];
  parts?: string[];
  grade?: number;
  freq?: number | null;
  card?: CardContent;
  example?: string;
  example_reading?: string;
  pattern?: string;
};

export type KanjiNode = {
  id: string;
  key: string;
  display: string;
  reading: string | null;
  meta: KanjiMeta;
};

/**
 * `source` 가 "이 상태가 어디서 왔는지" 를 지고 있다. 화면이 「아는 것」이라고 부르거나 이유 한 줄의
 * 주어로 쓸 수 있는 것은 **사용자가 판정한 것뿐**이다 (docs/FLOW.md 4장):
 *  - `input`  F03 에서 알아/몰라를 골랐다
 *  - `card`   카드를 끝까지 풀어 맞혔다
 * 나머지(`inferred` 등)는 순서를 정하는 데만 쓰고 이름을 부르지 않는다.
 */
export type StateSource = "default" | "onboarding" | "card" | "input" | "talk" | "inferred";
export type KanjiState = { knows_meaning: boolean; knows_sound: boolean; can_say: boolean; confidence: number; source: StateSource };

/** 이 상태가 사용자의 판정에서 온 것인가. 「아는 것」·이유 한 줄의 주어는 이걸 통과해야 한다. */
export function isJudged(st: KanjiState | undefined): boolean {
  return st?.source === "input" || st?.source === "card";
}

export async function getKanjiNodes(chars: string[]): Promise<Map<string, KanjiNode>> {
  if (chars.length === 0) return new Map();
  return withoutUser(async (tx) => {
    const { rows } = await tx.query<KanjiNode>(
      `SELECT id, key, display, reading, meta FROM nodes
       WHERE user_id IS NULL AND lang = 'ja' AND kind = 'kanji' AND key = ANY($1::text[])`,
      [chars],
    );
    return new Map(rows.map((r) => [r.key, r]));
  });
}

export async function getKanjiNodeById(id: string): Promise<KanjiNode | null> {
  return withoutUser(async (tx) => {
    const { rows } = await tx.query<KanjiNode>(
      "SELECT id, key, display, reading, meta FROM nodes WHERE user_id IS NULL AND lang = 'ja' AND kind = 'kanji' AND id = $1",
      [id],
    );
    return rows[0] ?? null;
  });
}

/** 부품 이름 ("열 십"). radical 노드의 display. */
export async function getPartNames(chars: string[]): Promise<Map<string, string>> {
  if (chars.length === 0) return new Map();
  return withoutUser(async (tx) => {
    const { rows } = await tx.query<{ key: string; name: string | null }>(
      `SELECT key, meta->>'ko_name' AS name FROM nodes
       WHERE user_id IS NULL AND lang = 'ja' AND kind = 'radical' AND key = ANY($1::text[])`,
      [chars],
    );
    return new Map(rows.filter((r) => r.name).map((r) => [r.key, r.name as string]));
  });
}

export async function getKanjiStates(userId: string, nodeIds: string[]): Promise<Map<string, KanjiState>> {
  if (nodeIds.length === 0) return new Map();
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<KanjiState & { node_id: string }>(
      "SELECT node_id, knows_meaning, knows_sound, can_say, confidence, source FROM user_node_state WHERE user_id = $1 AND node_id = ANY($2::uuid[])",
      [userId, nodeIds],
    );
    return new Map(rows.map((r) => [r.node_id, r]));
  });
}

/**
 * F03 "알아 / 몰라". 실제 자료의 실제 항목에 대한 판정이라 source 는 'input'.
 * knows_sound 는 true: 한국어 화자면 한자어 소리는 이미 안다(SPEC 6.5). "협력은 아는데 協은 모른다" = knows_meaning false.
 * 카드로 이미 켜진(source 'card') 한자를 "몰라"로 되돌리지는 않는다.
 */
export function judgeKanji(userId: string, nodeId: string, knows: boolean) {
  return withUser(userId, async (tx) => {
    await tx.query(
      `INSERT INTO user_node_state (user_id, node_id, knows_sound, knows_meaning, can_say, confidence, source)
       VALUES ($1, $2, true, $3, false, $4, 'input')
       ON CONFLICT (user_id, node_id) DO UPDATE
         SET knows_meaning = EXCLUDED.knows_meaning, confidence = EXCLUDED.confidence, source = 'input'
         WHERE user_node_state.source <> 'card'`,
      [userId, nodeId, knows, knows ? 0.7 : 0.2],
    );
  });
}

/** 카드를 마치면 켜진다: knows_meaning true, source 'card'. 추측이 맞았으면 확신 0.9, 아니면 0.6. */
export function lightUp(userId: string, nodeId: string, guessCorrect: boolean | null) {
  return withUser(userId, async (tx) => {
    await tx.query(
      `INSERT INTO user_node_state (user_id, node_id, knows_sound, knows_meaning, can_say, confidence, source)
       VALUES ($1, $2, true, true, false, $3, 'card')
       ON CONFLICT (user_id, node_id) DO UPDATE
         SET knows_meaning = true, confidence = EXCLUDED.confidence, source = 'card'`,
      [userId, nodeId, guessCorrect ? 0.9 : 0.6],
    );
  });
}

/** 말해봤다: can_say true (F10) */
export function markSaid(userId: string, nodeId: string) {
  return withUser(userId, async (tx) => {
    await tx.query("UPDATE user_node_state SET can_say = true WHERE user_id = $1 AND node_id = $2", [userId, nodeId]);
  });
}

/** 이 사용자가 아는(knows_meaning) 한자 글자들 */
export async function knownKanji(userId: string): Promise<Set<string>> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ key: string }>(
      `SELECT n.key FROM user_node_state s JOIN nodes n ON n.id = s.node_id
       WHERE s.user_id = $1 AND s.knows_meaning AND n.user_id IS NULL AND n.lang = 'ja' AND n.kind = 'kanji'`,
      [userId],
    );
    return new Set(rows.map((r) => r.key));
  });
}

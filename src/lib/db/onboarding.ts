import { withUser } from "@/lib/db";

/**
 * 온보딩 데이터 (O02~O04). 수준을 묻지 않는다. 기록하는 것은 전부 "상황"과 "행동"이다.
 *  - purposes: 언어별로 고른 상황 (O02). 상황이 하나라도 있으면 그 언어가 "켜진" 것.
 *  - kana: 가나 6개 마이크 인식 결과 (O03, 일본어를 켰을 때만)
 *  - seed: 영어 씨앗 카드 판정 → user_node_state (O04, 영어·스페인어를 켰을 때만)
 * 언어는 세트가 아니라 하나씩 켠다. 어느 단계가 남았는지는 src/lib/onboarding-flow.ts 가 정한다.
 */

export type Lang3 = "en" | "ja" | "es";
export type Purposes = Record<Lang3, string[]>;
export type KanaResult = { recognized: number; total: number; passed: boolean; checked_at: string; supported: boolean };

export type UserSettings = {
  purposes?: Purposes;
  kana?: KanaResult;
  /** 가나를 못 읽어 가나 모듈(v2)로 분기해야 하는 사용자 */
  kana_module?: boolean;
  /** 씨앗 단계를 끝냈거나 "여기까지"로 넘긴 시각 */
  seed?: { finished_at: string };
};

export async function getSettings(userId: string): Promise<{ settings: UserSettings; onboarded_at: string | null }> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ settings: UserSettings; onboarded_at: string | null }>(
      "SELECT settings, onboarded_at FROM users WHERE id = $1",
      [userId],
    );
    return rows[0] ?? { settings: {}, onboarded_at: null };
  });
}

/** 온보딩 흐름 판단에 필요한 것 한 번에: 설정 + 완료 시각 + 씨앗 판정 유무 */
export async function getOnboardingState(userId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ settings: UserSettings; onboarded_at: string | null }>(
      "SELECT settings, onboarded_at FROM users WHERE id = $1",
      [userId],
    );
    const { rows: seed } = await tx.query<{ n: string }>(
      `SELECT count(*) AS n FROM user_node_state s JOIN nodes n ON n.id = s.node_id
       WHERE s.user_id = $1 AND s.source = 'onboarding' AND n.meta->>'seed' = 'en-onboarding'`,
      [userId],
    );
    const row = rows[0] ?? { settings: {}, onboarded_at: null };
    return { settings: row.settings ?? {}, onboarded_at: row.onboarded_at, seedJudged: Number(seed[0]?.n ?? 0) > 0 };
  });
}

async function mergeSettings(userId: string, patch: UserSettings) {
  return withUser(userId, async (tx) => {
    await tx.query("UPDATE users SET settings = settings || $2::jsonb WHERE id = $1", [userId, JSON.stringify(patch)]);
  });
}

export function savePurposes(userId: string, purposes: Purposes) {
  return mergeSettings(userId, { purposes });
}

export function saveKanaResult(userId: string, kana: KanaResult, kanaModule: boolean) {
  return mergeSettings(userId, { kana, kana_module: kanaModule });
}

export function markSeedFinished(userId: string) {
  return mergeSettings(userId, { seed: { finished_at: new Date().toISOString() } });
}

export function finishOnboarding(userId: string) {
  return withUser(userId, async (tx) => {
    await tx.query("UPDATE users SET onboarded_at = coalesce(onboarded_at, now()) WHERE id = $1", [userId]);
  });
}

export type SeedNode = { id: string; key: string; display: string; definition: string; example: string };

/** 씨앗 40장 (공용 노드) + 이 사용자가 이미 판정한 것 */
export async function getSeedDeck(userId: string): Promise<{ deck: SeedNode[]; judged: Record<string, boolean> }> {
  return withUser(userId, async (tx) => {
    const { rows: deck } = await tx.query<SeedNode>(
      `SELECT id, key, display, meta->>'definition' AS definition, meta->>'example' AS example
       FROM nodes
       WHERE user_id IS NULL AND lang = 'en' AND meta->>'seed' = 'en-onboarding'
       ORDER BY (meta->>'seed_order')::int`,
    );
    const { rows: states } = await tx.query<{ node_id: string; knows_meaning: boolean }>(
      `SELECT s.node_id, s.knows_meaning
       FROM user_node_state s JOIN nodes n ON n.id = s.node_id
       WHERE s.user_id = $1 AND s.source = 'onboarding' AND n.meta->>'seed' = 'en-onboarding'`,
      [userId],
    );
    const judged: Record<string, boolean> = {};
    for (const s of states) judged[s.node_id] = s.knows_meaning;
    return { deck, judged };
  });
}

/**
 * "떠올랐어 / 안 떠올랐어" 기록. 정답을 본 뒤 판정하므로 자기 보고가 아니다.
 * 떠올랐으면 knows_meaning=true, confidence 0.8. 아니면 false, 0.2.
 * knows_sound 는 영어 화자가 아니어도 읽을 수 있으니 true 로 둔다. can_say 는 사운드 루프가 정한다.
 */
export function recordSeedJudgement(userId: string, nodeId: string, recalled: boolean) {
  return withUser(userId, async (tx) => {
    await tx.query(
      `INSERT INTO user_node_state (user_id, node_id, knows_sound, knows_meaning, can_say, confidence, source)
       VALUES ($1, $2, true, $3, false, $4, 'onboarding')
       ON CONFLICT (user_id, node_id) DO UPDATE
         SET knows_meaning = EXCLUDED.knows_meaning, confidence = EXCLUDED.confidence, source = 'onboarding'`,
      [userId, nodeId, recalled, recalled ? 0.8 : 0.2],
    );
  });
}

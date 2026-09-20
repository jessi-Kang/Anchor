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
  /** 영어 씨앗 단계를 끝냈거나 "여기까지"로 넘긴 시각 */
  seed?: { finished_at: string };
  /** 일본어 한자 씨앗 단계를 끝냈거나 넘긴 시각 */
  kanji?: { finished_at: string };
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

export function markStepFinished(userId: string, step: "seed" | "kanji") {
  return mergeSettings(userId, { [step]: { finished_at: new Date().toISOString() } });
}

export function finishOnboarding(userId: string) {
  return withUser(userId, async (tx) => {
    await tx.query("UPDATE users SET onboarded_at = coalesce(onboarded_at, now()) WHERE id = $1", [userId]);
  });
}

/** 씨앗 카드 한 장. 앞면은 display, 뒤집으면 main(+ ruby 예시, sub, anchor). 언어별 채우는 법은 getSeedDeck 참고. */
export type SeedNode = {
  id: string;
  display: string;
  lang: "en" | "ja";
  /** 뒤집었을 때 첫 줄: 영어는 쉬운 정의, 일본어는 음독 */
  main: string;
  /** 둘째 줄: 영어는 예문, 스페인어를 켰으면 스페인어 대응이 여기 붙는다 */
  sub?: string;
  /** 일본어 예시 단어 (よみがな 필수) */
  ruby?: { base: string; rt: string };
  /** 한국어 앵커 한 줄 ("협력의 협"). 설명이 아니라 이미 아는 소리를 부르는 용도 */
  anchor?: string;
};

export type SeedTag = "en-onboarding" | "ja-onboarding";

type SeedRow = { id: string; display: string; reading: string | null; meta: Record<string, string | undefined> };

/**
 * 씨앗 40장 (공용 노드) + 이 사용자가 이미 판정한 것.
 *  - en-onboarding: 어근·덩어리. showEs 면 뒤집었을 때 스페인어 대응을 함께 보인다.
 *  - ja-onboarding: 한자. 뒤집으면 음독 + 예시 단어(よみがな) + 한국어 한자어 앵커.
 */
export async function getSeedDeck(
  userId: string,
  tag: SeedTag,
  opts: { showEs?: boolean } = {},
): Promise<{ deck: SeedNode[]; judged: Record<string, boolean> }> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<SeedRow>(
      `SELECT id, display, reading, meta FROM nodes
       WHERE user_id IS NULL AND meta->>'seed' = $1
       ORDER BY (meta->>'seed_order')::int`,
      [tag],
    );
    const deck: SeedNode[] = rows.map((r) =>
      tag === "ja-onboarding"
        ? {
            id: r.id,
            display: r.display,
            lang: "ja",
            main: r.reading ?? "",
            ruby: r.meta.example && r.meta.example_reading ? { base: r.meta.example, rt: r.meta.example_reading } : undefined,
            anchor: r.meta.ko_word && r.meta.ko_sound ? `${r.meta.ko_word}의 ${r.meta.ko_sound}` : undefined,
          }
        : {
            id: r.id,
            display: r.display,
            lang: "en",
            main: r.meta.definition ?? "",
            sub: r.meta.example,
            anchor: opts.showEs && r.meta.es ? `es · ${r.meta.es}` : undefined,
          },
    );
    const { rows: states } = await tx.query<{ node_id: string; knows_meaning: boolean }>(
      `SELECT s.node_id, s.knows_meaning
       FROM user_node_state s JOIN nodes n ON n.id = s.node_id
       WHERE s.user_id = $1 AND s.source = 'onboarding' AND n.meta->>'seed' = $2`,
      [userId, tag],
    );
    const judged: Record<string, boolean> = {};
    for (const s of states) judged[s.node_id] = s.knows_meaning;
    return { deck, judged };
  });
}

/**
 * "떠올랐어 / 안 떠올랐어" 기록. 정답을 본 뒤 판정하므로 자기 보고가 아니다.
 * 떠올랐으면 knows_meaning=true, confidence 0.8. 아니면 false, 0.2.
 * knows_sound: 영어 부품은 읽을 수 있으니 true. 한자는 한국어 한자어 소리를 아는 것이므로 떠올랐을 때만 true
 * ("협력은 아는데 協은 모른다"가 knows_sound=true, knows_meaning=false 로 남아야 한다). can_say 는 사운드 루프가 정한다.
 */
export function recordSeedJudgement(userId: string, nodeId: string, recalled: boolean, lang: "en" | "ja" = "en") {
  return withUser(userId, async (tx) => {
    await tx.query(
      `INSERT INTO user_node_state (user_id, node_id, knows_sound, knows_meaning, can_say, confidence, source)
       VALUES ($1, $2, $5, $3, false, $4, 'onboarding')
       ON CONFLICT (user_id, node_id) DO UPDATE
         SET knows_sound = EXCLUDED.knows_sound, knows_meaning = EXCLUDED.knows_meaning, confidence = EXCLUDED.confidence, source = 'onboarding'`,
      [userId, nodeId, recalled, recalled ? 0.8 : 0.2, lang === "en" ? true : recalled],
    );
  });
}

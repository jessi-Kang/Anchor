import { withUser } from "@/lib/db";
import type { CardContent } from "@/lib/db/kanji";

/**
 * 발견 카드 (cards). 한자 1개 = 카드 1장. payload 는 만들 때 굳힌다 (문안이 나중에 바뀌어도 이 카드는 그대로).
 * 추측(guess_at)은 항상 정답(revealed_at)보다 먼저 — DB 제약과 saveGuess/reveal 순서로 지킨다.
 */

export type CardPart = { ch: string; name: string | null; count: number };
export type CardPayload = CardContent & {
  kanji: string;
  /** 음독 (きょう) */
  reading: string;
  /**
   * **발판: 이 한자의 한국 한자음 한 글자**(協 → "협"). 카드가 서려면 이것 하나는 있어야 해서
   * `string | null` 이 아니다 — 없으면 카드를 안 만든다 (`app/inputs/[id]/actions.ts`).
   * 원칙 2 가 "사용자의 것" 이라고 보장한 값이라, 앱이 고른 것이 아니다.
   */
  sound: string;
  /**
   * **부를 낱말**(協 → "협력"). 2,136자 중 656자에만 있다. 없으면 `null` 이고, 그때 카드는
   * 소리 하나로 선다 — **낱말을 지어내지 않는다.** F03 이 "부를 낱말이 아직 없어" 라고 한
   * 글자에 다음 화면이 낱말을 대면 그 화면이 거짓이 된다 (design/SCREENS.md, docs/FLOW.md 97).
   * 사전(`nodes.meta.ko_word`)에서만 온다. 문안 생성이 고른 낱말은 쓰지 않는다.
   */
  anchor: string | null;
  parts: CardPart[];
  /**
   * 출처: 자료 문장과 그 한자가 든 단어 (F04).
   * readings 는 문장의 한자 덩어리마다 붙는 よみがな 로, `kanjiRuns(sentence)` 와 길이·순서가 같다.
   * 없으면(키 없음·생성 실패·개수 불일치) 그 문장은 ruby 없이 나온다.
   */
  source: { sentence: string; word: string; readings?: string[] } | null;
  /**
   * 문안 출처: 손으로 적음 / Claude.
   *
   * `"fallback"`(사전 조합)은 **옛 행만 갖는다.** 지금은 못 만들면 카드를 아예 안 연다
   * (`lib/kanji/card-content.ts`). 이미 저장된 카드를 읽으려면 유니온에 남아 있어야 하고,
   * 남아 있어야 `pnpm fallbacks` 가 "그때 몇 장이 그렇게 만들어졌나" 를 셀 수 있다.
   */
  content_source: "authored" | "claude" | "fallback";
};

export type CardRow = {
  id: string;
  node_id: string;
  input_id: string | null;
  payload: CardPayload;
  guess: string | null;
  guess_at: string | null;
  skipped_at: string | null;
  guess_correct: boolean | null;
  revealed_at: string | null;
  landed_at: string | null;
  created_at: string;
};

export async function findOpenCard(userId: string, nodeId: string, inputId: string | null): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM cards WHERE user_id = $1 AND node_id = $2 AND ($3::uuid IS NULL OR input_id = $3) AND landed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId, nodeId, inputId],
    );
    return rows[0]?.id ?? null;
  });
}

export async function createCard(userId: string, nodeId: string, inputId: string | null, payload: CardPayload): Promise<string> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO cards (user_id, kind, lang, node_id, input_id, payload) VALUES ($1, 'discover', 'ja', $2, $3, $4) RETURNING id`,
      [userId, nodeId, inputId, JSON.stringify(payload)],
    );
    return rows[0].id;
  });
}

/**
 * 옛 payload 를 지금 모양으로 읽는다. **payload 는 만들 때 굳히므로 고쳐 쓰지 않고 읽을 때 맞춘다.**
 *
 * `sound`·`anchor` 로 가르기 전에 만든 카드는 `hook: { word, mark }` 하나를 지고 있다. `mark` 는
 * 언제나 한국 한자음이고 `word` 는 그때 그 카드가 실제로 띄운 낱말이라, 그대로 옮긴다 — 그 카드가
 * 보여 준 것을 지금 와서 바꾸면 굳힌 이유가 없어진다. 새 카드부터 사전만 보고 채워진다.
 */
type LegacyPayload = Omit<CardPayload, "sound" | "anchor"> & { hook?: { word: string; mark: string } };

export function cardPayload(raw: CardPayload | LegacyPayload): CardPayload {
  if ("sound" in raw && raw.sound) return raw as CardPayload;
  const hook = (raw as LegacyPayload).hook;
  return { ...(raw as LegacyPayload), sound: hook?.mark ?? "", anchor: hook?.word ?? null };
}

export async function getCard(userId: string, id: string): Promise<CardRow | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<CardRow>(
      `SELECT id, node_id, input_id, payload, guess, guess_at, skipped_at, guess_correct, revealed_at, landed_at, created_at
       FROM cards WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    const row = rows[0];
    return row ? { ...row, payload: cardPayload(row.payload) } : null;
  });
}

/** Scene3: 추측 저장. 빈 추측은 건너뛴 것(skipped_at). 이미 정답을 봤으면 바꾸지 않는다. */
export function saveGuess(userId: string, id: string, guess: string) {
  const g = guess.trim();
  return withUser(userId, async (tx) => {
    if (g) {
      await tx.query(
        `UPDATE cards SET guess = $3, guess_at = coalesce(guess_at, now()) WHERE user_id = $1 AND id = $2 AND revealed_at IS NULL`,
        [userId, id, g],
      );
    } else {
      await tx.query(`UPDATE cards SET skipped_at = coalesce(skipped_at, now()) WHERE user_id = $1 AND id = $2 AND revealed_at IS NULL`, [userId, id]);
    }
  });
}

/** Scene4: 정답을 봤다. 추측 판정도 같이 기록. */
export function reveal(userId: string, id: string, guessCorrect: boolean | null) {
  return withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE cards SET revealed_at = coalesce(revealed_at, now()), guess_correct = coalesce(guess_correct, $3)
       WHERE user_id = $1 AND id = $2 AND (guess_at IS NOT NULL OR skipped_at IS NOT NULL)`,
      [userId, id, guessCorrect],
    );
  });
}

/** Scene5 를 지나 착지했다 (F10/F11 로). */
export function land(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    await tx.query("UPDATE cards SET landed_at = coalesce(landed_at, now()) WHERE user_id = $1 AND id = $2", [userId, id]);
  });
}

/** 이 자료에서 만든 카드 수 / 착지한 카드 수 (홈 행의 "남은 카드") */
export async function cardCountsByInput(userId: string): Promise<Map<string, { made: number; landed: number }>> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ input_id: string; made: string; landed: string }>(
      `SELECT input_id, count(*)::text AS made, count(landed_at)::text AS landed FROM cards
       WHERE user_id = $1 AND input_id IS NOT NULL GROUP BY input_id`,
      [userId],
    );
    return new Map(rows.map((r) => [r.input_id, { made: Number(r.made), landed: Number(r.landed) }]));
  });
}

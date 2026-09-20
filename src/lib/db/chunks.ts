import { withUser } from "@/lib/db";
import type { Lang3 } from "@/lib/db/settings";

/**
 * 대화 덩어리 (chunks). "오늘 못 한 말" 한 줄 = 행 하나.
 * situation 은 사용자가 쓴 한국어 한 줄(후킹은 항상 상황, docs/SPEC.md 5장),
 * text 는 그 상황에서 쓸 영어 문장, meta.chunk 는 그 안에서 소리로 연습할 덩어리다.
 */

export type ChunkMeta = {
  /** text 안에서 강조·연습할 덩어리 ("push this to") */
  chunk?: string;
  /** 문안 출처 */
  content_source?: "claude" | "fallback";
  /**
   * F17 에서 사용자가 쓴 영어 추측, **쓴 그대로**.
   * 데이터 원칙이 "추측 한 번도 유실 없음" 이고, "지난번엔 이렇게 말하려 했지" 가 재만남(원칙 4)의 재료다.
   * **판정 결과는 없다** — 채점을 안 하니 남길 값이 없고, 남기면 언젠가 화면에 뜬다 (docs/FLOW.md 4장).
   */
  guess?: string;
};

export type ChunkRow = {
  id: string;
  lang: Lang3;
  situation: string;
  text: string;
  attitude: string | null;
  meta: ChunkMeta;
  created_at: string;
};

/**
 * `text` 가 빈 문자열이면 **영어 문장을 아직 안 만든 것**이다 (F13 → F17 사이).
 * 추측 화면(F17)이 열려 있는 동안 답이 DB 에도 없어야 새어 나갈 자리가 아예 없다.
 */
export function hasEnglish(row: Pick<ChunkRow, "text">): boolean {
  return row.text.trim().length > 0;
}

export async function createChunk(
  userId: string,
  v: { lang: Lang3; situation: string; text: string; attitude: string | null; meta: ChunkMeta },
): Promise<string> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO chunks (user_id, lang, situation, text, attitude, meta)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, v.lang, v.situation, v.text, v.attitude, JSON.stringify(v.meta)],
    );
    return rows[0].id;
  });
}

export async function getChunk(userId: string, id: string): Promise<ChunkRow | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<ChunkRow>(
      "SELECT id, lang, situation, text, attitude, meta, created_at FROM chunks WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    return rows[0] ?? null;
  });
}

/**
 * F17 이 쓰는 조회. 추측 화면은 situation 말고 아무것도 안 읽는다 — 행 전체를 가져오면 나중에
 * 붙는 것이 그 화면의 렌더 트리로 딸려 들어온다 (답이 새는 자리).
 *
 * `done` 은 "이미 지났다"만 알려 주는 **불리언**이다. 추측도 영어 문장도 값이 아니라 있는지 없는지로만
 * 나온다 — 그래야 이 화면이 지나간 추측을 다시 채워 보여 줄 수도, 영어가 새어 나올 수도 없다.
 */
export async function getSituation(userId: string, id: string): Promise<{ situation: string; done: boolean } | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ situation: string; done: boolean }>(
      `SELECT situation, (meta ? 'guess' OR btrim(text) <> '') AS done FROM chunks WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return rows[0] ?? null;
  });
}

/** 홈의 "못 한 말" 행이 쓰는 개수. */
export async function countChunks(userId: string, lang: Lang3 = "en"): Promise<number> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ n: string }>("SELECT count(*)::text AS n FROM chunks WHERE user_id = $1 AND lang = $2", [
      userId,
      lang,
    ]);
    return Number(rows[0]?.n ?? 0);
  });
}

/**
 * F17 "이제 확인": 추측을 저장하고 그때 만든 영어 문장을 채운다. 한 트랜잭션에서 같이 쓴다 —
 * 추측만 저장되고 문장이 안 들어가면 F14 가 또 추측 화면으로 되돌린다.
 * 이미 문장이 있으면(뒤로 가기로 F17 을 다시 지나온 경우) 덮어쓰지 않는다. 같은 상황에 매번 다른
 * 영어가 나오면 "그때 그 말" 이 아니게 된다.
 */
export async function saveGuessAndEnglish(
  userId: string,
  id: string,
  guess: string,
  english: { text: string; attitude: string | null; chunk: string; source: "claude" | "fallback" },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE chunks
          SET text = CASE WHEN btrim(text) = '' THEN $4::text ELSE text END,
              attitude = coalesce(attitude, $5),
              meta = meta
                   || jsonb_build_object('guess', $3::text)
                   || CASE WHEN btrim(text) = ''
                           THEN jsonb_build_object('chunk', $6::text, 'content_source', $7::text)
                           ELSE '{}'::jsonb END
        WHERE user_id = $1 AND id = $2`,
      [userId, id, guess, english.text, english.attitude, english.chunk, english.source],
    );
  });
}

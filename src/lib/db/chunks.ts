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

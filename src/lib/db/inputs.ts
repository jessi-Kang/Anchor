import { withUser } from "@/lib/db";
import type { Lang3 } from "@/lib/db/settings";

/** 붙여넣은 자료 (inputs). 모든 쿼리는 withUser 안 (RLS). */

export type InputRow = {
  id: string;
  lang: Lang3;
  title: string | null;
  body: string;
  created_at: string;
  extracted_at: string | null;
  meta: { example?: boolean; kanji?: string[] };
};

/** 제목이 없으면 첫 줄 앞 20자 */
function titleOf(body: string): string {
  const first = body.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  return first.length > 20 ? `${first.slice(0, 20)}…` : first;
}

export async function createInput(userId: string, lang: Lang3, body: string, opts: { title?: string; example?: boolean } = {}) {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("빈 자료");
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO inputs (user_id, kind, lang, title, body, meta)
       VALUES ($1, 'paste', $2, $3, $4, $5)
       RETURNING id`,
      [userId, lang, opts.title ?? titleOf(text), text, JSON.stringify(opts.example ? { example: true } : {})],
    );
    return rows[0].id;
  });
}

export async function getInput(userId: string, id: string): Promise<InputRow | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<InputRow>(
      "SELECT id, lang, title, body, created_at, extracted_at, meta FROM inputs WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    return rows[0] ?? null;
  });
}

/** 이 언어로 넣은 자료가 있는가 (첫 방문 판단: 없으면 예시 자료 행을 보인다) */
export async function hasInputs(userId: string, lang: Lang3): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ n: string }>("SELECT count(*)::text AS n FROM inputs WHERE user_id = $1 AND lang = $2", [userId, lang]);
    return Number(rows[0]?.n ?? 0) > 0;
  });
}

export async function listInputs(userId: string, limit = 20): Promise<InputRow[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<InputRow>(
      "SELECT id, lang, title, body, created_at, extracted_at, meta FROM inputs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [userId, limit],
    );
    return rows;
  });
}

/** F03 을 처음 열 때: 뽑은 한자 목록과 시각을 기록한다 (홈 행의 "한자 n개"). */
export function markExtracted(userId: string, id: string, kanji: string[]) {
  return withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE inputs SET extracted_at = coalesce(extracted_at, now()), meta = meta || jsonb_build_object('kanji', $3::jsonb)
       WHERE user_id = $1 AND id = $2`,
      [userId, id, JSON.stringify(kanji)],
    );
  });
}

import { withUser } from "@/lib/db";

/**
 * 하루 끝(F15)이 세는 것. **"오늘" 은 한국 시각의 하루다** — 사용자가 사는 날짜로 세야
 * "오늘 켜진 것" 이 맞는 말이 된다. UTC 로 세면 한국 시각 아침 9시 전이 어제로 잡힌다.
 *
 * 세는 것은 **일어난 일**이지 화면 상태가 아니다. 다시 열어도 같은 수가 나온다.
 */

const KST = "Asia/Seoul";

/** 오늘 카드를 끝내 켜진 한자 (나온 순서). */
export async function litToday(userId: string): Promise<string[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ key: string }>(
      `SELECT n.key FROM cards c JOIN nodes n ON n.id = c.node_id
        WHERE c.user_id = $1 AND c.landed_at IS NOT NULL
          AND (c.landed_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
        ORDER BY c.landed_at`,
      [userId, KST],
    );
    return rows.map((r) => r.key);
  });
}

/** 오늘 소리 내어 말해 본 덩어리 (나온 순서). 녹음이 한 번이라도 있으면 말해 본 것이다. */
export async function spokenToday(userId: string): Promise<string[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ text: string }>(
      `SELECT DISTINCT ON (ch.id) coalesce(ch.meta->>'chunk', ch.text) AS text
         FROM recordings r JOIN chunks ch ON ch.id = r.chunk_id
        WHERE r.user_id = $1
          AND (r.created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
        ORDER BY ch.id, r.created_at`,
      [userId, KST],
    );
    return rows.map((r) => r.text);
  });
}

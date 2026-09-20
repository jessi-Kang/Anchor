import { withUser } from "@/lib/db";

/**
 * 녹음(recordings) 조회. 지금 쓰는 것은 회차 하나다.
 *
 * 회차는 화면 상태가 아니라 쌓인 사실이다. 화면을 다시 열면 0 부터 세는 것은 틀린 값이고,
 * "같은 덩어리 5회차 곡선 일치도가 오르는가"(docs/SPEC.md 9장)를 잴 수 없게 만든다.
 * 그래서 F10·F14 는 들어올 때 이 값을 읽어 범례의 시작 회차로 쓴다 (docs/FLOW.md 1′장).
 */
export async function countRecordings(userId: string, target: { card: string } | { chunk: string }): Promise<number> {
  const column = "card" in target ? "card_id" : "chunk_id";
  const id = "card" in target ? target.card : target.chunk;
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM recordings WHERE user_id = $1 AND ${column} = $2`,
      [userId, id],
    );
    return Number(rows[0]?.n ?? 0);
  });
}

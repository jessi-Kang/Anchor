import { withUser } from "@/lib/db";

/**
 * 녹음(recordings) 조회.
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

/** 브라우저가 뽑아 저장해 둔 피치 한 점. `pitch` 는 이 모양의 배열이다. */
export type PitchPoint = { t: number; f0: number };

/**
 * 마지막 회차의 피치 곡선. 화면을 다시 열었을 때 **범례가 말하는 그 회차의 곡선**이다.
 *
 * 회차와 같은 이유로 읽는다: 곡선도 화면 상태가 아니라 쌓인 사실이다. 회차만 이어서 세고 곡선은
 * 두고 오면, 화면을 다시 연 사람의 첫 녹음은 겹칠 상대가 없어 "내 소리끼리 겹쳐 봐" 가 빈말이 된다.
 * 값은 `recordings.pitch` 에 이미 있다 — 안 읽고 있었을 뿐이다.
 *
 * 원어민 음성이 있든 없든 읽는다. 겹칠 상대(원어민 / 지난번)를 고르는 것은 화면의 몫이고,
 * 이 값은 "내가 마지막으로 낸 소리" 하나다.
 */
export async function lastPitch(userId: string, target: { card: string } | { chunk: string }): Promise<PitchPoint[] | null> {
  const column = "card" in target ? "card_id" : "chunk_id";
  const id = "card" in target ? target.card : target.chunk;
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ pitch: PitchPoint[] }>(
      `SELECT pitch FROM recordings WHERE user_id = $1 AND ${column} = $2 ORDER BY created_at DESC LIMIT 1`,
      [userId, id],
    );
    const pitch = rows[0]?.pitch;
    return Array.isArray(pitch) && pitch.length ? pitch : null;
  });
}

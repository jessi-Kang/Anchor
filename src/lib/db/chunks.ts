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
  /**
   * 문안 출처. **곡선 집계가 이 값으로 행을 가른다** (`scripts/measure.ts`).
   *  claude   — Claude 가 만든 영어
   *  authored — 손으로 적었거나 시드가 넣은 영어. 시드가 `claude` 를 쓰면 합성 문안과 진짜
   *             생성 문안을 못 가른다. 카드 쪽이 이미 쓰는 값이라 새 어휘가 아니다.
   *  fallback — 영어를 못 만들어 **사용자가 쓴 한국어가 그대로** 들어간 행. 그 덩어리는 영어
   *             목소리가 한국어를 읽은 소리를 기준선으로 갖게 되어 거리에 뜻이 없다.
   * optional 이라 **값이 아예 없는 행이 있다.** 그래서 세는 쪽은 "fallback 을 뺀다" 가 아니라
   * "claude·authored 만 넣는다" 로 거른다 — 빼는 목록은 값 없는 행을 조용히 통과시킨다.
   */
  content_source?: "claude" | "authored" | "fallback";
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

/**
 * 홈의 "못 한 말" 행이 쓰는 개수. **영어 문장이 있는 것만 센다.**
 *
 * 이 수가 홈 행을 F18(목록)로 보낼지 F13(쓰기)으로 보낼지 가른다. 행 전체를 세면 F13 에서 한 줄
 * 쓰고 F17 에서 그만둔 사람이 **빈 목록으로 떨어진다** — 그 행은 F18 이 안 내기 때문이다.
 * 세는 조건과 목록에 내는 조건이 같아야 한다.
 */
export async function countChunks(userId: string, lang: Lang3 = "en"): Promise<number> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM chunks WHERE user_id = $1 AND lang = $2 AND btrim(text) <> ''",
      [userId, lang],
    );
    return Number(rows[0]?.n ?? 0);
  });
}

export type PastChunk = { id: string; situation: string; chunk: string };

/**
 * F18 목록. **마지막으로 말한 지 오래된 것이 위다** (`docs/FLOW.md` 1′장 F18 행).
 *
 * 최근 순으로 세우면 오늘 말한 것만 또 말하게 되어 **회차가 안 쌓인다** — 같은 덩어리 5회차
 * 곡선 일치도가 통과 기준이라(`docs/SPEC.md` 9장) 이 줄 세우기가 측정의 전제다.
 *
 * **한 번도 말 안 한 것이 맨 위다.** `NULLS FIRST` 를 명시하는 이유는 ASC 기본이 NULLS LAST 라,
 * 안 적으면 한 번도 안 말한 것이 **맨 뒤로** 가기 때문이다 — 규칙이 정확히 뒤집힌다.
 *
 * **영어 문장이 없는 행은 안 낸다.** F13 과 F17 사이에서 멈춘 것이라, 목록에 띄우면 추측을
 * 건너뛰고 답 없는 F14 로 들어간다.
 */
export async function pastChunks(userId: string, lang: Lang3 = "en"): Promise<PastChunk[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<PastChunk>(
      `SELECT c.id, c.situation, coalesce(nullif(c.meta ->> 'chunk', ''), c.text) AS chunk
         FROM chunks c
         LEFT JOIN recordings r ON r.chunk_id = c.id AND r.user_id = $1
        WHERE c.user_id = $1 AND c.lang = $2 AND btrim(c.text) <> ''
        GROUP BY c.id
        ORDER BY max(r.created_at) ASC NULLS FIRST, c.created_at ASC`,
      [userId, lang],
    );
    return rows;
  });
}

/**
 * F17 "이제 확인": 추측을 저장하고 그때 만든 영어 문장을 채운다. 한 트랜잭션에서 같이 쓴다 —
 * 추측만 저장되고 문장이 안 들어가면 F14 가 또 추측 화면으로 되돌린다.
 * 이미 문장이 있으면(뒤로 가기로 F17 을 다시 지나온 경우) 덮어쓰지 않는다. 같은 상황에 매번 다른
 * 영어가 나오면 "그때 그 말" 이 아니게 된다.
 *
 * **그리고 이건 측정의 전제이기도 하다.** 곡선 기준선은 1회차에 뽑아 고정한다(`docs/MEASURE.md`
 * 2장). 나중에 누가 이 문장을 고치면 **옛 문장의 기준선과 새 문장을 말한 내 곡선**을 겨누게 되고,
 * 화면에는 멀쩡한 숫자가 뜬다 — 조용히 깨지는 종류다. 그래서 `btrim(text) = ''` 조건은 화면 편의가
 * 아니라 **불변 조건**이다. 문장을 고칠 길을 내려면 그 대상의 회차를 어떻게 할지 같이 정해야 한다.
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

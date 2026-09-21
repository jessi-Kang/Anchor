import { withUser } from "@/lib/db";
import type { Lang3 } from "@/lib/db/settings";
import { chunkKey } from "@/lib/talk/normalize";

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
  /**
   * **이 행이 가리키는 먼저 만난 덩어리**의 id (docs/FLOW.md 4장).
   *
   * 같은 덩어리가 다시 나오면 새로 만들지 않고 먼저 것으로 이어진다 — 회차와 곡선이 거기 쌓인다.
   * 새로 만들면 같은 말을 다섯 번 해도 **1회차짜리가 다섯 개**가 되어 "같은 덩어리 5회차"
   * (`docs/SPEC.md` 9장)를 영영 못 잰다.
   *
   * **오늘 행을 지우지는 않는다.** 오늘의 상황과 추측을 그대로 안은 채 먼저 것을 가리킨다 —
   * 쓴 줄은 하나도 없어지지 않는다(데이터 원칙). 목록(F18)이 그 행을 안 낼 뿐이다.
   */
  same_as?: string;
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
 *
 * **폴백 행도 영어가 없는 것으로 친다.** 게이트가 서기 전에 들어간 행은 `text` 에 **사용자가 쓴
 * 한국어**가 들어 있다. 지어낸 영어가 아니라 다른 언어가 들어앉은 것이라, 있는 것으로 치면
 * 그 행은 **영영 안 낫는다** — F14 가 F17 로 안 보내니 다시 만들 길이 없고, 그동안 F18 목록에서
 * 한국어 한 줄이 영어 덩어리 자리에 앉아 있고 듣기가 그걸 영어 목소리로 읽는다.
 *
 * 지우지도 숨기지도 않는다. **열면 낫는다** — 첫 탭에 F17 로 가서 다시 만들고, 그 뒤로는 진짜
 * 영어다 (PM 판정). 숨기면 닿을 길이 없어져서 오히려 영영 안 낫는다.
 */
export function hasEnglish(row: Pick<ChunkRow, "text" | "meta">): boolean {
  if (row.meta.content_source === "fallback") return false;
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
export async function getSituation(
  userId: string,
  id: string,
): Promise<{ situation: string; done: boolean; guess: string | null } | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ situation: string; done: boolean; guess: string | null }>(
      /*
        **`done` 은 영어 문장이 있을 때만 참이다.** 전에는 `meta ? 'guess'` 도 참으로 쳤는데,
        그러면 **추측은 냈고 문장은 못 만든 상태**에서 이 화면이 F14 로 튕기고, F14 는 문장이
        없다며 다시 여기로 보내 **두 화면이 끝없이 돈다.** 그 상태는 이제 실제로 생긴다 —
        문안 생성이 실패하면 추측만 저장되고 `text` 는 빈 채로 남는다.

        `guess` 는 **사용자가 쓴 자기 말**이라 돌려줘도 새는 게 아니다. 다시 그릴 때 그 줄이
        그대로 있어야 "없어졌다" 가 아니라 "아직 확인 중" 으로 읽힌다.
        **영어 문장(`text`)은 여전히 안 돌려준다** — 이 화면이 답을 들고 있으면 안 된다.
      */
      /*
        **폴백 행은 `done` 이 아니다.** `hasEnglish` 와 같은 눈으로 봐야 한다 — 여기만 "있다" 고
        하면 F17 이 F14 로 보내고 F14 는 영어가 없다며 다시 여기로 보내 **두 화면이 끝없이 돈다.**
        고치려던 행이 하필 닿을 수 없는 행이 된다.
      */
      `SELECT situation,
              btrim(text) <> '' AND coalesce(meta ->> 'content_source', '') <> 'fallback' AS done,
              meta ->> 'guess' AS guess
         FROM chunks WHERE user_id = $1 AND id = $2`,
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
      // **가리키는 행은 안 센다.** F18 이 그 행을 안 내므로, 세면 목록보다 큰 수가 홈에 뜬다.
      `SELECT count(*)::text AS n FROM chunks
         WHERE user_id = $1 AND lang = $2 AND btrim(text) <> '' AND NOT (meta ? 'same_as')`,
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
      /*
        **가리키는 행은 안 낸다** — 한 덩어리가 두 줄로 보이면 안 된다 (docs/FLOW.md 4장).
        **부제로 쓰는 상황은 그 묶음에서 가장 최근 것**이다. 오늘 나를 여기 데려온 것은 오늘 쓴
        줄이라, 먼저 쓴 줄을 부제로 두면 목록이 오늘의 나를 못 알아본다. 먼저 쓴 줄들은 제 행에
        그대로 남아 하나도 없어지지 않는다.
      */
      `SELECT c.id,
              (SELECT s.situation FROM chunks s
                 WHERE s.user_id = $1 AND (s.id = c.id OR s.meta ->> 'same_as' = c.id::text)
                 ORDER BY s.created_at DESC LIMIT 1) AS situation,
              coalesce(nullif(c.meta ->> 'chunk', ''), c.text) AS chunk
         FROM chunks c
         LEFT JOIN recordings r ON r.chunk_id = c.id AND r.user_id = $1
        WHERE c.user_id = $1 AND c.lang = $2 AND btrim(c.text) <> '' AND NOT (c.meta ? 'same_as')
        GROUP BY c.id
        ORDER BY max(r.created_at) ASC NULLS FIRST, c.created_at ASC`,
      [userId, lang],
    );
    return rows;
  });
}

/**
 * F17 "이제 확인" 이 쓰는 것 **둘로 나눠 뒀다**. 전에는 한 트랜잭션에 같이 썼는데, 문안 생성이
 * 그 앞에 있어서 **생성이 실패하면 추측까지 저장이 안 됐다.** 게다가 `guess-form` 이 보내기 전에
 * 기기 임시본을 지우므로 그 줄이 통째로 사라졌다 — 데이터 원칙("추측 한 번도 유실 없음") 위반이다.
 * **그래서 추측을 먼저 쓰고, 문장은 만들어진 뒤에 따로 쓴다.**
 *
 * 이미 문장이 있으면 덮지 않는다. 같은 상황에 매번 다른 영어가 나오면 "그때 그 말" 이 아니게 된다.
 *
 * **폴백 행에는 쓴다.** `btrim(text) = ''` 를 없애는 게 아니다 — 그 조건의 일은 **멀쩡한 영어를
 * 덮어쓰지 않는 것**이고 그건 그대로 필요하다. 폴백 행은 정의상 멀쩡한 영어가 아니라(사용자가 쓴
 * 한국어가 들어 있다) 거기만 정확히 열어 준다. 곡선 기준선 걱정도 여기선 반대다 — 그 행의 1회차
 * 기준선은 **영어 목소리가 한국어를 읽은 소리**라 지켜 봐야 뜻이 없다.
 *
 * **그리고 이건 측정의 전제이기도 하다.** 곡선 기준선은 1회차에 뽑아 고정한다(`docs/MEASURE.md`
 * 2장). 나중에 누가 이 문장을 고치면 **옛 문장의 기준선과 새 문장을 말한 내 곡선**을 겨누게 되고,
 * 화면에는 멀쩡한 숫자가 뜬다 — 조용히 깨지는 종류다. 그래서 `btrim(text) = ''` 조건은 화면 편의가
 * 아니라 **불변 조건**이다. 문장을 고칠 길을 내려면 그 대상의 회차를 어떻게 할지 같이 정해야 한다.
 */
export async function saveGuess(userId: string, id: string, guess: string): Promise<void> {
  await withUser(userId, async (tx) => {
    // **첫 추측은 안 덮는다.** 덮어쓰기는 유실이고, 데이터 원칙이 "추측 한 번도 유실 없음" 이다.
    // 문장을 다시 만드는 것은 **새 추측이 아니다** — 그래서 다시 만들기는 이 함수를 안 부른다.
    await tx.query(
      `UPDATE chunks SET meta = jsonb_build_object('guess', $3::text) || meta
         WHERE user_id = $1 AND id = $2 AND NOT (meta ? 'guess')`,
      [userId, id, guess],
    );
  });
}

export async function saveEnglish(
  userId: string,
  id: string,
  english: { text: string; attitude: string | null; chunk: string; source: "claude" },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE chunks
          SET text = $3::text,
              attitude = coalesce(attitude, $4),
              meta = meta || jsonb_build_object('chunk', $5::text, 'content_source', $6::text)
        WHERE user_id = $1 AND id = $2
          AND (btrim(text) = '' OR meta ->> 'content_source' = 'fallback')`,
      [userId, id, english.text, english.attitude, english.chunk, english.source],
    );
  });
}

/**
 * 이 덩어리를 **전에도 말한 적이 있나.** 있으면 그 행의 id.
 *
 * 견주는 자리는 F17 의 "이제 확인" 하나다 — 덩어리는 거기서 처음 만들어지니 그 전에는 견줄 것이
 * 없다 (docs/FLOW.md 4장). 같은 사용자·같은 언어 안에서만 본다.
 *
 * **가리키는 행은 후보가 아니다.** 사슬이 생기면 회차가 다시 갈린다 — A→B→C 가 되면 곡선이
 * B 와 C 에 나눠 쌓인다. 가리킬 곳은 늘 **묶음의 첫 행**이다.
 *
 * 맞춰 보는 규칙은 SQL 에 다시 적지 않고 `chunkKey` 하나를 쓴다. 규칙이 둘이면 한쪽은 잇고
 * 한쪽은 안 이어서 같은 말이 1회차짜리 둘로 갈린다.
 */
export async function findSameChunk(userId: string, lang: Lang3, chunk: string, exceptId: string): Promise<string | null> {
  const key = chunkKey(chunk);
  if (!key) return null;
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ id: string; chunk: string }>(
      `SELECT id, coalesce(nullif(meta ->> 'chunk', ''), text) AS chunk
         FROM chunks
        WHERE user_id = $1 AND lang = $2 AND id <> $3
          AND btrim(text) <> '' AND NOT (meta ? 'same_as')
        ORDER BY created_at ASC`,
      [userId, lang, exceptId],
    );
    return rows.find((r) => chunkKey(r.chunk) === key)?.id ?? null;
  });
}

/** 오늘 행이 먼저 것을 가리키게 한다. 한 번 가리키면 안 바꾼다 — 사슬도, 갈아타기도 없다. */
export async function pointAt(userId: string, id: string, targetId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE chunks SET meta = meta || jsonb_build_object('same_as', $3::text)
         WHERE user_id = $1 AND id = $2 AND NOT (meta ? 'same_as')`,
      [userId, id, targetId],
    );
  });
}

/**
 * F14 가 맨 위에 쓸 상황 한 줄과, **이 말을 전에도 만났는지**.
 *
 * 상황은 묶음에서 가장 최근 것이다 — 오늘 나를 여기 데려온 것은 오늘 쓴 줄이다.
 * `repeated` 는 이 행을 가리키는 행이 하나라도 있을 때만 참이다. 그래야 "전에도 막혔어" 한 줄이
 * **실제로 두 번째부터만** 뜬다.
 */
export async function chunkGroup(userId: string, id: string): Promise<{ situation: string; repeated: boolean } | null> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ situation: string | null; repeated: boolean }>(
      /*
        `$2` 는 **text** 다. `meta ->> 'same_as'` 가 text 라 한 파라미터를 uuid 로도 text 로도
        쓰면 Postgres 가 `text = uuid` 에서 멈춘다. 그래서 id 쪽을 text 로 맞춘다.
      */
      `SELECT (SELECT s.situation FROM chunks s
                WHERE s.user_id = $1 AND (s.id::text = $2 OR s.meta ->> 'same_as' = $2)
                ORDER BY s.created_at DESC LIMIT 1) AS situation,
              EXISTS (SELECT 1 FROM chunks p WHERE p.user_id = $1 AND p.meta ->> 'same_as' = $2) AS repeated`,
      [userId, id],
    );
    const row = rows[0];
    return row?.situation ? { situation: row.situation, repeated: row.repeated } : null;
  });
}

/**
 * 통과 기준 두 숫자를 뽑는다.
 *   pnpm measure <user_id>
 *
 * **정의의 원본은 `docs/MEASURE.md` 다.** 이 스크립트는 그 문서를 옮긴 것이고, 어긋나면 문서가
 * 맞다. 값이 좋은지 나쁜지는 여기서 안 따진다(M4). 여기가 하는 일은 셋뿐이다 — 행을 읽고,
 * 자격을 거르고, 분모·분자·표본수를 같이 찍는다.
 *
 * **SQL 을 그날 손으로 조립하지 않는다** (MEASURE 3장). 손으로 짜면 그날의 정의가 되고, 문서와
 * 어긋나도 아무도 모른다. 그래서 한 줄로 돈다.
 *
 * **곡선 거리는 `src/lib/pitch/distance.ts` 하나만 부른다.** 화면도 `pnpm pitch:baseline` 도 같은
 * 모듈을 부른다 — 같은 계산이 두 군데 있으면 어느 숫자가 맞는지 알 방법이 없다.
 *
 * 읽기만 한다. 한 행도 쓰지 않는다.
 */
import { loadEnv } from "./lib/load-env";
import { adminClient } from "./lib/admin-client";
import { isFixtureUser } from "./lib/fixture";
import { pitchDistance, type PitchPoint } from "../src/lib/pitch/distance";

loadEnv();

/**
 * 재만남 자격 간격 (MEASURE 1장 "자격"). 카드를 착지한 날로부터 이만큼 지난 뒤에 **넣은 자료**의
 * 출현만 센다. 플래그로 빼지 않는다 — 돌릴 때마다 바꿀 수 있으면 그날의 정의가 두 개가 된다.
 */
const QUALIFY_DAYS = 3;
/** 표본 하한 (MEASURE 1장). 분모가 이보다 작으면 비율을 발표하지 않는다. */
const MIN_DENOMINATOR = 10;
/** 곡선 통과를 판정하는 회차 (MEASURE 2장 "통과": 거리(1회차) > 거리(5회차)). */
const FIRST_ATTEMPT = 1;
const LAST_ATTEMPT = 5;

type EncounterRow = {
  node_id: string;
  display: string;
  recognized: boolean;
  gap_days: number;
};
type RecordingRow = {
  target_key: string;
  label: string;
  lang: string;
  attempt: number;
  pitch: unknown;
  target_pitch: unknown;
  target_voice_kind: string | null;
  target_voice_id: string | null;
  /** 덩어리 대상인가 (카드 대상이면 false). 문안 허용 목록은 덩어리에만 건다. */
  is_chunk: boolean;
  /** 덩어리 문안의 출처. 값이 아예 없는 행이 있다. */
  chunk_source: string | null;
};

/** 문안 출처 허용 목록 (MEASURE 2장). 여기 없으면 곡선에서 뺀다. */
const CONTENT_OK = new Set(["claude", "authored"]);

/**
 * 이 대상을 곡선에서 빼야 하는가, 뺀다면 왜. 카드 대상은 이 목록을 안 탄다 — `chunks` 행이 없어
 * 값이 언제나 NULL 이고, 카드가 말하는 것은 착지 낱말(일본어)이라 그 오염이 일어나지 않는다.
 *
 * **`chunk_source === null` 로 가르지 않는다.** 그게 더 짧아 보이지만, 그러면 **덩어리인데 출처가
 * 안 적힌 행**까지 카드와 같이 통과해 `unknown` 이 영영 0 이 된다. 그 행이야말로 빼는 목록이 놓쳐서
 * 허용 목록으로 바꾼 이유다 — NULL 로 가르면 **빼는 목록으로 되돌아간 것과 같다.**
 * 카드와 덩어리를 가르는 것은 출처의 유무가 아니라 **`chunks` 행이 있느냐**다.
 */
function dropReason(r: { is_chunk: boolean; chunk_source: string | null }): "fallback" | "unknown" | null {
  if (!r.is_chunk) return null;
  if (r.chunk_source && CONTENT_OK.has(r.chunk_source)) return null;
  return r.chunk_source === "fallback" ? "fallback" : "unknown";
}

const n1 = (x: number) => x.toFixed(1);
const n3 = (x: number) => x.toFixed(3);

/**
 * `recordings.pitch` / `target_pitch` 의 jsonb 를 점 배열로 읽는다. 드라이버가 이미 객체로 주지만
 * 모양까지 보장하지는 않아서, 거리 함수에 넣기 전에 여기서 한 번 거른다. 하나도 안 남으면 null 이다 —
 * 빈 배열을 넘기면 거리 함수가 "못 잰다" 대신 뭔가를 계산할 여지가 생긴다.
 */
function toPoints(value: unknown): PitchPoint[] | null {
  if (!Array.isArray(value)) return null;
  const out: PitchPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const t = Number((raw as { t?: unknown }).t);
    const f0 = Number((raw as { f0?: unknown }).f0);
    if (Number.isFinite(t) && Number.isFinite(f0)) out.push({ t, f0 });
  }
  return out.length ? out : null;
}

async function main() {
  const userId = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (!userId) {
    console.error("쓰는 법: pnpm measure <user_id>");
    console.error("user_id 는 users.id (Neon Auth 의 사용자 id) 다. 계정마다 따로 뽑는다.");
    process.exit(1);
  }

  const client = adminClient();
  await client.connect();
  try {
    /*
      **그 계정이 있는지 먼저 본다.** 없는 id 를 주면 아래 질의가 전부 0 을 돌려주고 출력은
      "표본 없음" 이 된다 — **오타와 「아직 안 쌓였다」가 구분이 안 된다.** D+14 에 그걸 받아들고
      "2주를 썼는데 아무것도 안 남았다" 로 읽으면 그날 하루를 엉뚱한 데서 쓴다. 돌려 보고 알았다.
    */
    const { rows: who } = await client.query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
    if (!who[0]) {
      console.error(`그런 계정이 없다: ${userId}`);
      console.error("users.id 를 그대로 줘야 한다. 계정이 맞는데 이 말이 나오면 DB 를 잘못 보고 있는 것이다.");
      process.exit(1);
    }
    /*
      ── 1. 재만남 인식률 ──────────────────────────────────────────────────────
      분모: 카드를 착지한 한자 중, 착지 +3일 뒤에 넣은 자료에서 **다시 나온 것** (MEASURE 1장).
            다시 안 나온 글자는 분모에 안 넣는다 — 그건 앱의 효과가 아니라 자료 선택을 재는 것이다.
      분자: 그 중 첫 재만남이 recognized = true 인 것.
      글자마다 **첫 재만남 한 번만** 센다. 고빈도자 하나가 비율을 지배하지 않게.

      같은 한자로 카드를 여러 번 풀었으면 **가장 이른 착지**를 기준으로 잡는다. 자격 간격은
      "언제 배웠나"에서 세는 것이라 늦게 다시 푼 카드로 미루면 자격이 사라진다.
    */
    const { rows: enc } = await client.query<EncounterRow>(
      `
      WITH landed AS (
        SELECT node_id, min(landed_at) AS landed_at
          FROM cards
         WHERE user_id = $1 AND landed_at IS NOT NULL
         GROUP BY node_id
      ),
      -- 그 글자를 카드로 푼 자료의 **본문**. 같은 글을 다시 넣은 자료에서 읽힌 것은 글자를 알아본
      -- 것인지 그 글을 기억한 것인지 가를 수 없고, 틀리는 방향이 한쪽이다 (MEASURE 1장).
      solved AS (
        SELECT DISTINCT c.node_id, i.body
          FROM cards c
          JOIN inputs i ON i.id = c.input_id AND i.user_id = $1
         WHERE c.user_id = $1 AND c.landed_at IS NOT NULL
      ),
      /*
        **무효를 먼저 버리고 나서 첫 번째를 센다.** 순서가 거꾸로면 무효가 유효를 밀어낸다 —
        카드를 푼 기사를 며칠 뒤 다시 넣고, 그 뒤에 진짜 새 기사에서 만났다면, 먼저 세고 나중에
        거르는 구현은 재투입을 첫 재만남으로 잡은 뒤 진짜를 버린다. 표본 하나가 그냥 사라진다.
        그래서 row_number() 는 아래 WHERE 가 무효를 걷어낸 **뒤**의 줄에만 매겨진다.
      */
      qualified AS (
        SELECT e.node_id,
               n.display,
               e.recognized,
               EXTRACT(EPOCH FROM (i.created_at - l.landed_at)) / 86400 AS gap_days,
               row_number() OVER (PARTITION BY e.node_id ORDER BY e.created_at, e.id) AS rn
          FROM encounters e
          JOIN landed l ON l.node_id = e.node_id
          JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
          JOIN nodes  n ON n.id = e.node_id AND (n.user_id IS NULL OR n.user_id = $1)
         WHERE e.user_id = $1
           AND e.recognized IS NOT NULL
           AND i.created_at >= l.landed_at + make_interval(days => $2::int)
           AND NOT EXISTS (SELECT 1 FROM solved s WHERE s.node_id = e.node_id AND s.body = i.body)
      )
      SELECT node_id, display, recognized, gap_days
        FROM qualified WHERE rn = 1 ORDER BY gap_days
      `,
      [userId, QUALIFY_DAYS],
    );

    /*
      자격에 못 미친 행과, 착지했지만 다시 안 나온 한자. **비율에는 안 들어간다.** 70% 가 안 나온
      날 그게 "아직 이르다"인지 "안 된다"인지를 가르는 재료라 같이 찍는다 (MEASURE 0′장).
    */
    const { rows: ctx } = await client.query<{ too_soon: string; landed: string; never_back: string; no_judgement: string; same_body: string; no_readings: string; partial_readings: string }>(
      `
      WITH landed AS (
        SELECT node_id, min(landed_at) AS landed_at
          FROM cards WHERE user_id = $1 AND landed_at IS NOT NULL GROUP BY node_id
      ),
      solved AS (
        SELECT DISTINCT c.node_id, i.body
          FROM cards c
          JOIN inputs i ON i.id = c.input_id AND i.user_id = $1
         WHERE c.user_id = $1 AND c.landed_at IS NOT NULL
      ),
      -- 다시 나오기는 했는가. **자격도 판정 여부도 안 본다** — 자격 미달과 판정 불가는 아래에서
      -- 따로 세므로, 여기서까지 걸러 버리면 같은 글자가 두 곳에 잡혀 합이 안 맞는다. "다시 안
      -- 나왔다" 는 글자 그대로 **줄이 하나도 없다** 는 뜻이어야 한다.
      seen AS (
        SELECT DISTINCT e.node_id FROM encounters e WHERE e.user_id = $1
      )
      SELECT
        (SELECT count(DISTINCT e.node_id)::text
           FROM encounters e
           JOIN landed l ON l.node_id = e.node_id
           JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
          WHERE e.user_id = $1 AND e.recognized IS NOT NULL
            AND i.created_at <  l.landed_at + make_interval(days => $2::int)) AS too_soon,
        (SELECT count(*)::text FROM landed) AS landed,
        (SELECT count(*)::text FROM landed WHERE node_id NOT IN (SELECT node_id FROM seen)) AS never_back,
        -- 다시 나왔는데 **판정이 일어날 수 없었던** 출현. F12 는 안 만난 한자가 섞인 덩어리를 열 수
        -- 없게 해 두었으므로(읽기를 열면 다음 카드의 답이 샌다) 그 안의 만난 글자에는 "열었다 / 안
        -- 열었다" 가 생기지 않는다. 분모에 넣으면 기회가 없던 것을 못 읽은 것으로 세게 되니 뺀다.
        -- 다만 **얼마나 빠지는지는 봐야 한다** — 2자 낱말이 흔한 일본어에서 이게 표본을 크게 깎을 수
        -- 있고, D+7 에 분모만 보는 이유가 그것이다 (MEASURE 3장).
        (SELECT count(DISTINCT e.node_id)::text
           FROM encounters e
           JOIN landed l ON l.node_id = e.node_id
           JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
          WHERE e.user_id = $1 AND e.recognized IS NULL
            AND i.created_at >= l.landed_at + make_interval(days => $2::int)) AS no_judgement,
        /*
          NULL 이 되는 길이 둘이고 **손쓰는 법이 정반대다** (MEASURE 0′장). 섞인 덩어리에 갇힌 것은
          표본이 쌓이면 줄어들고, 읽기가 없어 열 수조차 없던 것은 **우리 쪽 버그라 당장 고칠 일이다.**

          가르는 자리는 만남이 아니라 **자료**다 — 버그가 거기 있다. inputs.meta.readings 키가
          없으면 그 자료는 덩어리를 하나도 못 열었고, 키는 있는데 빈 항목이 섞여 있으면 그 덩어리만
          못 열었다 (lib/kanji/furigana.ts 의 alignReadings 가 일부만 비우고 나머지를 돌려준다).

          **덩어리를 다시 쪼개 되짚지 않는다.** 그 로직이 바뀌는 날 옛 데이터의 뜻이 같이 바뀐다.
          그래서 아래 둘째 수는 **자료 단위의 상한**이다 — 그 자료 안에서 갇힌 것과 섞여 있을 수 있다.
        */
        (SELECT count(DISTINCT e.node_id)::text
           FROM encounters e
           JOIN landed l ON l.node_id = e.node_id
           JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
          WHERE e.user_id = $1 AND e.recognized IS NULL
            AND i.created_at >= l.landed_at + make_interval(days => $2::int)
            AND i.meta -> 'readings' IS NULL) AS no_readings,
        (SELECT count(DISTINCT e.node_id)::text
           FROM encounters e
           JOIN landed l ON l.node_id = e.node_id
           JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
          WHERE e.user_id = $1 AND e.recognized IS NULL
            AND i.created_at >= l.landed_at + make_interval(days => $2::int)
            AND i.meta -> 'readings' IS NOT NULL
            AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(i.meta -> 'readings') x WHERE x = '')) AS partial_readings,
        -- 자격은 갖췄는데 **카드를 푼 그 글을 다시 넣은 자료**라 버린 것. 0 이 아니면 그 자체가
        -- 신호다 — 같은 글을 다시 읽고 있다는 뜻이고, 그만큼 표본이 줄어든다.
        (SELECT count(DISTINCT e.node_id)::text
           FROM encounters e
           JOIN landed l ON l.node_id = e.node_id
           JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
          WHERE e.user_id = $1 AND e.recognized IS NOT NULL
            AND i.created_at >= l.landed_at + make_interval(days => $2::int)
            AND EXISTS (SELECT 1 FROM solved s WHERE s.node_id = e.node_id AND s.body = i.body)) AS same_body
      `,
      [userId, QUALIFY_DAYS],
    );

    /*
      ── 2. 곡선 일치도 ────────────────────────────────────────────────────────
      대상은 카드 하나 또는 덩어리 하나다. 회차(attempt)는 서버가 INSERT 직전에 센 값이라
      화면 상태가 아니라 쌓인 사실이다. 1회차와 5회차만 쓰지만 전부 읽어 온다 — 중간 회차가
      비어 있는지(돌아갈 길이 없어 1회차만 다섯 개인지)를 같이 봐야 한다.
    */
    /*
      **문안이 폴백으로 만들어진 덩어리는 곡선 집계에서 뺀다.** 영어를 못 만들면
      `src/lib/talk/chunk-content.ts` 의 `fallbackContent` 가 사용자가 쓴 **한국어를 그대로**
      `english`·`chunk` 에 넣는다. 그러면 화면이 그 한국어를 영어 목소리로 읽고
      (`pitch-loop.tsx` 의 `u.lang = "en-US"`), 그 소리의 곡선이 1회차 기준선으로 굳는다.
      MEASURE 2장의 전제는 "기준선은 제대로 발음된 소리" 인데 그 행의 기준선은 **영어 목소리가
      읽은 한국어 문장**이라, 그 대상의 거리 숫자가 통째로 뜻을 잃는다. 화면에는 멀쩡한 숫자가
      뜨므로 여기서 안 빼면 아무도 모른다.

      `chunks.meta.content_source` 에 이미 적혀 있다(`lib/db/chunks.ts` 의 saveGuessAndEnglish).
      새 칸도 마이그레이션도 필요 없다. **재만남 쪽은 건드리지 않는다** — 오염된 것은 영어 곡선뿐이다.

      **빼는 목록이 아니라 넣는 목록으로 거른다.** `content_source` 는 optional 이라 값이 아예 없는
      행이 있고, "fallback 이면 뺀다" 는 그걸 조용히 통과시킨다. "claude·authored 만 넣는다" 는
      틀려도 분모가 작아지는 쪽이라 아래 머리말에 수로 드러난다.

      **허용 목록은 덩어리 대상에만 건다.** 카드 대상은 `chunks` 행이 없어 이 값이 언제나 NULL 이라,
      같이 걸면 일본어 곡선이 통째로 사라진다. 그리고 카드가 폴백으로 만들어져도 말하는 것은 착지
      낱말(일본어)이라 "영어 목소리가 한국어를 읽는" 오염이 일어나지 않는다.
    */
    const { rows: rec } = await client.query<RecordingRow>(
      `
      SELECT COALESCE('card:' || r.card_id::text, 'chunk:' || r.chunk_id::text) AS target_key,
             COALESCE(n.display, left(ch.text, 40))                             AS label,
             COALESCE(c.lang::text, ch.lang::text)                              AS lang,
             r.attempt, r.pitch, r.target_pitch, r.target_voice_kind, r.target_voice_id,
             (r.chunk_id IS NOT NULL)                                           AS is_chunk,
             ch.meta ->> 'content_source'                                       AS chunk_source
        FROM recordings r
        LEFT JOIN cards  c  ON c.id  = r.card_id  AND c.user_id  = $1
        LEFT JOIN nodes  n  ON n.id  = c.node_id AND (n.user_id IS NULL OR n.user_id = $1)
        LEFT JOIN chunks ch ON ch.id = r.chunk_id AND ch.user_id = $1
       WHERE r.user_id = $1
       ORDER BY target_key, r.attempt
      `,
      [userId],
    );

    print(userId, enc, ctx[0], rec);
  } finally {
    await client.end();
  }
}

function print(
  userId: string,
  enc: EncounterRow[],
  ctx: { too_soon: string; landed: string; never_back: string; no_judgement: string; same_body: string; no_readings: string; partial_readings: string } | undefined,
  rec: RecordingRow[],
) {
  console.log(`Anchor 측정 — ${new Date().toISOString()}`);
  console.log(`사용자: ${userId}`);
  console.log("정의: docs/MEASURE.md. 이 출력과 그 문서가 어긋나면 문서가 맞다. 통과·미달 판정은 M4 가 한다.");
  /*
    **합성인지는 계정으로 안다.** 행마다 표식을 보지 않는다 — 이 스크립트는 인자로 받은 계정의
    행만 읽고, 시드는 그 접두사 계정에만 넣는다. 그래서 "섞였는가" 라는 상태가 아예 없다.
    머리말에서 말하는 것은 빼기 위해서가 아니라, 이 출력이 배관 확인이라는 것을 읽는 사람이
    알아야 하기 때문이다.
  */
  if (isFixtureUser(userId)) {
    console.log("");
    console.log("※ 이 계정은 배관 확인용 합성 데이터다. 사람이 만든 숫자가 아니고 판정에 쓰지 않는다.");
  }
  /*
    **뺀 것은 세어서 말한다.** 안 보이게 빼면 곡선 표본이 왜 작은지를 못 가른다. 그리고 이 수가
    0 이 아니라는 것 자체가 신호다 — 영어 문안을 못 만들고 있다는 뜻이다.

    둘을 갈라 센다. **폴백**은 "영어를 못 만들었다" 는 신호이고, **출처 없음**은 "그 행이 언제
    만들어졌는지 모른다" 는 다른 신호다. 합치면 어느 쪽을 손봐야 하는지가 사라진다.
  */
  const byTarget = new Map<string, RecordingRow[]>();
  for (const r of rec) {
    const rows = byTarget.get(r.target_key);
    if (rows) rows.push(r);
    else byTarget.set(r.target_key, [r]);
  }

  const byReason = (why: "fallback" | "unknown") =>
    new Set(rec.filter((r) => dropReason(r) === why).map((r) => r.target_key)).size;
  const fb = byReason("fallback");
  const unknown = byReason("unknown");
  if (fb || unknown) {
    console.log("");
    if (fb) {
      console.log(`※ 폴백 문안이라 곡선에서 뺀 대상 ${fb}개 — 영어를 못 만들어 한국어가 그대로 덩어리에 들어간 행이다.`);
      /*
        이 수는 **줄지 않는다.** 게이트가 서서 새 폴백 행은 안 생기지만, 이미 들어간 한국어는
        덮어쓰이지 않는다. 문이 둘이고 둘 다 닫혀 있다 —
          `lib/db/chunks.ts` 의 `hasEnglish` 가 `text.trim().length > 0` 이라 폴백 행은 "영어가 있다"
          로 읽혀 F17(문안 다시 만들기)로 안 가고,
          거기까지 가도 `saveEnglish` 가 `btrim(text) = ''` 일 때만 쓴다.
        그래서 다음에 봤을 때 그대로여도 "안 고쳐졌다" 가 아니라 **"고칠 수 있는 행이 아니다"** 다.

        **그 둘 중 하나라도 폴백 행을 통과시키게 바뀌면 이 문장을 고친다** — 그때는 "시간이 지난다고
        줄지 않는다. 그 덩어리를 다시 열어야 줄어든다" 가 맞다. 지금 그렇게 적으면 **없는 고침 방법을
        알려 주는 것**이라 안 적는다. 위 두 자리를 열어 보고 바꾼다.
      */
      console.log("  이 수는 시간이 지나도 안 줄어든다. 한 번 들어간 문안은 덮어쓰이지 않는다.");
    }
    if (unknown)
      console.log(`※ 문안 출처가 안 적힌 덩어리 ${unknown}개도 뺐다 — 무엇으로 만든 문안인지 몰라 기준선을 믿을 수 없다.`);
    console.log("  그 기준선은 영어 목소리가 읽은 한국어일 수 있어 거리에 뜻이 없다. 재만남 쪽은 그대로 센다.");
  }

  // ── 1 ──────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("## 1. 재만남 인식률");
  console.log(`자격: 카드 착지 +${QUALIFY_DAYS}일 이후에 넣은 자료에서의 **첫** 재만남 한 번 (MEASURE 1장)`);
  const denom = enc.length;
  const numer = enc.filter((r) => r.recognized).length;
  console.log(`분모 ${denom} · 분자 ${numer}`);
  if (denom === 0) {
    console.log("→ 표본 없음. 자격을 갖춘 재만남이 아직 하나도 없다.");
  } else if (denom < MIN_DENOMINATOR) {
    console.log(`→ 표본 부족 (분모 ${denom} < ${MIN_DENOMINATOR}). 비율을 발표하지 않는다.`);
  } else {
    console.log(`→ ${n1((numer / denom) * 100)}% (${numer}/${denom})`);
  }
  if (denom) {
    console.log("");
    console.log("  글자   간격(일)  읽기를 열었나");
    for (const row of enc) {
      console.log(`  ${row.display.padEnd(4)}  ${n1(Number(row.gap_days)).padStart(7)}  ${row.recognized ? "안 열었다" : "열었다"}`);
    }
  }
  if (ctx) {
    console.log("");
    console.log(
      `참고: 착지한 한자 ${ctx.landed}자 · 자격 미달(간격 ${QUALIFY_DAYS}일 미만) ${ctx.too_soon}자 · 착지 뒤 다시 안 나온 한자 ${ctx.never_back}자`,
    );
    console.log("  자격 미달과 다시 안 나온 것은 비율에 안 들어간다. 왜 그 숫자가 나왔는지를 볼 재료다.");
    if (ctx.same_body !== "0")
      console.log(
        `  카드를 푼 그 글을 다시 넣은 자료에서의 출현 ${ctx.same_body}자 — 글자를 알아본 것인지 글을 기억한 것인지 못 가른다. 분모에서 뺀다.`,
      );
    if (ctx.no_judgement !== "0") {
      console.log(`  판정이 일어날 수 없던 출현 ${ctx.no_judgement}자 — 읽기를 열 기회가 없었다. 분모에서 뺀다.`);
      // 둘을 갈라 낸다. 뒤쪽은 우리 쪽 버그라 당장 고칠 일이고, 앞쪽은 표본이 쌓이면 줄어든다.
      if (ctx.no_readings !== "0")
        console.log(`    그중 ${ctx.no_readings}자는 **읽기가 아예 없는 자료**에서 왔다 — 후리가나를 못 만든 것이다. 고칠 일이다.`);
      if (ctx.partial_readings !== "0")
        console.log(`    ${ctx.partial_readings}자는 읽기가 일부 빈 자료에서 왔다 (그 자료 안에서 섞인 덩어리에 갇힌 것과 겹칠 수 있는 상한).`);
      /*
        둘을 더하면 총계보다 클 수 있다. 셋 다 글자를 세는데(`count(DISTINCT node_id)`) 버킷은
        **자료별로** 갈리기 때문이다 — 한 글자를 두 자료에서 만났고 한쪽은 읽기 키가 없고 한쪽은
        일부만 비었으면 그 글자가 양쪽에 다 들어간다. 합을 맞춰 보는 사람이 반드시 나오므로 적어 둔다.
      */
      if (Number(ctx.no_readings) + Number(ctx.partial_readings) > Number(ctx.no_judgement))
        console.log("    (두 줄의 합이 총계보다 크다 — 한 글자를 두 자료에서 만나면 양쪽에 다 센다.)");
    }
  }

  // ── 2 ──────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("## 2. 곡선 일치도");
  console.log(`통과 후보: 같은 대상에서 거리(${FIRST_ATTEMPT}회차) > 거리(${LAST_ATTEMPT}회차). 단위는 반음, 낮을수록 가깝다`);
  /*
    **「아무것도 없음」과 「전부 걸러짐」을 가른다.** 아래 표가 비었을 때 그게 녹음이 없어서인지
    거름막에 다 걸려서인지가 안 보이면, 같은 출력이 서로 다른 두 가지를 뜻하게 된다 — 없는 계정이
    "표본 없음" 으로 보이던 것과 같은 자리다.

    그래서 **합이 맞는지 볼 수 있게** 낸다. 대상 수 = 영어 표 + 일본어 표 + 뺀 것들 + 언어 밖.
    읽는 사람이 그 뺄셈을 해 보면 **사라진 대상이 없다는 것**까지 확인된다.
  */
  console.log(`녹음 ${rec.length}행 · 대상 ${byTarget.size}개 (아래 표 + 뺀 것 + 언어 밖의 합이다)`);
  if (rec.length === 0) console.log("  녹음이 한 건도 없다. 거름막에 걸린 것이 아니라 아직 말한 적이 없는 것이다.");

  type Result = {
    key: string;
    label: string;
    lang: string;
    /** 문안 출처가 허용 목록 밖이라 곡선에서 뺀다. 덩어리 대상에만 걸린다. */
    dropped: "fallback" | "unknown" | null;
    d1: number | null;
    d5: number | null;
    attempts: number;
    voice: string;
  };
  const results: Result[] = [];
  for (const [, rows] of byTarget) {
    const at = (a: number) => rows.find((r) => r.attempt === a);
    const dist = (row: RecordingRow | undefined) => {
      if (!row) return null;
      const mine = toPoints(row.pitch);
      const target = toPoints(row.target_pitch);
      return mine && target ? pitchDistance(mine, target) : null;
    };
    const base = rows.find((r) => r.target_voice_id) ?? rows[0];
    results.push({
      key: rows[0].target_key,
      label: rows[0].label ?? "?",
      lang: rows[0].lang ?? "?",
      dropped: dropReason(rows[0]),
      d1: dist(at(FIRST_ATTEMPT)),
      d5: dist(at(LAST_ATTEMPT)),
      attempts: rows.length,
      // 기준선이 무엇으로 만들어졌는지. 안 남은 행은 "모름" 이다 — 0007 이전에 쌓인 회차이거나
      // 겨눈 소리가 아예 없던 회차다. 둘을 뭉개지 않게 목소리 ID 를 같이 낸다.
      voice: base.target_voice_kind ? `${base.target_voice_kind}/${base.target_voice_id ?? "?"}` : "모름",
    });
  }

  /*
    **어느 묶음에도 안 들어간 대상.** 아래 묶음은 `lang` 으로 고르므로 값이 en·ja 가 아니면 그 대상은
    두 표 어디에도 안 뜨고 **아무 말 없이 사라진다** — 없는 계정이 "표본 없음" 으로 보이던 것과 같은
    종류다. 언어가 하나 늘거나(스페인어), 조인이 주인을 못 찾아 `lang` 이 NULL 이 되면 그때 조용해진다.
  */
  const orphan = results.filter((r) => !r.dropped && r.lang !== "en" && r.lang !== "ja");
  if (orphan.length) {
    console.log(
      `※ 어느 언어 묶음에도 안 들어간 대상 ${orphan.length}개 (lang=${[...new Set(orphan.map((r) => r.lang))].join(", ")}) — 아래 표에 안 뜬다.`,
    );
  }
  /*
    **회차가 겹치는 대상.** 회차는 서버가 INSERT 직전 `count(*)+1` 로 센다. 같은 대상에 두 요청이
    동시에 들어오면 둘 다 같은 수를 받을 수 있고, 그러면 아래 `at(1)`·`at(5)` 가 **둘 중 아무거나
    집는다.** 표에는 멀쩡한 거리가 뜨는데 어느 회차를 잰 것인지는 모르는 상태다.

    **고치는 답은 유니크 제약이 아니다.** 왜 아닌지와 진짜 답은 `db/README.md` 의 "회차는 왜 저장된
    값인가" 에 있다 — 이 줄이 실제로 뜬 날 급하게 손대기 전에 거기를 먼저 읽는다.
  */
  const dup = [...byTarget.entries()].filter(([, rows]) => new Set(rows.map((r) => r.attempt)).size !== rows.length);
  if (dup.length) {
    console.log(`※ 회차 번호가 겹치는 대상 ${dup.length}개 — 같은 회차가 둘이라 어느 것을 잰 값인지 모른다. 그 대상의 거리는 못 믿는다.`);
  }

  /*
    **언어를 가른다.** 영어는 프리셋이 영어 원어민 모델이라 "제대로 발음된 소리"의 대리로 쓸 만하다.
    일본어는 다국어 모델이 읽는 것이라 고저 악센트가 맞다는 보장이 없어, 둘 다 틀린 채로 일치하면
    통과가 나온다. 그래서 **판정은 영어로만 하고 일본어는 따로 적는다** (MEASURE 2장 "이 시험이
    닫지 못하는 것 — 일본어"). 여기서 합치면 그 결정이 출력에서 사라진다.
  */
  for (const [lang, title] of [
    ["en", "영어 (M4 판정 대상)"],
    ["ja", "일본어 (판정에 안 쓴다 — 기준선이 맞는지 아직 확인 안 됐다)"],
  ] as const) {
    const group = results.filter((r) => r.lang === lang && !r.dropped);
    console.log("");
    console.log(`### ${title}`);
    /*
      영어를 판정에 쓰는 근거도 **가정**이지 확인이 아니다 — "프리셋이 영어 원어민 모델이니 제대로
      발음한다" 는 확인된 적이 없고, 일본어보다 덜 위험할 뿐이다. 오히려 검증이 더 쉬운 쪽은
      일본어다(고저 악센트가 사전에 이산 라벨로 있고, 그 악센트가 곧 F0 다). M4 가 이 숫자를 읽을 때
      그 점을 같이 말해야 하므로 출력이 매번 그렇게 말한다 (MEASURE 2장).
    */
    if (lang === "en") console.log("  ※ 이 숫자를 판정에 쓰는 근거는 가정이다 — 프리셋이 제대로 발음한다는 것은 확인되지 않았다.");
    if (group.length === 0) {
      console.log("  대상 없음.");
      continue;
    }
    const paired = group.filter((r) => r.d1 !== null && r.d5 !== null);
    console.log("  대상                                      1회차   5회차   회차수  기준선");
    for (const r of group) {
      const label = r.label.length > 38 ? r.label.slice(0, 37) + "…" : r.label;
      const c1 = r.d1 === null ? "  —  " : n3(r.d1).padStart(5);
      const c5 = r.d5 === null ? "  —  " : n3(r.d5).padStart(5);
      console.log(`  ${label.padEnd(38)}  ${c1}   ${c5}   ${String(r.attempts).padStart(5)}  ${r.voice}`);
    }
    if (paired.length === 0) {
      // 없는 것을 0 으로 쓰지 않는다 (MEASURE 3장).
      const reached = group.filter((r) => r.attempts >= LAST_ATTEMPT).length;
      console.log(
        reached
          ? `  → 5회차 없음: ${LAST_ATTEMPT}회차까지 간 대상은 ${reached}개지만 겨눈 곡선이 없어 거리를 못 잰다.`
          : `  → 5회차 없음. ${LAST_ATTEMPT}회차까지 간 대상이 하나도 없다.`,
      );
    } else {
      const closer = paired.filter((r) => (r.d1 as number) > (r.d5 as number)).length;
      console.log(`  → 가까워진 대상 ${closer} / ${paired.length} (둘 다 잰 대상만)`);
    }
    const unknown = group.filter((r) => r.voice === "모름").length;
    if (unknown) console.log(`  ※ 기준선 출처가 안 남은 대상 ${unknown}개. 목소리가 바뀌면 이 대상들은 못 쓴다.`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

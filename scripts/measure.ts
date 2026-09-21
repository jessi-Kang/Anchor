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
 * **곡선 거리는 `src/lib/pitch/distance.ts` 하나만 부른다.** 화면도 같은 모듈을 부른다 — 같은
 * 계산이 두 군데 있으면 어느 숫자가 맞는지 알 방법이 없다.
 *
 * 읽기만 한다. 한 행도 쓰지 않는다.
 */
import { loadEnv } from "./lib/load-env";
import { adminClient } from "./lib/admin-client";
import { curveDistance, toPoints, type PitchPoint } from "../src/lib/pitch/distance";

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
  synthetic: boolean;
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
  synthetic: boolean;
};

const n1 = (x: number) => x.toFixed(1);
const n3 = (x: number) => x.toFixed(3);

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
      qualified AS (
        SELECT e.node_id,
               n.display,
               e.recognized,
               EXTRACT(EPOCH FROM (i.created_at - l.landed_at)) / 86400 AS gap_days,
               (e.meta ->> 'synthetic' = 'true' OR i.meta ->> 'synthetic' = 'true') AS synthetic,
               row_number() OVER (PARTITION BY e.node_id ORDER BY e.created_at, e.id) AS rn
          FROM encounters e
          JOIN landed l ON l.node_id = e.node_id
          JOIN inputs i ON i.id = e.input_id
          JOIN nodes  n ON n.id = e.node_id
         WHERE e.user_id = $1
           AND e.recognized IS NOT NULL
           AND i.created_at >= l.landed_at + make_interval(days => $2::int)
      )
      SELECT node_id, display, recognized, gap_days, synthetic
        FROM qualified WHERE rn = 1 ORDER BY gap_days
      `,
      [userId, QUALIFY_DAYS],
    );

    /*
      자격에 못 미친 행과, 착지했지만 다시 안 나온 한자. **비율에는 안 들어간다.** 70% 가 안 나온
      날 그게 "아직 이르다"인지 "안 된다"인지를 가르는 재료라 같이 찍는다 (MEASURE 0′장).
    */
    const { rows: ctx } = await client.query<{ too_soon: string; landed: string; never_back: string }>(
      `
      WITH landed AS (
        SELECT node_id, min(landed_at) AS landed_at
          FROM cards WHERE user_id = $1 AND landed_at IS NOT NULL GROUP BY node_id
      ),
      -- 다시 나오기는 했는가. **자격은 안 본다** — 자격 미달은 아래에서 따로 세므로, 여기서까지
      -- 걸러 버리면 같은 글자가 "자격 미달" 과 "다시 안 나왔다" 두 곳에 잡혀 합이 안 맞는다.
      seen AS (
        SELECT DISTINCT e.node_id FROM encounters e WHERE e.user_id = $1 AND e.recognized IS NOT NULL
      )
      SELECT
        (SELECT count(DISTINCT e.node_id)::text
           FROM encounters e
           JOIN landed l ON l.node_id = e.node_id
           JOIN inputs i ON i.id = e.input_id
          WHERE e.user_id = $1 AND e.recognized IS NOT NULL
            AND i.created_at <  l.landed_at + make_interval(days => $2::int)) AS too_soon,
        (SELECT count(*)::text FROM landed) AS landed,
        (SELECT count(*)::text FROM landed WHERE node_id NOT IN (SELECT node_id FROM seen)) AS never_back
      `,
      [userId, QUALIFY_DAYS],
    );

    /*
      ── 2. 곡선 일치도 ────────────────────────────────────────────────────────
      대상은 카드 하나 또는 덩어리 하나다. 회차(attempt)는 서버가 INSERT 직전에 센 값이라
      화면 상태가 아니라 쌓인 사실이다. 1회차와 5회차만 쓰지만 전부 읽어 온다 — 중간 회차가
      비어 있는지(돌아갈 길이 없어 1회차만 다섯 개인지)를 같이 봐야 한다.
    */
    const { rows: rec } = await client.query<RecordingRow>(
      `
      SELECT COALESCE('card:' || r.card_id::text, 'chunk:' || r.chunk_id::text) AS target_key,
             COALESCE(n.display, left(ch.text, 40))                             AS label,
             COALESCE(c.lang::text, ch.lang::text)                              AS lang,
             r.attempt, r.pitch, r.target_pitch, r.target_voice_kind, r.target_voice_id,
             (r.meta ->> 'synthetic' = 'true')                                  AS synthetic
        FROM recordings r
        LEFT JOIN cards  c  ON c.id  = r.card_id
        LEFT JOIN nodes  n  ON n.id  = c.node_id
        LEFT JOIN chunks ch ON ch.id = r.chunk_id
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
  ctx: { too_soon: string; landed: string; never_back: string } | undefined,
  rec: RecordingRow[],
) {
  const synthetic = enc.some((r) => r.synthetic) || rec.some((r) => r.synthetic);
  console.log(`Anchor 측정 — ${new Date().toISOString()}`);
  console.log(`사용자: ${userId}`);
  console.log("정의: docs/MEASURE.md. 이 출력과 그 문서가 어긋나면 문서가 맞다. 통과·미달 판정은 M4 가 한다.");
  if (synthetic) {
    /*
      섞였다는 것만 말하고 빼지 않는다. 빼 버리면 배관을 확인하려고 만든 행이 출력에서 사라져
      "스크립트가 도는가"를 이 출력으로 볼 수 없게 된다. 숫자를 읽는 사람이 알고 읽으면 된다.
    */
    const en = enc.filter((r) => r.synthetic).length;
    const rn = new Set(rec.filter((r) => r.synthetic).map((r) => r.target_key)).size;
    console.log("");
    console.log(`※ 합성 행이 섞여 있다 — 재만남 ${en}자, 곡선 대상 ${rn}개. 이 숫자는 사람이 만든 것이 아니다.`);
    console.log("  배관 확인용으로 넣은 행(meta.synthetic = true)이다. 판정에 쓰지 않는다.");
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
      console.log(`  ${row.display.padEnd(4)}  ${n1(Number(row.gap_days)).padStart(7)}  ${row.recognized ? "안 열었다" : "열었다"}${row.synthetic ? "  (합성)" : ""}`);
    }
  }
  if (ctx) {
    console.log("");
    console.log(
      `참고: 착지한 한자 ${ctx.landed}자 · 자격 미달(간격 ${QUALIFY_DAYS}일 미만) ${ctx.too_soon}자 · 착지 뒤 다시 안 나온 한자 ${ctx.never_back}자`,
    );
    console.log("  자격 미달과 다시 안 나온 것은 비율에 안 들어간다. 왜 그 숫자가 나왔는지를 볼 재료다.");
  }

  // ── 2 ──────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("## 2. 곡선 일치도");
  console.log(`통과 후보: 같은 대상에서 거리(${FIRST_ATTEMPT}회차) > 거리(${LAST_ATTEMPT}회차). 단위는 반음, 낮을수록 가깝다`);

  const byTarget = new Map<string, RecordingRow[]>();
  for (const r of rec) {
    const rows = byTarget.get(r.target_key);
    if (rows) rows.push(r);
    else byTarget.set(r.target_key, [r]);
  }

  type Result = {
    label: string;
    lang: string;
    d1: number | null;
    d5: number | null;
    attempts: number;
    voice: string;
    synthetic: boolean;
  };
  const results: Result[] = [];
  for (const [, rows] of byTarget) {
    const at = (a: number) => rows.find((r) => r.attempt === a);
    const dist = (row: RecordingRow | undefined) =>
      row ? curveDistance(toPoints(row.pitch) as PitchPoint[] | null, toPoints(row.target_pitch) as PitchPoint[] | null) : null;
    const base = rows.find((r) => r.target_voice_id) ?? rows[0];
    results.push({
      label: rows[0].label ?? "?",
      lang: rows[0].lang ?? "?",
      d1: dist(at(FIRST_ATTEMPT)),
      d5: dist(at(LAST_ATTEMPT)),
      attempts: rows.length,
      // 기준선이 무엇으로 만들어졌는지. 안 남은 행은 "모름" 이다 — 0007 이전에 쌓인 회차이거나
      // 겨눈 소리가 아예 없던 회차다. 둘을 뭉개지 않게 목소리 ID 를 같이 낸다.
      voice: base.target_voice_kind ? `${base.target_voice_kind}/${base.target_voice_id ?? "?"}` : "모름",
      synthetic: rows.some((r) => r.synthetic),
    });
  }

  /*
    **언어를 가른다.** 영어는 프리셋이 영어 원어민 모델이라 "제대로 발음된 소리"의 대리로 쓸 만하다.
    일본어는 다국어 모델이 읽는 것이라 고저 악센트가 맞다는 보장이 없어, 둘 다 틀린 채로 일치하면
    통과가 나온다. 그래서 **판정은 영어로만 하고 일본어는 따로 적는다** (MEASURE 2장 "이 시험이
    닫지 못하는 것 — 일본어"). 여기서 합치면 그 결정이 출력에서 사라진다.
  */
  for (const [lang, title] of [
    ["en", "영어 (M4 판정 대상)"],
    ["ja", "일본어 (기준선이 맞는지 확인되지 않았다. 통과·미달에 넣지 않는다)"],
  ] as const) {
    const group = results.filter((r) => r.lang === lang);
    console.log("");
    console.log(`### ${title}`);
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
      console.log(`  ${label.padEnd(38)}  ${c1}   ${c5}   ${String(r.attempts).padStart(5)}  ${r.voice}${r.synthetic ? "  (합성)" : ""}`);
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

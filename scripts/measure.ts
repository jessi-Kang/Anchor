/**
 * 두 숫자를 뽑는다 — `pnpm measure <user_id>`
 *
 * 정의는 전부 `docs/MEASURE.md` 에 있고 **여기는 그 문서를 그대로 코드로 옮긴 자리다.** 그날 손으로
 * SQL 을 짜면 그날의 정의가 되고, 문서와 어긋나도 아무도 모른다 (MEASURE 3장).
 *
 * 규칙 중 이 파일이 지켜야 하는 것:
 *  - **없는 것을 0 으로 찍지 않는다.** 표본이 없으면 "표본 부족", 5회차가 없으면 "5회차 없음",
 *    곡선을 못 재면 "잴 수 없음" 이다. 0 은 "쟀더니 0" 이라는 뜻이라 없는 것과 다른 말이다.
 *  - **자격은 여기서 건다.** `encounters` 는 일어난 일을 그대로 적고(MEASURE 0′), 착지 +3일·
 *    글자마다 첫 재만남 한 번은 이 스크립트가 고른다. 그래서 3일을 5일로 옮겨도 다시 셀 수 있다.
 *  - **합성 행이 섞이면 머리말에 적는다.** 도구를 시험하려고 만든 숫자를 통과 판정으로 읽으면 안 된다.
 *
 * 값이 좋은지 나쁜지는 여기서 안 따진다(M4). 이 스크립트는 세기만 한다.
 */
import { adminClient } from "./lib/admin-client";
import { loadEnv } from "./lib/load-env";
import { pitchDistance, type PitchPoint } from "../src/lib/pitch/distance";

/** 착지 후 이만큼 지난 뒤의 자료에서의 출현만 재만남으로 센다 (MEASURE 1장 "자격"). */
const QUALIFY_DAYS = 3;
/** 분모가 이보다 적으면 비율을 발표하지 않는다 (MEASURE 1장 "표본 하한"). */
const MIN_SAMPLE = 10;
/** 곡선 통과 판정은 1회차와 이 회차를 견준다 (MEASURE 2장). */
const LAST_ATTEMPT = 5;

type Recog = {
  denom: number;
  numer: number;
  early: number;
  unread: number;
  rows: { kanji: string; recognized: boolean; gapDays: number }[];
};

async function recognition(db: ReturnType<typeof adminClient>, userId: string): Promise<Recog> {
  // 착지한 카드가 있는 노드만 분모 후보다. 같은 한자를 두 번 착지했으면 **처음** 착지가 기준이다.
  const landed = `SELECT node_id, min(landed_at) AS landed_at
                    FROM cards WHERE user_id = $1 AND landed_at IS NOT NULL GROUP BY node_id`;
  const gap = `interval '${QUALIFY_DAYS} days'`;

  const { rows } = await db.query(
    `WITH landed AS (${landed}),
     -- 자격: 착지 +3일 뒤에 **넣은** 자료에서의 출현. 판정이 없는 행(recognized IS NULL)은 세지 않는다.
     qualified AS (
       SELECT e.node_id, e.recognized, e.created_at, i.created_at AS input_at, l.landed_at
         FROM encounters e
         JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
         JOIN landed l ON l.node_id = e.node_id
        WHERE e.user_id = $1 AND e.recognized IS NOT NULL
          AND i.created_at >= l.landed_at + ${gap}
     )
     -- 글자마다 **첫** 재만남 한 번. 고빈도자 하나가 비율을 지배하지 않게 (MEASURE 1장 "분자").
     -- 행을 덮어쓰지 않으므로(0′) 같은 자료를 다시 읽은 줄은 뒤에 쌓이고, 여기서 걸러진다.
     SELECT DISTINCT ON (q.node_id) n.key AS kanji, q.recognized,
            EXTRACT(EPOCH FROM (q.input_at - q.landed_at)) / 86400 AS gap_days
       FROM qualified q JOIN nodes n ON n.id = q.node_id
      ORDER BY q.node_id, q.created_at`,
    [userId],
  );

  // 자격 미달로 버린 행 수. "70% 가 안 나온 날, 아직 이른 것인지 안 되는 것인지" 를 가를 재료가
  // 이 행들 안에 있다 (MEASURE 0′). 버렸다는 사실만이라도 같이 찍는다.
  const { rows: e } = await db.query(
    `WITH landed AS (${landed})
     SELECT count(*) AS n FROM encounters e
       JOIN inputs i ON i.id = e.input_id AND i.user_id = $1
       JOIN landed l ON l.node_id = e.node_id
      WHERE e.user_id = $1 AND e.recognized IS NOT NULL AND i.created_at < l.landed_at + ${gap}`,
    [userId],
  );

  // **기회는 있었는데 판정이 없는 것.** 자격을 갖춘 자료 본문에 그 글자가 있는데 그 자료를 끝까지
  // 읽지 않아 행이 없다. MEASURE 의 분모는 "다시 나온 것" 인데 우리가 아는 것은 "다시 나온 것 중
  // 읽은 것" 뿐이라, 이 수를 따로 찍어 둔다 — 분모에 넣으면 행동이 없던 자리를 "못 읽었다" 로 세게 되고,
  // 안 찍으면 분모가 왜 작은지 알 길이 없다.
  const { rows: u } = await db.query(
    `WITH landed AS (${landed})
     SELECT count(DISTINCT l.node_id) AS n
       FROM landed l
       JOIN nodes n ON n.id = l.node_id
       JOIN inputs i ON i.user_id = $1 AND i.created_at >= l.landed_at + ${gap} AND strpos(i.body, n.key) > 0
      WHERE NOT EXISTS (SELECT 1 FROM encounters x
                         WHERE x.user_id = $1 AND x.node_id = l.node_id AND x.input_id = i.id
                           AND x.recognized IS NOT NULL)`,
    [userId],
  );

  const items = rows.map((r) => ({ kanji: r.kanji as string, recognized: r.recognized as boolean, gapDays: Number(r.gap_days) }));
  return {
    denom: items.length,
    numer: items.filter((i) => i.recognized).length,
    early: Number(e[0].n),
    unread: Number(u[0].n),
    rows: items,
  };
}

type Target = {
  label: string;
  lang: string;
  first: number | null;
  last: number | null;
  /** 잴 수 없으면 왜인지. 숫자 대신 이 말을 찍는다. */
  why: string | null;
};

async function curves(db: ReturnType<typeof adminClient>, userId: string) {
  const { rows } = await db.query(
    `SELECT r.attempt, r.pitch, r.target_pitch, r.created_at,
            coalesce('card:' || r.card_id::text, 'chunk:' || r.chunk_id::text) AS target,
            coalesce(c.lang::text, ch.lang::text) AS lang,
            coalesce(ch.text, c.payload->>'kanji', '(알 수 없음)') AS label
       FROM recordings r
       LEFT JOIN cards  c  ON c.id  = r.card_id
       LEFT JOIN chunks ch ON ch.id = r.chunk_id
      WHERE r.user_id = $1 AND r.attempt IN (1, $2)
      ORDER BY r.created_at`,
    [userId, LAST_ATTEMPT],
  );

  type Take = { lang: string; label: string; a1?: (typeof rows)[number]; aN?: (typeof rows)[number] };
  const byTarget = new Map<string, Take>();
  for (const r of rows) {
    const t: Take = byTarget.get(r.target) ?? { lang: r.lang ?? "xx", label: r.label };
    // 같은 회차가 여러 줄이면 **먼저 쌓인 것**을 쓴다. 회차는 서버가 count(*)+1 로 세므로 보통 한 줄이다.
    if (r.attempt === 1) t.a1 ??= r;
    else t.aN ??= r;
    byTarget.set(r.target, t);
  }

  const out: Target[] = [];
  let baselineDrift = 0;
  for (const t of byTarget.values()) {
    if (!t.a1 || !t.aN) continue; // 5회차까지 안 간 대상은 곡선 판정에 안 들어간다.
    // **기준선은 1회차에 뽑은 것 하나로 고정한다** (MEASURE 2장). 회차마다 다시 합성한 곡선을 쓰면
    // 거리 변화가 발음이 나아진 것인지 TTS 가 달라진 것인지 구분이 안 된다.
    const base = t.a1.target_pitch as PitchPoint[] | null;
    if (!base) {
      out.push({ label: t.label, lang: t.lang, first: null, last: null, why: "기준선 없음" });
      continue;
    }
    if (JSON.stringify(t.aN.target_pitch) !== JSON.stringify(base)) baselineDrift++;
    const first = pitchDistance(t.a1.pitch as PitchPoint[], base);
    const last = pitchDistance(t.aN.pitch as PitchPoint[], base);
    out.push({ label: t.label, lang: t.lang, first, last, why: first === null || last === null ? "잴 수 없음" : null });
  }
  return { targets: out, baselineDrift, hasFifth: out.length > 0 };
}

/** 합성 시드가 섞였는가. 시험용 숫자를 통과 판정으로 읽는 일만은 막는다. */
async function synthetic(db: ReturnType<typeof adminClient>, userId: string) {
  const { rows } = await db.query(
    `SELECT (SELECT settings->>'synthetic' FROM users WHERE id = $1) AS user_flag,
            (SELECT count(*) FROM inputs WHERE user_id = $1 AND meta->>'synthetic' = 'true') AS inputs,
            (SELECT count(*) FROM cards  WHERE user_id = $1 AND payload->>'synthetic' = 'true') AS cards,
            (SELECT count(*) FROM chunks WHERE user_id = $1 AND meta->>'synthetic' = 'true') AS chunks`,
    [userId],
  );
  const r = rows[0];
  const n = Number(r.inputs) + Number(r.cards) + Number(r.chunks);
  return { flagged: r.user_flag === "true" || n > 0, user: r.user_flag === "true", rows: n };
}

const d1 = (x: number) => x.toFixed(1);
const d2 = (x: number) => x.toFixed(2);

async function main() {
  loadEnv();
  const userId = process.argv[2];
  if (!userId) {
    console.error("쓰는 법: pnpm measure <user_id>");
    console.error("누구의 숫자인지 말하지 않으면 셀 수 없다 — 계정이 섞이면 그 숫자는 아무 말도 안 한다.");
    process.exit(2);
  }

  const db = adminClient();
  await db.connect();
  try {
    const { rows: who } = await db.query("SELECT id, email FROM users WHERE id = $1", [userId]);
    if (!who.length) {
      console.error(`그런 계정이 없다: ${userId}`);
      process.exit(2);
    }
    const syn = await synthetic(db, userId);
    const rec = await recognition(db, userId);
    const cur = await curves(db, userId);

    console.log(`측정 — ${who[0].id}`);
    console.log(`잰 날: ${new Date().toISOString().slice(0, 10)} · 정의: docs/MEASURE.md`);
    if (syn.flagged)
      console.log(
        `⚠ 합성 데이터가 섞였다${syn.user ? " (계정 자체가 합성)" : ""}${syn.rows ? ` · 표시된 행 ${syn.rows}개` : ""} — 통과 판정에 쓰지 마라.`,
      );
    console.log("");

    console.log("■ 재만남 인식률");
    console.log(`  자격: 카드 착지 +${QUALIFY_DAYS}일 뒤에 넣은 자료에서의 출현, 글자마다 첫 재만남 한 번`);
    if (rec.denom < MIN_SAMPLE) {
      console.log(`  표본 부족 — 분모 ${rec.denom} (하한 ${MIN_SAMPLE}). 비율을 내지 않는다.`);
      if (rec.denom) console.log(`  (참고로 지금까지: 열지 않고 읽음 ${rec.numer} / ${rec.denom})`);
    } else {
      console.log(`  ${d1((rec.numer / rec.denom) * 100)}%  =  ${rec.numer} / ${rec.denom}`);
    }
    console.log(`  자격 미달로 뺀 행: ${rec.early}개 (착지 +${QUALIFY_DAYS}일 안에 다시 나옴)`);
    console.log(`  기회는 있었는데 판정이 없음: ${rec.unread}자 (그 자료를 "읽기 끝" 까지 안 갔다)`);
    if (rec.rows.length) {
      // 간격이 짧을 때와 길 때 인식률이 어떻게 다른지가 "아직 이른 것인지 안 되는 것인지" 를 가른다
      // (MEASURE 0′). 그래서 글자 순이 아니라 **간격 순**으로 줄 세운다.
      console.log("  글자별:");
      for (const r of [...rec.rows].sort((a, b) => a.gapDays - b.gapDays))
        console.log(`    ${r.kanji}  ${r.recognized ? "열지 않음" : "열었음  "}  착지 +${d1(r.gapDays)}일`);
    }
    console.log("");

    console.log("■ 곡선 일치도");
    console.log(`  1회차와 ${LAST_ATTEMPT}회차를, 1회차에 고정한 기준선과 견준다. 단위는 반음(작을수록 가깝다).`);
    if (!cur.hasFifth) {
      console.log(`  ${LAST_ATTEMPT}회차 없음 — 같은 대상에 ${LAST_ATTEMPT}회차까지 쌓인 것이 하나도 없다.`);
    } else {
      const measured = cur.targets.filter((t) => t.first !== null && t.last !== null);
      const closer = measured.filter((t) => (t.last as number) < (t.first as number)).length;
      for (const t of cur.targets) {
        const head = `    [${t.lang}] ${t.label}`;
        if (t.why) console.log(`${head} — ${t.why}`);
        else
          console.log(
            `${head} — ${d2(t.first as number)} → ${d2(t.last as number)} (${(t.last as number) < (t.first as number) ? "가까워짐" : "멀어짐"})`,
          );
      }
      console.log(`  가까워진 대상: ${closer} / ${measured.length}`);
      const unmeasured = cur.targets.length - measured.length;
      if (unmeasured) console.log(`  못 잰 대상: ${unmeasured}개 (분모에서 뺐다 — 0 으로 세지 않는다)`);
      // 판정은 영어로만 한다: 다국어 TTS 가 읽는 일본어는 고저 악센트가 맞다는 보장이 없어서,
      // 둘 다 틀린 채 일치하면 "틀린 목표에 가까워지는 것" 을 통과라고 부르게 된다 (MEASURE 2장).
      const en = measured.filter((t) => t.lang === "en");
      console.log(
        `  그중 영어(판정에 쓰는 것): ${en.filter((t) => (t.last as number) < (t.first as number)).length} / ${en.length}` +
          (en.length ? "" : " — 영어 표본 없음"),
      );
      console.log("  일본어는 기준선이 확인되지 않아 따로 적고 통과·미달에 넣지 않는다 (MEASURE 2장).");
      if (cur.baselineDrift)
        console.log(`  ⚠ 기준선이 회차마다 다른 대상 ${cur.baselineDrift}개 — 그 거리 변화는 발음이 아니라 TTS 를 잰 것일 수 있다.`);
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

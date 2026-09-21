/**
 * 폴백이 얼마나 자주 떴는가 — `pnpm fallbacks [user_id]`
 *
 * **값은 이미 행마다 있는데 아무도 안 보고 있었다.** `node_cards.source`,
 * `chunks.meta.content_source`, `cards.payload.content_source` 에 'authored' / 'claude' /
 * 'fallback' 이 적혀 있다. 폴백이 뜨면 화면이 **사용자의 언어가 아닌 것**을 보여 주는데
 * (한자 카드 정답에 KANJIDIC 영어, 못 한 말에 사용자가 쓴 한국어), 그게 하루에 한 번인지
 * 절반인지 아는 사람이 없었다. 이 스크립트가 그 자리다.
 *
 * **고치는 것이 아니라 세는 것이다.** 무엇을 고칠지는 문안 판정이 정하고, 이건 그 판정이
 * 얼마나 급한지를 숫자로 말한다. 읽기만 하고 한 행도 쓰지 않는다.
 *
 * 없는 것을 0 으로 찍지 않는다 — 행이 하나도 없으면 "행 없음" 이라고 한다. 0% 는 "다 잘 됐다"
 * 는 뜻이고 표본이 없는 것과 다른 말이다.
 */
import { loadEnv } from "./lib/load-env";
import { adminClient } from "./lib/admin-client";

loadEnv();

type Row = { kind: string; source: string; n: string };

const UNKNOWN = "(안 적힘)";

/**
 * 한 묶음을 한 줄로.
 *
 * **출처가 안 적힌 행은 분모에서 뺀다.** 이 칸이 생기기 전에 쌓인 행이라 폴백이었는지 아닌지
 * 알 수가 없는데, 분모에 넣으면 "아닌 것" 으로 세어 **폴백 비율이 실제보다 낮게 나온다.**
 * 모르는 것을 좋은 쪽으로 세지 않는다 — 따로 몇 개인지만 적는다.
 */
function line(label: string, counts: Map<string, number>) {
  const unknown = counts.get(UNKNOWN) ?? 0;
  const known = [...counts.entries()].filter(([k]) => k !== UNKNOWN);
  const total = known.reduce((s, [, v]) => s + v, 0);
  const parts = [...counts.entries()].sort().map(([k, v]) => `${k} ${v}`).join(" · ") || "행 없음";
  const bad = counts.get("fallback") ?? 0;
  const ratio = total === 0 ? "출처가 적힌 행이 없다" : `폴백 ${((bad / total) * 100).toFixed(1)}% (${bad}/${total})`;
  console.log(`  ${label}  ${parts}`);
  console.log(`      → ${ratio}${unknown ? ` · 출처 모름 ${unknown}행(분모에서 뺐다)` : ""}`);
}

async function main() {
  const userId = process.argv[2];
  const db = adminClient();
  await db.connect();
  try {
    console.log(`폴백 집계 — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    console.log(userId ? `사용자: ${userId}` : "전체 계정");
    console.log("");

    // node_cards 는 공용 캐시라 사용자로 못 가른다. 가를 수 있는 척하지 않고 그렇게 적는다.
    const { rows: nc } = await db.query<Row>(
      "SELECT 'node_cards' AS kind, source, count(*)::text AS n FROM node_cards GROUP BY source",
    );
    // **폴백은 캐시에 안 들어간다**(`card-content.ts`: 키가 생기면 다시 만들게). 그래서 이 표는
    // "만들어 둔 것" 만 세고, 폴백이 몇 번 떴는지는 여기서 안 나온다. 아래 cards 가 그걸 센다.
    const ncMap = new Map(nc.map((r) => [r.source, Number(r.n)]));

    const where = userId ? "WHERE user_id = $1" : "";
    const args = userId ? [userId] : [];
    const { rows: cd } = await db.query<Row>(
      `SELECT 'cards' AS kind, coalesce(payload ->> 'content_source', '(안 적힘)') AS source, count(*)::text AS n
         FROM cards ${where} GROUP BY 2`,
      args,
    );
    const { rows: ch } = await db.query<Row>(
      `SELECT 'chunks' AS kind, coalesce(meta ->> 'content_source', '(안 적힘)') AS source, count(*)::text AS n
         FROM chunks ${where} GROUP BY 2`,
      args,
    );
    // 후리가나는 source 를 안 남긴다. 대신 **읽기가 붙었는가**가 같은 것을 말한다 — 모델이
    // 실패하면 `meta.readings` 가 아예 안 생기고 그 자료는 ruby 없이 간다 (`furigana.ts`).
    const { rows: fu } = await db.query<{ with_r: string; without_r: string }>(
      `SELECT count(*) FILTER (WHERE meta ? 'readings')::text AS with_r,
              count(*) FILTER (WHERE NOT (meta ? 'readings'))::text AS without_r
         FROM inputs ${where}${where ? " AND" : "WHERE"} lang = 'ja'`,
      args,
    );

    console.log("■ 문안이 어디서 왔나 (폴백 = 사용자의 언어가 아닌 것이 화면에 뜬 회차)");
    line("한자 카드(cards)", new Map(cd.map((r) => [r.source, Number(r.n)])));
    line("못 한 말(chunks)", new Map(ch.map((r) => [r.source, Number(r.n)])));
    console.log("");
    console.log("■ 참고");
    console.log(
      `  node_cards 캐시  ${[...ncMap.entries()].sort().map(([k, v]) => `${k} ${v}`).join(" · ") || "행 없음"}`,
    );
    console.log("      폴백은 캐시에 안 들어간다 — 이 표는 '만들어 둔 것' 만 센다");
    const w = Number(fu[0]?.with_r ?? 0);
    const wo = Number(fu[0]?.without_r ?? 0);
    console.log(
      w + wo === 0
        ? "  일본어 자료 읽기  행 없음"
        : `  일본어 자료 읽기  붙음 ${w} · 없음 ${wo}\n      → 읽기 없이 간 자료 ${((wo / (w + wo)) * 100).toFixed(1)}%`,
    );
    console.log("      후리가나는 실패해도 지어내지 않는다(ruby 없이 간다). 그게 맞는 모양이다");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

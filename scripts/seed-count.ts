/**
 * 공용 씨앗이 지금 몇 행인가 — `pnpm tsx scripts/seed-count.ts`
 *
 * **읽기만 한다. 한 행도 안 쓴다.** 적재 앞뒤에 같은 것을 찍어 **무엇이 얼마나 늘었는지**를
 * 사람이 눈으로 가르게 하려고 있다. 적재 스크립트가 찍는 수는 "입력이 몇 개였나" 지
 * "DB 에 몇 행이 섰나" 가 아니라서, 둘이 갈리는 날 그 차이가 안 보인다.
 *
 * **없는 것을 0 으로 찍지 않는다** — 표가 없으면 그렇게 말한다. 0 은 "비어 있다" 는 뜻이고
 * "못 셌다" 와 다른 말이다.
 */
import { loadEnv } from "./lib/load-env";
import { adminClient } from "./lib/admin-client";

loadEnv();

const ROWS: [string, string][] = [
  ["한자", "SELECT count(*) FROM nodes WHERE user_id IS NULL AND lang='ja' AND kind='kanji'"],
  ["부품", "SELECT count(*) FROM nodes WHERE user_id IS NULL AND lang='ja' AND kind='radical'"],
  ["한국 한자음", "SELECT count(*) FROM nodes WHERE user_id IS NULL AND lang='ko' AND kind='sound'"],
  ["영어", "SELECT count(*) FROM nodes WHERE user_id IS NULL AND lang='en'"],
  ["엣지 part_of", "SELECT count(*) FROM edges WHERE user_id IS NULL AND rel='part_of'"],
  ["엣지 ko_sound_of", "SELECT count(*) FROM edges WHERE user_id IS NULL AND rel='ko_sound_of'"],
  ["엣지 합계", "SELECT count(*) FROM edges WHERE user_id IS NULL"],
];

async function main() {
  const client = adminClient();
  await client.connect();
  try {
    for (const [label, sql] of ROWS) {
      try {
        const { rows } = await client.query<{ count: string }>(sql);
        console.log(`  ${label.padEnd(16)} ${rows[0].count}`);
      } catch (e) {
        console.log(`  ${label.padEnd(16)} 못 셌다 — ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

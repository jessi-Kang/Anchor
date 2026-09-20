/**
 * 공용 참조 노드 적재 (user_id IS NULL).
 *   pnpm db:seed
 *
 * DATABASE_URL_ADMIN (없으면 DATABASE_URL) 로 접속한다. 앱 역할은 공용 노드를 쓸 수 없다(RLS).
 * O04 영어 씨앗(db/seed/en-seed.json)과 O05 한자 씨앗(db/seed/ja-seed.json). 이후 KANJIDIC2·IDS·한자음 적재도 여기에 붙인다.
 * 같은 (lang, kind, key) 는 갱신하고, 새 것만 추가한다. 사용자 상태(user_node_state)는 건드리지 않는다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { loadEnv } from "./lib/load-env";

loadEnv();

type SeedItem = {
  kind: "root" | "chunk";
  key: string;
  display: string;
  definition: string;
  example: string;
  /** 어근·접사: 스페인어 대응, 들어가는 업무 단어 */
  es?: string;
  words?: string[];
  /** 덩어리: 태도 9종, 강도(1→2), 한국어 말끝 앵커 */
  attitude?: string;
  intensity?: number;
  ko_anchor?: string;
};

type KanjiItem = { kanji: string; ko_sound: string; ko_word: string; onyomi: string; example: string; reading: string; pattern: string };

async function main() {
  // 관리 연결: DATABASE_URL_ADMIN 이 없으면 Vercel Neon 통합이 주입하는 DATABASE_URL(소유자 역할)을 쓴다.
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_ADMIN (또는 DATABASE_URL) 이 필요하다");

  const file = path.resolve(process.cwd(), "db/seed/en-seed.json");
  const { items } = JSON.parse(readFileSync(file, "utf8")) as { items: SeedItem[] };

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (const [i, it] of items.entries()) {
      await client.query(
        `INSERT INTO nodes (user_id, lang, kind, key, display, meta)
         VALUES (NULL, 'en', $1, $2, $3, $4)
         ON CONFLICT (lang, kind, key) WHERE user_id IS NULL
         DO UPDATE SET display = EXCLUDED.display, meta = nodes.meta || EXCLUDED.meta`,
        [
          it.kind,
          it.key,
          it.display,
          JSON.stringify({
            seed: "en-onboarding",
            seed_order: i,
            definition: it.definition,
            example: it.example,
            ...(it.es ? { es: it.es } : {}),
            ...(it.words ? { words: it.words } : {}),
            ...(it.attitude ? { attitude: it.attitude, intensity: it.intensity ?? 1, ko_anchor: it.ko_anchor } : {}),
          }),
        ],
      );
      n++;
    }
    console.log(`en-seed: ${n} 노드 적재`);

    const ja = JSON.parse(readFileSync(path.resolve(process.cwd(), "db/seed/ja-seed.json"), "utf8")) as { items: KanjiItem[] };
    let m = 0;
    for (const [i, it] of ja.items.entries()) {
      await client.query(
        `INSERT INTO nodes (user_id, lang, kind, key, display, reading, meta)
         VALUES (NULL, 'ja', 'kanji', $1, $1, $2, $3)
         ON CONFLICT (lang, kind, key) WHERE user_id IS NULL
         DO UPDATE SET reading = EXCLUDED.reading, meta = nodes.meta || EXCLUDED.meta`,
        [
          it.kanji,
          it.onyomi,
          JSON.stringify({
            seed: "ja-onboarding",
            seed_order: i,
            ko_sound: it.ko_sound,
            ko_word: it.ko_word,
            example: it.example,
            example_reading: it.reading,
            pattern: it.pattern,
          }),
        ],
      );
      m++;
    }
    await client.query("COMMIT");
    console.log(`ja-seed: ${m} 노드 적재`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

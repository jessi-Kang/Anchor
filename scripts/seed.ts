/**
 * 공용 참조 노드 적재 (user_id IS NULL).
 *   pnpm db:seed
 *
 * DATABASE_URL_ADMIN (없으면 DATABASE_URL) 로 접속한다. 앱 역할은 공용 노드를 쓸 수 없다(RLS).
 * 같은 (lang, kind, key) 는 갱신하고, 새 것만 추가한다. 사용자 상태(user_node_state)는 건드리지 않는다.
 *
 * 1. en-seed.json   영어 어근·덩어리 40 (F03 영어 뽑기·F13 재료. 씨앗 단계는 폐기됐지만 노드는 남긴다)
 * 2. parts-ko.json  한자 부품 이름 → radical 노드 (meta.ko_name "열 십")
 * 3. kanji.json     상용한자 2,136 → kanji 노드 (음독·훈독·한국 한자음·영어 뜻·부품)
 *    + kanji-ko.json / ja-seed.json 의 한국어 앵커 단어 (meta.ko_word)
 *    + kanji-cards.json 의 손으로 적은 카드 문안 (meta.card)
 *    + 엣지: 부품 part_of 한자, 한국 한자음 sound 노드 ko_sound_of 한자
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/load-env";
import { adminClient } from "./lib/admin-client";

loadEnv();

type SeedItem = {
  kind: "root" | "chunk";
  key: string;
  display: string;
  definition: string;
  example: string;
  es?: string;
  words?: string[];
  attitude?: string;
  intensity?: number;
  ko_anchor?: string;
};
type KanjiSeedItem = { kanji: string; ko_sound: string; ko_word: string; onyomi: string; example: string; reading: string; pattern: string };
type KanjiItem = { kanji: string; grade: number; freq: number | null; jlpt: number | null; on: string[]; kun: string[]; ko: string | null; meanings: string[]; parts: string[] };

const read = <T,>(f: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), "db/seed", f), "utf8")) as T;

async function main() {

  const en = read<{ items: SeedItem[] }>("en-seed.json").items;
  const partsKo = read<{ parts: Record<string, string> }>("parts-ko.json").parts;
  const kanji = read<{ items: KanjiItem[] }>("kanji.json").items;
  const koWords = read<{ words: Record<string, string> }>("kanji-ko.json").words;
  const jaSeed = read<{ items: KanjiSeedItem[] }>("ja-seed.json").items;
  const cards = read<{ cards: Record<string, unknown> }>("kanji-cards.json").cards;
  const seedByKanji = new Map(jaSeed.map((it) => [it.kanji, it]));

  const client = adminClient();
  await client.connect();
  try {
    await client.query("BEGIN");

    // 1. 영어 어근·덩어리
    for (const [i, it] of en.entries()) {
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
    }
    console.log(`en-seed: ${en.length} 노드`);

    // 2. 부품 (radical). 이름이 있는 것 + kanji.json 부품에 나오는 이름 없는 것
    const partChars = new Set<string>(Object.keys(partsKo));
    for (const it of kanji) for (const p of it.parts) partChars.add(p);
    const partId = new Map<string, string>();
    for (const ch of partChars) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO nodes (user_id, lang, kind, key, display, meta)
         VALUES (NULL, 'ja', 'radical', $1, $1, $2)
         ON CONFLICT (lang, kind, key) WHERE user_id IS NULL
         DO UPDATE SET meta = nodes.meta || EXCLUDED.meta
         RETURNING id`,
        [ch, JSON.stringify(partsKo[ch] ? { ko_name: partsKo[ch] } : {})],
      );
      partId.set(ch, rows[0].id);
    }
    console.log(`부품: ${partChars.size} 노드`);

    // 3. 한자
    const kanjiId = new Map<string, string>();
    const soundId = new Map<string, string>();
    let edges = 0;
    for (const it of kanji) {
      const seed = seedByKanji.get(it.kanji);
      const koWord = koWords[it.kanji] ?? seed?.ko_word;
      const meta: Record<string, unknown> = {
        on: it.on,
        kun: it.kun,
        ko_sound: it.ko ?? seed?.ko_sound ?? null,
        meanings: it.meanings,
        parts: it.parts,
        grade: it.grade,
        freq: it.freq,
        jlpt: it.jlpt,
        ...(koWord ? { ko_word: koWord } : {}),
        ...(seed ? { seed: "ja-onboarding", example: seed.example, example_reading: seed.reading, pattern: seed.pattern } : {}),
        ...(cards[it.kanji] ? { card: cards[it.kanji] } : {}),
      };
      const reading = seed?.onyomi ?? it.on[0] ?? null;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO nodes (user_id, lang, kind, key, display, reading, meta)
         VALUES (NULL, 'ja', 'kanji', $1, $1, $2, $3)
         ON CONFLICT (lang, kind, key) WHERE user_id IS NULL
         DO UPDATE SET reading = EXCLUDED.reading, meta = nodes.meta || EXCLUDED.meta
         RETURNING id`,
        [it.kanji, reading, JSON.stringify(meta)],
      );
      const id = rows[0].id;
      kanjiId.set(it.kanji, id);

      // 부품 ∈ 한자
      for (const p of new Set(it.parts)) {
        const pid = partId.get(p);
        if (!pid || pid === id) continue;
        await client.query(
          `INSERT INTO edges (user_id, src, dst, rel, weight, meta) VALUES (NULL, $1, $2, 'part_of', $3, '{}')
           ON CONFLICT (src, dst, rel) WHERE user_id IS NULL DO UPDATE SET weight = EXCLUDED.weight`,
          [pid, id, it.parts.filter((x) => x === p).length],
        );
        edges++;
      }

      // 한국 한자음 → 한자 (ko sound 노드는 한 소리에 하나)
      const ko = it.ko ?? seed?.ko_sound;
      if (ko) {
        let sid = soundId.get(ko);
        if (!sid) {
          const { rows: s } = await client.query<{ id: string }>(
            `INSERT INTO nodes (user_id, lang, kind, key, display, meta) VALUES (NULL, 'ko', 'sound', $1, $1, '{}')
             ON CONFLICT (lang, kind, key) WHERE user_id IS NULL DO UPDATE SET display = EXCLUDED.display RETURNING id`,
            [ko],
          );
          sid = s[0].id;
          soundId.set(ko, sid);
        }
        await client.query(
          `INSERT INTO edges (user_id, src, dst, rel) VALUES (NULL, $1, $2, 'ko_sound_of')
           ON CONFLICT (src, dst, rel) WHERE user_id IS NULL DO NOTHING`,
          [sid, id],
        );
        edges++;
      }
    }
    await client.query("COMMIT");
    console.log(`한자: ${kanji.length} 노드, 한국 한자음: ${soundId.size} 노드, 엣지: ${edges}`);
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

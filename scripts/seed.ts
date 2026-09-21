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
import { ORPHAN_SOUND_DELETE } from "../src/lib/db/node-guard";

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

    // 2. 부품 (radical). 이름이 있는 것 + kanji.json 부품에 나오는 것
    const partChars = new Set<string>(Object.keys(partsKo));
    for (const it of kanji) for (const p of it.parts) partChars.add(p);
    /*
      **부를 이름이 없으면 그 글자의 한국 한자음으로 떨어진다.**
      `parts-ko.json` 은 부수·구성요소의 훈("열 십")만 갖고 있어서, **그 자체가 상용한자인 부품**
      (不·与·丘·先·保·倉·光·兵·前·北·南… 112종)이 "이름 없음" 으로 취급되고 있었다. 씨앗에 한국
      한자음이 이미 있는데도다. 그대로 두면 "이름 없는 부품은 뺀다" 규칙이 그 112종을 같이 버려서
      한자 143자가 괜히 「부품 없음」으로 간다.

      소리 한 글자가 훈보다 덜 주는 것이라 규칙에도 맞다 — "판정 자리에는 발판을 주되 가장 적게,
      소리만 주는 쪽이 낱말까지 주는 쪽보다 덜 준다" (커밋 `00f3b7b`, docs/FLOW.md 4장).

      여기 한 곳에서 채운다. 화면(`getPartNames`)은 노드의 `ko_name` 만 읽으면 되고, 씨앗을 다시
      적재해도 살아남는다.
    */
    const koSoundOf = new Map(kanji.filter((it) => it.ko).map((it) => [it.kanji, it.ko as string]));
    const partId = new Map<string, string>();
    for (const ch of partChars) {
      const name = partsKo[ch] ?? koSoundOf.get(ch);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO nodes (user_id, lang, kind, key, display, meta)
         VALUES (NULL, 'ja', 'radical', $1, $1, $2)
         ON CONFLICT (lang, kind, key) WHERE user_id IS NULL
         DO UPDATE SET meta = nodes.meta || EXCLUDED.meta
         RETURNING id`,
        [ch, JSON.stringify(name ? { ko_name: name } : {})],
      );
      partId.set(ch, rows[0].id);
    }
    console.log(`부품: ${partChars.size} 노드`);

    // 3. 한자
    const kanjiId = new Map<string, string>();
    const soundId = new Map<string, string>();
    let edges = 0;
    let dropped = 0;
    /** 지운 행 수를 세어 돌려준다 — 조용한 DELETE 를 안 만든다. */
    const drop = async (sql: string, params: unknown[]) => (await client.query(sql, params)).rowCount ?? 0;
    for (const it of kanji) {
      const seed = seedByKanji.get(it.kanji);
      const koWord = koWords[it.kanji] ?? seed?.ko_word;
      /*
        **없는 칸도 `null` 로 적는다. 빼면 안 된다.**

        위 upsert 는 `meta = nodes.meta || EXCLUDED.meta` 다. jsonb `||` 는 **오른쪽에 없는 키를
        왼쪽에서 그대로 살린다.** 그래서 조건부 전개(`...(x ? { k: x } : {})`)로 칸을 빼면,
        **파일에서 지운 값이 DB 에서는 안 지워진다.** 적재는 "파일이 말하는 상태"가 아니라
        "파일이 말한 적 있는 모든 상태의 합"이 된다.

        **돌려서 봤다** (로컬, 2026-09-21): `駅` 의 앵커를 「역」으로 넣어 놓고 — 표에서 뺀 뒤의
        파일로 — 다시 적재하니 `meta.ko_word` 가 **「역」 그대로 남았다.** F03 은 그 한 칸으로
        두 묶음을 가르므로, 화면은 표에서 뺀 지 한참 뒤에도 **"역의 역"** 이라고 말한다.
        규칙 1 이 물린 바로 그 거짓말이 적재를 타고 살아남는 것이다.

        셋 다 같은 모양이라 셋 다 적는다 — 앵커 낱말이 빠질 수 있듯, 한자가 `ja-seed.json` 에서
        빠지면 예문이, `kanji-cards.json` 에서 빠지면 손 카드가 똑같이 남는다. 지금 그 두 자리가
        실제로 빠진 적은 없지만, **한 번 빠지면 아무도 화면에서 못 알아본다**(앵커는 오늘 열둘이
        빠졌고, 그때도 화면만 보고는 몰랐다). 읽는 쪽은 전부 `?? null` 이나 참/거짓이라 `null` 과
        「없음」을 같게 본다(`meta ->> 'ko_word'` 도 SQL NULL 이다).
      */
      const meta: Record<string, unknown> = {
        on: it.on,
        kun: it.kun,
        ko_sound: it.ko ?? seed?.ko_sound ?? null,
        meanings: it.meanings,
        parts: it.parts,
        grade: it.grade,
        freq: it.freq,
        jlpt: it.jlpt,
        ko_word: koWord ?? null,
        seed: seed ? "ja-onboarding" : null,
        example: seed?.example ?? null,
        example_reading: seed?.reading ?? null,
        pattern: seed?.pattern ?? null,
        card: cards[it.kanji] ?? null,
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
      const keptParts: string[] = [];
      for (const p of new Set(it.parts)) {
        const pid = partId.get(p);
        if (!pid || pid === id) continue;
        await client.query(
          `INSERT INTO edges (user_id, src, dst, rel, weight, meta) VALUES (NULL, $1, $2, 'part_of', $3, '{}')
           ON CONFLICT (src, dst, rel) WHERE user_id IS NULL DO UPDATE SET weight = EXCLUDED.weight`,
          [pid, id, it.parts.filter((x) => x === p).length],
        );
        keptParts.push(pid);
        edges++;
      }
      dropped += await drop(
        `DELETE FROM edges WHERE user_id IS NULL AND rel = 'part_of' AND dst = $1 AND src <> ALL($2::uuid[])`,
        [id, keptParts],
      );

      // 한국 한자음 → 한자 (ko sound 노드는 한 소리에 하나)
      const ko = it.ko ?? seed?.ko_sound;
      let keptSound: string | null = null;
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
        keptSound = sid;
        edges++;
      }
      dropped += await drop(
        `DELETE FROM edges
          WHERE user_id IS NULL AND rel = 'ko_sound_of' AND dst = $1
            AND ($2::uuid IS NULL OR src <> $2::uuid)`,
        [id, keptSound],
      );
    }
    /*
      **엣지를 고치면 소리 노드가 고아로 남는다.** 金 의 소리가 김 → 금 으로 바뀌면 김→金 엣지는
      위에서 지워지는데, 김 노드 자체는 아무도 안 가리킨 채 `ko/sound` 에 앉아 있다. 그러면
      "맞춘다, 쌓지 않는다" 가 엣지에만 참이고 노드엔 거짓이 된다.

      **범위를 `lang='ko' AND kind='sound'` 로 못 박는다.** 언젠가 `kind IN (...)` 으로 넓히고
      싶은 날이 온다(안 쓰는 부품·한자). **여기를 넓히면 `encounters` 가 같이 지워진다** —
      `nodes` 로 가는 FK 여섯이 CASCADE 이고, `encounters` 는 `docs/MEASURE.md` 의 분자·분모이자
      다시 만들 수 없는 유일한 표다. 넓히려면 이 줄과 `node-guard.ts` 를 같이 읽고 정한다.

      가드는 손으로 안 적는다 — `NODE_GUARD_TABLES` 에서 낸다(`node-guard.ts` 가 이유를 적고 있다).
      오늘은 소리 노드에 사용자 행이 안 붙어서 이 절이 아무것도 안 거른다. **그게 요점이다:
      지금 값이 아니라 구문이 안전을 진다.**
    */
    const orphans = await drop(ORPHAN_SOUND_DELETE, []);
    await client.query("COMMIT");
    console.log(`한자: ${kanji.length} 노드, 한국 한자음: ${soundId.size} 노드, 엣지: ${edges}`);
    // 정상이면 둘 다 0 이다. 0 이 아닌 날이 "무엇이 바뀌었나" 를 묻는 날이다.
    console.log(`지운 엣지: ${dropped} · 지운 소리 노드: ${orphans}`);
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

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
         DO UPDATE SET display = EXCLUDED.display, meta = EXCLUDED.meta`,
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
         DO UPDATE SET meta = EXCLUDED.meta
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
    /*
      **노드의 구멍과 엣지의 구멍은 같은 병인데 약이 다르다.** 둘 다 "적재가 파일이 말하는 상태가
      아니라 말한 적 있는 모든 상태의 합이 된다" 인데,

        노드  upsert 가 그 행을 **다시 쓴다.** 그래서 `meta = EXCLUDED.meta` 로 문법을 바꾸면
              닫힌다 — 파일이 말하지 않는 칸은 말하지 않은 채로 덮인다 (위 주석).
        엣지  upsert 가 **없던 줄을 안 건드린다.** 부품 규칙이 바뀌어 더는 안 딸리는 줄은
              아무도 안 보고, 아무도 안 지운다. **문법으로는 못 닫는다 — 지워야 닫힌다.**

      그래서 여기 DELETE 가 있다. **노드 쪽이 닫혔다고 엣지 쪽이 닫힌 게 아니다.**

      **구멍 크기는 DB 마다 다르다.** 되풀이 적재가 쌓인 DB 에서 `part_of` 가 4,727 이었고 새로
      세운 DB 는 3,913 이었다(차이 814). 이 세션의 로컬 DB 는 3,913 이라 `part_of` 구멍이 0 이다 —
      **구멍이 없는 DB 에서 재면 「고칠 게 없다」로 보인다.** 탐침에 있지도 않은 부품 줄 250 개를
      심고 돌려서 `지운 엣지: 261`(심은 250 + 묵은 `ko_sound_of` 11)을 봤고, 최종 상태는 구멍
      크기와 무관하게 `part_of 3,913 · ko_sound_of 2,135` 로 같았다.
    */
    /** 지운 행 수를 세어 돌려준다 — 조용한 DELETE 를 안 만든다. */
    const drop = async (sql: string, params: unknown[]) => (await client.query(sql, params)).rowCount ?? 0;
    for (const it of kanji) {
      const seed = seedByKanji.get(it.kanji);
      const koWord = koWords[it.kanji] ?? seed?.ko_word;
      /*
        **적재는 파일이 말하는 상태를 쓴다. 쌓지 않는다.**

        위 upsert 셋은 `meta = EXCLUDED.meta` 다. 전에는 `meta = nodes.meta || EXCLUDED.meta`
        였는데, jsonb `||` 는 **오른쪽에 없는 키를 왼쪽에서 그대로 살린다.** 그래서 칸이 하나라도
        빠지면 **파일에서 지운 값이 DB 에서는 안 지워졌고**, 적재가 "파일이 말하는 상태"가 아니라
        "파일이 말한 적 있는 모든 상태의 합"이 됐다.

        **돌려서 봤다** (로컬, 2026-09-21): `駅` 의 앵커를 「역」으로 넣어 놓고 — 표에서 뺀 뒤의
        파일로 — 다시 적재하니 `meta.ko_word` 가 **「역」 그대로 남았다.** F03 은 그 한 칸으로
        두 묶음을 가르므로, 화면은 표에서 뺀 지 한참 뒤에도 **"역의 역"** 이라고 말한다.
        규칙 1 이 물린 바로 그 거짓말이 적재를 타고 살아남는 것이다.

        **칸마다 `?? null` 로 막는 길도 있었는데, 그건 「빠뜨리지 않기」를 사람이 매번 지키는
        길이다.** 실제로 한 자리를 고친 뒤에도 `...(x ? { k: x } : {})` 가 세 군데 남아 있었고,
        그걸 막으려고 쓴 시험은 `const meta: Record<…>` 모양만 찾아서 **나머지를 안 보고도 초록
        이었다.** 문법을 바꾸면 그 규칙 자체가 없어진다 — 조건부로 빼든 안 빼든, DB 는 파일이
        말한 것만 갖는다.

        **탐침으로 갈랐다** (2026-09-21, `anchor_local` 복제본): `扌` 의 훈과 `retro-` 의 `es` 를
        파일에서 뺀 채로 돌려서, `||` 는 옛 값을 살리고(`{"ko_name": "손 수"}`) `= EXCLUDED.meta`
        는 지우는 것(`{}`)을 봤다. 같은 돌림에서 행 수(18·2136·505·22·427)와 kind 별 칸(14·1·6·7)
        은 그대로였다. **새로 지워지는 건 「씨앗이 안 쓰는데 DB 엔 있는 칸」뿐**인데, 공용 `nodes`
        를 쓰는 건 이 파일과 `scripts/seed-parts-sql.ts`(칸 하나, `meta.parts` — 여기서도 쓴다)
        뿐이고, 앱 역할은 RLS 로 공용 노드를 못 고친다(`db/migrations/0006_node_cards.sql`).
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
         DO UPDATE SET reading = EXCLUDED.reading, meta = EXCLUDED.meta
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

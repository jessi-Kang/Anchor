/**
 * 씨앗 전체를 **SQL 로 찍어낸다.** `pnpm seed:sql [--out db/out.sql]`
 *
 * **이 스크립트는 DB 에 접속하지 않는다.** `scripts/seed-parts-sql.ts` 와 같은 방식이고 같은 이유다 —
 * 아무도 연결 문자열을 쥐지 않고, 돌리기 전에 무엇이 들어가는지 줄 단위로 읽을 수 있다.
 * 실제 적용은 그 SQL 을 받은 쪽이 한다(`docs/TEAM.md` 명단: 프로덕션에 나갈 SQL 은 프로덕트 리더가 돌린다).
 *
 * **왜 만들었나.** `pnpm db:seed` 는 `DATABASE_URL_ADMIN` 을 요구하는데, 세션에는 연결 문자열이 없고
 * `get_connection_string` 은 하네스가 막는다(`docs/TEAM.md` 7′장). 그래서 2026-09-21 오전에 나는
 * **"우리가 못 하니 Jessi 가 돌려 달라"** 로 판정했다. 그 판정이 틀렸다 — 같은 문서 7′장이
 * **"세션에서 DB 에 닿는 길은 Neon MCP 다. 조회도 마이그레이션 적용도 그 길로 한다"** 고
 * 이미 적어 두었다. 막힌 것은 **길**이 아니라 **스크립트가 연결을 직접 여는 것**이었고, 그건
 * 스크립트를 안 쓰고 SQL 을 찍으면 없어진다. 사람 손을 부르기 전에 옆길을 먼저 검증했어야 했다.
 *
 * **찍는 것은 `scripts/seed.ts` 와 같은 상태다.** 다만 한 가지가 다르다 — seed.ts 는 노드를 넣고
 * `RETURNING id` 로 받은 아이디로 엣지를 만드는데, 여기서는 아이디를 모르므로 **엣지를 키로 조인해서**
 * 넣는다. 결과는 같고, 오히려 중간 상태를 안 들고 있어도 된다.
 *
 * **행 수로 검증한다.** 찍어낸 SQL 을 빈 DB 에 돌리면 `pnpm db:seed` 와 같은 수가 서야 한다:
 * 한자 2,136 · 부품 505 · 한국 한자음 427 · 영어 40 · 엣지 6,048(part_of 3,913 + ko_sound_of 2,135).
 * 그 대조가 이 스크립트의 시험이다(`scripts/test/seed-sql.test.ts` 가 파일만 보고,
 * 수가 맞는지는 실제로 돌려서 본다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type EnItem = {
  kind: string;
  key: string;
  display: string;
  definition?: string;
  example?: string;
  es?: unknown;
  words?: unknown;
  attitude?: unknown;
  intensity?: number;
  ko_anchor?: unknown;
};
type KanjiItem = {
  kanji: string;
  on: string[];
  kun: string[];
  ko?: string;
  meanings: string[];
  parts: string[];
  grade?: number;
  freq?: number;
  jlpt?: number;
};
type SeedItem = {
  kanji: string;
  ko_sound: string;
  ko_word: string;
  onyomi: string;
  example: string;
  reading: string;
  pattern: string;
};

const dir = path.join(process.cwd(), "db/seed");
const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as T;

/** SQL 문자열 리터럴. 홑따옴표만 막으면 된다 — 값에 개행이 있어도 표준 리터럴이 받는다. */
function lit(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}
const json = (v: unknown): string => `${lit(JSON.stringify(v))}::jsonb`;

/**
 * 한 INSERT 에 같은 키가 두 번 들어가면 Postgres 가 거부한다
 * (`ON CONFLICT DO UPDATE command cannot affect row a second time`).
 * 그래서 찍기 전에 키로 접는다 — 뒤에 온 것이 이긴다. seed.ts 의 루프도 같은 결과다.
 */
function dedupe<T>(rows: T[], keyOf: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(keyOf(r), r);
  return [...m.values()];
}

/** 긴 VALUES 는 조각으로 자른다 — 한 문장이 너무 길면 받는 쪽에서 잘린다. */
function chunked(head: string, rows: string[], tail: string, size = 200): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(`${head}\n${rows.slice(i, i + size).join(",\n")}\n${tail};`);
  }
  return out;
}

function build(): string[] {
  const en = read<{ items: EnItem[] }>("en-seed.json").items;
  const partsKo = read<{ parts: Record<string, string> }>("parts-ko.json").parts;
  const kanji = read<{ items: KanjiItem[] }>("kanji.json").items;
  const koWords = read<{ words: Record<string, string> }>("kanji-ko.json").words;
  const jaSeed = read<{ items: SeedItem[] }>("ja-seed.json").items;
  const cards = read<{ cards: Record<string, unknown> }>("kanji-cards.json").cards;
  const seedByKanji = new Map(jaSeed.map((it) => [it.kanji, it]));

  const out: string[] = [];

  // 1. 영어 어근·덩어리
  const enRows = dedupe(
    en.map((it, i) => {
      const meta = {
        seed: "en-onboarding",
        seed_order: i,
        definition: it.definition,
        example: it.example,
        ...(it.es ? { es: it.es } : {}),
        ...(it.words ? { words: it.words } : {}),
        ...(it.attitude ? { attitude: it.attitude, intensity: it.intensity ?? 1, ko_anchor: it.ko_anchor } : {}),
      };
      return { k: `${it.kind}\u0000${it.key}`, sql: `  (NULL, 'en', ${lit(it.kind)}, ${lit(it.key)}, ${lit(it.display)}, ${json(meta)})` };
    }),
    (r) => r.k,
  );
  out.push(
    ...chunked(
      "INSERT INTO nodes (user_id, lang, kind, key, display, meta) VALUES",
      enRows.map((r) => r.sql),
      "ON CONFLICT (lang, kind, key) WHERE user_id IS NULL\nDO UPDATE SET display = EXCLUDED.display, meta = EXCLUDED.meta",
    ),
  );

  // 2. 부품. 이름이 없으면 그 글자의 한국 한자음으로 떨어진다 (seed.ts 와 같은 규칙)
  const partChars = new Set<string>(Object.keys(partsKo));
  for (const it of kanji) for (const p of it.parts) partChars.add(p);
  const koSoundOf = new Map(kanji.filter((it) => it.ko).map((it) => [it.kanji, it.ko as string]));
  const partRows = [...partChars].map((ch) => {
    const name = partsKo[ch] ?? koSoundOf.get(ch);
    return `  (NULL, 'ja', 'radical', ${lit(ch)}, ${lit(ch)}, ${json(name ? { ko_name: name } : {})})`;
  });
  out.push(
    ...chunked(
      "INSERT INTO nodes (user_id, lang, kind, key, display, meta) VALUES",
      partRows,
      "ON CONFLICT (lang, kind, key) WHERE user_id IS NULL\nDO UPDATE SET meta = EXCLUDED.meta",
    ),
  );

  // 3. 한자
  const kanjiRows = kanji.map((it) => {
    const seed = seedByKanji.get(it.kanji);
    const meta = {
      on: it.on,
      kun: it.kun,
      ko_sound: it.ko ?? seed?.ko_sound ?? null,
      meanings: it.meanings,
      parts: it.parts,
      grade: it.grade,
      freq: it.freq,
      jlpt: it.jlpt,
      ko_word: koWords[it.kanji] ?? seed?.ko_word ?? null,
      seed: seed ? "ja-onboarding" : null,
      example: seed?.example ?? null,
      example_reading: seed?.reading ?? null,
      pattern: seed?.pattern ?? null,
      card: cards[it.kanji] ?? null,
    };
    const reading = seed?.onyomi ?? it.on[0] ?? null;
    return `  (NULL, 'ja', 'kanji', ${lit(it.kanji)}, ${lit(it.kanji)}, ${lit(reading ?? null)}, ${json(meta)})`;
  });
  out.push(
    ...chunked(
      "INSERT INTO nodes (user_id, lang, kind, key, display, reading, meta) VALUES",
      kanjiRows,
      "ON CONFLICT (lang, kind, key) WHERE user_id IS NULL\nDO UPDATE SET reading = EXCLUDED.reading, meta = EXCLUDED.meta",
    ),
  );

  // 4. 한국 한자음 노드
  const sounds = dedupe(
    kanji.flatMap((it) => {
      const ko = it.ko ?? seedByKanji.get(it.kanji)?.ko_sound;
      return ko ? [ko] : [];
    }).map((ko) => ({ k: ko, sql: `  (NULL, 'ko', 'sound', ${lit(ko)}, ${lit(ko)}, '{}'::jsonb)` })),
    (r) => r.k,
  );
  out.push(
    ...chunked(
      "INSERT INTO nodes (user_id, lang, kind, key, display, meta) VALUES",
      sounds.map((r) => r.sql),
      "ON CONFLICT (lang, kind, key) WHERE user_id IS NULL\nDO UPDATE SET display = EXCLUDED.display",
    ),
  );

  /*
    5. 엣지. seed.ts 는 `RETURNING id` 로 받은 아이디를 들고 잇는데, 여기서는 아이디를 모른다.
    그래서 **키로 조인한다** — 넣을 쌍을 VALUES 로 늘어놓고 `nodes` 에 두 번 붙인다.
    `pid === id` 를 건너뛰던 줄은 여기서 `p <> k` 로 선다 (한자가 제 부품으로 잡히는 자리).
  */
  const partOf: string[] = [];
  for (const it of kanji) {
    for (const p of new Set(it.parts)) {
      if (p === it.kanji) continue;
      partOf.push(`  (${lit(p)}, ${lit(it.kanji)}, ${it.parts.filter((x) => x === p).length})`);
    }
  }
  out.push(
    ...chunked(
      `INSERT INTO edges (user_id, src, dst, rel, weight, meta)
SELECT NULL, r.id, k.id, 'part_of', v.w, '{}'::jsonb
FROM (VALUES`,
      partOf,
      `) AS v(p, k, w)
JOIN nodes r ON r.user_id IS NULL AND r.lang = 'ja' AND r.kind = 'radical' AND r.key = v.p
JOIN nodes k ON k.user_id IS NULL AND k.lang = 'ja' AND k.kind = 'kanji'   AND k.key = v.k
ON CONFLICT (src, dst, rel) WHERE user_id IS NULL DO UPDATE SET weight = EXCLUDED.weight`,
    ),
  );

  const soundOf: string[] = [];
  for (const it of kanji) {
    const ko = it.ko ?? seedByKanji.get(it.kanji)?.ko_sound;
    if (ko) soundOf.push(`  (${lit(ko)}, ${lit(it.kanji)})`);
  }
  out.push(
    ...chunked(
      `INSERT INTO edges (user_id, src, dst, rel)
SELECT NULL, s.id, k.id, 'ko_sound_of'
FROM (VALUES`,
      soundOf,
      `) AS v(s, k)
JOIN nodes s ON s.user_id IS NULL AND s.lang = 'ko' AND s.kind = 'sound' AND s.key = v.s
JOIN nodes k ON k.user_id IS NULL AND k.lang = 'ja' AND k.kind = 'kanji' AND k.key = v.k
ON CONFLICT (src, dst, rel) WHERE user_id IS NULL DO NOTHING`,
    ),
  );

  return out;
}

const stmts = build();
const sql = `-- scripts/seed-sql.ts 가 찍은 것. 손으로 고치지 말 것.
-- 서야 할 수: 한자 2,136 · 부품 505 · 한국 한자음 427 · 영어 40 · 엣지 6,048
${stmts.join("\n\n")}
`;

const outArg = process.argv.indexOf("--out");
if (outArg >= 0 && process.argv[outArg + 1]) {
  writeFileSync(process.argv[outArg + 1], sql);
  console.log(`${stmts.length}개 문장 → ${process.argv[outArg + 1]}`);
} else {
  process.stdout.write(sql);
}

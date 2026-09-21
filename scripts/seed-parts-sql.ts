/**
 * 프로덕션의 `nodes.meta.parts` 를 지금 `db/seed/kanji.json` 과 맞추는 SQL 을 **찍어낸다.**
 *   pnpm seed:parts-sql --all                  2,136자 전부 (프로덕션에 어느 판이 올라가 있는지 모를 때)
 *   pnpm seed:parts-sql --since <git-ref>      그 커밋의 kanji.json 과 다른 것만
 *   pnpm seed:parts-sql --all --out db/out.sql 파일로
 *
 * **이 스크립트는 DB 에 접속하지 않는다.** 출력만 한다. 그래서 아무도 연결 문자열을 쥐지 않고,
 * 돌리기 전에 무엇이 바뀌는지 줄 단위로 읽을 수 있다. 실제 적용은 그 파일을 받은 쪽이 한다.
 *
 * **왜 전체 재적재가 아닌가.** `pnpm db:seed` 는 2,136자에 엣지까지 다시 쓴다. 부품 규칙 하나가
 * 바뀌어 스물몇 자가 달라졌을 뿐인데 만 줄을 훑을 이유가 없고, 훑는 동안 무엇이 바뀌는지도 안 보인다.
 *
 * **안전은 git 이 아니라 조건절이 만든다.** 찍어낸 UPDATE 는 `meta->'parts'` 가 **실제로 다른 줄만**
 * 건드린다. `--since` 는 파일을 읽기 좋게 줄이는 최적화일 뿐이라, 좁히기가 틀려도 엉뚱한 줄이
 * 바뀌지 않는다. `--all` 로 찍어도 **결과는 같고 파일만 길다.**
 *
 * **기본값을 두지 않는다.** 프로덕션에 어느 커밋의 씨앗이 올라가 있는지는 아무도 안 적어 뒀다.
 * 기본 ref 를 하나 정해 두면 그게 맞다고 믿고 "바뀔 게 없다" 를 받아들게 되는데, 그 말은 참이 아니라
 * **안 물어봤다는 뜻**이다. 배포된 커밋을 알면 `--since`, 모르면 `--all` 이다. 어느 쪽이든 찍어낸
 * 파일의 1번 질의가 실제로 바뀔 줄 수를 먼저 알려 준다.
 *
 * **건드리는 것은 `meta.parts` 하나뿐이다.** `part_of` 엣지는 안 지운다 — 지금 그 엣지를 읽는 코드가
 * 없다(`src/`·`scripts/` 를 `part_of` 로 훑어 `scripts/seed.ts` 의 쓰는 자리 하나만 나왔다).
 * 읽는 자리가 생기면 그때 같은 길로 지우는 문을 낸다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const SEED_PATH = "db/seed/kanji.json";
type KanjiItem = { kanji: string; parts: string[] };

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);

/** SQL 문자열 리터럴. 작은따옴표를 겹쳐 닫는다 — 한자만 들어올 자리지만 여기서 믿지 않는다. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function itemsFrom(json: string): Map<string, string[]> {
  const items = (JSON.parse(json) as { items: KanjiItem[] }).items;
  return new Map(items.map((it) => [it.kanji, it.parts ?? []]));
}

function main() {
  const file = path.resolve(process.cwd(), SEED_PATH);
  const current = readFileSync(file, "utf8");
  const now = itemsFrom(current);
  const sha = createHash("sha256").update(current).digest("hex").slice(0, 12);

  const all = has("all");
  const since = arg("since");
  if (!all && !since) {
    console.error("어느 판과 견줄지를 정해야 한다.");
    console.error("  프로덕션에 올라간 커밋을 알면 : pnpm seed:parts-sql --since <git-ref>");
    console.error("  모르면                        : pnpm seed:parts-sql --all");
    console.error("둘 다 결과는 같다 — 조건절이 실제로 다른 줄만 고른다. --all 은 파일이 길 뿐이다.");
    process.exit(1);
  }
  let before: Map<string, string[]> | null = null;
  let resolved = "";
  if (since) {
    try {
      resolved = execFileSync("git", ["rev-parse", "--short", since], { encoding: "utf8" }).trim();
      before = itemsFrom(execFileSync("git", ["show", `${since}:${SEED_PATH}`], { encoding: "utf8", maxBuffer: 1 << 28 }));
    } catch {
      // 견줄 것을 못 찾으면 **조용히 전체로 넘어가지 않는다.** 좁히기가 실패한 줄 모르고 "바뀐 게
      // 없다" 를 받아들면 고쳐야 할 줄을 통째로 빠뜨린다.
      console.error(`견줄 판을 못 읽었다: git show ${since}:${SEED_PATH}`);
      console.error("--since 에 다른 커밋을 주거나, --all 로 전부 찍어라 (조건절이 어차피 걸러 준다).");
      process.exit(1);
    }
  }

  const changed: { kanji: string; parts: string[]; was: string[] | null }[] = [];
  for (const [kanji, parts] of now) {
    const was = before?.get(kanji) ?? null;
    if (before && was && JSON.stringify(was) === JSON.stringify(parts)) continue;
    changed.push({ kanji, parts, was });
  }

  const head = [
    `-- nodes.meta.parts 맞추기 — scripts/seed-parts-sql.ts 가 찍어냈다. 손으로 고치지 말 것.`,
    `-- 기준 파일: ${SEED_PATH} (sha256 앞 12자리 ${sha})`,
    all ? `-- 범위: 전부 ${now.size}자` : `-- 범위: ${since} (${resolved}) 와 다른 ${changed.length}자 / 전체 ${now.size}자`,
    `-- 건드리는 것: 공용 한자 노드(user_id IS NULL, lang='ja', kind='kanji')의 meta.parts 하나뿐.`,
    `-- 안 건드리는 것: 다른 meta 칸, part_of 엣지, 사용자 노드, 사용자 상태.`,
    `-- 조건절이 값이 실제로 다른 줄만 고른다. 두 번 돌려도 두 번째는 0 줄이다.`,
    "",
  ];
  if (changed.length === 0) {
    process.stdout.write(head.concat("-- 바뀔 것이 없다.", "").join("\n"));
    return;
  }

  // 한자 하나에 한 줄. 줄 단위로 읽히는 것이 이 파일의 목적이라 UPDATE 를 N 개로 쪼개지 않고
  // VALUES 목록 하나로 묶는다 — 읽을 줄 수는 같고 질의는 둘뿐이다.
  const values = changed.map(({ kanji, parts, was }, i) => {
    const cast = i === 0 ? "::text" : "";
    const castJ = i === 0 ? "::jsonb" : "";
    const note = before ? `  -- 전: ${was === null ? "(그 판에 없던 글자)" : JSON.stringify(was)}` : "";
    return `    (${lit(kanji)}${cast}, ${lit(JSON.stringify(parts))}${castJ})${i === changed.length - 1 ? "" : ","}${note}`;
  });
  const want = ["  WITH want(key, parts) AS (VALUES", ...values, "  )"].join("\n");
  const where = `   WHERE n.user_id IS NULL AND n.lang = 'ja' AND n.kind = 'kanji'\n     AND n.meta -> 'parts' IS DISTINCT FROM w.parts`;

  const sql = [
    ...head,
    "BEGIN;",
    "",
    "-- 1. 돌리기 전에 — 실제로 바뀔 줄이 몇인가. 0 이면 이미 맞는 것이니 그대로 ROLLBACK 해도 된다.",
    want,
    `SELECT count(*) AS "바뀔 노드", ${changed.length} AS "파일에 적힌 글자"`,
    "    FROM nodes n JOIN want w ON w.key = n.key",
    where.replace("   WHERE", "   WHERE"),
    ";",
    "",
    "-- 2. 적용.",
    want,
    "UPDATE nodes n SET meta = jsonb_set(n.meta, '{parts}', w.parts)",
    "    FROM want w",
    `${where}\n     AND n.key = w.key`,
    ";",
    "",
    "-- 3. 확인 — 여기서 0 이 나와야 한다.",
    want,
    'SELECT count(*) AS "아직 다른 노드"',
    "    FROM nodes n JOIN want w ON w.key = n.key",
    where,
    ";",
    "",
    "COMMIT;",
    "",
  ].join("\n");

  const out = arg("out");
  if (out) {
    writeFileSync(path.resolve(process.cwd(), out), sql);
    console.error(`${out} 에 ${changed.length}자.`);
  } else {
    process.stdout.write(sql);
  }
}

main();

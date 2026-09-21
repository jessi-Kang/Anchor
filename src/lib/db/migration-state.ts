/**
 * **원장(`schema_migrations`)과 레포(`db/migrations/`)를 견준다.** DB 도 파일도 모르는 순수
 * 함수라, 부르는 쪽이 읽어서 넘긴다. 두 곳이 쓴다 — `pnpm test:db` 앞의 출처 한 줄
 * (`scripts/db-provenance.ts`)과 `/api/health`.
 *
 * **왜 한 곳인가.** 원장만 보면 거짓을 말하게 된다. `/api/health` 가 원래
 * `SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1` 하나로 `latest_migration` 을
 * 냈는데, 누가 손으로 돌린 SQL 이 원장에 뒤쪽 이름으로 남으면 **어느 커밋에도 없는 파일 이름이
 * 「최신」으로 나갔다.** 그런데 `docs/SECURITY.md` E5 가 그 값을 **복구 리허설의 판정 기준**으로
 * 쓴다. 원장과 레포는 **둘 다 봐야** 참을 말할 수 있고, 두 곳이 각자 견주면 언젠가 갈린다.
 */

/** 레포 파일 하나. `checksum` 은 파일을 읽을 수 있는 쪽(CLI)만 넘긴다. */
export type MigrationFile = { name: string; checksum?: string };

export type MigrationCompare = {
  /** 원장에서 이름순 마지막. 원장이 비었거나 못 읽었으면 null */
  ledger_latest: string | null;
  /** 이 빌드가 들고 있는 파일 중 마지막 */
  repo_latest: string | null;
  /** **원장에만 있는 이름.** 유령 줄이 여기서 보인다 */
  ledger_only: string[];
  /** 레포에는 있는데 원장에 없는 이름 — 아직 안 올라간 것 */
  missing: string[];
  /** 이름은 같은데 체크섬이 갈린 것. 체크섬을 넘긴 쪽에서만 찬다 */
  drifted: { name: string; ledger: string; repo: string }[];
  /** 사람이 읽는 한 줄: `0001–0008 적용 (8/8)` */
  applied: string;
  /** 셋 다 비었는가 */
  ok: boolean;
};

export function compareMigrations(applied: Map<string, string>, files: MigrationFile[]): MigrationCompare {
  const names = files.map((f) => f.name);
  const missing = names.filter((n) => !applied.has(n));
  /*
    **체크섬을 안 넘긴 쪽에서는 어긋남을 말하지 않는다.** `undefined` 를 값으로 견주면 올라간 파일이
    전부 "갈렸다" 로 나온다 — 라우트는 번들에 파일 내용이 없어 해시를 못 구하므로, 못 보는 것을
    "없다" 가 아니라 **빈 목록**으로 둔다. 어긋남은 파일을 읽는 쪽(CLI)이 말한다.
  */
  const drifted = files.flatMap((f) =>
    f.checksum !== undefined && applied.has(f.name) && applied.get(f.name) !== f.checksum
      ? [{ name: f.name, ledger: applied.get(f.name)!, repo: f.checksum }]
      : [],
  );
  const ledgerOnly = [...applied.keys()].filter((n) => !names.includes(n));

  const appliedNames = names.filter((n) => applied.has(n));
  const range =
    appliedNames.length === 0
      ? "적용된 것 없음"
      : `${appliedNames[0].slice(0, 4)}–${appliedNames[appliedNames.length - 1].slice(0, 4)} 적용 (${appliedNames.length}/${names.length})`;

  return {
    ledger_latest: [...applied.keys()].sort().pop() ?? null,
    repo_latest: names[names.length - 1] ?? null,
    ledger_only: ledgerOnly,
    missing,
    drifted,
    applied: range,
    ok: !missing.length && !drifted.length && !ledgerOnly.length,
  };
}

export type MigrationState = {
  /** 찍을 줄들. 첫 줄이 어디에 붙었는지, 나머지가 무엇이 어긋났는지다. */
  lines: string[];
  /** 원장과 레포가 완전히 같은가. 아니어도 **멈추지 않는다** — 말하는 것이 일이다. */
  ok: boolean;
};

const short = (h: string) => h.slice(0, 12);

/**
 * 위 비교를 **사람이 읽는 줄로** 바꾼다. `pnpm test:db` 앞에 찍는다.
 *
 * **왜 있는가.** `pnpm test:db` 의 초록이 네 번 나갔는데, 그 수는 전부 "0008 이 적재된 DB 위"
 * 라는 조건을 달고 있었고 **숫자엔 그 말이 없었다.** 같은 시각 다른 컨테이너에서는 같은 명령이
 * 27통과/3실패였다 — 거기엔 0008 이 없었기 때문이다. 조건 없는 초록은 **막힌 마이그레이션이
 * 풀렸다는 뜻으로 읽힌다.** 숫자에는 어느 값 위에서 난 것인지를 붙인다.
 *
 * **맞을 때만 말하는 줄은 맞다는 것을 증명하지 못한다.** 그래서 어긋남도 같은 줄이 말한다.
 */
export function describeMigrations(where: string, applied: Map<string, string>, files: MigrationFile[]): MigrationState {
  const c = compareMigrations(applied, files);
  const lines = [`DB: ${where}`];
  if (c.ok) {
    lines.push(`마이그레이션: ${c.applied} · 레포와 ${files.length}/${files.length} 일치`);
  } else {
    lines.push(`마이그레이션: ${c.applied}`);
    if (c.missing.length) lines.push(`  안 올라간 것: ${c.missing.join(", ")}`);
    for (const d of c.drifted) lines.push(`  어긋난 것: ${d.name} (원장 ${short(d.ledger)}… / 레포 ${short(d.repo)}…)`);
    if (c.ledger_only.length) lines.push(`  원장에만 있는 것: ${c.ledger_only.join(", ")}`);
  }
  lines.push("※ 아래 초록·빨강은 이 상태 위의 값이다.");
  return { lines, ok: c.ok };
}

/**
 * **이 빌드가 들고 있는 마이그레이션 파일 이름.** `db/migrations/` 를 런타임에 `readdir` 하지
 * 않는다 — 서버리스 번들에 그 디렉터리가 없을 수 있고, 없으면 라우트가 "레포에 아무것도 없다" 고
 * 말한다. 그러니 **상수가 배포되는 표**고 **디렉터리가 진짜 표**다. 둘이 독립이어야 어긋남이
 * 빨간 줄로 나온다 (`scripts/test/migration-files.test.ts`).
 */
export const MIGRATION_FILES: string[] = [
  "0001_init.sql",
  "0002_rls.sql",
  "0003_owner_reads_for_backup.sql",
  "0004_settings_languages.sql",
  "0005_drop_onboarding_steps.sql",
  "0006_node_cards.sql",
  "0007_measure_columns.sql",
  "0008_recordings_client_id.sql",
];

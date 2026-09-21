/**
 * 원장과 레포를 견줘 **한 줄로 말한다.** `pnpm test:db` 가 돌기 전에 찍는다.
 *
 * **왜 있는가.** 오늘 `pnpm test:db` 의 초록이 네 번 나갔는데, 그 수는 전부 "0008 이 적재된 DB
 * 위" 라는 조건을 달고 있었고 **숫자엔 그 말이 없었다.** 같은 시각 다른 컨테이너에서는 같은
 * 명령이 27통과/3실패였다 — 거기엔 0008 이 없었기 때문이다. 조건 없는 초록은 **막힌
 * 마이그레이션이 풀렸다는 뜻으로 읽힌다.** 숫자에는 어느 값 위에서 난 것인지를 붙인다.
 *
 * **맞을 때만 말하는 줄은 맞다는 것을 증명하지 못한다.** 그래서 어긋남도 같은 줄이 말한다 —
 * 안 올라간 것, 원장에만 있는 것, 체크섬이 갈린 것. 셋 다 이름과 값을 댄다.
 *
 * DB 는 읽기만 한다. 이 파일은 순수 함수라 DB 를 모른다 — 부르는 쪽이 읽어서 넘긴다.
 */

export type MigrationState = {
  /** 찍을 줄들. 첫 줄이 어디에 붙었는지, 나머지가 무엇이 어긋났는지다. */
  lines: string[];
  /** 원장과 레포가 완전히 같은가. 아니어도 **멈추지 않는다** — 말하는 것이 일이다. */
  ok: boolean;
};

const short = (h: string) => h.slice(0, 12);

export function describeMigrations(
  where: string,
  applied: Map<string, string>,
  files: { name: string; checksum: string }[],
): MigrationState {
  const names = files.map((f) => f.name);
  const missing = names.filter((n) => !applied.has(n));
  const drifted = files.filter((f) => applied.has(f.name) && applied.get(f.name) !== f.checksum);
  const extra = [...applied.keys()].filter((n) => !names.includes(n));

  const appliedNames = names.filter((n) => applied.has(n));
  const range =
    appliedNames.length === 0
      ? "적용된 것 없음"
      : `${appliedNames[0].slice(0, 4)}–${appliedNames[appliedNames.length - 1].slice(0, 4)} 적용 (${appliedNames.length}/${names.length})`;

  const lines = [`DB: ${where}`];
  if (!missing.length && !drifted.length && !extra.length) {
    lines.push(`마이그레이션: ${range} · 레포와 ${names.length}/${names.length} 일치`);
  } else {
    lines.push(`마이그레이션: ${range}`);
    if (missing.length) lines.push(`  안 올라간 것: ${missing.join(", ")}`);
    for (const d of drifted) {
      lines.push(`  어긋난 것: ${d.name} (원장 ${short(applied.get(d.name)!)}… / 레포 ${short(d.checksum)}…)`);
    }
    if (extra.length) lines.push(`  원장에만 있는 것: ${extra.join(", ")}`);
  }
  lines.push("※ 아래 초록·빨강은 이 상태 위의 값이다.");
  return { lines, ok: !missing.length && !drifted.length && !extra.length };
}

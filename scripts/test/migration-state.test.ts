/**
 * 출처 한 줄이 **어긋남도 말하는지** 붙든다.
 *   pnpm test:db
 *
 * `pnpm test:db` 앞에 붙은 줄은 그 수가 어느 DB 위의 값인지를 말한다. **맞을 때만 말하는 줄은
 * 맞다는 것을 증명하지 못한다** — 어긋난 컨테이너에서 그 줄이 침묵하면, 조건 없는 초록이 다시
 * 나간다. 오늘 그 초록이 네 번 나갔고, 같은 시각 다른 컨테이너에서는 같은 명령이 27/3 이었다.
 *
 * **DB 를 안 쓴다.** 원장을 어긋나게 만들어 확인하려면 원장을 고쳐야 하는데, 지우는·재는 경로를
 * 재려고 건드리면 그 값은 아무 말도 못 한다. 그래서 **진짜 함수에 어긋난 입력을 먹인다** —
 * 사본을 시험하는 것이 아니라 `db-provenance.ts` 가 부르는 바로 그 함수다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMigrations } from "../lib/migration-state";

const FILES = [
  { name: "0001_init.sql", checksum: "a".repeat(64) },
  { name: "0002_rls.sql", checksum: "b".repeat(64) },
  { name: "0003_x.sql", checksum: "c".repeat(64) },
];
const WHERE = "anchor_local@127.0.0.1:5432 (anchor_owner)";
const all = () => new Map(FILES.map((f) => [f.name, f.checksum]));

test("다 맞으면 몇 개가 맞는지까지 말한다 — 「일치」 한 마디로 끝내지 않는다", () => {
  const s = describeMigrations(WHERE, all(), FILES);
  assert.equal(s.ok, true);
  assert.ok(s.lines[0].includes(WHERE), s.lines.join("\n"));
  assert.match(s.lines[1], /0001–0003 적용 \(3\/3\).*3\/3 일치/);
});

test("체크섬이 갈리면 파일 이름과 두 값을 댄다 — 「어긋남」 만으로는 못 고친다", () => {
  const led = all();
  led.set("0002_rls.sql", "f".repeat(64));
  const s = describeMigrations(WHERE, led, FILES);
  assert.equal(s.ok, false);
  const line = s.lines.find((l) => l.includes("어긋난 것"));
  assert.ok(line, s.lines.join("\n"));
  assert.ok(line!.includes("0002_rls.sql"), line);
  assert.ok(line!.includes("ffffffffffff") && line!.includes("bbbbbbbbbbbb"), line);
});

test("안 올라간 것은 이름을 댄다 — 개발 컨테이너에서 바로 찍혀야 하는 자리다", () => {
  const led = all();
  led.delete("0003_x.sql");
  const s = describeMigrations(WHERE, led, FILES);
  assert.equal(s.ok, false);
  assert.ok(
    s.lines.some((l) => l.includes("안 올라간 것") && l.includes("0003_x.sql")),
    s.lines.join("\n"),
  );
  // 적용 수도 줄어 보여야 한다. "3/3 일치" 가 남아 있으면 줄이 거짓말을 한다.
  assert.match(s.lines[1], /\(2\/3\)/);
  assert.ok(!s.lines.some((l) => l.includes("일치")), s.lines.join("\n"));
});

test("원장에만 있는 것도 말한다 — 파일이 사라진 쪽도 어긋남이다", () => {
  const led = all();
  led.set("0004_gone.sql", "d".repeat(64));
  const s = describeMigrations(WHERE, led, FILES);
  assert.equal(s.ok, false);
  assert.ok(
    s.lines.some((l) => l.includes("원장에만 있는 것") && l.includes("0004_gone.sql")),
    s.lines.join("\n"),
  );
});

test("어느 경우에도 「이 상태 위의 값이다」 를 붙인다 — 수 혼자 나가지 않게", () => {
  for (const led of [all(), new Map(), (() => { const m = all(); m.set("0002_rls.sql", "f".repeat(64)); return m; })()]) {
    const s = describeMigrations(WHERE, led, FILES);
    assert.equal(s.lines[s.lines.length - 1], "※ 아래 초록·빨강은 이 상태 위의 값이다.");
  }
});

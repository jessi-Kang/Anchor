/**
 * **`/api/health` 가 마이그레이션에 대해 하는 말**을 붙든다 — 배포되는 표와 진짜 표가 같은지,
 * 그리고 라우트가 부르는 모양에서 비교 함수가 못 보는 것을 "없다" 로 말하지 않는지.
 *   pnpm test:db  (DB 는 안 쓴다 — 파일만 읽는다)
 *
 * `/api/health` 는 `db/migrations/` 를 런타임에 `readdir` 하지 못한다. 서버리스 번들에 그
 * 디렉터리가 없을 수 있고, 없으면 라우트가 **"레포에 아무것도 없다"** 고 말한다. 그래서 파일
 * 이름을 상수(`MIGRATION_FILES`)로 들고 배포한다.
 *
 * **상수가 배포되는 표고 디렉터리가 진짜 표다.** 둘이 독립이라서, 마이그레이션을 새로 넣고
 * 상수를 안 고치면 여기서 빨간 줄이 난다. 한쪽이 다른 쪽을 읽어 만들면 둘이 같은 말을 해서
 * 아무것도 못 잡는다 — 그래서 이 시험은 `readdir` 을 **여기서만** 한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { compareMigrations, MIGRATION_FILES } from "../../src/lib/db/migration-state";

const onDisk = readdirSync(path.resolve(process.cwd(), "db", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

test("상수가 db/migrations/ 와 같다 — 새 마이그레이션을 넣으면 여기서 먼저 걸린다", () => {
  assert.ok(onDisk.length > 0, "db/migrations/ 를 못 읽었다");
  assert.deepEqual(
    MIGRATION_FILES,
    onDisk,
    "MIGRATION_FILES 와 db/migrations/ 가 다르다. 상수를 고쳐라 — /api/health 가 이 값으로 레포 쪽을 말한다",
  );
});

test("이름순으로 들고 있다 — repo_latest 가 마지막 줄을 뜻하려면 정렬돼 있어야 한다", () => {
  assert.deepEqual(MIGRATION_FILES, [...MIGRATION_FILES].sort());
});

/*
  아래 둘은 **라우트가 부르는 모양**이다. 라우트는 번들에 파일 내용이 없어 체크섬을 못 넘긴다.
  그때 비교 함수가 `applied` 의 값과 `undefined` 를 견주면 **올라간 파일이 전부 「갈렸다」** 로
  나오고, 반대로 대충 넘기면 **못 보는 것을 「어긋난 게 없다」** 로 말하게 된다. 둘 다 거짓이다.
*/
const repo = () => MIGRATION_FILES.map((name) => ({ name }));

test("원장에만 있는 이름이 보인다 — 이게 latest_migration 이 못 하던 일이다", () => {
  const ledger = new Map([...MIGRATION_FILES, "0009_ghost_not_in_repo.sql"].map((n) => [n, ""]));
  const c = compareMigrations(ledger, repo());
  assert.deepEqual(c.ledger_only, ["0009_ghost_not_in_repo.sql"]);
  assert.equal(c.ledger_latest, "0009_ghost_not_in_repo.sql");
  assert.equal(c.repo_latest, MIGRATION_FILES[MIGRATION_FILES.length - 1]);
  assert.equal(c.ok, false);
  // 유령 줄이 이름 역순 첫 줄이라, 옛 응답은 이 이름 하나를 「최신」으로 내보내고 끝이었다.
  assert.notEqual(c.ledger_latest, c.repo_latest);
});

test("체크섬을 안 넘기면 어긋남을 말하지 않는다 — 못 보는 것을 「없다」 로 바꾸지 않게", () => {
  const ledger = new Map(MIGRATION_FILES.map((n) => [n, "deadbeef"]));
  const c = compareMigrations(ledger, repo());
  assert.deepEqual(c.drifted, [], "체크섬 없이 부른 쪽이 어긋남을 지어내면 안 된다");
  assert.deepEqual(c.missing, []);
  assert.deepEqual(c.ledger_only, []);
  // 파일을 읽는 쪽(CLI)은 같은 원장에서 어긋남을 본다 — 못 보는 쪽과 보는 쪽이 갈려 있어야 한다.
  const cli = compareMigrations(ledger, MIGRATION_FILES.map((name) => ({ name, checksum: "cafe" })));
  assert.equal(cli.drifted.length, MIGRATION_FILES.length);
});

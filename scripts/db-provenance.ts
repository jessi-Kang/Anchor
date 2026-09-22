/**
 * `pnpm test:db` 앞에 붙어 **그 수가 어느 DB 위의 값인지**를 찍는다.
 * 읽기만 한다 — `schema_migrations` 를 SELECT 하고 파일을 해시할 뿐, 아무것도 안 고친다.
 *
 * **못 붙어도, 어긋나도 0 으로 끝난다.** 여기서 멈추면 어긋난 컨테이너는 시험을 아예 못 돌려
 * 무엇이 지나가고 무엇이 떨어지는지조차 못 본다. 이 줄의 일은 막는 것이 아니라 **말하는 것**이다.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/load-env";
import { adminClient, reason } from "./lib/admin-client";
import { describeMigrations } from "../src/lib/db/migration-state";

loadEnv();

const DIR = path.join(process.cwd(), "db", "migrations");

function files() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, checksum: createHash("sha256").update(readFileSync(path.join(DIR, name), "utf8")).digest("hex") }));
}

async function main() {
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) {
    console.log("DB: DATABASE_URL_ADMIN 이 없다 — 어느 DB 위의 값인지 말할 수 없다.");
    console.log("※ 아래 초록·빨강은 출처가 안 붙은 값이다.");
    return;
  }
  const u = new URL(url);
  const where = `${u.pathname.slice(1)}@${u.hostname}:${u.port || 5432} (${u.username})`;

  const client = adminClient();
  try {
    await client.connect();
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    const state = describeMigrations(where, new Map(rows.map((r) => [r.name, r.checksum])), files());
    for (const l of state.lines) console.log(l);
  } catch (e) {
    // 원장을 못 읽은 것도 출처다. 조용히 넘어가면 그 뒤 수가 또 맨몸으로 나간다.
    console.log(`DB: ${where} — 원장을 못 읽었다 (${reason(e)})`);
    console.log("※ 아래 초록·빨강은 이 상태 위의 값이다.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

main();

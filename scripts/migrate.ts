/**
 * SQL 마이그레이션 러너.
 *   pnpm db:migrate            적용
 *   pnpm db:migrate --status   상태만
 *
 * - DATABASE_URL_ADMIN (없으면 DATABASE_URL) 로 접속 (테이블 소유자).
 * - db/migrations/*.sql 을 이름순으로 실행, 파일 하나 = 트랜잭션 하나.
 * - schema_migrations 에 이름·체크섬 기록. 적용된 파일이 바뀌면 중단.
 * - `__ANCHOR_APP_PASSWORD__` 플레이스홀더를 환경 변수로 치환 (0001 의 역할 생성용).
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import { loadEnv } from "./lib/load-env";

loadEnv();

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");
const statusOnly = process.argv.includes("--status");

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function main() {
  // 관리 연결: DATABASE_URL_ADMIN 이 없으면 Vercel Neon 통합이 주입하는 DATABASE_URL(소유자 역할)을 쓴다.
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_ADMIN (또는 DATABASE_URL) 이 필요하다 (.env.example 참고)");

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    let pending = 0;
    for (const file of files) {
      const raw = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = sha256(raw);
      const prev = applied.get(file);

      if (prev) {
        if (prev !== checksum) {
          throw new Error(`${file} 은 이미 적용됐는데 내용이 바뀌었다. 새 마이그레이션 파일로 만들 것.`);
        }
        console.log(`  ✓ ${file}`);
        continue;
      }

      pending++;
      if (statusOnly) {
        console.log(`  · ${file}  (미적용)`);
        continue;
      }

      let sql = raw;
      if (sql.includes("__ANCHOR_APP_PASSWORD__")) {
        const pw = process.env.ANCHOR_APP_PASSWORD;
        if (!pw || pw.length < 16) throw new Error(`${file}: ANCHOR_APP_PASSWORD (16자 이상) 가 필요하다`);
        sql = sql.replaceAll("__ANCHOR_APP_PASSWORD__", pw.replaceAll("'", "''"));
      }

      process.stdout.write(`  → ${file} ... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        console.log("적용");
      } catch (e) {
        await client.query("ROLLBACK");
        console.log("실패");
        throw e;
      }
    }

    if (statusOnly) console.log(pending ? `\n미적용 ${pending}개` : "\n모두 적용됨");
    else if (!pending) console.log("\n적용할 마이그레이션 없음");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

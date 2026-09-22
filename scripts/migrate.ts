/**
 * SQL 마이그레이션 러너.
 *   pnpm db:migrate            적용
 *   pnpm db:migrate --status   상태만
 *
 * - DATABASE_URL_ADMIN (없으면 DATABASE_URL) 로 접속 (테이블 소유자).
 * - db/migrations/*.sql 을 이름순으로 실행, 파일 하나 = 트랜잭션 하나.
 * - schema_migrations 에 이름·체크섬 기록. 적용된 파일이 바뀌면 중단 (예외는 INTENTIONAL_EDITS).
 * - `__ANCHOR_APP_PASSWORD__` 플레이스홀더를 환경 변수로 치환 (0001 의 역할 생성용).
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadEnv } from "./lib/load-env";
import { adminClient, reason } from "./lib/admin-client";

loadEnv();

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");
const statusOnly = process.argv.includes("--status");

/**
 * 이미 적용된 파일을 일부러 고친 자리들. 파일 이름 + 고치기 전 체크섬 + 고친 뒤 체크섬.
 *
 * 규칙은 그대로다: 적용된 마이그레이션은 바꾸지 않는다. 다만 "프로덕션에 이미 들어간 SQL 을
 * 되돌릴 수 없는 자리" — 복구 경로처럼 아직 한 번도 안 돌아 본 코드 — 를 고칠 때는
 * 새 파일을 하나 더 만들어도 복구가 나아지지 않는다. 복구는 0001 부터 다시 돌리는 일이라
 * 0001 자체가 맞아야 한다. 그래서 여기에 그 수정을 적어 둔다.
 *
 * - 프로덕션 원장(schema_migrations)은 손대지 않는다. 허용된 짝이면 그대로 두고 넘어간다.
 * - 실수로 바뀐 파일은 여전히 잡힌다. 옛 체크섬만 적으면 그 파일은 그 뒤로 아무렇게나 고쳐도
 *   통과해 버린다(원장의 값은 계속 옛 체크섬이니까). 그래서 from·to 를 둘 다 박는다 —
 *   딱 이 수정 하나만 통과하고, 여기서 또 한 줄이라도 바뀌면 예전처럼 멈춘다.
 */
const INTENTIONAL_EDITS: { file: string; from: string; to: string }[] = [
  {
    // GRANT CONNECT ON DATABASE neondb → current_database().
    // 이름이 neondb 가 아닌 DB 로 복구하면 0001 에서 통째로 멈췄다.
    file: "0001_init.sql",
    from: "a0efe30e8f0921bcc3f19f2d1beede8a354dba566db4012b8873e0cef254e54b",
    to: "07c2d8dc9f92a196fd1f4f10bb65d433f5b1b40437db3c54d8c909cf3851e3ab",
  },
];

function isIntentional(file: string, from: string, to: string) {
  return INTENTIONAL_EDITS.some((e) => e.file === file && e.from === from && e.to === to);
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function main() {
  // 관리 연결: DATABASE_URL_ADMIN 이 없으면 Vercel Neon 통합이 주입하는 DATABASE_URL(소유자 역할)을 쓴다.

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  const client = adminClient();
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
          if (!isIntentional(file, prev, checksum)) {
            throw new Error(`${file} 은 이미 적용됐는데 내용이 바뀌었다. 새 마이그레이션 파일로 만들 것.`);
          }
          // 의도한 수정. 원장은 옛 체크섬 그대로 둔다 — 프로덕션 기록을 덮어쓰지 않는다.
          console.log(`  ✓ ${file}  (의도한 수정, 원장은 그대로)`);
          continue;
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
  console.error(reason(e));
  process.exit(1);
});

/**
 * Vercel Blob 에 있는 JSON 백업을 빈 데이터베이스에 복원한다 (docs/BACKUP.md 절차 C).
 *   pnpm backup:restore <anchor-….json.gz 파일 경로>
 *
 * 전제: 대상 DB 에 pnpm db:migrate 로 스키마가 이미 있다. 이 스크립트는 행만 넣는다.
 * FK 순서대로 넣고, 이미 있는 행은 건너뛴다(ON CONFLICT DO NOTHING). 삭제 원장에 있는 계정은 넣지 않는다.
 * 파일 내려받기: https://vercel.com/jessikang/anchor/stores → anchor-backups → daily/ 에서 다운로드.
 *
 * **넣는 차례는 `src/lib/db/backup-tables.ts` 의 `RESTORE_ORDER` 다.** 여기 따로 적고 있었더니
 * `node_cards` 가 백업 목록에도 이 목록에도 없었고, 백업만 고쳤으면 **파일에는 담기는데 복구가
 * 그 표를 건너뛰는** 상태가 됐다. 뜨는 목록과 되돌리는 목록은 따로 새므로 한 파일에 두고
 * `scripts/test/backup-tables.test.ts` 가 둘을 스키마와, 그리고 서로도 견준다.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadEnv } from "../lib/load-env";
import { adminClient } from "../lib/admin-client";
import { RESTORE_ORDER } from "../../src/lib/db/backup-tables";

loadEnv();

type Backup = { format: string; version: number; taken_at: string; tables: Record<string, Record<string, unknown>[]> };

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: pnpm backup:restore <파일.json.gz>");

  const raw = readFileSync(file);
  const text = file.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const backup = JSON.parse(text) as Backup;
  if (backup.format !== "anchor-backup") throw new Error("anchor-backup 형식이 아니다");
  console.log(`백업 시각 ${backup.taken_at}`);

  const deleted = new Set((backup.tables["public.account_deletions"] ?? []).map((r) => String(r.user_id)));

  const client = adminClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const name of RESTORE_ORDER) {
      const table = `public.${name}`;
      const rows = backup.tables[table] ?? [];
      const kept = table === "public.account_deletions" ? rows : rows.filter((r) => !deleted.has(String(r.user_id ?? r.id)));
      let n = 0;
      for (const row of kept) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => {
          const v = row[c];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        const [schema, name] = table.split(".");
        await client.query(
          `INSERT INTO ${schema}.${name} (${cols.map((c) => `"${c}"`).join(", ")})
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
           ON CONFLICT DO NOTHING`,
          vals,
        );
        n++;
      }
      console.log(`  ${table}: ${n}행 (건너뜀 ${rows.length - kept.length})`);
    }
    await client.query("COMMIT");
    console.log("복원 완료. /api/health 로 RLS 상태를 확인하고 ANCHOR_DATABASE_URL 을 교체할 것.");
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

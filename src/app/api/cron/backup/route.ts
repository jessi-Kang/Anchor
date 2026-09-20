import { Pool } from "@neondatabase/serverless";
import { put, list, del } from "@vercel/blob";
import { gzipSync } from "node:zlib";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/backup — 매일 DB 전체를 JSON 으로 떠서 Neon 밖(Vercel Blob, 비공개)에 저장한다.
 *
 * - 호출: vercel.json 의 cron. Vercel 이 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 온다. 그 외 호출은 401.
 * - 연결: DATABASE_URL (소유자). 0003 마이그레이션으로 소유자는 RLS 를 통과해 전체를 읽는다.
 * - 저장: daily/anchor-<UTC시각>.json.gz. 보존 BACKUP_RETENTION_DAYS(기본 35)일 뒤 삭제.
 * - 삭제 원장: 보존 기간이 지난 계정 삭제 요청에 backups_purged_at 을 채운다 (사본이 전부 사라진 시점).
 *
 * pg_dump 가 아니라 JSON 인 이유: 서버리스에는 pg_dump 가 없고, 외부 스토리지 계정을 만들려면 카드가 필요했다.
 * 데이터 양이 작은 MVP 에선 테이블별 JSON 이 충분하고, 복구는 scripts/backup/restore-json.ts 로 한다.
 * 공용 참조 노드(user_id IS NULL)는 저장소의 db/seed 로 언제든 다시 만들 수 있지만 그래도 함께 담는다.
 */

const TABLES = [
  "schema_migrations",
  "users",
  "inputs",
  "nodes",
  "edges",
  "user_node_state",
  "cards",
  "chunks",
  "recordings",
  "encounters",
  "account_deletions",
] as const;

/** 로그인 계정 매핑도 함께 (복구 뒤 같은 Google 계정이 같은 user_id 로 이어지도록) */
const AUTH_TABLES = ["user", "account"] as const;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET 미설정" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!adminUrl || !token) return Response.json({ error: "DATABASE_URL 또는 BLOB_READ_WRITE_TOKEN 없음" }, { status: 503 });

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 35);
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  const startedAt = new Date();

  try {
    const client = await pool.connect();
    const dump: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      for (const t of TABLES) {
        const { rows } = await client.query(`SELECT * FROM public.${t}`);
        dump[`public.${t}`] = rows;
        counts[t] = rows.length;
      }
      for (const t of AUTH_TABLES) {
        const { rows } = await client.query(`SELECT * FROM neon_auth."${t}"`);
        dump[`neon_auth.${t}`] = rows;
        counts[`neon_auth.${t}`] = rows.length;
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const body = gzipSync(
      Buffer.from(
        JSON.stringify({ format: "anchor-backup", version: 1, taken_at: startedAt.toISOString(), tables: dump }),
      ),
    );
    const blob = await put(`daily/anchor-${stamp}.json.gz`, body, {
      access: "private",
      token,
      addRandomSuffix: false,
      contentType: "application/gzip",
    });

    // 보존 기간 지난 사본 삭제
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const old: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "daily/", token, cursor });
      for (const b of page.blobs) if (new Date(b.uploadedAt).getTime() < cutoff) old.push(b.url);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (old.length) await del(old, { token });

    // 삭제 원장: 사본이 전부 사라진 계정 표시
    const { rowCount: purged } = await pool.query(
      `UPDATE account_deletions SET backups_purged_at = now()
       WHERE backups_purged_at IS NULL AND requested_at < now() - make_interval(days => $1)`,
      [retentionDays],
    );

    return Response.json({
      ok: true,
      file: blob.pathname,
      bytes: body.byteLength,
      counts,
      deleted_old: old.length,
      deletions_marked_purged: purged ?? 0,
      took_ms: Date.now() - startedAt.getTime(),
    });
  } catch (e) {
    console.error("[backup] 실패", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

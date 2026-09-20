import { Pool } from "@neondatabase/serverless";
import { deleteVoiceObject } from "@/lib/voice-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/voice — 보관 기간이 지난 음성 원본을 스토리지에서 지운다.
 *
 * CLAUDE.md 데이터 원칙: "원본은 일정 기간 뒤 삭제(설정 가능), 피치 데이터만 보관."
 * 기간은 계정마다 users.voice_retention_days 이고, 업로드할 때 recordings.audio_expires_at 으로 굳는다.
 * 지금까지 그 시각을 적기만 하고 지우는 것이 없었다.
 *
 * - 호출: vercel.json 의 cron. Vercel 이 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 온다. 그 외는 403.
 * - 연결: DATABASE_URL(소유자). 모든 계정을 가로질러야 하고, 0003 으로 소유자는 RLS 를 통과해 읽는다.
 *
 * **순서가 규칙이다: 오브젝트를 지운 뒤에 키를 NULL 로.** 반대로 하면 실패한 삭제가 고아 오브젝트로
 * 남고, 남았다는 사실조차 DB 에 없어 다시 집을 수도 없다. 실패한 건은 행을 그대로 두어 다음 번에 다시 집는다.
 * 피치(pitch·target_pitch)는 건드리지 않는다 — 원본이 사라져도 곡선 비교는 이어진다.
 */

type Expired = { id: string; audio_object_key: string };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET 미설정" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!adminUrl || !token) return Response.json({ error: "DATABASE_URL 또는 BLOB_READ_WRITE_TOKEN 없음" }, { status: 503 });

  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  let removed = 0;
  let failed = 0;
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<Expired>(
        `SELECT id, audio_object_key FROM recordings
         WHERE audio_object_key IS NOT NULL AND audio_expires_at IS NOT NULL AND audio_expires_at <= now()
         ORDER BY audio_expires_at LIMIT 1000`,
      );
      for (const r of rows) {
        // 오브젝트 먼저. 지워진 것만 DB 에서 키를 뗀다.
        if (await deleteVoiceObject(r.audio_object_key, token)) {
          await client.query("UPDATE recordings SET audio_object_key = NULL, audio_expires_at = NULL WHERE id = $1", [r.id]);
          removed++;
        } else {
          failed++;
        }
      }
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[cron/voice] 실패", e);
    return Response.json({ error: "음성 만료 삭제 실패" }, { status: 500 });
  } finally {
    await pool.end();
  }

  return Response.json({ ok: true, removed, failed });
}

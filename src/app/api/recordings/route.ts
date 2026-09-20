import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/recordings  (multipart: card_id, pitch(json), duration_ms, audio(blob, 선택))
 * 피치 곡선은 브라우저에서 뽑아 DB 에 보관하고, 원본 오디오는 계정 전용 비공개 Blob 에
 * users.voice_retention_days(기본 30일) 동안만 둔다 (CLAUDE.md 데이터 원칙). 만료 삭제는 cron 이 한다.
 * 유실 방지: 오디오 업로드가 실패해도 피치 행은 남긴다.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "multipart 가 아니다" }, { status: 400 });
  const cardId = String(form.get("card_id") ?? "");
  const durationMs = Number(form.get("duration_ms") ?? 0);
  let pitch: unknown;
  try {
    pitch = JSON.parse(String(form.get("pitch") ?? "[]"));
  } catch {
    return Response.json({ error: "pitch 가 JSON 이 아니다" }, { status: 400 });
  }
  if (!cardId || !Array.isArray(pitch)) return Response.json({ error: "card_id, pitch 가 필요하다" }, { status: 400 });

  const audio = form.get("audio");
  let audioKey: string | null = null;
  let expiresAt: string | null = null;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (audio instanceof Blob && audio.size > 0 && token) {
    try {
      const days = await withUser(user.id, async (tx) => {
        const { rows } = await tx.query<{ voice_retention_days: number }>("SELECT voice_retention_days FROM users WHERE id = $1", [user.id]);
        return rows[0]?.voice_retention_days ?? 30;
      });
      const key = `voice/${user.id}/${cardId}-${Date.now()}.webm`;
      const blob = await put(key, audio, { access: "private", token, addRandomSuffix: false, contentType: audio.type || "audio/webm" });
      audioKey = blob.pathname;
      expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    } catch (e) {
      console.error("[recordings] 오디오 업로드 실패, 피치만 저장", e);
    }
  }

  const id = await withUser(user.id, async (tx) => {
    const { rows: prev } = await tx.query<{ n: string }>("SELECT count(*)::text AS n FROM recordings WHERE user_id = $1 AND card_id = $2", [user.id, cardId]);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO recordings (user_id, card_id, attempt, pitch, duration_ms, audio_object_key, audio_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user.id, cardId, Number(prev[0]?.n ?? 0) + 1, JSON.stringify(pitch), Number.isFinite(durationMs) ? Math.round(durationMs) : null, audioKey, expiresAt],
    );
    return rows[0].id;
  });
  return Response.json({ ok: true, id, audio_saved: Boolean(audioKey) });
}

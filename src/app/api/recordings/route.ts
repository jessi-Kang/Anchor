import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/recordings  (multipart: card_id **또는** chunk_id, pitch(json), duration_ms, audio(blob, 선택))
 * 피치 곡선은 브라우저에서 뽑아 DB 에 보관하고, 원본 오디오는 계정 전용 비공개 Blob 에
 * users.voice_retention_days(기본 30일) 동안만 둔다 (CLAUDE.md 데이터 원칙).
 * 만료 삭제는 /api/cron/voice 가 한다.
 * 유실 방지: 오디오 업로드가 실패해도 피치 행은 남긴다.
 *
 * 한자 카드(F10)는 card_id 로, 대화 덩어리(F14)는 chunk_id 로 매단다. 둘 중 하나는 있어야 한다.
 *
 * 그 id 는 반드시 내 것이어야 한다. RLS 가 user_id 만 보므로 남의 id 로도 행이 만들어졌고,
 * 그 값이 Blob 키 경로에도 들어가 계정별 접두사(voice/<user_id>/)를 벗어날 수 있었다.
 * 그래서 DB 로 주인을 확인하고, 키에는 입력값이 아니라 DB 가 돌려준 id 를 쓴다.
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
  const chunkId = String(form.get("chunk_id") ?? "");
  const durationMs = Number(form.get("duration_ms") ?? 0);
  let pitch: unknown;
  try {
    pitch = JSON.parse(String(form.get("pitch") ?? "[]"));
  } catch {
    return Response.json({ error: "pitch 가 JSON 이 아니다" }, { status: 400 });
  }
  if ((!cardId && !chunkId) || !Array.isArray(pitch)) {
    return Response.json({ error: "card_id 또는 chunk_id, 그리고 pitch 가 필요하다" }, { status: 400 });
  }

  // 내 것인가. 아니면 아무것도 만들지 않는다 (남의 카드·덩어리에 녹음이 매달리지 않게).
  const table = cardId ? "cards" : "chunks";
  const ownId = await withUser(user.id, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = $1 AND user_id = $2`, [
      cardId || chunkId,
      user.id,
    ]);
    return rows[0]?.id ?? null;
  }).catch(() => null);
  if (!ownId) return Response.json({ error: cardId ? "그런 카드가 없다" : "그런 덩어리가 없다" }, { status: 404 });
  const ownCardId = cardId ? ownId : null;
  const ownChunkId = cardId ? null : ownId;

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
      const key = `voice/${user.id}/${ownId}-${Date.now()}.webm`;
      const blob = await put(key, audio, { access: "private", token, addRandomSuffix: false, contentType: audio.type || "audio/webm" });
      audioKey = blob.pathname;
      expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    } catch (e) {
      console.error("[recordings] 오디오 업로드 실패, 피치만 저장", e);
    }
  }

  const id = await withUser(user.id, async (tx) => {
    const { rows: prev } = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM recordings WHERE user_id = $1 AND ${cardId ? "card_id" : "chunk_id"} = $2`,
      [user.id, ownId],
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO recordings (user_id, card_id, chunk_id, attempt, pitch, duration_ms, audio_object_key, audio_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [user.id, ownCardId, ownChunkId, Number(prev[0]?.n ?? 0) + 1, JSON.stringify(pitch), Number.isFinite(durationMs) ? Math.round(durationMs) : null, audioKey, expiresAt],
    );
    return rows[0].id;
  });
  return Response.json({ ok: true, id, audio_saved: Boolean(audioKey) });
}

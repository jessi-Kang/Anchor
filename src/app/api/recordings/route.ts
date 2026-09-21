import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import { targetVoiceId } from "@/lib/tts-voice";

export const dynamic = "force-dynamic";

/**
 * POST /api/recordings  (multipart: card_id **또는** chunk_id, pitch(json), target_pitch(json, 선택),
 *                         duration_ms, audio(blob, 선택))
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
  /*
    **그때 들려준 원어민 곡선**. 통과 기준 둘 중 하나("같은 덩어리 5회차 곡선 일치도가 오르는가",
    docs/SPEC.md 9장)는 내 곡선과 겨눈 상대를 나란히 놓아야 나오는데, 겨눈 상대를 안 남기면
    **나중에 다시 만들 수 없다** — 같은 문장이어도 TTS 가 그때와 같은 소리를 준다는 보장이 없고,
    원어민 음성이 없던 회차는 아예 상대가 없었다는 사실 자체가 값이다.
    `match_score` 는 비워 둬도 된다. 곡선 둘이 남아 있으면 나중에 계산할 수 있다.
    못 되돌리는 것은 이 값 하나뿐이라 값이 들어오기 전에 코드를 먼저 넣는다.
  */
  let targetPitch: unknown = null;
  const rawTarget = form.get("target_pitch");
  if (rawTarget) {
    try {
      const parsed = JSON.parse(String(rawTarget));
      if (Array.isArray(parsed) && parsed.length) targetPitch = parsed;
    } catch {
      // 못 읽어도 녹음은 저장한다 — 곡선 하나를 못 읽었다고 회차를 버리지 않는다.
      console.error("[recordings] target_pitch 가 JSON 이 아니다");
    }
  }
  if ((!cardId && !chunkId) || !Array.isArray(pitch)) {
    return Response.json({ error: "card_id 또는 chunk_id, 그리고 pitch 가 필요하다" }, { status: 400 });
  }

  // 내 것인가. 아니면 아무것도 만들지 않는다 (남의 카드·덩어리에 녹음이 매달리지 않게).
  // 언어도 같이 읽는다 — 어느 목소리로 기준선을 만들었는지는 언어에 달려 있고, 클라이언트가
  // 보낸 값이 아니라 DB 가 돌려준 값이어야 그 판단이 흔들리지 않는다.
  const table = cardId ? "cards" : "chunks";
  const own = await withUser(user.id, async (tx) => {
    const { rows } = await tx.query<{ id: string; lang: string }>(
      `SELECT id, lang::text AS lang FROM ${table} WHERE id = $1 AND user_id = $2`,
      [cardId || chunkId, user.id],
    );
    return rows[0] ?? null;
  }).catch(() => null);
  if (!own) return Response.json({ error: cardId ? "그런 카드가 없다" : "그런 덩어리가 없다" }, { status: 404 });
  const ownId = own.id;
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

  const saved = await withUser(user.id, async (tx) => {
    const column = cardId ? "card_id" : "chunk_id";
    const { rows: prev } = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM recordings WHERE user_id = $1 AND ${column} = $2`,
      [user.id, ownId],
    );
    /*
      **기준선은 1회차에 뽑은 곡선으로 고정한다** (docs/MEASURE.md 2장). 브라우저는 회차마다 TTS 를
      새로 받아 곡선을 다시 만드는데, 같은 문장이어도 호출마다 오디오가 달라질 수 있다. 그러면
      1회차와 5회차가 **다른 소리**를 기준으로 재게 되고, 거리가 줄어든 것이 발음이 나아져서인지
      TTS 가 달라져서인지 구분할 수 없다. 기준선이 움직이면 그 비교는 아무 말도 안 한다.
      그래서 이 대상에 이미 기준선이 있으면 이번에 보낸 것을 버리고 그것을 쓴다.
    */
    const { rows: base } = await tx.query<{ target_pitch: unknown; target_voice_kind: string | null; target_voice_id: string | null }>(
      `SELECT target_pitch, target_voice_kind, target_voice_id FROM recordings
        WHERE user_id = $1 AND ${column} = $2 AND target_pitch IS NOT NULL
        ORDER BY created_at LIMIT 1`,
      [user.id, ownId],
    );
    const target = base[0]?.target_pitch ?? targetPitch;
    /*
      **그 기준선을 무엇으로 만들었는가** (docs/MEASURE.md 2장). 곡선만 남기고 목소리를 안 남기면,
      목소리 ID 가 바뀐 날 **어느 행이 어느 기준선인지 몰라 이전 회차가 전부 죽는다.** 곡선은
      그대로 있는데 그 곡선이 무엇인지를 모르는 상태가 된다.

      값은 클라이언트에게 묻지 않고 **서버가 `lib/tts-voice.ts` 로 다시 고른다.** 화면이 듣기에
      쓰는 `/api/tts` 도 같은 함수로 목소리를 고르므로 답이 하나뿐이고, 되돌아온 문자열을 믿을
      필요도 없다. (`/api/tts?voice=mine` 처럼 화면이 목소리를 따로 지정하는 길이 이 루프에
      생기면 이 추론이 어긋난다. 그때는 그 값을 같이 보내야 한다.)

      기준선을 물려받을 때는 **출처도 같이 물려받는다.** 곡선만 1회차 것이고 출처가 이번 회차
      것이면 그 행이 거짓말을 한다.
      `target_pitch` 가 없으면 이 칸도 NULL 이다 — 겨눈 소리가 없던 회차라 기준선 자체가 없다.
    */
    const lang = own.lang === "en" ? "en" : "ja";
    const voiceId = targetVoiceId(lang);
    const inherited = base[0]?.target_voice_kind
      ? { kind: base[0].target_voice_kind, id: base[0].target_voice_id }
      : null;
    const voice = target
      ? (inherited ??
        (voiceId
          ? {
              // 언어별 전용 목소리가 있으면 그쪽, 없으면 Jessi 목소리 클론으로 떨어진 것이다.
              kind: voiceId === process.env.ELEVENLABS_VOICE_ID_JESSI ? "clone" : "lang",
              id: voiceId,
            }
          : null))
      : null;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO recordings (user_id, card_id, chunk_id, attempt, pitch, target_pitch, duration_ms, audio_object_key, audio_expires_at, target_voice_kind, target_voice_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        user.id,
        ownCardId,
        ownChunkId,
        Number(prev[0]?.n ?? 0) + 1,
        JSON.stringify(pitch),
        target ? JSON.stringify(target) : null,
        Number.isFinite(durationMs) ? Math.round(durationMs) : null,
        audioKey,
        expiresAt,
        voice?.kind ?? null,
        voice?.id ?? null,
      ],
    );
    return { id: rows[0].id, target: Boolean(target) };
  });
  return Response.json({ ok: true, id: saved.id, audio_saved: Boolean(audioKey), target_saved: saved.target });
}
